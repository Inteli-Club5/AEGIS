import { proxyAgentServiceRequest } from "~~/lib/server/agentService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// TODO(auth): see app/api/agent-service/agents/route.ts -- same unauthenticated gap. This route
// additionally forwards the operator's own EIP-712 signature headers untouched, so at least the
// mutation itself is signer-authenticated -- there's just no session/rate-limit layer in front of it.
export async function POST(req: Request) {
  return proxyAgentServiceRequest(req, {
    path: "/policies",
    method: "POST",
    body: "json",
    forwardOperator: true,
  });
}
