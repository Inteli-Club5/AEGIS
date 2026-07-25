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

export async function DELETE(req: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const { agentId } = await params;
  return proxyAgentServiceRequest(req, {
    path: `/agents/${encodeURIComponent(agentId)}`,
    method: "DELETE",
    body: "none",
  });
}
