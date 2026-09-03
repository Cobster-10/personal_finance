import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptPlaidAccessToken } from "@/lib/plaid/crypto";
import { getPlaidClient, getPlaidEnvironment, plaidErrorMessage } from "@/lib/plaid/server";
import { syncPlaidItem } from "@/lib/plaid/sync";

export const runtime = "nodejs";

type ExchangeBody = { public_token?: unknown; institution_name?: unknown; institution_id?: unknown };

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });

  let body: ExchangeBody;
  try { body = await request.json() as ExchangeBody; } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  if (typeof body.public_token !== "string" || body.public_token.length > 512) {
    return NextResponse.json({ error: "A valid Plaid public token is required." }, { status: 400 });
  }

  try {
    const plaid = getPlaidClient();
    const { data: exchanged } = await plaid.itemPublicTokenExchange({ public_token: body.public_token });
    const { data: itemData } = await plaid.itemGet({ access_token: exchanged.access_token });
    const { data: accountsData } = await plaid.accountsGet({ access_token: exchanged.access_token });
    const accounts = accountsData.accounts.filter((account) =>
      (account.type === "depository" && account.subtype === "checking") ||
      (account.type === "credit" && account.subtype === "credit card"),
    );
    if (accounts.length === 0) return NextResponse.json({ error: "No checking or credit card account was selected." }, { status: 400 });

    const admin = createAdminClient();
    const { data: plaidItem, error: itemError } = await admin.from("plaid_items").upsert({
      user_id: user.id,
      plaid_item_id: exchanged.item_id,
      plaid_institution_id: itemData.item.institution_id ?? (typeof body.institution_id === "string" ? body.institution_id : null),
      institution_name: itemData.item.institution_name ?? (typeof body.institution_name === "string" ? body.institution_name.slice(0, 120) : null),
      access_token_ciphertext: encryptPlaidAccessToken(exchanged.access_token),
      access_token_key_version: "v1",
      plaid_environment: getPlaidEnvironment(),
      status: "healthy",
    }, { onConflict: "user_id,plaid_item_id" }).select("id").single();
    if (itemError || !plaidItem) throw itemError ?? new Error("Could not store Plaid Item.");

    const accountRows = accounts.map((account) => ({
      user_id: user.id,
      plaid_item_id: plaidItem.id,
      plaid_account_id: account.account_id,
      account_mask: account.mask,
      name: account.type === "credit" ? "Credit card" : "Checking",
      account_type: account.type === "credit" ? "credit_card" : "checking",
      institution_name: itemData.item.institution_name ?? (typeof body.institution_name === "string" ? body.institution_name.slice(0, 120) : null),
      currency_code: account.balances.iso_currency_code ?? "USD",
      current_balance_cents: 0,
      is_archived: false,
    }));
    const { error: accountError } = await admin.from("accounts").upsert(accountRows, { onConflict: "user_id,plaid_account_id" });
    if (accountError) throw accountError;

    const sync = await syncPlaidItem(user.id, plaidItem.id);
    return NextResponse.json({ connected_accounts: accountRows.length, imported_transactions: sync.importedCount, sync_status: sync.updateStatus });
  } catch (error) {
    return NextResponse.json({ error: plaidErrorMessage(error) }, { status: 502 });
  }
}
