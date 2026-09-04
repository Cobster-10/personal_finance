import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { decryptPlaidAccessToken } from "@/lib/plaid/crypto";
import { getPlaidClient, getPlaidEnvironment } from "@/lib/plaid/server";

const SYNC_LEASE_SECONDS = 10 * 60;
const MAX_PAGINATION_RESTARTS = 3;

type SyncedTransaction = {
  user_id: string;
  account_id: string;
  amount_cents: number;
  transaction_date: string;
  merchant_name: string | null;
  description: string | null;
  status: "pending" | "cleared";
  source: "bank";
  plaid_transaction_id: string;
  plaid_pending_transaction_id: string | null;
  currency_code: string | null;
};

function hasPlaidErrorCode(error: unknown, code: string) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { response?: { data?: { error_code?: unknown } }; error_code?: unknown };
  return candidate.response?.data?.error_code === code || candidate.error_code === code;
}

export async function syncPlaidItem(userId: string, plaidItemRowId: string) {
  const admin = createAdminClient();
  const syncLockToken = crypto.randomUUID();
  const { data: claimed, error: claimError } = await admin.rpc("claim_plaid_item_sync", {
    p_item_id: plaidItemRowId,
    p_user_id: userId,
    p_lock_token: syncLockToken,
    p_lease_seconds: SYNC_LEASE_SECONDS,
  });
  if (claimError) throw claimError;

  // Another invocation is already fetching this Item. It will commit its cursor
  // and data atomically, so there is nothing for this invocation to do.
  if (!claimed) return { importedCount: 0, updateStatus: "NOT_READY" };

  try {
    const { data: item, error: itemError } = await admin
      .from("plaid_items")
      .select("id, access_token_ciphertext, sync_cursor, plaid_environment")
      .eq("id", plaidItemRowId)
      .eq("user_id", userId)
      .single();
    if (itemError || !item) throw itemError ?? new Error("Plaid Item was not found.");
    if (item.plaid_environment !== getPlaidEnvironment()) {
      throw new Error("Plaid Item environment does not match the configured environment.");
    }

    const { data: accountRows, error: accountError } = await admin
      .from("accounts")
      .select("id, plaid_account_id")
      .eq("user_id", userId)
      .eq("plaid_item_id", plaidItemRowId);
    if (accountError) throw accountError;

    const accountIds = new Map(
      accountRows.filter((account) => account.plaid_account_id).map((account) => [account.plaid_account_id as string, account.id]),
    );
    const plaid = getPlaidClient();
    // Retain this cursor for a full restart. Plaid can mutate data while a
    // multi-page sync is in progress; retries must begin at the first page.
    const startingCursor = item.sync_cursor ?? undefined;
    let cursor = startingCursor;
    let updateStatus = "NOT_READY";
    let updates: SyncedTransaction[] = [];
    let removedIds: string[] = [];

    for (let restart = 0; restart <= MAX_PAGINATION_RESTARTS; restart += 1) {
      cursor = startingCursor;
      const updatesByPlaidId = new Map<string, SyncedTransaction>();
      removedIds = [];

      try {
        do {
          const { data } = await plaid.transactionsSync({
            access_token: decryptPlaidAccessToken(item.access_token_ciphertext),
            ...(cursor ? { cursor } : {}),
            count: 500,
            options: { include_original_description: true },
          });
          updateStatus = data.transactions_update_status;

          const pageUpdates: SyncedTransaction[] = [...data.added, ...data.modified].flatMap((transaction): SyncedTransaction[] => {
            const accountId = accountIds.get(transaction.account_id);
            const amountCents = Math.round(-transaction.amount * 100);
            if (!accountId || amountCents === 0) return [];
            return [{
              user_id: userId,
              account_id: accountId,
              amount_cents: amountCents,
              transaction_date: transaction.date,
              merchant_name: transaction.merchant_name ?? transaction.name ?? null,
              description: transaction.original_description ?? null,
              status: transaction.pending ? "pending" : "cleared",
              source: "bank",
              plaid_transaction_id: transaction.transaction_id,
              plaid_pending_transaction_id: transaction.pending_transaction_id,
              currency_code: transaction.iso_currency_code,
            }];
          });
          pageUpdates.forEach((transaction) => updatesByPlaidId.set(transaction.plaid_transaction_id, transaction));
          removedIds.push(...data.removed.map((transaction) => transaction.transaction_id));

          if (data.has_more && !data.next_cursor) throw new Error("Plaid returned more transaction updates without a cursor.");
          cursor = data.next_cursor || cursor;
          if (!data.has_more) break;
        } while (cursor);
        updates = [...updatesByPlaidId.values()];
        break;
      } catch (error) {
        if (!hasPlaidErrorCode(error, "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION") || restart === MAX_PAGINATION_RESTARTS) {
          throw error;
        }
      }
    }

    // The RPC applies transactions, removals, and the final cursor in one database
    // transaction. No page is visible and no cursor advances until all pages arrive.
    if (!cursor) throw new Error("Plaid did not return a transaction sync cursor.");

    const { error: applyError } = await admin.rpc("apply_plaid_item_sync", {
      p_item_id: plaidItemRowId,
      p_user_id: userId,
      p_lock_token: syncLockToken,
      p_next_cursor: cursor,
      p_transactions: updates,
      p_removed_transaction_ids: removedIds,
    });
    if (applyError) throw applyError;

    return { importedCount: updates.length, updateStatus };
  } finally {
    const { error: releaseError } = await admin.rpc("release_plaid_item_sync", {
      p_item_id: plaidItemRowId,
      p_user_id: userId,
      p_lock_token: syncLockToken,
    });
    if (releaseError) console.error("Unable to release Plaid sync lease", releaseError.message);
  }
}
