import "server-only";

/**
 * Browser-originated mutations use the Origin header as a CSRF boundary. The
 * optional canonical origin avoids trusting forwarded host headers in production.
 */
export function isTrustedBrowserOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;

  const configuredOrigin = process.env.APP_ORIGIN;
  if (!configuredOrigin && process.env.NODE_ENV === "production") return false;

  let expectedOrigin: string;
  try {
    expectedOrigin = configuredOrigin ?? new URL(request.url).origin;
  } catch {
    return false;
  }
  return origin === expectedOrigin;
}

export function isJsonRequest(request: Request) {
  return request.headers.get("content-type")?.toLowerCase().startsWith("application/json") ?? false;
}
