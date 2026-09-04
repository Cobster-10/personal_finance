import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { SignOutButton } from "@/components/sign-out-button";
import { TransactionCategorySelect } from "@/components/transaction-category-select";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const ledgerNavItems = [
  { label: "Snapshot", icon: "/assets/nav-snapshot.svg", href: "/" },
  { label: "Transactions", icon: "/assets/nav-transactions.svg", href: "/transactions" },
  { label: "Categories", icon: "/assets/nav-categories.svg", href: "/?tab=categories" },
  { label: "Settings", icon: "/assets/nav-settings.svg" },
];

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

function formatAmount(amountCents: number, currencyCode: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode,
    signDisplay: "always",
  }).format(amountCents / 100);
}

function accountLabel(account: { name: string; account_mask: string | null }) {
  return account.account_mask ? `${account.name} ····${account.account_mask}` : account.name;
}

export default async function TransactionsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [
    { data: transactions, error: transactionsError },
    { data: accounts, error: accountsError },
    { data: categories, error: categoriesError },
  ] = await Promise.all([
    supabase
      .from("transactions")
      .select("id, account_id, category_id, transaction_date, amount_cents, merchant_name, description, status, source, currency_code, plaid_transaction_id")
      .eq("user_id", user.id)
      .order("transaction_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1000),
    supabase
      .from("accounts")
      .select("id, name, account_mask, institution_name, currency_code")
      .eq("user_id", user.id)
      .eq("is_archived", false)
      .order("name"),
    supabase
      .from("categories")
      .select("id, name, category_type")
      .eq("user_id", user.id)
      .order("category_type")
      .order("name"),
  ]);

  if (transactionsError || accountsError || categoriesError) {
    throw transactionsError ?? accountsError ?? categoriesError;
  }

  const accountMap = new Map((accounts ?? []).map((account) => [account.id, account]));
  const oldestTransaction = transactions?.at(-1)?.transaction_date;
  const newestTransaction = transactions?.[0]?.transaction_date;

  return (
    <div className="ledger-page">
      <header className="ledger-topbar">
        <Link className="ledger-brand" href="/" aria-label="Sketch Finance snapshot">
          <Image src="/assets/app-logo.svg" alt="" width={38} height={38} />
          <span>Sketch Finance</span>
        </Link>
        <nav className="sketch-nav ledger-nav" aria-label="Primary navigation">
          {ledgerNavItems.map((item, index) => (
            <div className="nav-slot" key={item.label}>
              {item.href ? (
                <Link
                  className={`nav-button ${item.label === "Transactions" ? "is-active" : ""}`}
                  href={item.href}
                  aria-current={item.label === "Transactions" ? "page" : undefined}
                >
                  <Image src={item.icon} alt="" width={24} height={24} />
                  <span>{item.label}</span>
                </Link>
              ) : (
                <button className="nav-button" type="button" disabled title="Available from Snapshot">
                  <Image src={item.icon} alt="" width={24} height={24} />
                  <span>{item.label}</span>
                </button>
              )}
              {index < ledgerNavItems.length - 1 ? <span className="nav-separator" aria-hidden="true" /> : null}
            </div>
          ))}
        </nav>
        <div className="ledger-actions">
          <SignOutButton />
        </div>
      </header>

      <main className="ledger-main">
        <div className="ledger-heading">
          <div>
            <p className="ledger-eyebrow">Bank feed</p>
            <h1>Transactions</h1>
            <p className="ledger-description">
              A chronological view of the transaction data received from your connected accounts.
            </p>
          </div>
          <div className="ledger-summary" aria-label="Transaction summary">
            <strong>{transactions?.length ?? 0}</strong>
            <span>records loaded</span>
            {oldestTransaction && newestTransaction ? (
              <small>{formatDate(oldestTransaction)} – {formatDate(newestTransaction)}</small>
            ) : null}
          </div>
        </div>

        {accounts && accounts.length > 0 ? (
          <section className="ledger-accounts" aria-labelledby="connected-accounts-heading">
            <div className="ledger-section-heading">
              <h2 id="connected-accounts-heading">Connected accounts</h2>
              <span>{accounts.length} active</span>
            </div>
            <div className="ledger-account-list">
              {accounts.map((account) => (
                <div className="ledger-account-card" key={account.id}>
                  <span className="ledger-account-dot" aria-hidden="true" />
                  <div>
                    <strong>{accountLabel(account)}</strong>
                    <span>{account.institution_name ?? "Connected account"} · {account.currency_code}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <section className="ledger-table-wrap" aria-labelledby="ledger-heading">
          <div className="ledger-section-heading">
            <h2 id="ledger-heading">Ledger</h2>
            <span>Newest first</span>
          </div>
          {transactions && transactions.length > 0 ? (
            <div className="ledger-scroll">
              <table className="ledger-table">
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col">Transaction</th>
                    <th scope="col">Account</th>
                    <th scope="col">Category</th>
                    <th scope="col">Status</th>
                    <th scope="col">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((transaction) => {
                    const account = accountMap.get(transaction.account_id);
                    const currencyCode = transaction.currency_code ?? account?.currency_code ?? "USD";
                    return (
                      <tr key={transaction.id}>
                        <td>{formatDate(transaction.transaction_date)}</td>
                        <td>
                          <strong>{transaction.merchant_name ?? "Unknown merchant"}</strong>
                          <span>{transaction.description ?? "No description"}</span>
                          <small>{transaction.source}{transaction.plaid_transaction_id ? ` · Plaid ${transaction.plaid_transaction_id.slice(0, 8)}…` : ""} · {currencyCode}</small>
                        </td>
                        <td>{account ? accountLabel(account) : "Unknown account"}</td>
                        <td className="ledger-category-cell">
                          <TransactionCategorySelect
                            transactionId={transaction.id}
                            amountCents={transaction.amount_cents}
                            categoryId={transaction.category_id}
                            description={transaction.merchant_name ?? transaction.description ?? "transaction"}
                            categories={categories ?? []}
                          />
                        </td>
                        <td><span className={`ledger-status ledger-status-${transaction.status}`}>{transaction.status}</span></td>
                        <td className={transaction.amount_cents >= 0 ? "ledger-amount ledger-amount-positive" : "ledger-amount"}>
                          {formatAmount(transaction.amount_cents, currencyCode)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="ledger-empty-state">
              <span className="ledger-empty-mark" aria-hidden="true">∿</span>
              <h3>No transactions loaded yet</h3>
              <p>Connect a Sandbox account, then return here after Plaid finishes its initial sync.</p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
