import { agentJson, authenticateAgentRequest, isAgentAuthFailure } from "@/lib/agent/auth";
import { getAgentCategories, resolveAgentMonth } from "@/lib/finance/agent-data";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const scope = authenticateAgentRequest(request);
  if (isAgentAuthFailure(scope)) return agentJson({ error: scope.error }, { status: scope.status });

  const selectedMonth = resolveAgentMonth(new URL(request.url).searchParams.get("month"));
  if (!selectedMonth) return agentJson({ error: "month must use YYYY-MM-01." }, { status: 400 });

  try {
    return agentJson(await getAgentCategories(scope.userId, selectedMonth));
  } catch (error) {
    console.error("Agent categories failed", error instanceof Error ? error.message : "unknown error");
    return agentJson({ error: "Could not load categories." }, { status: 500 });
  }
}
