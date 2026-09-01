"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  CATEGORY_PURPOSES,
  normalizeCategoryPurpose,
  type CategoryPurpose,
} from "@/lib/finance/category-data";
import type { DashboardCategory } from "@/lib/finance/dashboard-data";

type CategoryType = "expense" | "income";

function formatMoney(value: number, currencyCode: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatInputAmount(value: number) {
  return value > 0 ? String(value) : "";
}

function purposeLabel(value: CategoryPurpose) {
  return CATEGORY_PURPOSES.find((purpose) => purpose.value === value)?.label ?? "Spend";
}

function CategoryRow({
  category,
  currencyCode,
  draftBudget,
  noBudget,
  isSaving,
  onBudgetChange,
  onBudgetBlur,
  onNoBudgetChange,
  onPurposeChange,
}: {
  category: DashboardCategory;
  currencyCode: string;
  draftBudget: string;
  noBudget: boolean;
  isSaving: boolean;
  onBudgetChange: (value: string) => void;
  onBudgetBlur: () => void;
  onNoBudgetChange: (checked: boolean) => void;
  onPurposeChange: (purpose: CategoryPurpose) => void;
}) {
  const total = category.categoryType === "expense" ? category.spent : category.received;
  const totalLabel = category.categoryType === "expense" ? "spent" : "received";

  return (
    <div className={`category-row ${isSaving ? "is-saving" : ""}`}>
      <div className="category-name-cell">
        <span className={`category-icon ${category.categoryType}`} aria-hidden="true">
          {category.icon ?? (category.categoryType === "expense" ? "✦" : "↗")}
        </span>
        <strong>{category.name}</strong>
      </div>

      <label className="category-budget-cell">
        <span className="sr-only">Monthly budget for {category.name}</span>
        <span aria-hidden="true">$</span>
        <input
          type="number"
          min="0"
          step="1"
          inputMode="numeric"
          value={draftBudget}
          disabled={noBudget}
          placeholder="0"
          onChange={(event) => onBudgetChange(event.target.value)}
          onBlur={onBudgetBlur}
        />
      </label>

      <div className="category-total-cell">
        <strong>{formatMoney(total, currencyCode)}</strong>
        <span>{totalLabel}</span>
      </div>

      <label className="category-no-budget-cell">
        <span className="sr-only">No budget for {category.name}</span>
        <input
          type="checkbox"
          checked={noBudget}
          onChange={(event) => onNoBudgetChange(event.target.checked)}
        />
        <span className="category-toggle" aria-hidden="true" />
      </label>

      <label className="category-purpose-cell">
        <span className="sr-only">Purpose for {category.name}</span>
        <select
          value={category.purpose}
          onChange={(event) => onPurposeChange(normalizeCategoryPurpose(event.target.value))}
          aria-label={`${category.name} purpose: ${purposeLabel(category.purpose)}`}
        >
          {CATEGORY_PURPOSES.map((purpose) => (
            <option key={purpose.value} value={purpose.value}>{purpose.label}</option>
          ))}
        </select>
      </label>
    </div>
  );
}

function CategorySection({
  type,
  categories,
  currencyCode,
  draftBudgets,
  noBudgets,
  savingId,
  newName,
  newPurpose,
  onBudgetChange,
  onBudgetBlur,
  onNoBudgetChange,
  onPurposeChange,
  onNewNameChange,
  onNewPurposeChange,
  onAdd,
}: {
  type: CategoryType;
  categories: DashboardCategory[];
  currencyCode: string;
  draftBudgets: Record<string, string>;
  noBudgets: Record<string, boolean>;
  savingId: string | null;
  newName: string;
  newPurpose: CategoryPurpose;
  onBudgetChange: (id: string, value: string) => void;
  onBudgetBlur: (category: DashboardCategory) => void;
  onNoBudgetChange: (category: DashboardCategory, checked: boolean) => void;
  onPurposeChange: (category: DashboardCategory, purpose: CategoryPurpose) => void;
  onNewNameChange: (value: string) => void;
  onNewPurposeChange: (purpose: CategoryPurpose) => void;
  onAdd: () => void;
}) {
  const isExpense = type === "expense";
  const title = isExpense ? "Expense Categories" : "Income Categories";
  const description = isExpense ? "Plan where your spending goes" : "Plan where your income comes from";
  const totalLabel = isExpense ? "Spent" : "Received";

  return (
    <section className={`category-section ${isExpense ? "category-section-expense" : "category-section-income"}`} aria-labelledby={`${type}-categories-heading`}>
      <header className="category-section-heading">
        <div>
          <h2 id={`${type}-categories-heading`}>{title}</h2>
          <p>{description} for the month.</p>
        </div>
        <span className="category-section-caption">{totalLabel}</span>
      </header>

      <div className="category-table" role="table" aria-label={title}>
        <div className="category-table-header" role="row">
          <span role="columnheader">Category</span>
          <span role="columnheader">Monthly Budget</span>
          <span role="columnheader">{totalLabel}</span>
          <span role="columnheader">No budget</span>
          <span role="columnheader">Purpose</span>
        </div>

        {categories.length > 0 ? categories.map((category) => (
          <CategoryRow
            key={category.id}
            category={category}
            currencyCode={currencyCode}
            draftBudget={draftBudgets[category.id] ?? formatInputAmount(category.monthlyBudget)}
            noBudget={noBudgets[category.id] ?? category.monthlyBudget === 0}
            isSaving={savingId === category.id || savingId === `purpose-${category.id}`}
            onBudgetChange={(value) => onBudgetChange(category.id, value)}
            onBudgetBlur={() => onBudgetBlur(category)}
            onNoBudgetChange={(checked) => onNoBudgetChange(category, checked)}
            onPurposeChange={(purpose) => onPurposeChange(category, purpose)}
          />
        )) : (
          <div className="category-section-empty" role="row">
            <span className="category-empty-mark" aria-hidden="true">○</span>
            <span>No {isExpense ? "expense" : "income"} categories yet.</span>
          </div>
        )}
      </div>

      <form
        className="add-category-form"
        onSubmit={(event) => {
          event.preventDefault();
          onAdd();
        }}
      >
        <label className="add-category-input">
          <span className="sr-only">New {isExpense ? "expense" : "income"} category name</span>
          <input
            type="text"
            value={newName}
            placeholder={`New ${isExpense ? "expense" : "income"} category`}
            onChange={(event) => onNewNameChange(event.target.value)}
          />
        </label>
        <label className="add-category-purpose">
          <span className="sr-only">Purpose for new category</span>
          <select value={newPurpose} onChange={(event) => onNewPurposeChange(normalizeCategoryPurpose(event.target.value))}>
            {CATEGORY_PURPOSES.map((purpose) => (
              <option key={purpose.value} value={purpose.value}>{purpose.label}</option>
            ))}
          </select>
        </label>
        <button type="submit">＋ Add {isExpense ? "Expense" : "Income"} Category</button>
      </form>
    </section>
  );
}

export function CategoryPlanner({
  initialCategories,
  month,
  monthLabel,
  currencyCode,
}: {
  initialCategories: DashboardCategory[];
  month: string;
  monthLabel: string;
  currencyCode: string;
}) {
  const [categories, setCategories] = useState(initialCategories);
  const [draftBudgets, setDraftBudgets] = useState<Record<string, string>>(() =>
    Object.fromEntries(initialCategories.map((category) => [category.id, formatInputAmount(category.monthlyBudget)])),
  );
  const [noBudgets, setNoBudgets] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(initialCategories.map((category) => [category.id, category.monthlyBudget === 0])),
  );
  const [savingId, setSavingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [newNames, setNewNames] = useState<Record<CategoryType, string>>({ expense: "", income: "" });
  const [newPurposes, setNewPurposes] = useState<Record<CategoryType, CategoryPurpose>>({
    expense: "spend",
    income: "save_grow",
  });

  const expenseCategories = categories.filter((category) => category.categoryType === "expense");
  const incomeCategories = categories.filter((category) => category.categoryType === "income");

  async function getCurrentUser() {
    const supabase = createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) throw new Error("Your session has expired. Please sign in again.");
    return { supabase, user };
  }

  async function savePurpose(category: DashboardCategory, purpose: CategoryPurpose) {
    const previousPurpose = category.purpose;
    setErrorMessage(null);
    setSavingId(`purpose-${category.id}`);
    setCategories((current) => current.map((item) => item.id === category.id ? { ...item, purpose } : item));

    try {
      const { supabase } = await getCurrentUser();
      const { error } = await supabase.from("categories").update({ purpose }).eq("id", category.id);
      if (error) throw error;
    } catch (error) {
      setCategories((current) => current.map((item) => item.id === category.id ? { ...item, purpose: previousPurpose } : item));
      setErrorMessage(error instanceof Error ? error.message : "Could not save the category purpose.");
    } finally {
      setSavingId(null);
    }
  }

  async function saveBudget(category: DashboardCategory, rawBudget?: string) {
    const parsedAmount = Number(rawBudget ?? draftBudgets[category.id] ?? "0");
    const amount = Number.isFinite(parsedAmount) ? Math.max(0, Math.round(parsedAmount * 100) / 100) : 0;
    const previousAmount = category.monthlyBudget;
    setDraftBudgets((current) => ({ ...current, [category.id]: formatInputAmount(amount) }));
    setCategories((current) => current.map((item) => item.id === category.id ? { ...item, monthlyBudget: amount } : item));
    setErrorMessage(null);
    setSavingId(category.id);

    try {
      const { supabase, user } = await getCurrentUser();
      let budgetId = category.budgetId;

      if (!budgetId) {
        const { data: budget, error: budgetError } = await supabase
          .from("budgets")
          .upsert({ user_id: user.id, month, total_budget_cents: 0 }, { onConflict: "user_id,month" })
          .select("id")
          .single();
        if (budgetError || !budget) throw budgetError ?? new Error("Could not create the monthly budget.");
        budgetId = budget.id;
        setCategories((current) => current.map((item) => ({ ...item, budgetId })));
      }

      const { error: categoryBudgetError } = await supabase
        .from("budget_categories")
        .upsert(
          { user_id: user.id, budget_id: budgetId, category_id: category.id, budget_cents: Math.round(amount * 100) },
          { onConflict: "budget_id,category_id" },
        );
      if (categoryBudgetError) throw categoryBudgetError;

      const nextTotalBudget = categories.reduce(
        (total, item) => total + (item.categoryType === "expense" ? (item.id === category.id ? amount : item.monthlyBudget) : 0),
        0,
      );
      const { error: totalBudgetError } = await supabase
        .from("budgets")
        .update({ total_budget_cents: Math.round(nextTotalBudget * 100) })
        .eq("id", budgetId);
      if (totalBudgetError) throw totalBudgetError;
    } catch (error) {
      setCategories((current) => current.map((item) => item.id === category.id ? { ...item, monthlyBudget: previousAmount } : item));
      setDraftBudgets((current) => ({ ...current, [category.id]: formatInputAmount(previousAmount) }));
      setErrorMessage(error instanceof Error ? error.message : "Could not save the monthly budget.");
    } finally {
      setSavingId(null);
    }
  }

  async function addCategory(type: CategoryType) {
    const name = newNames[type].trim();
    if (!name) return;

    setErrorMessage(null);
    setSavingId(`new-${type}`);
    try {
      const { supabase, user } = await getCurrentUser();
      const { data: row, error } = await supabase
        .from("categories")
        .insert({
          user_id: user.id,
          name,
          category_type: type,
          purpose: newPurposes[type],
          color: type === "expense" ? "#f6c1b3" : "#c8e8d4",
          icon: type === "expense" ? "✦" : "↗",
        })
        .select("id, name, category_type, purpose, color, icon")
        .single();
      if (error || !row) throw error ?? new Error("Could not add the category.");

      const category: DashboardCategory = {
        id: row.id,
        name: row.name,
        categoryType: row.category_type === "income" ? "income" : "expense",
        purpose: normalizeCategoryPurpose(row.purpose),
        color: row.color,
        icon: row.icon,
        monthlyBudget: 0,
        spent: 0,
        received: 0,
        budgetId: categories.find((item) => item.budgetId)?.budgetId ?? null,
      };
      setCategories((current) => [...current, category].sort((a, b) => a.name.localeCompare(b.name)));
      setNewNames((current) => ({ ...current, [type]: "" }));
      setDraftBudgets((current) => ({ ...current, [category.id]: "" }));
      setNoBudgets((current) => ({ ...current, [category.id]: true }));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not add the category.");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <main className="category-planner" aria-labelledby="category-planner-title">
      <header className="category-planner-heading">
        <div>
          <h1 id="category-planner-title">{monthLabel}</h1>
          <p>Monthly planner</p>
        </div>
        <span className="category-planner-month" aria-hidden="true">{month}</span>
      </header>

      <section className="purpose-guide" aria-labelledby="purpose-guide-title">
        <div className="purpose-guide-heading">
          <h2 id="purpose-guide-title">Category purposes</h2>
          <p>Every category belongs to one of these four bigger buckets.</p>
        </div>
        <div className="purpose-options">
          {CATEGORY_PURPOSES.map((purpose) => (
            <div className={`purpose-option ${purpose.className}`} key={purpose.value}>
              <strong>{purpose.label}</strong>
              <span>{purpose.description}</span>
            </div>
          ))}
        </div>
      </section>

      {errorMessage ? <p className="category-error" role="alert">{errorMessage}</p> : null}

      <div className="category-columns">
        <CategorySection
          type="expense"
          categories={expenseCategories}
          currencyCode={currencyCode}
          draftBudgets={draftBudgets}
          noBudgets={noBudgets}
          savingId={savingId}
          newName={newNames.expense}
          newPurpose={newPurposes.expense}
          onBudgetChange={(id, value) => setDraftBudgets((current) => ({ ...current, [id]: value }))}
          onBudgetBlur={saveBudget}
          onNoBudgetChange={(category, checked) => {
            setNoBudgets((current) => ({ ...current, [category.id]: checked }));
            if (checked) {
              setDraftBudgets((current) => ({ ...current, [category.id]: "" }));
              void saveBudget(category, "0");
            }
          }}
          onPurposeChange={savePurpose}
          onNewNameChange={(value) => setNewNames((current) => ({ ...current, expense: value }))}
          onNewPurposeChange={(purpose) => setNewPurposes((current) => ({ ...current, expense: purpose }))}
          onAdd={() => void addCategory("expense")}
        />
        <CategorySection
          type="income"
          categories={incomeCategories}
          currencyCode={currencyCode}
          draftBudgets={draftBudgets}
          noBudgets={noBudgets}
          savingId={savingId}
          newName={newNames.income}
          newPurpose={newPurposes.income}
          onBudgetChange={(id, value) => setDraftBudgets((current) => ({ ...current, [id]: value }))}
          onBudgetBlur={saveBudget}
          onNoBudgetChange={(category, checked) => {
            setNoBudgets((current) => ({ ...current, [category.id]: checked }));
            if (checked) {
              setDraftBudgets((current) => ({ ...current, [category.id]: "" }));
              void saveBudget(category, "0");
            }
          }}
          onPurposeChange={savePurpose}
          onNewNameChange={(value) => setNewNames((current) => ({ ...current, income: value }))}
          onNewPurposeChange={(purpose) => setNewPurposes((current) => ({ ...current, income: purpose }))}
          onAdd={() => void addCategory("income")}
        />
      </div>
    </main>
  );
}
