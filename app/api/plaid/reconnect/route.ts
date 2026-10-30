import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPlaidEnvironment, plaidErrorMessage } from "@/lib/plaid/server";
import { syncPlaidItem } from "@/lib/plaid/sync";
import { isJsonRequest, isTrustedBrowserOrigin } from "@/lib/http/request-security";
import { consumeLinkAttempt, verifyLinkAttempt } from "@/lib/plaid/link-attempts";

export const runtime = "nodejs";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ReconnectBody = { link_attempt_id?: unknown };

export async function POST(request: Request) {
  if (!isTrustedBrowserOrigin(request) || !isJsonRequest(request)) return NextResponse.json({ error: "Invalid request." }, { status: 403 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });

  let body: ReconnectBody;
  try { body = await request.json() as ReconnectBody; } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  if (typeof body.link_attempt_id !== "string" || !UUID_PATTERN.test(body.link_attempt_id)) {
    return NextResponse.json({ error: "A valid Plaid reconnection attempt is required." }, { status: 400 });
  }

  try {
    const attempt = await verifyLinkAttempt({ userId: user.id, attemptId: body.link_attempt_id });
    if (!attempt.plaid_item_id) return NextResponse.json({ error: "This bank connection attempt cannot reconnect an institution." }, { status: 409 });

    const admin = createAdminClient();
    const { data: item, error: itemError } = await admin
      .from("plaid_items")
      .select("id")
      .eq("id", attempt.plaid_item_id)
      .eq("user_id", user.id)
      .eq("plaid_environment", getPlaidEnvironment())
      .maybeSingle();
    if (itemError) throw itemError;
    if (!item) return NextResponse.json({ error: "Connected institution not found." }, { status: 404 });

    await consumeLinkAttempt(user.id, attempt.id);

    try {
      const sync = await syncPlaidItem(user.id, item.id);
      return NextResponse.json({ reconnected: true, imported_transactions: sync.importedCount, sync_status: sync.updateStatus });
    } catch (syncError) {
      console.error("Plaid reconnection sync failed", syncError instanceof Error ? syncError.message : "unknown error");
      return NextResponse.json({ reconnected: true, sync_status: "PENDING" });
    }
  } catch (error) {
    return NextResponse.json({ error: plaidErrorMessage(error) }, { status: 502 });
  }
}
