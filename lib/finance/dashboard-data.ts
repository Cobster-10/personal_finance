import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export type DashboardExpense = {
  category: string;
  spent: number;
  budget: number;
};

export type DashboardData = {
  month: string;
  monthLabel: string;
  currencyCode: string;
  months: { value: string; label: string }[];
  expectedIncome: number;
  depositedIncome: number;
  currentSpent: number;
  totalBudget: number;
  expenses: DashboardExpense[];
  recentIncome: { date: string; description: string; amount: number } | null;
  dataSource: "demo" | "supabase";
};

const DEMO_EXPENSES: DashboardExpense[] = [
  { category: "Food & Drink", spent: 150, budget: 200 },
  { category: "Fuel & Transit", spent: 110, budget: 200 },
  { category: "Fun & Treats", spent: 140, budget: 200 },
];

function monthLabel(month: string) {
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${month}T00:00:00Z`),
  );
}

function monthOptions(month: string) {
  const start = new Date(`${month}T00:00:00Z`);

  return Array.from({ length: 4 }, (_, index) => {
    const option = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - (3 - index), 1));
    const value = option.toISOString().slice(0, 10);
    return { value, label: monthLabel(value) };
  });
}

function normalizeMonth(value?: string) {
  if (value && /^\d{4}-\d{2}-01$/.test(value)) {
    const date = new Date(`${value}T00:00:00Z`);
    if (!Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value) {
      return value;
    }
  }

  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

function demoData(month: string): DashboardData {
  const demoIncomeDate = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(
    new Date(`${month}T00:00:00Z`),
  );

  return {
    month,
    monthLabel: monthLabel(month),
    currencyCode: "USD",
    months: monthOptions(month),
    expectedIncome: 9000,
    depositedIncome: 750,
    currentSpent: 2480,
    totalBudget: 3000,
    expenses: DEMO_EXPENSES,
    recentIncome: { date: demoIncomeDate, description: "Paycheck deposit", amount: 750 },
    dataSource: "demo",
  };
}

function emptyLiveData(month: string, currencyCode = "USD"): DashboardData {
  return {
    month,
    monthLabel: monthLabel(month),
    currencyCode,
    months: monthOptions(month),
    expectedIncome: 0,
    depositedIncome: 0,
    currentSpent: 0,
    totalBudget: 0,
    expenses: [],
    recentIncome: null,
    dataSource: "supabase",
  };
}

export async function getDashboardData(selectedMonth?: string): Promise<DashboardData> {
  const month = normalizeMonth(selectedMonth);
  const fallback = demoData(month);

  if (!isSupabaseConfigured()) {
    return fallback;
  }

  try {
    const supabase = await createClient();
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();

    if (claimsError || !claimsData?.claims) {
      return fallback;
    }

    const nextMonth = new Date(`${month}T00:00:00Z`);
    nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
    const monthEnd = nextMonth.toISOString().slice(0, 10);

    const [
      { data: transactions, error: transactionsError },
      { data: budget, error: budgetError },
      { data: profile, error: profileError },
    ] = await Promise.all([
      supabase
        .from("transactions")
        .select("category_id, transaction_date, amount_cents, merchant_name, description, status")
        .eq("user_id", claimsData.claims.sub)
        .gte("transaction_date", month)
        .lt("transaction_date", monthEnd)
        .order("transaction_date", { ascending: false }),
      supabase.from("budgets").select("id, total_budget_cents").eq("month", month).maybeSingle(),
      supabase.from("profiles").select("currency_code").eq("id", claimsData.claims.sub).maybeSingle(),
    ]);

    if (transactionsError || budgetError || profileError) {
      throw transactionsError ?? budgetError ?? profileError;
    }

    const transactionCategoryIds = Array.from(
      new Set((transactions ?? []).map((transaction) => transaction.category_id).filter((id): id is string => Boolean(id))),
    );
    const { data: budgetCategories, error: budgetCategoriesError } = budget?.id
      ? await supabase.from("budget_categories").select("category_id, budget_cents").eq("budget_id", budget.id)
      : { data: [], error: null };

    if (budgetCategoriesError) {
      throw budgetCategoriesError;
    }

    const categoryIds = Array.from(
      new Set([
        ...transactionCategoryIds,
        ...(budgetCategories ?? []).map((entry) => entry.category_id),
      ]),
    );
    const { data: categories, error: categoriesError } = categoryIds.length > 0
      ? await supabase.from("categories").select("id, name").in("id", categoryIds).eq("category_type", "expense")
      : { data: [], error: null };

    if (categoriesError) {
      throw categoriesError;
    }

    /*
     * RLS still enforces ownership here. The explicit user_id predicates on
     * the primary queries make the intended access boundary obvious and keep
     * these queries safe if they are reused outside this loader.
     */
    const categoryNames = new Map((categories ?? []).map((category) => [category.id, category.name]));
    const categoryBudgets = new Map((budgetCategories ?? []).map((entry) => [entry.category_id, entry.budget_cents / 100]));
    const spentByCategory = new Map<string, number>();

    for (const transaction of transactions ?? []) {
      if (transaction.amount_cents >= 0 || !transaction.category_id || !categoryNames.has(transaction.category_id)) {
        continue;
      }
      const categoryId = transaction.category_id;
      spentByCategory.set(categoryId, (spentByCategory.get(categoryId) ?? 0) + Math.abs(transaction.amount_cents) / 100);
    }

    const expenses = Array.from(new Set([...spentByCategory.keys(), ...categoryBudgets.keys()]))
      .map((categoryId) => ({
        category: categoryNames.get(categoryId) ?? "Uncategorized",
        spent: spentByCategory.get(categoryId) ?? 0,
        budget: categoryBudgets.get(categoryId) ?? 0,
      }))
      .filter((expense) => expense.spent > 0 || expense.budget > 0)
      .sort((a, b) => b.spent - a.spent);

    const incomeTransactions = (transactions ?? []).filter((transaction) => transaction.amount_cents > 0);
    const depositedTransactions = incomeTransactions.filter((transaction) => transaction.status === "cleared");
    const recentIncome = incomeTransactions[0];

    return {
      ...emptyLiveData(month, profile?.currency_code ?? "USD"),
      month,
      monthLabel: monthLabel(month),
      months: monthOptions(month),
      expectedIncome: incomeTransactions.reduce((sum, transaction) => sum + transaction.amount_cents / 100, 0),
      depositedIncome: depositedTransactions.reduce((sum, transaction) => sum + transaction.amount_cents / 100, 0),
      currentSpent: (transactions ?? [])
        .filter((transaction) => transaction.amount_cents < 0)
        .reduce((sum, transaction) => sum + Math.abs(transaction.amount_cents) / 100, 0),
      totalBudget: (budget?.total_budget_cents ?? 0) / 100,
      expenses,
      recentIncome: recentIncome
        ? {
            date: new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(
              new Date(`${recentIncome.transaction_date}T00:00:00Z`),
            ),
            description: recentIncome.merchant_name ?? recentIncome.description ?? "Income",
            amount: recentIncome.amount_cents / 100,
          }
        : null,
      dataSource: "supabase",
    };
  } catch {
    return emptyLiveData(month);
  }
}
