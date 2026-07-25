import { NextResponse } from "next/server";
import { proxyToAgentService } from "@/lib/server/agentService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// TODO(auth): wire this route to the real AEGIS backend auth/session layer
// before exposing it beyond the hackathon backend -- today anyone can trigger
// a real Hedera account creation for any `ownerWallet` they type in, with no
// proof of ownership. Same gap as /api/0g/agentic-id.
export async function POST(req: Request) {
  const payload = await req.json().catch(() => ({}));
  const { status, body } = await proxyToAgentService("/create-agents", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return NextResponse.json(body, { status });
}
