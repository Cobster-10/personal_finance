import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const algorithm = "aes-256-gcm";
const keyVersion = "v1";

function getKey() {
  const encodedKey = process.env.PLAID_ACCESS_TOKEN_ENCRYPTION_KEY;
  if (!encodedKey) throw new Error("PLAID_ACCESS_TOKEN_ENCRYPTION_KEY is not configured on the server.");

  const key = Buffer.from(encodedKey, "base64");
  if (key.length !== 32) throw new Error("PLAID_ACCESS_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
  return key;
}

export function encryptPlaidAccessToken(accessToken: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(algorithm, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(accessToken, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [keyVersion, iv, tag, ciphertext].map((part) => part.toString("base64url")).join(".");
}

export function decryptPlaidAccessToken(value: string) {
  const [version, encodedIv, encodedTag, encodedCiphertext] = value.split(".");
  if (version !== keyVersion || !encodedIv || !encodedTag || !encodedCiphertext) throw new Error("Invalid Plaid token ciphertext.");

  const decipher = createDecipheriv(algorithm, getKey(), Buffer.from(encodedIv, "base64url"));
  decipher.setAuthTag(Buffer.from(encodedTag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encodedCiphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
