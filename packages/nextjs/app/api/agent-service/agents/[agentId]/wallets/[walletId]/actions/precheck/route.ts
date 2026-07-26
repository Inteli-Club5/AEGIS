import { hashActionContext } from "~~/lib/policy/action-auth";
import { proxyAgentServiceRequestAsAgent, verifyAgentActionAuthorization } from "~~/lib/server/agentService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Body forwarded as-is: the strict Level 1 v2 action shape (actionType,
// destination, assetId, amount, actionDeadline). Requires an
// `Idempotency-Key` request header, generated client-side per submission.
export async function POST(req: Request, { params }: { params: Promise<{ agentId: string; walletId: string }> }) {
  const { agentId, walletId } = await params;
  const payload = await req.json().catch(() => ({}));

  const authorization = await verifyAgentActionAuthorization(req, {
    agentId,
    action: "PRECHECK",
    contextHash: hashActionContext(payload),
  });
  if (!authorization.ok) return authorization.response;

  return proxyAgentServiceRequestAsAgent(req, {
    path: `/agents/${encodeURIComponent(agentId)}/wallets/${encodeURIComponent(walletId)}/actions/precheck`,
    method: "POST",
    agentId,
    body: "json",
    presetPayload: payload,
    forwardIdempotencyKey: true,
  });
}
