import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { isIgnoredCategoryPurpose, normalizeCategoryPurpose } from "@/lib/finance/category-data";
import { calculateGiveCommitmentCents } from "@/lib/finance/give-commitment";

const MONTH_PATTERN = /^\d{4}-\d{2}-01$/;

export type AgentMonth = { month: string; monthEnd: string };

export function resolveAgentMonth(value?: string | null): AgentMonth | null {
  if (value && !MONTH_PATTERN.test(value)) return null;
  const candidate = value ?? new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString().slice(0, 10);
  const date = new Date(`${candidate}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== candidate) return null;

  const nextMonth = new Date(date);
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  return { month: candidate, monthEnd: nextMonth.toISOString().slice(0, 10) };
}

type OverviewCategory = {
  id: string;
  name: string;
  category_type: "expense" | "income";
  purpose: string;
  monthly_budget_cents: number;
  spent_cents: number;
  received_cents: number;
  counts_toward_totals: boolean;
};

type AgentAlert =
  | { type: "over_budget"; category_id: string; category_name: string; amount_over_cents: number }
  | { type: "near_budget"; category_id: string; category_name: string; amount_remaining_cents: number }
  | { type: "overall_over_budget"; amount_over_cents: number }
  | { type: "overall_near_budget"; amount_remaining_cents: number }
  | { type: "give_commitment_outstanding"; amount_remaining_cents: number; carried_forward_cents: number };

function categoryDto(
  category: { id: string; name: string; category_type: string; purpose: string },
  budgetCents: number,
  spentCents: number,
  receivedCents: number,
): OverviewCategory {
  const purpose = normalizeCategoryPurpose(category.purpose);
  return {
    id: category.id,
    name: category.name,
    category_type: category.category_type === "income" ? "income" : "expense",
    purpose,
    monthly_budget_cents: isIgnoredCategoryPurpose(purpose) ? 0 : budgetCents,
    spent_cents: isIgnoredCategoryPurpose(purpose) ? 0 : spentCents,
    received_cents: isIgnoredCategoryPurpose(purpose) ? 0 : receivedCents,
    counts_toward_totals: !isIgnoredCategoryPurpose(purpose),
  };
}

export async function getAgentOverview(userId: string, selectedMonth: AgentMonth) {
  const admin = createAdminClient();
  const [
    { data: categories, error: categoriesError },
    { data: budget, error: budgetError },
    { data: transactions, error: transactionsError },
    { data: profile, error: profileError },
    { data: historicalBudgets, error: historicalBudgetsError },
  ] = await Promise.all([
    admin.from("categories").select("id, name, category_type, purpose").eq("user_id", userId).order("category_type").order("name"),
    admin
      .from("budgets")
      .select("id, expected_income_cents, total_budget_cents, total_budget_override_cents")
      .eq("user_id", userId)
      .eq("month", selectedMonth.month)
      .maybeSingle(),
    admin
      .from("transactions")
      .select("category_id, amount_cents")
      .eq("user_id", userId)
      .gte("transaction_date", selectedMonth.month)
      .lt("transaction_date", selectedMonth.monthEnd),
    admin.from("profiles").select("currency_code").eq("id", userId).maybeSingle(),
    admin.from("budgets").select("id, month").eq("user_id", userId).lte("month", selectedMonth.month),
  ]);

  if (categoriesError || budgetError || transactionsError || profileError || historicalBudgetsError) {
    throw categoriesError ?? budgetError ?? transactionsError ?? profileError ?? historicalBudgetsError;
  }

  const categoryById = new Map((categories ?? []).map((category) => [category.id, category]));
  const ignoredCategoryIds = new Set((categories ?? [])
    .filter((category) => isIgnoredCategoryPurpose(category.purpose))
    .map((category) => category.id));
  const giveCategoryIds = (categories ?? [])
    .filter((category) => category.category_type === "expense" && normalizeCategoryPurpose(category.purpose) === "give")
    .map((category) => category.id);
  const historicalBudgetIds = (historicalBudgets ?? []).map((item) => item.id);

  const [
    { data: budgetCategories, error: budgetCategoriesError },
    { data: historicalGiveBudgets, error: historicalGiveBudgetsError },
    { data: historicalGiveTransactions, error: historicalGiveTransactionsError },
  ] = await Promise.all([
    budget?.id
      ? admin.from("budget_categories").select("category_id, budget_cents").eq("user_id", userId).eq("budget_id", budget.id)
      : Promise.resolve({ data: [], error: null }),
    historicalBudgetIds.length > 0 && giveCategoryIds.length > 0
      ? admin
          .from("budget_categories")
          .select("budget_id, category_id, budget_cents")
          .eq("user_id", userId)
          .in("budget_id", historicalBudgetIds)
          .in("category_id", giveCategoryIds)
      : Promise.resolve({ data: [], error: null }),
    giveCategoryIds.length > 0
      ? admin
          .from("transactions")
          .select("transaction_date, amount_cents")
          .eq("user_id", userId)
          .in("category_id", giveCategoryIds)
          .lt("transaction_date", selectedMonth.monthEnd)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (budgetCategoriesError || historicalGiveBudgetsError || historicalGiveTransactionsError) {
    throw budgetCategoriesError ?? historicalGiveBudgetsError ?? historicalGiveTransactionsError;
  }

  const budgetByCategory = new Map((budgetCategories ?? []).map((entry) => [entry.category_id, entry.budget_cents]));
  const spentByCategory = new Map<string, number>();
  const receivedByCategory = new Map<string, number>();
  let totalSpentCents = 0;
  let totalReceivedCents = 0;
  for (const transaction of transactions ?? []) {
    if (transaction.category_id && ignoredCategoryIds.has(transaction.category_id)) continue;
    if (transaction.amount_cents < 0) {
      totalSpentCents += Math.abs(transaction.amount_cents);
      if (transaction.category_id && categoryById.has(transaction.category_id)) {
        spentByCategory.set(transaction.category_id, (spentByCategory.get(transaction.category_id) ?? 0) + Math.abs(transaction.amount_cents));
      }
    } else if (transaction.amount_cents > 0) {
      totalReceivedCents += transaction.amount_cents;
      if (transaction.category_id && categoryById.has(transaction.category_id)) {
        receivedByCategory.set(transaction.category_id, (receivedByCategory.get(transaction.category_id) ?? 0) + transaction.amount_cents);
      }
    }
  }

  const categoriesDto = (categories ?? []).map((category) => categoryDto(
    category,
    budgetByCategory.get(category.id) ?? 0,
    spentByCategory.get(category.id) ?? 0,
    receivedByCategory.get(category.id) ?? 0,
  ));
  const categoryBudgetTotalCents = categoriesDto
    .filter((category) => category.category_type === "expense" && category.counts_toward_totals)
    .reduce((total, category) => total + category.monthly_budget_cents, 0);
  const totalBudgetCents = budget?.total_budget_override_cents ?? categoryBudgetTotalCents;

  const giveBudgetMonthById = new Map((historicalBudgets ?? []).map((item) => [item.id, item.month]));
  const giveProgressByMonth = new Map<string, { budgetCents: number; spentCents: number }>();
  for (const entry of historicalGiveBudgets ?? []) {
    const entryMonth = giveBudgetMonthById.get(entry.budget_id);
    if (!entryMonth) continue;
    const progress = giveProgressByMonth.get(entryMonth) ?? { budgetCents: 0, spentCents: 0 };
    progress.budgetCents += entry.budget_cents;
    giveProgressByMonth.set(entryMonth, progress);
  }
  for (const transaction of historicalGiveTransactions ?? []) {
    if (transaction.amount_cents >= 0) continue;
    const transactionMonth = `${transaction.transaction_date.slice(0, 7)}-01`;
    const progress = giveProgressByMonth.get(transactionMonth) ?? { budgetCents: 0, spentCents: 0 };
    progress.spentCents += Math.abs(transaction.amount_cents);
    giveProgressByMonth.set(transactionMonth, progress);
  }
  const giveCommitment = calculateGiveCommitmentCents(
    selectedMonth.month,
    [...giveProgressByMonth.entries()].map(([month, progress]) => ({ month, ...progress })),
  );

  const alerts: AgentAlert[] = [];
  for (const category of categoriesDto) {
    if (category.category_type !== "expense" || !category.counts_toward_totals || category.monthly_budget_cents <= 0) continue;
    if (category.spent_cents >= category.monthly_budget_cents) {
      alerts.push({
        type: "over_budget",
        category_id: category.id,
        category_name: category.name,
        amount_over_cents: category.spent_cents - category.monthly_budget_cents,
      });
    } else if (category.spent_cents * 100 >= category.monthly_budget_cents * 80) {
      alerts.push({
        type: "near_budget",
        category_id: category.id,
        category_name: category.name,
        amount_remaining_cents: category.monthly_budget_cents - category.spent_cents,
      });
    }
  }
  if (totalBudgetCents > 0 && totalSpentCents >= totalBudgetCents) {
    alerts.push({ type: "overall_over_budget", amount_over_cents: totalSpentCents - totalBudgetCents });
  } else if (totalBudgetCents > 0 && totalSpentCents * 100 >= totalBudgetCents * 80) {
    alerts.push({ type: "overall_near_budget", amount_remaining_cents: totalBudgetCents - totalSpentCents });
  }
  if (giveCommitment.remainingCents > 0) {
    alerts.push({
      type: "give_commitment_outstanding",
      amount_remaining_cents: giveCommitment.remainingCents,
      carried_forward_cents: giveCommitment.carryoverFromPriorMonthsCents,
    });
  }

  return {
    month: selectedMonth.month,
    currency_code: profile?.currency_code ?? "USD",
    totals: {
      spent_cents: totalSpentCents,
      received_cents: totalReceivedCents,
      budget_cents: totalBudgetCents,
      category_budget_cents: categoryBudgetTotalCents,
      expected_income_cents: budget?.expected_income_cents ?? null,
    },
    categories: categoriesDto,
    give_commitment: {
      carryover_from_prior_months_cents: giveCommitment.carryoverFromPriorMonthsCents,
      monthly_budget_cents: giveCommitment.monthlyBudgetCents,
      spent_cents: giveCommitment.spentCents,
      target_cents: giveCommitment.targetCents,
      remaining_cents: giveCommitment.remainingCents,
    },
    alerts,
  };
}

export async function getAgentCategories(userId: string, selectedMonth: AgentMonth) {
  const overview = await getAgentOverview(userId, selectedMonth);
  return {
    month: overview.month,
    currency_code: overview.currency_code,
    categories: overview.categories,
  };
}

export async function getAgentTransactions(
  userId: string,
  options: { state: "all" | "uncategorized"; month?: AgentMonth; limit: number },
) {
  const admin = createAdminClient();
  let query = admin
    .from("transactions")
    .select("id, category_id, transaction_date, amount_cents, merchant_name, description, status, source, currency_code")
    .eq("user_id", userId)
    .order("transaction_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(options.limit);

  if (options.state === "uncategorized") query = query.is("category_id", null);
  if (options.month) query = query.gte("transaction_date", options.month.month).lt("transaction_date", options.month.monthEnd);

  const [{ data: transactions, error: transactionsError }, { data: categories, error: categoriesError }] = await Promise.all([
    query,
    admin.from("categories").select("id, name, category_type, purpose").eq("user_id", userId),
  ]);
  if (transactionsError || categoriesError) throw transactionsError ?? categoriesError;

  const categoryById = new Map((categories ?? []).map((category) => [category.id, category]));
  return {
    transactions: (transactions ?? []).map((transaction) => {
      const category = transaction.category_id ? categoryById.get(transaction.category_id) : null;
      return {
        id: transaction.id,
        date: transaction.transaction_date,
        amount_cents: transaction.amount_cents,
        merchant_name: transaction.merchant_name,
        description: transaction.description,
        status: transaction.status,
        source: transaction.source,
        currency_code: transaction.currency_code ?? "USD",
        category: category ? {
          id: category.id,
          name: category.name,
          category_type: category.category_type,
          purpose: normalizeCategoryPurpose(category.purpose),
        } : null,
      };
    }),
  };
}

export async function assignAgentTransactionCategory(
  userId: string,
  transactionId: string,
  categoryId: string | null,
) {
  const admin = createAdminClient();
  if (categoryId) {
    const { data: category, error: categoryError } = await admin
      .from("categories")
      .select("id, name, category_type, purpose")
      .eq("id", categoryId)
      .eq("user_id", userId)
      .maybeSingle();
    if (categoryError) throw categoryError;
    if (!category) return { status: "category_not_found" as const };
  }

  const { data: transaction, error: transactionError } = await admin
    .from("transactions")
    .update({ category_id: categoryId })
    .eq("id", transactionId)
    .eq("user_id", userId)
    .select("id, category_id, amount_cents")
    .maybeSingle();
  if (transactionError) throw transactionError;
  if (!transaction) return { status: "transaction_not_found" as const };

  return {
    status: "updated" as const,
    transaction: {
      id: transaction.id,
      category_id: transaction.category_id,
      amount_cents: transaction.amount_cents,
    },
  };
}
