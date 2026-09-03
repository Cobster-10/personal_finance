import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { decryptPlaidAccessToken } from "@/lib/plaid/crypto";
import { getPlaidClient, getPlaidEnvironment } from "@/lib/plaid/server";

export async function syncPlaidItem(userId: string, plaidItemRowId: string) {
  const admin = createAdminClient();
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
  let cursor = item.sync_cursor ?? undefined;
  let updateStatus = "NOT_READY";
  let importedCount = 0;

  do {
    const { data } = await plaid.transactionsSync({
      access_token: decryptPlaidAccessToken(item.access_token_ciphertext),
      ...(cursor ? { cursor } : {}),
      count: 500,
      options: { include_original_description: true },
    });
    updateStatus = data.transactions_update_status;

    const updates = [...data.added, ...data.modified].flatMap((transaction) => {
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

    if (updates.length > 0) {
      const { error } = await admin.from("transactions").upsert(updates, {
        onConflict: "user_id,plaid_transaction_id",
      });
      if (error) throw error;
      importedCount += updates.length;
    }

    const removedIds = data.removed.map((transaction) => transaction.transaction_id);
    if (removedIds.length > 0) {
      const { error } = await admin
        .from("transactions")
        .delete()
        .eq("user_id", userId)
        .in("plaid_transaction_id", removedIds);
      if (error) throw error;
    }

    cursor = data.next_cursor || cursor;
    if (!data.has_more) break;
  } while (cursor);

  const { error: updateError } = await admin
    .from("plaid_items")
    .update({ sync_cursor: cursor ?? null, status: "healthy" })
    .eq("id", plaidItemRowId)
    .eq("user_id", userId);
  if (updateError) throw updateError;

  return { importedCount, updateStatus };
}
