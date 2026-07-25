import { NextResponse } from "next/server";
import { proxyToAgentService } from "@/lib/server/agentService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// TODO(auth): see app/api/agent-service/agents/route.ts -- same unauthenticated gap.
export async function POST(req: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const { agentId } = await params;
  const payload = await req.json().catch(() => ({}));
  const { status, body } = await proxyToAgentService(`/agents/${agentId}/create-wallets`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return NextResponse.json(body, { status });
}
