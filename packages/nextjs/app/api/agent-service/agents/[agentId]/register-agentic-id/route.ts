import { hashActionContext } from "~~/lib/policy/action-auth";
import { proxyAgentServiceRequestAsAgent, verifyAgentActionAuthorization } from "~~/lib/server/agentService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const { agentId } = await params;

  const authorization = await verifyAgentActionAuthorization(req, {
    agentId,
    action: "REGISTER_AGENTIC_ID",
    contextHash: hashActionContext({}),
  });
  if (!authorization.ok) return authorization.response;

  return proxyAgentServiceRequestAsAgent(req, {
    path: `/agents/${encodeURIComponent(agentId)}/register-agentic-id`,
    method: "POST",
    agentId,
    body: "none",
  });
}
