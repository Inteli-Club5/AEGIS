import { proxyAgentServiceRequest } from "~~/lib/server/agentService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ policyId: string }> }) {
  const { policyId } = await params;
  return proxyAgentServiceRequest(req, {
    path: `/policies/${encodeURIComponent(policyId)}`,
    method: "GET",
    body: "none",
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ policyId: string }> }) {
  const { policyId } = await params;
  return proxyAgentServiceRequest(req, {
    path: `/policies/${encodeURIComponent(policyId)}`,
    method: "PATCH",
    body: "json",
    forwardOperator: true,
  });
}
