import { NextResponse } from "next/server";
import { toOnchainApiError } from "~~/lib/onchain-data/apiErrors";
import { getOptionalIndexingStatusClient } from "~~/lib/onchain-data/indexingStatus";
import { listAgenticIdentities } from "~~/lib/onchain-data/repository";
import { getZeroGGraphClient } from "~~/lib/onchain-data/serverClients";

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

    const result = await listAgenticIdentities({
      client: getZeroGGraphClient(),
      indexingStatusClient: getOptionalIndexingStatusClient(),
      limit: optionalInteger(params, "limit"),
      cursor: params.get("cursor"),
      owner: optional(params, "owner"),
      contract: optional(params, "contract"),
      tokenId: optional(params, "tokenId"),
      status: readStatus(params),
      dateFrom,
      dateTo,
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

function readStatus(params: URLSearchParams): "ACTIVE" | "BURNED" | undefined {
  const status = optional(params, "status")?.toUpperCase();
  if (status === undefined) return undefined;
  if (status !== "ACTIVE" && status !== "BURNED") throw new Error("status must be ACTIVE or BURNED.");
  return status;
}
