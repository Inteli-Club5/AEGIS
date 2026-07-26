import { OnchainApiError } from "./browser.ts";
import type { PolicyReferenceFilters, SafeExecutionFilters } from "./coverageQueries.ts";
import type { IndexerFreshness, PaginatedResult, PolicyReference, SafeExecution } from "./types.ts";

export function fetchSafeExecutions(
  input: { limit?: number; cursor?: string | null; filters?: SafeExecutionFilters } = {},
  signal?: AbortSignal,
): Promise<PaginatedResult<SafeExecution>> {
  return requestCoverageJson(`/api/onchain/executions${buildQuery(input)}`, signal);
}

export function fetchSafeExecution(
  id: string,
  signal?: AbortSignal,
): Promise<{ item: SafeExecution; freshness: IndexerFreshness }> {
  return requestCoverageJson(`/api/onchain/executions/${encodeURIComponent(id)}`, signal);
}

export function fetchPolicyReferences(
  input: { limit?: number; cursor?: string | null; filters?: PolicyReferenceFilters } = {},
  signal?: AbortSignal,
): Promise<PaginatedResult<PolicyReference>> {
  return requestCoverageJson(`/api/onchain/policies${buildQuery(input)}`, signal);
}

export function fetchPolicyReference(
  id: string,
  signal?: AbortSignal,
): Promise<{ item: PolicyReference; freshness: IndexerFreshness }> {
  return requestCoverageJson(`/api/onchain/policies/${encodeURIComponent(id)}`, signal);
}

function buildQuery(input: { limit?: number; cursor?: string | null; filters?: Record<string, unknown> }): string {
  const params = new URLSearchParams();
  if (input.limit !== undefined) params.set("limit", String(input.limit));
  if (input.cursor) params.set("cursor", input.cursor);
  for (const [key, value] of Object.entries(input.filters ?? {})) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  return params.size > 0 ? `?${params.toString()}` : "";
}

async function requestCoverageJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { cache: "no-store", signal });
  const body = (await response.json().catch(() => null)) as (T & { error?: string; message?: string }) | null;
  if (!response.ok || body === null) {
    throw new OnchainApiError(
      body?.message ?? "The onchain data service returned an invalid response.",
      response.status,
      body?.error ?? "invalid_onchain_response",
    );
  }
  return body;
}
