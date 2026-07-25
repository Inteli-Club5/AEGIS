import { NextResponse } from "next/server";
import { createAgenticIdForAegisAgent, normalizeCreateAgenticIdInput } from "~~/integrations/0g/agentic-id";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const getErrorMessage = (error: unknown) => {
  const maybeError = error as { shortMessage?: string; details?: string; message?: string };
  return maybeError.shortMessage || maybeError.details || maybeError.message || "Unknown 0G Agentic ID error.";
};

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const input = normalizeCreateAgenticIdInput(body);
    const result = await createAgenticIdForAegisAgent(input);

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const message = getErrorMessage(error);
    const isClientInputError =
      message.includes(" is required") ||
      message.includes("must be a valid") ||
      message.includes("must contain") ||
      message.includes("must be a bytes32");

    // TODO(auth): wire this route to the real AEGIS backend auth/session layer
    // before exposing it beyond the hackathon backend. The current route is a
    // functional integration boundary, not an authorization policy.
    return NextResponse.json({ error: message }, { status: isClientInputError ? 400 : 500 });
  }
}
