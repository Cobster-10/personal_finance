"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { CandyJarViewer } from "@/components/candy-jar-viewer";
import { ReceiptStackMeter } from "@/components/receipt-stack-meter";
import { CategoryPlanner } from "@/components/category-planner";
import type { DashboardData, DashboardExpense } from "@/lib/finance/dashboard-data";
import { SignOutButton } from "@/components/sign-out-button";
import { ConnectAccountButton } from "@/components/connect-account-button";

type NavItem = {
  label: string;
  icon: string;
};

const navItems: NavItem[] = [
  { label: "Snapshot", icon: "/assets/nav-snapshot.svg" },
  { label: "Transactions", icon: "/assets/nav-transactions.svg" },
  { label: "Categories", icon: "/assets/nav-categories.svg" },
  { label: "Settings", icon: "/assets/nav-settings.svg" },
];

function formatMoney(value: number, currencyCode: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode,
    maximumFractionDigits: 0,
  }).format(value);
}

function ExpenseMeter({
  category,
  spent,
  budget,
  currencyCode,
  onOpen,
}: DashboardExpense & { currencyCode: string; onOpen: () => void }) {
  const percentage = budget > 0 ? Math.min(Math.round((spent / budget) * 100), 100) : 0;

  return (
    <button
      className="expense-card"
      type="button"
      aria-label={`Open ${category} spending details`}
      onClick={onOpen}
    >
      <h2>{category}</h2>
      <div className="expense-meter" aria-hidden="true">
        <div className="expense-fill" style={{ height: `${percentage}%` }} />
        <div className="expense-outline" />
        <span className="expense-progress">{percentage}% used</span>
      </div>
      <div className="expense-stats">
        <div>
          <strong>{formatMoney(spent, currencyCode)}</strong>
          <span>spent</span>
        </div>
        <div className="expense-budget">
          <strong>{formatMoney(budget, currencyCode)}</strong>
          <span>budget</span>
        </div>
      </div>
    </button>
  );
}

function ExpenseDetailsModal({
  expense,
  currencyCode,
  onClose,
  onViewTransactions,
}: {
  expense: DashboardExpense;
  currencyCode: string;
  onClose: () => void;
  onViewTransactions: () => void;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const remaining = expense.budget - expense.spent;
  const usedPercentage = expense.budget > 0 ? Math.round((expense.spent / expense.budget) * 100) : 0;
  const scaleMaximum = Math.max(expense.budget * 2, expense.spent, 1);
  const budgetMarker = (expense.budget / scaleMaximum) * 100;
  const transactions = expense.transactions ?? [];

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return (
    <div className="expense-modal-backdrop">
      <button className="expense-modal-scrim" type="button" aria-label="Close spending details" onClick={onClose} />
      <section className="expense-modal" role="dialog" aria-modal="true" aria-labelledby="expense-modal-title">
        <header className="expense-modal-header">
          <div className="expense-modal-title-wrap">
            <span className="expense-modal-arrow" aria-hidden="true">→</span>
            <h2 id="expense-modal-title">{expense.category} Details</h2>
            <span className="expense-modal-mark" aria-hidden="true">⌁</span>
          </div>
          <button ref={closeButtonRef} className="expense-modal-close" type="button" aria-label="Close spending details" onClick={onClose}>
            ×
          </button>
        </header>

        <div className="expense-modal-summary">
          <div>
            <span>Budget</span>
            <strong className="modal-budget-value">{formatMoney(expense.budget, currencyCode)}</strong>
          </div>
          <div>
            <span>Spent</span>
            <strong className="modal-spent-value">{formatMoney(expense.spent, currencyCode)}</strong>
          </div>
          <div>
            <span>Remaining</span>
            <strong className={remaining < 0 ? "modal-over-value" : "modal-remaining-value"}>
              {formatMoney(remaining, currencyCode)}
            </strong>
          </div>
        </div>

        <div className="modal-budget-visual" aria-label={`${usedPercentage}% of budget used`}>
          <div className="modal-budget-track">
            <div className="modal-budget-fill" style={{ width: `${(expense.spent / scaleMaximum) * 100}%` }} />
            <span className="modal-budget-marker" style={{ left: `${budgetMarker}%` }} aria-hidden="true" />
          </div>
          <div className="modal-budget-axis" aria-hidden="true">
            <span>$0</span>
            <span>{formatMoney(expense.budget, currencyCode)} budget</span>
            <span>{formatMoney(scaleMaximum, currencyCode)}</span>
          </div>
          <div className="modal-budget-status">
            <span>{usedPercentage}% used</span>
            <strong>{remaining < 0 ? `${formatMoney(Math.abs(remaining), currencyCode)} over budget` : "On track"}</strong>
          </div>
        </div>

        <section className="modal-transactions" aria-labelledby="recent-transactions-title">
          <h3 id="recent-transactions-title">Recent Transactions</h3>
          {transactions.length > 0 ? (
            <div className="modal-transaction-list">
              {transactions.map((transaction, index) => (
                <div className="modal-transaction-row" key={`${transaction.date}-${transaction.description}-${index}`}>
                  <span className="modal-transaction-icon" aria-hidden="true">$</span>
                  <div>
                    <strong>{transaction.description}</strong>
                    <span>{transaction.date}</span>
                  </div>
                  <em>{formatMoney(-transaction.amount, currencyCode)}</em>
                </div>
              ))}
            </div>
          ) : (
            <div className="modal-empty-transactions">
              <span className="modal-empty-circle" aria-hidden="true" />
              <p>No transactions recorded yet</p>
              <span>Add an expense to see it here.</span>
            </div>
          )}
        </section>

        <button className="modal-view-all" type="button" onClick={onViewTransactions}>
          View all spending transactions
        </button>
      </section>
    </div>
  );
}

function IncomeBottle({ expectedIncome, depositedIncome }: Pick<DashboardData, "expectedIncome" | "depositedIncome">) {
  const liquidLevel = expectedIncome > 0 ? Math.min(depositedIncome / expectedIncome, 1) : 0;

  return (
    <div className="income-bottle">
      <CandyJarViewer
        className="candy-jar-viewer"
        liquidColor="#339457"
        liquidLevel={liquidLevel}
        src="/assets/models/candy-jar/candy_jar.glb"
      />
      <span className="bottle-shadow bottle-shadow-wide" />
      <span className="bottle-shadow bottle-shadow-short" />
      <p className="model-credit">
        <a
          href="https://sketchfab.com/3d-models/candy-jar-1e5534d5bd2d4e60ba18201b895c2704"
          target="_blank"
          rel="noreferrer"
        >
          Candy Jar
        </a>{" "}
        by{" "}
        <a href="https://sketchfab.com/yeeyeeman" target="_blank" rel="noreferrer">
          yeeyeeman
        </a>
      </p>
    </div>
  );
}

export function FinanceDashboard({ initialData }: { initialData: DashboardData }) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("Snapshot");
  const [month, setMonth] = useState(initialData.month);
  const [totalBudget, setTotalBudget] = useState(initialData.totalBudget);
  const [currentSpent, setCurrentSpent] = useState(initialData.currentSpent);
  const [selectedExpense, setSelectedExpense] = useState<DashboardExpense | null>(null);

  return (
    <div className="finance-app">
      <header className="topbar">
        <a className="brand" href="#snapshot" aria-label="Sketch Finance home">
          <Image src="/assets/app-logo.svg" alt="" width={46} height={46} />
        </a>

        <nav className="sketch-nav" aria-label="Primary navigation">
          {navItems.map((item, index) => (
            <div className="nav-slot" key={item.label}>
              <button
                className={`nav-button ${activeTab === item.label ? "is-active" : ""}`}
                type="button"
                aria-current={activeTab === item.label ? "page" : undefined}
                onClick={() => setActiveTab(item.label)}
              >
                <Image src={item.icon} alt="" width={24} height={24} />
                <span>{item.label}</span>
              </button>
              {index < navItems.length - 1 ? <span className="nav-separator" aria-hidden="true" /> : null}
            </div>
          ))}
        </nav>

        <div className="account-controls">
          <label className="month-control">
            <Image src="/assets/calendar.svg" alt="" width={26} height={26} />
            <span className="sr-only">Dashboard month</span>
            <span className="month-select-shell">
              <select
                value={month}
                onChange={(event) => {
                  const value = event.target.value;
                  setMonth(value);
                  router.push(`/?month=${value}`);
                }}
              >
                {initialData.months.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <Image className="select-chevron" src="/assets/chevron.svg" alt="" width={17} height={17} />
            </span>
          </label>
          <ConnectAccountButton />
          <SignOutButton />
        </div>
      </header>

      {activeTab === "Categories" ? (
        <CategoryPlanner
          initialCategories={initialData.categories}
          month={initialData.month}
          monthLabel={initialData.monthLabel}
          currencyCode={initialData.currencyCode}
        />
      ) : null}

      {activeTab !== "Categories" ? <main className="dashboard" id="snapshot">
        <section className="income-panel" aria-labelledby="income-heading">
          <h1 className="sr-only" id="income-heading">Income snapshot for {initialData.monthLabel}</h1>

          <div className="income-stat income-expected">
            <strong>{formatMoney(initialData.expectedIncome, initialData.currencyCode)}</strong>
            <span>expected</span>
          </div>
          <span className="income-dash income-dash-expected" aria-hidden="true" />

          <div className="income-stat income-deposited">
            <strong>{formatMoney(initialData.depositedIncome, initialData.currencyCode)}</strong>
            <span>deposited</span>
          </div>
          <span className="income-dash income-dash-deposited" aria-hidden="true" />

          <IncomeBottle expectedIncome={initialData.expectedIncome} depositedIncome={initialData.depositedIncome} />

          <div className="recent-income">
            <div className="transaction-row">
              <Image src="/assets/transaction-check.svg" alt="" width={23} height={23} />
              <div>
                <p>{initialData.recentIncome ? `${initialData.recentIncome.date} · ${initialData.recentIncome.description}` : "No income recorded"}</p>
                <strong>{initialData.recentIncome ? `+${formatMoney(initialData.recentIncome.amount, initialData.currencyCode)}` : formatMoney(0, initialData.currencyCode)}</strong>
              </div>
            </div>
          </div>
        </section>

        <section className="spending-panel" aria-labelledby="spending-heading">
          <h2 className="sr-only" id="spending-heading">Monthly spending</h2>
          <ReceiptStackMeter
            totalBudget={totalBudget}
            currentSpent={currentSpent}
            onTotalBudgetChange={setTotalBudget}
            onCurrentSpentChange={setCurrentSpent}
          />

          <div className="expense-grid">
            {initialData.expenses.length > 0 ? initialData.expenses.map((expense) => (
              <ExpenseMeter
                key={expense.category}
                {...expense}
                currencyCode={initialData.currencyCode}
                onOpen={() => setSelectedExpense(expense)}
              />
            )) : (
              <div className="expense-empty-state">
                <span className="expense-empty-circle" aria-hidden="true" />
                <p>No expense categories recorded for this month.</p>
              </div>
            )}
          </div>
        </section>
      </main> : null}

      {selectedExpense ? (
        <ExpenseDetailsModal
          expense={selectedExpense}
          currencyCode={initialData.currencyCode}
          onClose={() => setSelectedExpense(null)}
          onViewTransactions={() => {
            setSelectedExpense(null);
            setActiveTab("Transactions");
          }}
        />
      ) : null}

      <p className="view-status" aria-live="polite">
        {activeTab} · {initialData.monthLabel}
      </p>
    </div>
  );
}
