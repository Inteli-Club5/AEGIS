import { proxyAgentServiceRequest } from "~~/lib/server/agentService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Forwards the operator's EIP-712 AgentCommitment signature headers untouched
// -- see app/api/agent-service/agents/route.ts.
export async function POST(req: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const { agentId } = await params;
  return proxyAgentServiceRequest(req, {
    path: `/agents/${encodeURIComponent(agentId)}/create-wallets`,
    method: "POST",
    body: "json",
    forwardOperator: true,
  });
}
