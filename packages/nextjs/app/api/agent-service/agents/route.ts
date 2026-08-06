import { NextResponse } from "next/server";
import { proxyAgentServiceRequest } from "~~/lib/server/agentService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EVM_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

// Recovers the connected wallet's agents from the backend's durable
// owner-indexed store, instead of the browser-local cache that a fresh
// browser/device never had (see services/agent-service's GET /agents).
export async function GET(req: Request) {
  const owner = new URL(req.url).searchParams.get("owner");
  if (!owner || !EVM_ADDRESS_RE.test(owner)) {
    return NextResponse.json({ error: "owner must be a valid EVM address" }, { status: 400 });
  }
  return proxyAgentServiceRequest(req, {
    path: `/agents?owner=${encodeURIComponent(owner)}`,
    method: "GET",
    body: "none",
  });
}

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
