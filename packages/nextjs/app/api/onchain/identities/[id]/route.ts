import { NextResponse } from "next/server";
import { toOnchainApiError } from "~~/lib/onchain-data/apiErrors";
import { getOptionalIndexingStatusClient } from "~~/lib/onchain-data/indexingStatus";
import { getAgenticIdentity } from "~~/lib/onchain-data/repository";
import { getZeroGGraphClient } from "~~/lib/onchain-data/serverClients";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!/^0x[0-9a-fA-F]{64}$/.test(id)) throw new Error("Identity ID must be a 32-byte indexed entity ID.");
    const query = new URL(request.url).searchParams;
    const result = await getAgenticIdentity({
      client: getZeroGGraphClient(),
      id: id.toLowerCase(),
      ownerChangeLimit: optionalInteger(query, "ownerChangeLimit"),
      ownerChangeCursor: query.get("ownerChangeCursor"),
      indexingStatusClient: getOptionalIndexingStatusClient(),
    });
    if (!result.item) {
      return NextResponse.json(
        { error: "not_found", message: "Agentic Identity not found in the 0G Subgraph." },
        { status: 404 },
      );
    }
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const response = toOnchainApiError(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}

function optionalInteger(params: URLSearchParams, name: string): number | undefined {
  const value = params.get(name)?.trim();
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`${name} must be a non-negative integer.`);
  return parsed;
}
