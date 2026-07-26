import { NextResponse } from "next/server";
import { toOnchainApiError } from "~~/lib/onchain-data/apiErrors";
import { getOptionalIndexingStatusClient } from "~~/lib/onchain-data/indexingStatus";
import { getHederaAgentSummary } from "~~/lib/onchain-data/repository";
import { getHederaGraphClient } from "~~/lib/onchain-data/serverClients";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!/^0x[0-9a-fA-F]{64}$/.test(id)) throw new Error("Agent ID must be a 32-byte agentIdHash entity ID.");
    const result = await getHederaAgentSummary({
      client: getHederaGraphClient(),
      id: id.toLowerCase(),
      indexingStatusClient: getOptionalIndexingStatusClient(),
    });
    if (!result.item) {
      return NextResponse.json(
        { error: "not_found", message: "Agent summary not found in the Hedera Subgraph." },
        { status: 404 },
      );
    }
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const response = toOnchainApiError(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
