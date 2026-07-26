import type { AuditCopilotIntent, AuditCopilotResponse } from "./auditCopilot.ts";
import type { IdentityFilters, ValidationFilters } from "./queries.ts";
import type {
  AgentOnchainSummary,
  AgenticIdentity,
  AgenticIdentityDetail,
  CrossChainAgentFilters,
  CrossChainAgentPage,
  HederaAgentDetail,
  OnchainOverview,
  PaginatedResult,
  TeeMLValidation,
} from "./types.ts";

export class OnchainApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = "OnchainApiError";
    this.status = status;
    this.code = code;
  }
}

export async function fetchAuditCopilot(
  input: { question: string; intent?: AuditCopilotIntent; limit?: number },
  signal?: AbortSignal,
): Promise<AuditCopilotResponse> {
  return requestOnchainJson("/api/onchain/audit-copilot", signal, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function fetchOnchainOverview(signal?: AbortSignal): Promise<OnchainOverview> {
  return requestOnchainJson("/api/onchain/overview", signal);
}

export async function fetchTeeMLValidations(
  input: {
    limit?: number;
    cursor?: string | null;
    filters?: ValidationFilters;
  } = {},
  signal?: AbortSignal,
): Promise<PaginatedResult<TeeMLValidation>> {
  const params = new URLSearchParams();
  if (input.limit !== undefined) params.set("limit", String(input.limit));
  if (input.cursor) params.set("cursor", input.cursor);
  for (const [key, value] of Object.entries(input.filters ?? {})) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  const query = params.size > 0 ? `?${params.toString()}` : "";
  return requestOnchainJson(`/api/onchain/validations${query}`, signal);
}

export async function fetchTeeMLValidation(
  id: string,
  signal?: AbortSignal,
): Promise<{
  item: TeeMLValidation;
  freshness: PaginatedResult<TeeMLValidation>["freshness"];
}> {
  return requestOnchainJson(`/api/onchain/validations/${encodeURIComponent(id)}`, signal);
}

export async function fetchCrossChainAgents(
  input: {
    limit?: number;
    cursor?: string | null;
    filters?: CrossChainAgentFilters;
  } = {},
  signal?: AbortSignal,
): Promise<CrossChainAgentPage> {
  const query = buildOnchainSearch(input);
  return requestOnchainJson(`/api/onchain/agents${query}`, signal);
}

export async function fetchHederaAgentSummary(
  id: string,
  signal?: AbortSignal,
): Promise<Omit<HederaAgentDetail, "item"> & { item: AgentOnchainSummary }> {
  return requestOnchainJson(`/api/onchain/agents/${encodeURIComponent(id)}`, signal);
}

export async function fetchAgenticIdentities(
  input: {
    limit?: number;
    cursor?: string | null;
    filters?: IdentityFilters;
  } = {},
  signal?: AbortSignal,
): Promise<PaginatedResult<AgenticIdentity>> {
  const query = buildOnchainSearch(input);
  return requestOnchainJson(`/api/onchain/identities${query}`, signal);
}

export async function fetchAgenticIdentity(
  id: string,
  input: { ownerChangeLimit?: number; ownerChangeCursor?: string | null } = {},
  signal?: AbortSignal,
): Promise<Omit<AgenticIdentityDetail, "item"> & { item: AgenticIdentity }> {
  const params = new URLSearchParams();
  if (input.ownerChangeLimit !== undefined) params.set("ownerChangeLimit", String(input.ownerChangeLimit));
  if (input.ownerChangeCursor) params.set("ownerChangeCursor", input.ownerChangeCursor);
  const query = params.size > 0 ? `?${params.toString()}` : "";
  return requestOnchainJson(`/api/onchain/identities/${encodeURIComponent(id)}${query}`, signal);
}

function buildOnchainSearch(input: {
  limit?: number;
  cursor?: string | null;
  filters?: Readonly<Record<string, unknown>>;
}): string {
  const params = new URLSearchParams();
  if (input.limit !== undefined) params.set("limit", String(input.limit));
  if (input.cursor) params.set("cursor", input.cursor);
  for (const [key, value] of Object.entries(input.filters ?? {})) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  return params.size > 0 ? `?${params.toString()}` : "";
}

async function requestOnchainJson<T>(path: string, signal?: AbortSignal, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, { ...init, cache: "no-store", signal });
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
