import { NextResponse } from "next/server";
import { buildAgenticIdRegistrationCommitment } from "../../../../../agentic-id-contract/index.js";
import { timingSafeEqual } from "node:crypto";
import { keccak256, stringToHex } from "viem";
import { createAgenticIdForAegisAgent, normalizeCreateAgenticIdInput } from "~~/integrations/0g/agentic-id";
import { stableStringify } from "~~/integrations/0g/agentic-id/metadata";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const getErrorMessage = (error: unknown) => {
  const maybeError = error as { shortMessage?: string; details?: string; message?: string };
  return maybeError.shortMessage || maybeError.details || maybeError.message || "Unknown 0G Agentic ID error.";
};

const isAuthorizedInternalRequest = (req: Request) => {
  const expected = process.env.AEGIS_AGENTIC_ID_INTERNAL_TOKEN;
  const authorization = req.headers.get("authorization");
  if (!expected || expected.length < 32 || !authorization?.startsWith("Bearer ")) {
    return false;
  }
  const supplied = authorization.slice("Bearer ".length);
  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied);
  return expectedBytes.length === suppliedBytes.length && timingSafeEqual(expectedBytes, suppliedBytes);
};

export async function POST(req: Request) {
  if (!process.env.AEGIS_AGENTIC_ID_INTERNAL_TOKEN || process.env.AEGIS_AGENTIC_ID_INTERNAL_TOKEN.length < 32) {
    return NextResponse.json({ error: "Agentic ID internal authentication is not configured." }, { status: 503 });
  }
  if (!isAuthorizedInternalRequest(req)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  try {
    const body = await req.json();
    const input = normalizeCreateAgenticIdInput(body);
    const idempotencyKey = req.headers.get("idempotency-key");
    const expectedIdempotencyKey = keccak256(
      stringToHex(
        stableStringify(
          buildAgenticIdRegistrationCommitment({
            request: input,
            chainId: input.expectedChainId,
            contractAddress: input.expectedAgenticIdContractAddress.toLowerCase(),
          }),
        ),
      ),
    );
    if (idempotencyKey !== expectedIdempotencyKey) {
      return NextResponse.json({ error: "Agentic ID idempotency commitment is invalid." }, { status: 400 });
    }
    const result = await createAgenticIdForAegisAgent(input);

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const message = getErrorMessage(error);
    const isClientInputError =
      message.includes(" is required") ||
      message.includes("must be a valid") ||
      message.includes("must contain") ||
      message.includes("must be a bytes32");

    return NextResponse.json({ error: message }, { status: isClientInputError ? 400 : 500 });
  }
}
