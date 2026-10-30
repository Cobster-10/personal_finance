import { NextResponse } from "next/server";
import { CountryCode, type LinkTokenCreateRequest } from "plaid";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptPlaidAccessToken, encryptPlaidAccessToken } from "@/lib/plaid/crypto";
import { getPlaidClient, getPlaidEnvironment, plaidErrorMessage } from "@/lib/plaid/server";
import { isJsonRequest, isTrustedBrowserOrigin } from "@/lib/http/request-security";
import { MAX_LINK_ATTEMPTS_PER_HOUR, PLAID_LINK_ATTEMPT_TTL_MS } from "@/lib/plaid/link-attempts";

export const runtime = "nodejs";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  if (!isTrustedBrowserOrigin(request) || !isJsonRequest(request)) return NextResponse.json({ error: "Invalid request." }, { status: 403 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });

  let body: { item_id?: unknown };
  try { body = await request.json() as { item_id?: unknown }; } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  if (typeof body.item_id !== "string" || !UUID_PATTERN.test(body.item_id)) {
    return NextResponse.json({ error: "Invalid connected institution." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: item, error: itemError } = await admin
    .from("plaid_items")
    .select("id, access_token_ciphertext")
    .eq("id", body.item_id)
    .eq("user_id", user.id)
    .eq("plaid_environment", getPlaidEnvironment())
    .eq("status", "login_required")
    .maybeSingle();
  if (itemError) return NextResponse.json({ error: "Could not start the account reconnection." }, { status: 500 });
  if (!item) return NextResponse.json({ error: "This institution no longer needs reconnection or is unavailable." }, { status: 409 });

  let attemptId: string | null = null;
  try {
    const { data: reservedAttemptId, error: reservationError } = await admin.rpc("reserve_plaid_link_update_attempt", {
      p_user_id: user.id,
      p_item_id: item.id,
      p_plaid_environment: getPlaidEnvironment(),
      p_expires_at: new Date(Date.now() + PLAID_LINK_ATTEMPT_TTL_MS).toISOString(),
      p_max_attempts: MAX_LINK_ATTEMPTS_PER_HOUR,
    });
    if (reservationError || !reservedAttemptId) {
      const message = reservationError?.message ?? "Could not reserve the account reconnection.";
      return NextResponse.json({ error: message }, { status: message.includes("quota") ? 429 : 409 });
    }
    attemptId = reservedAttemptId;

    const linkTokenRequest: LinkTokenCreateRequest = {
      client_name: "Sketch Finance",
      language: "en",
      country_codes: [CountryCode.Us],
      user: { client_user_id: user.id },
      access_token: decryptPlaidAccessToken(item.access_token_ciphertext),
    };
    const customizationName = process.env.PLAID_LINK_CUSTOMIZATION_NAME;
    if (customizationName) linkTokenRequest.link_customization_name = customizationName;

    const { data } = await getPlaidClient().linkTokenCreate(linkTokenRequest);
    const expiresAt = new Date(Math.min(Date.parse(data.expiration), Date.now() + PLAID_LINK_ATTEMPT_TTL_MS));
    const { data: readyAttempt, error } = await admin.from("plaid_link_attempts").update({
      encrypted_link_token: encryptPlaidAccessToken(data.link_token),
      expires_at: expiresAt.toISOString(),
      is_ready: true,
    }).eq("id", attemptId).eq("user_id", user.id).eq("plaid_item_id", item.id).eq("is_ready", false).select("id").maybeSingle();
    if (error || !readyAttempt) throw error ?? new Error("Could not secure the Plaid Link attempt.");

    return NextResponse.json({ link_token: data.link_token, link_attempt_id: attemptId });
  } catch (error) {
    if (attemptId) await admin.from("plaid_link_attempts").delete().eq("id", attemptId).eq("user_id", user.id);
    return NextResponse.json({ error: plaidErrorMessage(error) }, { status: 502 });
  }
}
