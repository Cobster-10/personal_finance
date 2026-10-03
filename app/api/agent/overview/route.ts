import { agentJson, authenticateAgentRequest, isAgentAuthFailure } from "@/lib/agent/auth";
import { getAgentOverview, resolveAgentMonth } from "@/lib/finance/agent-data";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const scope = authenticateAgentRequest(request);
  if (isAgentAuthFailure(scope)) return agentJson({ error: scope.error }, { status: scope.status });

  const selectedMonth = resolveAgentMonth(new URL(request.url).searchParams.get("month"));
  if (!selectedMonth) return agentJson({ error: "month must use YYYY-MM-01." }, { status: 400 });

  try {
    return agentJson(await getAgentOverview(scope.userId, selectedMonth));
  } catch (error) {
    console.error("Agent overview failed", error instanceof Error ? error.message : "unknown error");
    return agentJson({ error: "Could not load finance overview." }, { status: 500 });
  }
}
