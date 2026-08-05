import { proxyAgentServiceRequest } from "~~/lib/server/agentService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const { agentId } = await params;
  return proxyAgentServiceRequest(req, {
    path: `/agents/${encodeURIComponent(agentId)}`,
    method: "GET",
    body: "none",
  });
}

// Forwards the operator's EIP-712 AgentCommitment signature headers untouched
// -- the agent-service backend independently verifies ownership before
// deleting an existing agent's records (deleting a nonexistent one is a
// deliberate, unauthenticated no-op; see index.ts's DELETE /agents/:agentId).
export async function DELETE(req: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const { agentId } = await params;
  return proxyAgentServiceRequest(req, {
    path: `/agents/${encodeURIComponent(agentId)}`,
    method: "DELETE",
    body: "none",
    forwardOperator: true,
  });
}
