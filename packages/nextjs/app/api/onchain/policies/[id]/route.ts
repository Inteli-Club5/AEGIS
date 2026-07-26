import { NextResponse } from "next/server";
import { toOnchainApiError } from "~~/lib/onchain-data/apiErrors";
import { getPolicyReference } from "~~/lib/onchain-data/coverageRepository";
import { getOptionalIndexingStatusClient } from "~~/lib/onchain-data/indexingStatus";
import { getHederaGraphClient } from "~~/lib/onchain-data/serverClients";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!/^0x[0-9a-fA-F]{64}$/.test(id)) throw new Error("Policy ID must be a 32-byte entity ID.");
    const result = await getPolicyReference({
      client: getHederaGraphClient(),
      indexingStatusClient: getOptionalIndexingStatusClient(),
      id,
    });
    if (!result.item) {
      return NextResponse.json(
        { error: "not_found", message: "Policy reference not found in the Hedera Subgraph." },
        { status: 404 },
      );
    }
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const response = toOnchainApiError(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
