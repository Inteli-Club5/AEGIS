import { createPageRequest } from "./pagination.ts";

const TEEML_VALIDATION_FIELDS = /* GraphQL */ `
  id
  requestId
  agentIdHash
  agenticIdTokenId
  safe
  policyHash
  actionHash
  semanticContextHash
  teemlRequestHash
  artifactHash
  modelIdHash
  verdict
  reasonCodeHash
  recorder
  schemaVersion
  transactionHash
  blockNumber
  blockTimestamp
  logIndex
`;

const GRAPH_META_FIELDS = /* GraphQL */ `
  block {
    number
    hash
    timestamp
  }
  deployment
  hasIndexingErrors
`;

const HEDERA_AGENT_FIELDS = /* GraphQL */ `
  id
  agentIdHash
  safe
  agenticIdTokenId
  validationCount
  allowCount
  denyCount
  executionCount
  executionSuccessCount
  executionFailureCount
  policyCount
  firstActivityAt
  lastActivityAt
`;

const AGENTIC_IDENTITY_FIELDS = /* GraphQL */ `
  id
  contract
  tokenId
  owner
  status
  seenMint
  mintTransactionHash
  mintBlockNumber
  mintBlockTimestamp
  transactionHash
  blockNumber
  blockTimestamp
  logIndex
  firstSeenAt
  lastUpdatedAt
  currentAuthorizationCount
  totalAuthorizationEvents
`;

const AGENTIC_IDENTITY_OWNER_CHANGE_FIELDS = /* GraphQL */ `
  id
  identity {
    id
  }
  contract
  tokenId
  previousOwner
  newOwner
  changeType
  transactionHash
  blockNumber
  blockTimestamp
  logIndex
`;

const AGENTIC_IDENTITY_AUTHORIZATION_FIELDS = /* GraphQL */ `
  id
  contract
  tokenId
  user
  action
  authorized
  transactionHash
  blockNumber
  blockTimestamp
  logIndex
`;

const AGENTIC_IDENTITY_DELEGATION_FIELDS = /* GraphQL */ `
  id
  owner
  assistant
  action
  active
  transactionHash
  blockNumber
  blockTimestamp
  logIndex
`;

export const RECENT_TEEML_VALIDATIONS_QUERY = /* GraphQL */ `
  query TeeMLValidations($first: Int!, $where: TeeMLValidation_filter!) {
    teeMLValidations(first: $first, orderBy: id, orderDirection: asc, where: $where) {
      ${TEEML_VALIDATION_FIELDS}
    }
    _meta {
      ${GRAPH_META_FIELDS}
    }
  }
`;

export const LATEST_TEEML_VALIDATIONS_QUERY = /* GraphQL */ `
  query LatestTeeMLValidations($first: Int!, $where: TeeMLValidation_filter!) {
    teeMLValidations(first: $first, orderBy: blockTimestamp, orderDirection: desc, where: $where) {
      ${TEEML_VALIDATION_FIELDS}
    }
    _meta {
      ${GRAPH_META_FIELDS}
    }
  }
`;

export const TEEML_VALIDATION_BY_ID_QUERY = /* GraphQL */ `
  query TeeMLValidationById($id: ID!) {
    teeMLValidation(id: $id) {
      ${TEEML_VALIDATION_FIELDS}
    }
    _meta {
      ${GRAPH_META_FIELDS}
    }
  }
`;

export const HEDERA_AGENTS_QUERY = /* GraphQL */ `
  query HederaAgents($first: Int!, $where: AgentOnchainSummary_filter!, $block: Block_height) {
    agentOnchainSummaries(first: $first, orderBy: id, orderDirection: asc, where: $where, block: $block) {
      ${HEDERA_AGENT_FIELDS}
    }
    _meta(block: $block) {
      ${GRAPH_META_FIELDS}
    }
  }
`;

export const HEDERA_AGENT_CANDIDATES_QUERY = /* GraphQL */ `
  query CrossChainHederaCandidates(
    $first: Int!
    $where: AgentOnchainSummary_filter!
    $block: Block_height
  ) {
    agentOnchainSummaries(first: $first, orderBy: id, orderDirection: asc, where: $where, block: $block) {
      ${HEDERA_AGENT_FIELDS}
    }
    _meta(block: $block) {
      ${GRAPH_META_FIELDS}
    }
  }
`;

export const RECENT_HEDERA_AGENTS_QUERY = /* GraphQL */ `
  query RecentHederaAgents($first: Int!, $where: AgentOnchainSummary_filter!) {
    agentOnchainSummaries(first: $first, orderBy: lastActivityAt, orderDirection: desc, where: $where) {
      ${HEDERA_AGENT_FIELDS}
    }
    _meta {
      ${GRAPH_META_FIELDS}
    }
  }
`;

export const HEDERA_AGENT_BY_ID_QUERY = /* GraphQL */ `
  query HederaAgentById($id: ID!) {
    agentOnchainSummary(id: $id) {
      ${HEDERA_AGENT_FIELDS}
    }
  }
`;

export const HEDERA_AGENT_DETAIL_QUERY = /* GraphQL */ `
  query HederaAgentDetail($id: ID!, $validationFirst: Int!) {
    agentOnchainSummary(id: $id) {
      ${HEDERA_AGENT_FIELDS}
    }
    teeMLValidations(
      first: $validationFirst
      orderBy: blockTimestamp
      orderDirection: desc
      where: { agent: $id }
    ) {
      ${TEEML_VALIDATION_FIELDS}
    }
    _meta {
      ${GRAPH_META_FIELDS}
    }
  }
`;

export const AGENTIC_IDENTITIES_QUERY = /* GraphQL */ `
  query AgenticIdentities($first: Int!, $where: AgenticIdentity_filter!, $block: Block_height) {
    agenticIdentities(first: $first, orderBy: id, orderDirection: asc, where: $where, block: $block) {
      ${AGENTIC_IDENTITY_FIELDS}
    }
    _meta(block: $block) {
      ${GRAPH_META_FIELDS}
    }
  }
`;

export const ZERO_G_IDENTITY_CANDIDATES_QUERY = /* GraphQL */ `
  query CrossChainZeroGIdentityCandidates(
    $first: Int!
    $where: AgenticIdentity_filter!
    $block: Block_height
  ) {
    agenticIdentities(first: $first, orderBy: id, orderDirection: asc, where: $where, block: $block) {
      ${AGENTIC_IDENTITY_FIELDS}
    }
    _meta(block: $block) {
      ${GRAPH_META_FIELDS}
    }
  }
`;

export const AGENTIC_IDENTITY_BY_ID_QUERY = /* GraphQL */ `
  query AgenticIdentityById($id: ID!) {
    agenticIdentity(id: $id) {
      ${AGENTIC_IDENTITY_FIELDS}
    }
    agenticIdentityOwnerChanges(first: 50, orderBy: id, orderDirection: asc, where: { identity: $id }) {
      id
      identity {
        id
      }
      contract
      tokenId
      previousOwner
      newOwner
      changeType
      transactionHash
      blockNumber
      blockTimestamp
      logIndex
    }
  }
`;

export const AGENTIC_IDENTITY_DETAIL_QUERY = /* GraphQL */ `
  query AgenticIdentityDetail(
    $id: ID!
    $ownerChangeFirst: Int!
    $ownerChangeWhere: AgenticIdentityOwnerChange_filter!
  ) {
    agenticIdentity(id: $id) {
      ${AGENTIC_IDENTITY_FIELDS}
    }
    agenticIdentityOwnerChanges(
      first: $ownerChangeFirst
      orderBy: id
      orderDirection: asc
      where: $ownerChangeWhere
    ) {
      ${AGENTIC_IDENTITY_OWNER_CHANGE_FIELDS}
    }
    _meta {
      ${GRAPH_META_FIELDS}
    }
  }
`;

export const HEDERA_OVERVIEW_QUERY = /* GraphQL */ `
  query HederaOverview($agentFirst: Int!, $validationFirst: Int!) {
    agentOnchainSummaries(first: $agentFirst, orderBy: id, orderDirection: asc) {
      ${HEDERA_AGENT_FIELDS}
    }
    teeMLValidations(first: $validationFirst, orderBy: blockTimestamp, orderDirection: desc) {
      ${TEEML_VALIDATION_FIELDS}
    }
    hederaProtocolSummary(id: "global") {
      id
      totalAgents
      totalValidations
      totalAllow
      totalDeny
      totalExecutions
      totalExecutionSuccess
      totalExecutionFailure
      totalPolicies
      firstActivityAt
      lastActivityAt
    }
    _meta {
      ${GRAPH_META_FIELDS}
    }
  }
`;

export const ZERO_G_OVERVIEW_QUERY = /* GraphQL */ `
  query ZeroGOverview($identityFirst: Int!) {
    agenticIdentities(first: $identityFirst, orderBy: id, orderDirection: asc) {
      ${AGENTIC_IDENTITY_FIELDS}
    }
    zeroGProtocolSummary(id: "global") {
      id
      distinctIdentityCount
      mintEventCount
      transferEventCount
      burnEventCount
      currentIdentityCount
      totalOwnerChanges
      firstActivityAt
      lastActivityAt
    }
    _meta {
      ${GRAPH_META_FIELDS}
    }
  }
`;

export const AUDIT_ZERO_G_REGISTRY_SUMMARY_QUERY = /* GraphQL */ `
  query AuditZeroGRegistrySummary($first: Int!) {
    zeroGProtocolSummary(id: "global") {
      id
      distinctIdentityCount
      mintEventCount
      transferEventCount
      burnEventCount
      currentIdentityCount
      totalOwnerChanges
      firstActivityAt
      lastActivityAt
    }
    agenticIdentities(first: $first, orderBy: lastUpdatedAt, orderDirection: desc) {
      ${AGENTIC_IDENTITY_FIELDS}
    }
    _meta {
      ${GRAPH_META_FIELDS}
    }
  }
`;

export const AUDIT_ZERO_G_IDENTITIES_QUERY = /* GraphQL */ `
  query AuditZeroGIdentities($first: Int!) {
    agenticIdentities(first: $first, orderBy: lastUpdatedAt, orderDirection: desc) {
      ${AGENTIC_IDENTITY_FIELDS}
    }
    _meta {
      ${GRAPH_META_FIELDS}
    }
  }
`;

export const AUDIT_ZERO_G_OWNER_CHANGES_QUERY = /* GraphQL */ `
  query AuditZeroGOwnerChanges($first: Int!) {
    agenticIdentityOwnerChanges(first: $first, orderBy: blockTimestamp, orderDirection: desc) {
      ${AGENTIC_IDENTITY_OWNER_CHANGE_FIELDS}
    }
    _meta {
      ${GRAPH_META_FIELDS}
    }
  }
`;

export const AUDIT_ZERO_G_AUTHORIZATIONS_QUERY = /* GraphQL */ `
  query AuditZeroGAuthorizations($first: Int!) {
    agenticIdentityAuthorizations(first: $first, orderBy: blockTimestamp, orderDirection: desc) {
      ${AGENTIC_IDENTITY_AUTHORIZATION_FIELDS}
    }
    _meta {
      ${GRAPH_META_FIELDS}
    }
  }
`;

export const AUDIT_ZERO_G_DELEGATIONS_QUERY = /* GraphQL */ `
  query AuditZeroGDelegations($first: Int!) {
    agenticIdentityDelegations(first: $first, orderBy: blockTimestamp, orderDirection: desc) {
      ${AGENTIC_IDENTITY_DELEGATION_FIELDS}
    }
    _meta {
      ${GRAPH_META_FIELDS}
    }
  }
`;

export const SAFE_EXECUTIONS_BY_SAFE_QUERY = /* GraphQL */ `
  query SafeExecutionsBySafe($first: Int!, $where: SafeExecution_filter!) {
    safeExecutions(first: $first, orderBy: id, orderDirection: asc, where: $where) {
      id
      safe
      agentIdHash
      safeTxHash
      success
      refundPayment
      transactionHash
      blockNumber
      blockTimestamp
      logIndex
    }
  }
`;

export const POLICY_REFERENCES_QUERY = /* GraphQL */ `
  query PolicyReferences($first: Int!, $where: PolicyReference_filter!) {
    policyReferences(first: $first, orderBy: id, orderDirection: asc, where: $where) {
      id
      policyHash
      validationCount
      allowCount
      denyCount
      firstReferencedAt
      lastReferencedAt
    }
  }
`;

export const DAILY_AGENT_METRICS_QUERY = /* GraphQL */ `
  query DailyAgentMetrics($first: Int!, $where: DailyAgentMetric_filter!) {
    dailyAgentMetrics(first: $first, orderBy: id, orderDirection: asc, where: $where) {
      id
      day
      agentIdHash
      validationCount
      allowCount
      denyCount
      executionCount
      executionSuccessCount
      executionFailureCount
    }
  }
`;

export const INDEXING_STATUS_QUERY = /* GraphQL */ `
  query IndexingStatus {
    _meta {
      ${GRAPH_META_FIELDS}
    }
  }
`;

export const QUERY_CATALOG = {
  recentAgents: RECENT_HEDERA_AGENTS_QUERY,
  agentById: HEDERA_AGENT_DETAIL_QUERY,
  agentBySafe: HEDERA_AGENTS_QUERY,
  recentTeeMLValidations: LATEST_TEEML_VALIDATIONS_QUERY,
  validationsByVerdict: RECENT_TEEML_VALIDATIONS_QUERY,
  validationsByReasonCode: RECENT_TEEML_VALIDATIONS_QUERY,
  validationByRequestId: RECENT_TEEML_VALIDATIONS_QUERY,
  validationByActionHash: RECENT_TEEML_VALIDATIONS_QUERY,
  validationsByPolicyHash: RECENT_TEEML_VALIDATIONS_QUERY,
  executionsBySafe: SAFE_EXECUTIONS_BY_SAFE_QUERY,
  agentSummary: HEDERA_AGENT_BY_ID_QUERY,
  dailyMetrics: DAILY_AGENT_METRICS_QUERY,
  indexingStatus: INDEXING_STATUS_QUERY,
  crossChainAgentView: [HEDERA_AGENTS_QUERY, AGENTIC_IDENTITIES_QUERY] as const,
  agenticIdentities: AGENTIC_IDENTITIES_QUERY,
  agenticIdentityById: AGENTIC_IDENTITY_DETAIL_QUERY,
  auditZeroGRegistrySummary: AUDIT_ZERO_G_REGISTRY_SUMMARY_QUERY,
  auditZeroGIdentities: AUDIT_ZERO_G_IDENTITIES_QUERY,
  auditZeroGOwnerChanges: AUDIT_ZERO_G_OWNER_CHANGES_QUERY,
  auditZeroGAuthorizations: AUDIT_ZERO_G_AUTHORIZATIONS_QUERY,
  auditZeroGDelegations: AUDIT_ZERO_G_DELEGATIONS_QUERY,
} as const;

export const UNSUPPORTED_ONCHAIN_QUERIES = {
  // TODO(TG-EVENTS-001): Enable this onchain business view after the execution module emits the documented sanitized event and the Hedera Subgraph indexes it. Do not replace the missing event with RPC, database, or fixture data. Remove this TODO after the producer, mapping, live indexing, GraphQL, and dashboard acceptance tests pass.
  paymentsByAgent: "No indexed payment event/entity is available in the current Hedera schema.",
} as const;

export type ValidationFilters = {
  agentIdHash?: string;
  verdict?: "ALLOW" | "DENY";
  reasonCodeHash?: string;
  policyHash?: string;
  actionHash?: string;
  modelIdHash?: string;
  recorder?: string;
  safe?: string;
  transactionHash?: string;
  requestId?: string;
  dateFrom?: number;
  dateTo?: number;
};

export function buildValidationQueryVariables(input: {
  limit?: number;
  cursor?: string | null;
  filters?: ValidationFilters;
}) {
  const page = createPageRequest(input);
  const filters = input.filters ?? {};
  return {
    first: page.first + 1,
    where: compactObject({
      id_gt: page.afterId,
      agentIdHash: normalizeBytes(filters.agentIdHash, 32),
      verdict: filters.verdict,
      reasonCodeHash: normalizeBytes(filters.reasonCodeHash, 32),
      policyHash: normalizeBytes(filters.policyHash, 32),
      actionHash: normalizeBytes(filters.actionHash, 32),
      modelIdHash: normalizeBytes(filters.modelIdHash, 32),
      recorder: normalizeBytes(filters.recorder, 20),
      safe: normalizeBytes(filters.safe, 20),
      transactionHash: normalizeBytes(filters.transactionHash, 32),
      requestId: normalizeBytes(filters.requestId, 32),
      blockTimestamp_gte: normalizeTimestamp(filters.dateFrom),
      blockTimestamp_lte: normalizeTimestamp(filters.dateTo),
    }),
  };
}

export type AgentFilters = {
  safe?: string;
  agentIdHash?: string;
  agenticIdTokenId?: string;
  dateFrom?: number;
  dateTo?: number;
};

export function buildAgentQueryVariables(
  input: {
    limit?: number;
    cursor?: string | null;
    blockNumber?: number;
  } & AgentFilters,
) {
  const page = createPageRequest(input);
  const blockNumber = normalizeBlockNumber(input.blockNumber);
  return {
    first: page.first + 1,
    where: compactObject({
      id_gt: page.afterId,
      safe: normalizeBytes(input.safe, 20),
      agentIdHash: normalizeBytes(input.agentIdHash, 32),
      agenticIdTokenId: normalizeTokenId(input.agenticIdTokenId),
      lastActivityAt_gte: normalizeTimestamp(input.dateFrom),
      lastActivityAt_lte: normalizeTimestamp(input.dateTo),
    }),
    ...(blockNumber === undefined ? {} : { block: { number: blockNumber } }),
  };
}

export type IdentityFilters = {
  owner?: string;
  contract?: string;
  tokenId?: string;
  status?: "ACTIVE" | "BURNED";
  dateFrom?: number;
  dateTo?: number;
};

export function buildIdentityQueryVariables(
  input: {
    limit?: number;
    cursor?: string | null;
    blockNumber?: number;
  } & IdentityFilters,
) {
  const page = createPageRequest(input);
  const blockNumber = normalizeBlockNumber(input.blockNumber);
  return {
    first: page.first + 1,
    where: compactObject({
      id_gt: page.afterId,
      owner: normalizeBytes(input.owner, 20),
      contract: normalizeBytes(input.contract, 20),
      tokenId: normalizeTokenId(input.tokenId),
      status: input.status,
      lastUpdatedAt_gte: normalizeTimestamp(input.dateFrom),
      lastUpdatedAt_lte: normalizeTimestamp(input.dateTo),
    }),
    ...(blockNumber === undefined ? {} : { block: { number: blockNumber } }),
  };
}

export function buildIdentityDetailQueryVariables(input: {
  id: string;
  ownerChangeLimit?: number;
  ownerChangeCursor?: string | null;
}) {
  const page = createPageRequest({ limit: input.ownerChangeLimit, cursor: input.ownerChangeCursor });
  return {
    id: input.id,
    ownerChangeFirst: page.first + 1,
    ownerChangeWhere: compactObject({ identity: input.id, id_gt: page.afterId }),
  };
}

function normalizeTimestamp(value: number | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("Onchain date filters must be Unix seconds.");
  return String(value);
}

function normalizeBlockNumber(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("Onchain block numbers must be unsigned integers.");
  return value;
}

function normalizeTokenId(value: string | undefined): string | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) throw new Error("Agentic ID token must be an unsigned integer.");
  return BigInt(normalized).toString();
}

function normalizeBytes(value: string | undefined, byteLength: number): string | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  const normalized = value.trim().toLowerCase();
  if (!new RegExp(`^0x[0-9a-f]{${byteLength * 2}}$`).test(normalized)) {
    throw new Error(`Expected a ${byteLength}-byte 0x-prefixed value.`);
  }
  return normalized;
}

function compactObject<T extends Record<string, unknown>>(input: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined && value !== null),
  ) as Partial<T>;
}
