import "server-only";

import { timingSafeEqual } from "node:crypto";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type AgentScope = { userId: string };
export type AgentAuthFailure = { error: string; status: 401 | 503 };

function hasMatchingToken(providedToken: string, expectedToken: string) {
  const provided = Buffer.from(providedToken, "utf8");
  const expected = Buffer.from(expectedToken, "utf8");

  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

/**
 * The agent API intentionally uses a dedicated, server-only token and a
 * single configured user scope. It never accepts a user ID from the caller.
 */
export function authenticateAgentRequest(request: Request): AgentScope | AgentAuthFailure {
  const expectedToken = process.env.OPENCLAW_AGENT_API_KEY;
  const userId = process.env.OPENCLAW_AGENT_USER_ID;

  if (!expectedToken || !userId || !UUID_PATTERN.test(userId)) {
    return { error: "Agent API is not configured.", status: 503 };
  }

  const authorization = request.headers.get("authorization");
  const providedToken = authorization?.match(/^Bearer ([^\s]+)$/i)?.[1];
  if (!providedToken || !hasMatchingToken(providedToken, expectedToken)) {
    return { error: "Unauthorized.", status: 401 };
  }

  return { userId };
}

export function isAgentAuthFailure(value: AgentScope | AgentAuthFailure): value is AgentAuthFailure {
  return "status" in value;
}

export function agentJson(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "no-store");
  headers.set("Vary", "Authorization");
  return Response.json(body, { ...init, headers });
}
