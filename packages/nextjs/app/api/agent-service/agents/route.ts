import { proxyAgentServiceRequest } from "~~/lib/server/agentService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Forwards the operator's EIP-712 AgentCommitment signature headers untouched
// -- the agent-service backend independently verifies that the signer
// actually controls the claimed ownerWallet before creating a real Hedera
// account (see services/agent-service/src/policy-engine/auth.ts).
export async function POST(req: Request) {
  return proxyAgentServiceRequest(req, {
    path: "/create-agents",
    method: "POST",
    body: "json",
    forwardOperator: true,
  });
}
