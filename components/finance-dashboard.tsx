"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { CandyJarViewer } from "@/components/candy-jar-viewer";
import { ReceiptStackMeter } from "@/components/receipt-stack-meter";
import type { DashboardData, DashboardExpense } from "@/lib/finance/dashboard-data";
import { SignOutButton } from "@/components/sign-out-button";

type NavItem = {
  label: string;
  icon: string;
};

const navItems: NavItem[] = [
  { label: "Snapshot", icon: "/assets/nav-snapshot.svg" },
  { label: "Money In", icon: "/assets/nav-money-in.svg" },
  { label: "Spending", icon: "/assets/nav-spending.svg" },
  { label: "Settings", icon: "/assets/nav-settings.svg" },
];

function formatMoney(value: number, currencyCode: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode,
    maximumFractionDigits: 0,
  }).format(value);
}

function ExpenseMeter({ category, spent, budget, currencyCode }: DashboardExpense & { currencyCode: string }) {
  const percentage = budget > 0 ? Math.min(Math.round((spent / budget) * 100), 100) : 0;

  return (
    <article className="expense-card" aria-label={`${category}: ${percentage}% of budget used`}>
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
    </article>
  );
}

function IncomeBottle() {
  return (
    <div className="income-bottle">
      <CandyJarViewer className="candy-jar-viewer" src="/assets/models/candy-jar/candy_jar.glb" />
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
          <SignOutButton />
        </div>
      </header>

      <main className="dashboard" id="snapshot">
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

          <IncomeBottle />

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
            {initialData.expenses.map((expense) => (
              <ExpenseMeter key={expense.category} {...expense} currencyCode={initialData.currencyCode} />
            ))}
          </div>
        </section>
      </main>

      <p className="view-status" aria-live="polite">
        {activeTab} · {initialData.monthLabel}
      </p>
    </div>
  );
}
