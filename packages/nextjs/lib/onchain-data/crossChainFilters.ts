import { buildAgentQueryVariables, buildIdentityQueryVariables } from "./queries.ts";
import type { AgentOnchainSummary, AgenticIdentity, CrossChainAgentFilters, CrossChainAgentView } from "./types.ts";

export type NormalizedCrossChainAgentFilters = {
  agentIdHash?: string;
  safe?: string;
  owner?: string;
  status?: "ACTIVE" | "BURNED";
  tokenId?: string;
  contract?: string;
  dateFrom?: string;
  dateTo?: string;
};

export function normalizeCrossChainAgentFilters(filters: CrossChainAgentFilters): NormalizedCrossChainAgentFilters {
  const hederaWhere = buildAgentQueryVariables({
    agentIdHash: filters.agentIdHash,
    safe: filters.safe,
    agenticIdTokenId: filters.tokenId,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
  }).where as Record<string, string | undefined>;
  const zeroGWhere = buildIdentityQueryVariables({
    owner: filters.owner,
    contract: filters.contract,
    tokenId: filters.tokenId,
    status: filters.status,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
  }).where as Record<string, string | "ACTIVE" | "BURNED" | undefined>;

  return {
    agentIdHash: hederaWhere.agentIdHash,
    safe: hederaWhere.safe,
    owner: zeroGWhere.owner,
    status: zeroGWhere.status as "ACTIVE" | "BURNED" | undefined,
    tokenId: hederaWhere.agenticIdTokenId,
    contract: zeroGWhere.contract,
    dateFrom: hederaWhere.lastActivityAt_gte,
    dateTo: hederaWhere.lastActivityAt_lte,
  };
}

export function matchesCrossChainAgentFilters(
  view: CrossChainAgentView,
  hedera: AgentOnchainSummary[],
  zeroG: AgenticIdentity[],
  filters: NormalizedCrossChainAgentFilters,
): boolean {
  const tokenId = normalizeTokenId(view.hedera?.agenticIdTokenId ?? view.zeroG?.tokenId ?? "");
  if (filters.tokenId && tokenId !== filters.tokenId) return false;

  const hederaCandidates = hedera.filter(agent => normalizeTokenId(agent.agenticIdTokenId) === tokenId);
  const zeroGCandidates = zeroG.filter(identity => normalizeTokenId(identity.tokenId) === tokenId);
  const hasHederaFilter = Boolean(filters.agentIdHash || filters.safe);
  const hasZeroGFilter = Boolean(filters.owner || filters.status || filters.contract);
  const matchingHedera = (view.hedera ? [view.hedera] : hederaCandidates).filter(agent =>
    matchesHedera(agent, filters),
  );
  const matchingZeroG = (view.zeroG ? [view.zeroG] : zeroGCandidates).filter(identity =>
    matchesZeroG(identity, filters),
  );

  if (hasHederaFilter && matchingHedera.length === 0) return false;
  if (hasZeroGFilter && matchingZeroG.length === 0) return false;

  if (filters.dateFrom || filters.dateTo) {
    const timestamps =
      view.state === "complete" || view.state === "mismatch"
        ? [view.hedera?.lastActivityAt, view.zeroG?.lastUpdatedAt]
        : [
            ...(!hasZeroGFilter || hasHederaFilter ? matchingHedera.map(agent => agent.lastActivityAt) : []),
            ...(!hasHederaFilter || hasZeroGFilter ? matchingZeroG.map(identity => identity.lastUpdatedAt) : []),
          ];
    const concreteTimestamps = timestamps.filter((value): value is string => typeof value === "string");
    if (!concreteTimestamps.some(value => inDateRange(value, filters.dateFrom, filters.dateTo))) return false;
  }

  return true;
}

function matchesHedera(agent: AgentOnchainSummary, filters: NormalizedCrossChainAgentFilters): boolean {
  return (
    (!filters.agentIdHash || agent.agentIdHash.toLowerCase() === filters.agentIdHash) &&
    (!filters.safe || agent.safe.toLowerCase() === filters.safe)
  );
}

function matchesZeroG(identity: AgenticIdentity, filters: NormalizedCrossChainAgentFilters): boolean {
  return (
    (!filters.owner || identity.owner.toLowerCase() === filters.owner) &&
    (!filters.status || identity.status === filters.status) &&
    (!filters.contract || identity.contract.toLowerCase() === filters.contract)
  );
}

function inDateRange(value: string, from?: string, to?: string): boolean {
  const timestamp = BigInt(value);
  return (!from || timestamp >= BigInt(from)) && (!to || timestamp <= BigInt(to));
}

function normalizeTokenId(value: string): string {
  if (!/^\d+$/.test(value.trim())) throw new Error("Expected an unsigned decimal Agentic ID token.");
  return BigInt(value.trim()).toString();
}
