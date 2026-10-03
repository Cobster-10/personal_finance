import { agentJson, authenticateAgentRequest, isAgentAuthFailure } from "@/lib/agent/auth";
import { assignAgentTransactionCategory } from "@/lib/finance/agent-data";

export const runtime = "nodejs";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type UpdateCategoryBody = { category_id?: unknown };

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const scope = authenticateAgentRequest(request);
  if (isAgentAuthFailure(scope)) return agentJson({ error: scope.error }, { status: scope.status });

  const { id } = await context.params;
  if (!UUID_PATTERN.test(id)) return agentJson({ error: "Invalid transaction id." }, { status: 400 });
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return agentJson({ error: "Expected a JSON request body." }, { status: 415 });
  }

  let body: UpdateCategoryBody;
  try {
    body = await request.json() as UpdateCategoryBody;
  } catch {
    return agentJson({ error: "Invalid JSON request body." }, { status: 400 });
  }
  if (!(body.category_id === null || (typeof body.category_id === "string" && UUID_PATTERN.test(body.category_id)))) {
    return agentJson({ error: "category_id must be a category UUID or null." }, { status: 400 });
  }

  try {
    const result = await assignAgentTransactionCategory(scope.userId, id, body.category_id);
    if (result.status === "category_not_found") return agentJson({ error: "Category not found." }, { status: 404 });
    if (result.status === "transaction_not_found") return agentJson({ error: "Transaction not found." }, { status: 404 });
    return agentJson(result);
  } catch (error) {
    console.error("Agent categorization failed", error instanceof Error ? error.message : "unknown error");
    return agentJson({ error: "Could not update the transaction category." }, { status: 500 });
  }
}
