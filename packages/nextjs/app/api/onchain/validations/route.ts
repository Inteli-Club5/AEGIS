import { NextResponse } from "next/server";
import { toOnchainApiError } from "~~/lib/onchain-data/apiErrors";
import { getOptionalIndexingStatusClient } from "~~/lib/onchain-data/indexingStatus";
import { listTeeMLValidations } from "~~/lib/onchain-data/repository";
import { getHederaGraphClient } from "~~/lib/onchain-data/serverClients";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const hedera = getHederaGraphClient();
    const dateFrom = optionalInteger(params, "dateFrom");
    const dateTo = optionalInteger(params, "dateTo");
    if (dateFrom !== undefined && dateTo !== undefined && dateFrom > dateTo) {
      throw new Error("dateFrom must be less than or equal to dateTo.");
    }
    const result = await listTeeMLValidations({
      client: hedera,
      indexingStatusClient: getOptionalIndexingStatusClient(),
      limit: optionalInteger(params, "limit"),
      cursor: params.get("cursor"),
      filters: {
        agentIdHash: optional(params, "agentIdHash"),
        verdict: readVerdict(params),
        reasonCodeHash: optional(params, "reasonCodeHash"),
        policyHash: optional(params, "policyHash"),
        actionHash: optional(params, "actionHash"),
        modelIdHash: optional(params, "modelIdHash"),
        recorder: optional(params, "recorder"),
        safe: optional(params, "safe"),
        transactionHash: optional(params, "transactionHash"),
        requestId: optional(params, "requestId"),
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

function readVerdict(params: URLSearchParams): "ALLOW" | "DENY" | undefined {
  const verdict = optional(params, "verdict")?.toUpperCase();
  if (verdict === undefined) return undefined;
  if (verdict !== "ALLOW" && verdict !== "DENY") throw new Error("verdict must be ALLOW or DENY.");
  return verdict;
}
