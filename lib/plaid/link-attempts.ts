import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export const PLAID_LINK_ATTEMPT_TTL_MS = 4 * 60 * 60 * 1000;
export const MAX_LINK_ATTEMPTS_PER_HOUR = 3;
export const MAX_PLAID_ITEMS_PER_USER = 5;

/**
 * Confirms that this signed-in user has a Link token our server created which
 * is still eligible to exchange an onSuccess public token. Standard web Link
 * does not require Link Events, so the public token is validated by Plaid's
 * itemPublicTokenExchange call rather than linkTokenGet.
 */
export async function verifyLinkAttempt({
  userId,
  attemptId,
  plaidItemId,
}: {
  userId: string;
  attemptId: string;
  plaidItemId?: string;
}) {
  const admin = createAdminClient();
  const { data: attempt, error } = await admin
    .from("plaid_link_attempts")
    .select("id, expires_at, consumed_at, is_ready, plaid_item_id")
    .eq("id", attemptId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  if (!attempt || !attempt.is_ready || attempt.consumed_at || Date.parse(attempt.expires_at) <= Date.now()) {
    throw new Error("This bank connection attempt has expired. Start again.");
  }
  if (plaidItemId && attempt.plaid_item_id !== plaidItemId) {
    throw new Error("This bank connection attempt is not valid for that institution.");
  }

  return attempt;
}

export async function consumeLinkAttempt(userId: string, attemptId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("plaid_link_attempts")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", attemptId)
    .eq("user_id", userId)
    .is("consumed_at", null)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("This bank connection attempt has already been used.");
}
