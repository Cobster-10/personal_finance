import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import { decodeProtectedHeader, importJWK, jwtVerify, type JWK, type JWTPayload } from "jose";
import type { JWKPublicKey } from "plaid";
import { getPlaidClient } from "@/lib/plaid/server";

type CachedKey = {
  jwk: JWKPublicKey;
  expiresAt: number;
};

const keyCache = new Map<string, CachedKey>();
const MAX_IAT_AGE_SECONDS = 5 * 60;

async function getVerificationKey(keyId: string) {
  const cached = keyCache.get(keyId);
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.expiresAt > now) return cached.jwk;

  const { data } = await getPlaidClient().webhookVerificationKeyGet({ key_id: keyId });
  const key = data.key;
  if (
    key.kid !== keyId ||
    key.alg !== "ES256" ||
    key.kty !== "EC" ||
    key.crv !== "P-256" ||
    typeof key.x !== "string" ||
    typeof key.y !== "string"
  ) {
    throw new Error("Plaid returned an invalid webhook verification key.");
  }

  keyCache.set(keyId, {
    jwk: key,
    // Refresh before Plaid's advertised expiration. A short fallback also
    // prevents retaining a key indefinitely if no expiration is returned.
    expiresAt: Math.min(key.expired_at ?? now + 10 * 60, now + 10 * 60),
  });
  return key;
}

function hasMatchingHash(expectedHash: unknown, rawBody: string) {
  if (typeof expectedHash !== "string" || !/^[a-f0-9]{64}$/i.test(expectedHash)) return false;
  const actualHash = createHash("sha256").update(rawBody, "utf8").digest("hex");
  const expected = Buffer.from(expectedHash, "hex");
  const actual = Buffer.from(actualHash, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function verifyPlaidWebhook(rawBody: string, verificationHeader: string | null): Promise<JWTPayload | null> {
  if (!verificationHeader) return null;

  try {
    const protectedHeader = decodeProtectedHeader(verificationHeader);
    if (protectedHeader.alg !== "ES256" || typeof protectedHeader.kid !== "string") return null;

    const key = await getVerificationKey(protectedHeader.kid);
    const verificationKey = await importJWK(key as JWK, "ES256");
    const { payload } = await jwtVerify(verificationHeader, verificationKey, {
      algorithms: ["ES256"],
    });

    const issuedAt = payload.iat;
    const now = Math.floor(Date.now() / 1000);
    if (typeof issuedAt !== "number" || Math.abs(now - issuedAt) > MAX_IAT_AGE_SECONDS) return null;
    if (!hasMatchingHash(payload.request_body_sha256, rawBody)) return null;

    return payload;
  } catch {
    // Keep verification failures opaque so the endpoint does not become a
    // useful oracle for attackers probing the webhook implementation.
    return null;
  }
}
