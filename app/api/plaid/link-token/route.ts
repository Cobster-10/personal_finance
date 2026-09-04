import { NextResponse } from "next/server";
import { CountryCode, CreditAccountSubtype, DepositoryAccountSubtype, Products, type LinkTokenCreateRequest } from "plaid";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptPlaidAccessToken } from "@/lib/plaid/crypto";
import { getPlaidClient, getPlaidEnvironment, plaidErrorMessage } from "@/lib/plaid/server";
import { isTrustedBrowserOrigin } from "@/lib/http/request-security";
import { MAX_LINK_ATTEMPTS_PER_HOUR, MAX_PLAID_ITEMS_PER_USER, PLAID_LINK_ATTEMPT_TTL_MS } from "@/lib/plaid/link-attempts";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isTrustedBrowserOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });

  const linkTokenRequest: LinkTokenCreateRequest = {
    client_name: "Sketch Finance",
    language: "en",
    country_codes: [CountryCode.Us],
    products: [Products.Transactions],
    user: { client_user_id: user.id },
    account_filters: {
      depository: { account_subtypes: [DepositoryAccountSubtype.Checking] },
      credit: { account_subtypes: [CreditAccountSubtype.CreditCard] },
    },
  };

  const customizationName = process.env.PLAID_LINK_CUSTOMIZATION_NAME;
  if (customizationName) linkTokenRequest.link_customization_name = customizationName;

  const webhookUrl = process.env.PLAID_WEBHOOK_URL;
  if (webhookUrl) linkTokenRequest.webhook = webhookUrl;

  const admin = createAdminClient();
  let attemptId: string | null = null;
  try {
    const { data: reservedAttemptId, error: reservationError } = await admin.rpc("reserve_plaid_link_attempt", {
      p_user_id: user.id,
      p_expires_at: new Date(Date.now() + PLAID_LINK_ATTEMPT_TTL_MS).toISOString(),
      p_plaid_environment: getPlaidEnvironment(),
      p_max_attempts: MAX_LINK_ATTEMPTS_PER_HOUR,
      p_max_items: MAX_PLAID_ITEMS_PER_USER,
    });
    if (reservationError || !reservedAttemptId) {
      const message = reservationError?.message ?? "Could not reserve the bank connection.";
      const status = message.includes("quota") ? 429 : message.includes("maximum") ? 409 : 500;
      return NextResponse.json({ error: message }, { status });
    }
    attemptId = reservedAttemptId;
    const { data } = await getPlaidClient().linkTokenCreate(linkTokenRequest);
    const expiresAt = new Date(Math.min(Date.parse(data.expiration), Date.now() + PLAID_LINK_ATTEMPT_TTL_MS));
    const { data: readyAttempt, error } = await admin.from("plaid_link_attempts").update({
      encrypted_link_token: encryptPlaidAccessToken(data.link_token),
      expires_at: expiresAt.toISOString(),
      is_ready: true,
    }).eq("id", attemptId).eq("user_id", user.id).eq("is_ready", false).select("id").maybeSingle();
    if (error || !readyAttempt) throw error ?? new Error("Could not secure the Plaid Link attempt.");
    return NextResponse.json({ link_token: data.link_token, link_attempt_id: attemptId });
  } catch (error) {
    if (attemptId) await admin.from("plaid_link_attempts").delete().eq("id", attemptId).eq("user_id", user.id);
    return NextResponse.json({ error: plaidErrorMessage(error) }, { status: 502 });
  }
}
