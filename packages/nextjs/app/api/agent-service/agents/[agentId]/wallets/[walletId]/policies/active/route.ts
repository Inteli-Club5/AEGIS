import { proxyAgentServiceRequest } from "~~/lib/server/agentService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ agentId: string; walletId: string }> }) {
  const { agentId, walletId } = await params;
  return proxyAgentServiceRequest(req, {
    path: `/agents/${encodeURIComponent(agentId)}/wallets/${encodeURIComponent(walletId)}/policies/active`,
    method: "GET",
    body: "none",
  });
}
