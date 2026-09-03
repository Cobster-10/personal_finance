import { after, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPlaidEnvironment } from "@/lib/plaid/server";
import { syncPlaidItem } from "@/lib/plaid/sync";
import { verifyPlaidWebhook } from "@/lib/plaid/webhook-verification";

export const runtime = "nodejs";
const MAX_WEBHOOK_BODY_BYTES = 256 * 1024;

type PlaidWebhook = {
  webhook_type?: unknown;
  webhook_code?: unknown;
  item_id?: unknown;
  environment?: unknown;
};

const transactionSyncCodes = new Set([
  "SYNC_UPDATES_AVAILABLE",
  "INITIAL_UPDATE",
  "HISTORICAL_UPDATE",
  "DEFAULT_UPDATE",
  "TRANSACTIONS_REMOVED",
]);

export async function POST(request: Request) {
  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > MAX_WEBHOOK_BODY_BYTES) {
    return NextResponse.json({ error: "Webhook is too large." }, { status: 413 });
  }
  const payload = await verifyPlaidWebhook(rawBody, request.headers.get("Plaid-Verification"));
  if (!payload) return NextResponse.json({ error: "Invalid webhook." }, { status: 401 });

  let webhook: PlaidWebhook;
  try {
    webhook = JSON.parse(rawBody) as PlaidWebhook;
  } catch {
    return NextResponse.json({ error: "Invalid webhook." }, { status: 400 });
  }

  const webhookType = typeof webhook.webhook_type === "string" ? webhook.webhook_type : "";
  const webhookCode = typeof webhook.webhook_code === "string" ? webhook.webhook_code : "";
  const itemId = typeof webhook.item_id === "string" ? webhook.item_id : "";
  const environment = typeof webhook.environment === "string" ? webhook.environment : "";
  if (!webhookType || !webhookCode || !itemId || !environment) {
    return NextResponse.json({ error: "Invalid webhook." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: item, error: itemError } = await admin
    .from("plaid_items")
    .select("id, user_id, plaid_environment")
    .eq("plaid_item_id", itemId)
    .maybeSingle();
  if (itemError) return NextResponse.json({ error: "Webhook processing failed." }, { status: 500 });

  // A valid webhook for an Item that was deleted locally should not be retried.
  if (!item || item.plaid_environment !== environment || item.plaid_environment !== getPlaidEnvironment()) {
    return NextResponse.json({ received: true });
  }

  if (webhookType === "TRANSACTIONS" && transactionSyncCodes.has(webhookCode)) {
    after(async () => {
      try {
        await syncPlaidItem(item.user_id, item.id);
      } catch (error) {
        console.error("Plaid webhook sync failed", error instanceof Error ? error.message : "unknown error");
        await admin.from("plaid_items").update({ status: "error" }).eq("id", item.id);
      }
    });
  } else if (webhookType === "ITEM") {
    const status = webhookCode === "ITEM_LOGIN_REQUIRED" || webhookCode === "PENDING_EXPIRATION"
      ? "login_required"
      : webhookCode === "ITEM_REMOVED"
        ? "revoked"
        : webhookCode === "ERROR"
          ? "error"
          : null;
    if (status) {
      const { error } = await admin.from("plaid_items").update({ status }).eq("id", item.id);
      if (error) return NextResponse.json({ error: "Webhook processing failed." }, { status: 500 });
    }
  }

  return NextResponse.json({ received: true });
}
