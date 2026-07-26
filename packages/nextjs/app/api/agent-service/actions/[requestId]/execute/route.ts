import { hashActionContext } from "~~/lib/policy/action-auth";
import { proxyAgentServiceRequestAsAgent, verifyAgentActionAuthorization } from "~~/lib/server/agentService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// requestId in the path only identifies the durable action; it doesn't say
// which agent owns it, so the caller must also pass ?agentId=... (the same
// agent that ran the preceding precheck/verify) to fetch the right bearer
// token. The backend route reads no request body at all.
export async function POST(req: Request, { params }: { params: Promise<{ requestId: string }> }) {
  const { requestId } = await params;
  const agentId = new URL(req.url).searchParams.get("agentId");
  if (!agentId) {
    return Response.json({ error: "agentId query parameter is required" }, { status: 400 });
  }

  const authorization = await verifyAgentActionAuthorization(req, {
    agentId,
    action: "EXECUTE",
    contextHash: hashActionContext({ requestId }),
  });
  if (!authorization.ok) return authorization.response;

  return proxyAgentServiceRequestAsAgent(req, {
    path: `/actions/${encodeURIComponent(requestId)}/execute`,
    method: "POST",
    agentId,
    body: "none",
  });
}
