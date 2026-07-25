import { NextResponse } from "next/server";
import { proxyToAgentService } from "@/lib/server/agentService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// TODO(auth): see app/api/agent-service/agents/route.ts -- same unauthenticated gap.
export async function POST(_req: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const { agentId } = await params;
  const { status, body } = await proxyToAgentService(`/agents/${agentId}/register-agentic-id`, {
    method: "POST",
  });
  return NextResponse.json(body, { status });
}
