import { after, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPlaidEnvironment } from "@/lib/plaid/server";
import { syncPlaidItem } from "@/lib/plaid/sync";
import { hasPlausiblePlaidVerificationHeader, verifyPlaidWebhook } from "@/lib/plaid/webhook-verification";

export const runtime = "nodejs";
const MAX_WEBHOOK_BODY_BYTES = 256 * 1024;
const MAX_CONTENT_LENGTH_HEADER_BYTES = 16;

type PlaidWebhook = {
  webhook_type?: unknown;
  webhook_code?: unknown;
  item_id?: unknown;
  environment?: unknown;
  account_id?: unknown;
  error?: {
    error_code?: unknown;
  } | null;
};

const transactionSyncCodes = new Set([
  "SYNC_UPDATES_AVAILABLE",
  "INITIAL_UPDATE",
  "HISTORICAL_UPDATE",
  "DEFAULT_UPDATE",
  "TRANSACTIONS_REMOVED",
]);

async function readWebhookBody(request: Request): Promise<Uint8Array | null> {
  const contentLength = request.headers.get("content-length");
  if (contentLength) {
    if (
      contentLength.length > MAX_CONTENT_LENGTH_HEADER_BYTES ||
      !/^\d+$/.test(contentLength) ||
      Number(contentLength) > MAX_WEBHOOK_BODY_BYTES
    ) return null;
  }

  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let receivedBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      receivedBytes += value.byteLength;
      if (receivedBytes > MAX_WEBHOOK_BODY_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const rawBody = new Uint8Array(receivedBytes);
  let offset = 0;
  for (const chunk of chunks) {
    rawBody.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return rawBody;
}

function getItemStatus(webhookCode: string, errorCode: string) {
  if (webhookCode === "ERROR") return errorCode === "ITEM_LOGIN_REQUIRED" ? "login_required" : "error";
  if (webhookCode === "PENDING_DISCONNECT" || webhookCode === "PENDING_EXPIRATION") return "login_required";
  if (webhookCode === "USER_PERMISSION_REVOKED" || webhookCode === "ITEM_REMOVED") return "revoked";
  if (webhookCode === "LOGIN_REPAIRED") return "healthy";
  return null;
}

export async function POST(request: Request) {
  const verificationHeader = request.headers.get("Plaid-Verification");
  // Do not buffer a body or query Plaid for attacker-controlled keys unless
  // the signature header is small and structurally plausible.
  if (!hasPlausiblePlaidVerificationHeader(verificationHeader)) {
    return NextResponse.json({ error: "Invalid webhook." }, { status: 401 });
  }

  const rawBody = await readWebhookBody(request);
  if (!rawBody) {
    return NextResponse.json({ error: "Webhook is too large." }, { status: 413 });
  }
  const payload = await verifyPlaidWebhook(rawBody, verificationHeader);
  if (!payload) return NextResponse.json({ error: "Invalid webhook." }, { status: 401 });

  let webhook: PlaidWebhook;
  try {
    webhook = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(rawBody)) as PlaidWebhook;
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
    const errorCode = typeof webhook.error?.error_code === "string" ? webhook.error.error_code : "";
    const status = getItemStatus(webhookCode, errorCode);
    if (status) {
      const { error } = await admin.from("plaid_items").update({ status }).eq("id", item.id);
      if (error) return NextResponse.json({ error: "Webhook processing failed." }, { status: 500 });
    }

    // Plaid recommends removing stored Plaid-derived data for a revoked
    // account. Deleting the local account cascades to its transactions while
    // preserving the still-valid Item and any other linked accounts.
    if (webhookCode === "USER_ACCOUNT_REVOKED" && typeof webhook.account_id === "string") {
      const { error } = await admin
        .from("accounts")
        .delete()
        .eq("user_id", item.user_id)
        .eq("plaid_item_id", item.id)
        .eq("plaid_account_id", webhook.account_id);
      if (error) return NextResponse.json({ error: "Webhook processing failed." }, { status: 500 });
    }
  }

  return NextResponse.json({ received: true });
}
