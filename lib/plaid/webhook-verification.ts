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
const missingKeyCache = new Map<string, number>();
const pendingKeyLookups = new Map<string, Promise<JWKPublicKey>>();
const MAX_IAT_AGE_SECONDS = 5 * 60;
const MAX_VERIFICATION_HEADER_BYTES = 4 * 1024;
const MAX_JWT_SEGMENT_BYTES = 2 * 1024;
const MAX_CACHED_KEYS = 32;
const MAX_MISSING_KEYS = 64;
const MISSING_KEY_CACHE_SECONDS = 60;
const KEY_LOOKUP_WINDOW_SECONDS = 60;
const MAX_KEY_LOOKUPS_PER_WINDOW = 20;
// Plaid currently issues UUID-shaped key IDs. Deliberately do not constrain
// UUID version bits so a future key-rotation format does not drop webhooks.
const PLAID_KEY_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let keyLookupWindowStartedAt = 0;
let keyLookupsInWindow = 0;

function rememberBounded<T>(cache: Map<string, T>, key: string, value: T, maxEntries: number) {
  cache.delete(key);
  cache.set(key, value);
  while (cache.size > maxEntries) cache.delete(cache.keys().next().value!);
}

function canLookUpKey(now: number) {
  if (now - keyLookupWindowStartedAt >= KEY_LOOKUP_WINDOW_SECONDS) {
    keyLookupWindowStartedAt = now;
    keyLookupsInWindow = 0;
  }
  if (keyLookupsInWindow >= MAX_KEY_LOOKUPS_PER_WINDOW) return false;
  keyLookupsInWindow += 1;
  return true;
}

function hasValidJwtShape(verificationHeader: string) {
  if (Buffer.byteLength(verificationHeader, "utf8") > MAX_VERIFICATION_HEADER_BYTES) return false;
  const parts = verificationHeader.split(".");
  return parts.length === 3 && parts.every((part) => part.length > 0 && part.length <= MAX_JWT_SEGMENT_BYTES);
}

export function hasPlausiblePlaidVerificationHeader(verificationHeader: string | null) {
  return typeof verificationHeader === "string" && hasValidJwtShape(verificationHeader);
}

async function getVerificationKey(keyId: string) {
  const now = Math.floor(Date.now() / 1000);
  const cached = keyCache.get(keyId);
  if (cached && cached.expiresAt > now) {
    // Refresh recency so a normal Plaid key stays in the small LRU cache.
    rememberBounded(keyCache, keyId, cached, MAX_CACHED_KEYS);
    return cached.jwk;
  }
  if (cached) keyCache.delete(keyId);

  const missingUntil = missingKeyCache.get(keyId);
  if (missingUntil && missingUntil > now) throw new Error("Unknown Plaid webhook verification key.");
  if (missingUntil) missingKeyCache.delete(keyId);

  const pending = pendingKeyLookups.get(keyId);
  if (pending) return pending;
  if (!canLookUpKey(now)) throw new Error("Plaid webhook verification-key lookup limit reached.");

  const lookup = (async () => {
    try {
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

      rememberBounded(keyCache, keyId, {
        jwk: key,
        // Refresh before Plaid's advertised expiration. A short fallback also
        // prevents retaining a key indefinitely if no expiration is returned.
        expiresAt: Math.min(key.expired_at ?? now + 10 * 60, now + 10 * 60),
      }, MAX_CACHED_KEYS);
      return key;
    } catch (error) {
      rememberBounded(missingKeyCache, keyId, now + MISSING_KEY_CACHE_SECONDS, MAX_MISSING_KEYS);
      throw error;
    } finally {
      pendingKeyLookups.delete(keyId);
    }
  })();

  pendingKeyLookups.set(keyId, lookup);
  return lookup;
}

function hasMatchingHash(expectedHash: unknown, rawBody: Uint8Array) {
  if (typeof expectedHash !== "string" || !/^[a-f0-9]{64}$/i.test(expectedHash)) return false;
  const actualHash = createHash("sha256").update(rawBody).digest("hex");
  const expected = Buffer.from(expectedHash, "hex");
  const actual = Buffer.from(actualHash, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function verifyPlaidWebhook(rawBody: Uint8Array, verificationHeader: string | null): Promise<JWTPayload | null> {
  if (!verificationHeader || !hasPlausiblePlaidVerificationHeader(verificationHeader)) return null;

  try {
    const protectedHeader = decodeProtectedHeader(verificationHeader);
    if (
      protectedHeader.alg !== "ES256" ||
      typeof protectedHeader.kid !== "string" ||
      !PLAID_KEY_ID_PATTERN.test(protectedHeader.kid)
    ) return null;

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
