import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptPlaidAccessToken } from "@/lib/plaid/crypto";
import { getPlaidClient, getPlaidEnvironment, plaidErrorMessage } from "@/lib/plaid/server";
import { syncPlaidItem } from "@/lib/plaid/sync";
import { isJsonRequest, isTrustedBrowserOrigin } from "@/lib/http/request-security";
import { consumeLinkAttempt, MAX_PLAID_ITEMS_PER_USER, verifyLinkAttempt } from "@/lib/plaid/link-attempts";

export const runtime = "nodejs";

type ExchangeBody = { public_token?: unknown; link_attempt_id?: unknown };

export async function POST(request: Request) {
  if (!isTrustedBrowserOrigin(request) || !isJsonRequest(request)) return NextResponse.json({ error: "Invalid request." }, { status: 403 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });

  let body: ExchangeBody;
  try { body = await request.json() as ExchangeBody; } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  if (typeof body.public_token !== "string" || body.public_token.length > 512
    || typeof body.link_attempt_id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.link_attempt_id)) {
    return NextResponse.json({ error: "A valid Plaid public token is required." }, { status: 400 });
  }

  let exchangedAccessToken: string | undefined;
  let storedItemId: string | undefined;
  let persisted = false;
  try {
    await verifyLinkAttempt({
      userId: user.id,
      attemptId: body.link_attempt_id,
    });

    const plaid = getPlaidClient();
    const { data: exchanged } = await plaid.itemPublicTokenExchange({ public_token: body.public_token });
    exchangedAccessToken = exchanged.access_token;
    const { data: itemData } = await plaid.itemGet({ access_token: exchanged.access_token });
    const { data: accountsData } = await plaid.accountsGet({ access_token: exchanged.access_token });
    const accounts = accountsData.accounts.filter((account) =>
      (account.type === "depository" && account.subtype === "checking") ||
      (account.type === "credit" && account.subtype === "credit card"),
    );
    if (accounts.length === 0) throw new Error("No checking or credit card account was selected.");

    const admin = createAdminClient();
    const [{ count: itemCount, error: itemCountError }, { data: duplicate, error: duplicateError }] = await Promise.all([
      admin.from("plaid_items").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("plaid_environment", getPlaidEnvironment()),
      itemData.item.institution_id
        ? admin.from("plaid_items").select("id").eq("user_id", user.id).eq("plaid_environment", getPlaidEnvironment()).eq("plaid_institution_id", itemData.item.institution_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
    if (itemCountError || duplicateError) throw itemCountError ?? duplicateError;
    if ((itemCount ?? 0) >= MAX_PLAID_ITEMS_PER_USER) throw new Error("You have reached the maximum number of connected institutions.");
    if (duplicate) throw new Error("This institution is already connected. Disconnect it before connecting it again.");

    const { data: plaidItem, error: itemError } = await admin.from("plaid_items").upsert({
      user_id: user.id,
      plaid_item_id: exchanged.item_id,
      plaid_institution_id: itemData.item.institution_id,
      institution_name: itemData.item.institution_name,
      access_token_ciphertext: encryptPlaidAccessToken(exchanged.access_token),
      access_token_key_version: "v1",
      plaid_environment: getPlaidEnvironment(),
      status: "healthy",
    }, { onConflict: "user_id,plaid_item_id" }).select("id").single();
    if (itemError || !plaidItem) throw itemError ?? new Error("Could not store Plaid Item.");
    storedItemId = plaidItem.id;

    const accountRows = accounts.map((account) => ({
      user_id: user.id,
      plaid_item_id: plaidItem.id,
      plaid_account_id: account.account_id,
      account_mask: account.mask,
      name: account.type === "credit" ? "Credit card" : "Checking",
      account_type: account.type === "credit" ? "credit_card" : "checking",
      institution_name: itemData.item.institution_name,
      currency_code: account.balances.iso_currency_code ?? "USD",
      current_balance_cents: 0,
      is_archived: false,
    }));
    const { error: accountError } = await admin.from("accounts").upsert(accountRows, { onConflict: "user_id,plaid_account_id" });
    if (accountError) throw accountError;
    persisted = true;
    await consumeLinkAttempt(user.id, body.link_attempt_id);

    const sync = await syncPlaidItem(user.id, plaidItem.id);
    return NextResponse.json({ connected_accounts: accountRows.length, imported_transactions: sync.importedCount, sync_status: sync.updateStatus });
  } catch (error) {
    if (exchangedAccessToken && !persisted) {
      try {
        await getPlaidClient().itemRemove({ access_token: exchangedAccessToken });
        if (storedItemId) {
          const admin = createAdminClient();
          await admin.from("accounts").delete().eq("user_id", user.id).eq("plaid_item_id", storedItemId);
          await admin.from("plaid_items").delete().eq("id", storedItemId).eq("user_id", user.id);
        }
      } catch {
        // Preserve the original error; Plaid removal failures need operator review.
      }
    }
    return NextResponse.json({ error: plaidErrorMessage(error) }, { status: 502 });
  }
}
