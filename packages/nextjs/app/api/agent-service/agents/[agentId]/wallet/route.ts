import { proxyAgentServiceRequest } from "~~/lib/server/agentService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// TODO(auth): see app/api/agent-service/agents/route.ts -- same unauthenticated gap.
export async function POST(req: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const { agentId } = await params;
  return proxyAgentServiceRequest(req, {
    path: `/agents/${encodeURIComponent(agentId)}/create-wallets`,
    method: "POST",
    body: "json",
  });
}
