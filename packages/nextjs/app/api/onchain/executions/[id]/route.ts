import { NextResponse } from "next/server";
import { toOnchainApiError } from "~~/lib/onchain-data/apiErrors";
import { getSafeExecution } from "~~/lib/onchain-data/coverageRepository";
import { getOptionalIndexingStatusClient } from "~~/lib/onchain-data/indexingStatus";
import { getHederaGraphClient } from "~~/lib/onchain-data/serverClients";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!/^0x[0-9a-fA-F]{72}$/.test(id)) throw new Error("Execution ID must be a 36-byte event entity ID.");
    const result = await getSafeExecution({
      client: getHederaGraphClient(),
      indexingStatusClient: getOptionalIndexingStatusClient(),
      id,
    });
    if (!result.item) {
      return NextResponse.json(
        { error: "not_found", message: "Safe execution not found in the Hedera Subgraph." },
        { status: 404 },
      );
    }
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const response = toOnchainApiError(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
