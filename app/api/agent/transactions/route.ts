import { agentJson, authenticateAgentRequest, isAgentAuthFailure } from "@/lib/agent/auth";
import { getAgentTransactions, resolveAgentMonth } from "@/lib/finance/agent-data";

export const runtime = "nodejs";

function parseLimit(value: string | null) {
  if (!value) return 100;
  if (!/^\d+$/.test(value)) return null;
  const limit = Number(value);
  return limit >= 1 && limit <= 500 ? limit : null;
}

export async function GET(request: Request) {
  const scope = authenticateAgentRequest(request);
  if (isAgentAuthFailure(scope)) return agentJson({ error: scope.error }, { status: scope.status });

  const url = new URL(request.url);
  const state = url.searchParams.get("state") ?? "all";
  if (state !== "all" && state !== "uncategorized") {
    return agentJson({ error: "state must be all or uncategorized." }, { status: 400 });
  }
  const monthValue = url.searchParams.get("month");
  const selectedMonth = monthValue ? resolveAgentMonth(monthValue) : undefined;
  if (monthValue && !selectedMonth) return agentJson({ error: "month must use YYYY-MM-01." }, { status: 400 });
  const limit = parseLimit(url.searchParams.get("limit"));
  if (!limit) return agentJson({ error: "limit must be between 1 and 500." }, { status: 400 });

  try {
    return agentJson(await getAgentTransactions(scope.userId, { state, month: selectedMonth ?? undefined, limit }));
  } catch (error) {
    console.error("Agent transactions failed", error instanceof Error ? error.message : "unknown error");
    return agentJson({ error: "Could not load transactions." }, { status: 500 });
  }
}
