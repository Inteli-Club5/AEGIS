import { NextResponse } from "next/server";
import { toOnchainApiError } from "~~/lib/onchain-data/apiErrors";
import { getOptionalIndexingStatusClient } from "~~/lib/onchain-data/indexingStatus";
import { getOnchainOverview } from "~~/lib/onchain-data/repository";
import { type GraphClient, getHederaGraphClient, getZeroGGraphClient } from "~~/lib/onchain-data/serverClients";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const hederaClient = getClientOrDeferredFailure(getHederaGraphClient);
    const zeroGClient = getClientOrDeferredFailure(getZeroGGraphClient);
    const overview = await getOnchainOverview({
      hederaClient,
      zeroGClient,
      indexingStatusClient: getOptionalIndexingStatusClient(),
    });
    return NextResponse.json(overview, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const response = toOnchainApiError(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}

function getClientOrDeferredFailure(factory: () => GraphClient): GraphClient {
  try {
    return factory();
  } catch (error) {
    return {
      query: async <T>() => Promise.reject(error) as Promise<T>,
    };
  }
}
