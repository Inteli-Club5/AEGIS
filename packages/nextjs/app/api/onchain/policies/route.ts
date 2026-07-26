import { NextResponse } from "next/server";
import { toOnchainApiError } from "~~/lib/onchain-data/apiErrors";
import { listPolicyReferences } from "~~/lib/onchain-data/coverageRepository";
import { getOptionalIndexingStatusClient } from "~~/lib/onchain-data/indexingStatus";
import { getHederaGraphClient } from "~~/lib/onchain-data/serverClients";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const dateFrom = optionalInteger(params, "dateFrom");
    const dateTo = optionalInteger(params, "dateTo");
    if (dateFrom !== undefined && dateTo !== undefined && dateFrom > dateTo) {
      throw new Error("dateFrom must be less than or equal to dateTo.");
    }
    const result = await listPolicyReferences({
      client: getHederaGraphClient(),
      indexingStatusClient: getOptionalIndexingStatusClient(),
      limit: optionalInteger(params, "limit"),
      cursor: params.get("cursor"),
      filters: {
        policyHash: optional(params, "policyHash"),
        dateFrom,
        dateTo,
      },
    });
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const response = toOnchainApiError(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}

function optional(params: URLSearchParams, name: string): string | undefined {
  const value = params.get(name)?.trim();
  return value || undefined;
}

function optionalInteger(params: URLSearchParams, name: string): number | undefined {
  const value = optional(params, name);
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`${name} must be a non-negative integer.`);
  return parsed;
}
