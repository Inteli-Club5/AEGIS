import { proxyAgentServiceRequest } from "~~/lib/server/agentService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ policyId: string }> }) {
  const { policyId } = await params;
  return proxyAgentServiceRequest(req, {
    path: `/policies/${encodeURIComponent(policyId)}/versions`,
    method: "GET",
    body: "none",
  });
}
