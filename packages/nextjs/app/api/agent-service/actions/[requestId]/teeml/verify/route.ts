import { hashActionContext } from "~~/lib/policy/action-auth";
import { proxyAgentServiceRequestAsAgent, verifyAgentActionAuthorization } from "~~/lib/server/agentService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// requestId in the path only identifies the durable action; it doesn't say
// which agent owns it, so the caller must also pass ?agentId=... (the same
// agent that ran the preceding precheck) to fetch the right bearer token.
// Body forwarded as-is: { serviceId, productId? }.
export async function POST(req: Request, { params }: { params: Promise<{ requestId: string }> }) {
  const { requestId } = await params;
  const agentId = new URL(req.url).searchParams.get("agentId");
  if (!agentId) {
    return Response.json({ error: "agentId query parameter is required" }, { status: 400 });
  }
  const payload = (await req.json().catch(() => ({}))) as { serviceId?: string; productId?: string };

  const authorization = await verifyAgentActionAuthorization(req, {
    agentId,
    action: "TEEML_VERIFY",
    contextHash: hashActionContext({ requestId, serviceId: payload.serviceId, productId: payload.productId ?? null }),
  });
  if (!authorization.ok) return authorization.response;

  return proxyAgentServiceRequestAsAgent(req, {
    path: `/actions/${encodeURIComponent(requestId)}/teeml/verify`,
    method: "POST",
    agentId,
    body: "json",
    presetPayload: payload,
  });
}
