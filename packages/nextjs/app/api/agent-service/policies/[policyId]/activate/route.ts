import { proxyAgentServiceRequest } from "~~/lib/server/agentService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// TODO(auth): see app/api/agent-service/agents/route.ts -- same unauthenticated gap.
export async function POST(req: Request, { params }: { params: Promise<{ policyId: string }> }) {
  const { policyId } = await params;
  return proxyAgentServiceRequest(req, {
    path: `/policies/${encodeURIComponent(policyId)}/activate`,
    method: "POST",
    body: "json",
    forwardOperator: true,
  });
}
