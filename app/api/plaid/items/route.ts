import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptPlaidAccessToken } from "@/lib/plaid/crypto";
import { isJsonRequest, isTrustedBrowserOrigin } from "@/lib/http/request-security";
import { getPlaidClient, getPlaidEnvironment, plaidErrorMessage } from "@/lib/plaid/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

async function currentUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });

  const { data, error } = await createAdminClient()
    .from("plaid_items")
    .select("id, institution_name, status")
    .eq("user_id", user.id)
    .eq("plaid_environment", getPlaidEnvironment())
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: "Could not load connected institutions." }, { status: 500 });
  return NextResponse.json({ items: data });
}

export async function DELETE(request: Request) {
  if (!isTrustedBrowserOrigin(request) || !isJsonRequest(request)) return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });

  let body: { item_id?: unknown };
  try { body = await request.json() as { item_id?: unknown }; } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  if (typeof body.item_id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.item_id)) {
    return NextResponse.json({ error: "Invalid connected institution." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: item, error } = await admin
    .from("plaid_items")
    .select("id, access_token_ciphertext, status")
    .eq("id", body.item_id)
    .eq("user_id", user.id)
    .eq("plaid_environment", getPlaidEnvironment())
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Could not disconnect the institution." }, { status: 500 });
  if (!item) return NextResponse.json({ error: "Connected institution not found." }, { status: 404 });

  let plaidRemovalSucceeded = item.status === "revoked";
  try {
    if (item.status !== "revoked") {
      await getPlaidClient().itemRemove({ access_token: decryptPlaidAccessToken(item.access_token_ciphertext) });
      plaidRemovalSucceeded = true;
    }
    const { error: accountsError } = await admin.from("accounts").delete().eq("user_id", user.id).eq("plaid_item_id", item.id);
    if (accountsError) throw accountsError;
    const { error: itemError } = await admin.from("plaid_items").delete().eq("id", item.id).eq("user_id", user.id);
    if (itemError) throw itemError;
    return NextResponse.json({ disconnected: true });
  } catch (disconnectError) {
    // Only a confirmed Plaid removal makes local-only cleanup safe on retry.
    if (plaidRemovalSucceeded) {
      await admin.from("plaid_items").update({ status: "revoked" }).eq("id", item.id).eq("user_id", user.id);
    }
    return NextResponse.json({ error: plaidErrorMessage(disconnectError) }, { status: 502 });
  }
}
