import { buildCrossChainAgentViews } from "./aggregate.ts";
import { buildIndexerFreshness } from "./freshness.ts";
import type { IndexingStatusClient } from "./indexingStatus.ts";
import { createNextCursor, createPageRequest } from "./pagination.ts";
import {
  AGENTIC_IDENTITIES_QUERY,
  AGENTIC_IDENTITY_DETAIL_QUERY,
  HEDERA_AGENTS_QUERY,
  HEDERA_AGENT_DETAIL_QUERY,
  HEDERA_OVERVIEW_QUERY,
  RECENT_TEEML_VALIDATIONS_QUERY,
  TEEML_VALIDATION_BY_ID_QUERY,
  type ValidationFilters,
  ZERO_G_OVERVIEW_QUERY,
  buildAgentQueryVariables,
  buildIdentityDetailQueryVariables,
  buildIdentityQueryVariables,
  buildValidationQueryVariables,
} from "./queries.ts";
import type { GraphClient } from "./serverClients.ts";
import type {
  AgentOnchainSummary,
  AgenticIdentity,
  AgenticIdentityDetail,
  AgenticIdentityOwnerChange,
  GraphMeta,
  HederaAgentDetail,
  HederaProtocolSummary,
  OnchainOverview,
  PaginatedResult,
  SuppliedAgentLink,
  TeeMLValidation,
  ZeroGProtocolSummary,
} from "./types.ts";

type RawMeta = {
  block?: { number?: number | string | null; hash?: string | null; timestamp?: number | string | null } | null;
  deployment?: string | null;
  hasIndexingErrors?: boolean | null;
};

type RawTeeMLValidation = Omit<TeeMLValidation, "sourceChain" | "schemaVersion"> & {
  schemaVersion: number | string;
};

type RawAgentSummary = Omit<AgentOnchainSummary, "sourceChain">;
type RawAgenticIdentity = Omit<AgenticIdentity, "sourceChain">;
type RawAgenticIdentityOwnerChange = Omit<AgenticIdentityOwnerChange, "sourceChain">;

export async function listTeeMLValidations(input: {
  client: GraphClient;
  limit?: number;
  cursor?: string | null;
  filters?: ValidationFilters;
  nowSeconds?: number;
  indexingStatusClient?: IndexingStatusClient | null;
}): Promise<PaginatedResult<TeeMLValidation>> {
  const variables = buildValidationQueryVariables(input);
  const [data, chainHead] = await Promise.all([
    input.client.query<{
      teeMLValidations: RawTeeMLValidation[];
      _meta?: RawMeta | null;
    }>(RECENT_TEEML_VALIDATIONS_QUERY, variables),
    readChainHead(input.indexingStatusClient, "hedera-testnet"),
  ]);
  const page = createPageRequest(input);
  const fetchedItems = (data.teeMLValidations ?? []).map(withHederaSource);
  const items = fetchedItems.slice(0, page.first);

  return {
    items,
    nextCursor: createNextCursor({
      hasNextPage: fetchedItems.length > page.first,
      lastId: items.at(-1)?.id,
    }),
    freshness: buildIndexerFreshness({
      source: "hedera-testnet",
      meta: normalizeMeta(data._meta),
      chainHeadBlock: chainHead.block,
      chainHeadStatus: chainHead.status,
      nowSeconds: input.nowSeconds,
    }),
  };
}

export async function getTeeMLValidation(input: {
  client: GraphClient;
  id: string;
  nowSeconds?: number;
  indexingStatusClient?: IndexingStatusClient | null;
}): Promise<{ item: TeeMLValidation | null; freshness: ReturnType<typeof buildIndexerFreshness> }> {
  const [data, chainHead] = await Promise.all([
    input.client.query<{
      teeMLValidation: RawTeeMLValidation | null;
      _meta?: RawMeta | null;
    }>(TEEML_VALIDATION_BY_ID_QUERY, { id: input.id }),
    readChainHead(input.indexingStatusClient, "hedera-testnet"),
  ]);
  return {
    item: data.teeMLValidation ? withHederaSource(data.teeMLValidation) : null,
    freshness: buildIndexerFreshness({
      source: "hedera-testnet",
      meta: normalizeMeta(data._meta),
      chainHeadBlock: chainHead.block,
      chainHeadStatus: chainHead.status,
      nowSeconds: input.nowSeconds,
    }),
  };
}

export async function listHederaAgentSummaries(input: {
  client: GraphClient;
  limit?: number;
  cursor?: string | null;
  safe?: string;
  agentIdHash?: string;
  agenticIdTokenId?: string;
  dateFrom?: number;
  dateTo?: number;
  blockNumber?: number;
  nowSeconds?: number;
  indexingStatusClient?: IndexingStatusClient | null;
}): Promise<PaginatedResult<AgentOnchainSummary>> {
  const variables = buildAgentQueryVariables(input);
  const [data, chainHead] = await Promise.all([
    input.client.query<{
      agentOnchainSummaries: RawAgentSummary[];
      _meta?: RawMeta | null;
    }>(HEDERA_AGENTS_QUERY, variables),
    readChainHead(input.indexingStatusClient, "hedera-testnet"),
  ]);
  const page = createPageRequest(input);
  const fetchedItems = (data.agentOnchainSummaries ?? []).map(withHederaAgentSource);
  const items = fetchedItems.slice(0, page.first);
  return {
    items,
    nextCursor: createNextCursor({
      hasNextPage: fetchedItems.length > page.first,
      lastId: items.at(-1)?.id,
    }),
    freshness: buildIndexerFreshness({
      source: "hedera-testnet",
      meta: normalizeMeta(data._meta),
      chainHeadBlock: chainHead.block,
      chainHeadStatus: chainHead.status,
      nowSeconds: input.nowSeconds,
    }),
  };
}

export async function getHederaAgentSummary(input: {
  client: GraphClient;
  id: string;
  nowSeconds?: number;
  indexingStatusClient?: IndexingStatusClient | null;
}): Promise<HederaAgentDetail> {
  const [data, chainHead] = await Promise.all([
    input.client.query<{
      agentOnchainSummary: RawAgentSummary | null;
      teeMLValidations: RawTeeMLValidation[];
      _meta?: RawMeta | null;
    }>(HEDERA_AGENT_DETAIL_QUERY, { id: input.id, validationFirst: 10 }),
    readChainHead(input.indexingStatusClient, "hedera-testnet"),
  ]);

  return {
    item: data.agentOnchainSummary ? withHederaAgentSource(data.agentOnchainSummary) : null,
    recentValidations: (data.teeMLValidations ?? []).map(withHederaSource),
    freshness: buildIndexerFreshness({
      source: "hedera-testnet",
      meta: normalizeMeta(data._meta),
      chainHeadBlock: chainHead.block,
      chainHeadStatus: chainHead.status,
      nowSeconds: input.nowSeconds,
    }),
  };
}

export async function listAgenticIdentities(input: {
  client: GraphClient;
  limit?: number;
  cursor?: string | null;
  owner?: string;
  contract?: string;
  tokenId?: string;
  status?: "ACTIVE" | "BURNED";
  dateFrom?: number;
  dateTo?: number;
  blockNumber?: number;
  nowSeconds?: number;
  indexingStatusClient?: IndexingStatusClient | null;
}): Promise<PaginatedResult<AgenticIdentity>> {
  const variables = buildIdentityQueryVariables(input);
  const [data, chainHead] = await Promise.all([
    input.client.query<{
      agenticIdentities: RawAgenticIdentity[];
      _meta?: RawMeta | null;
    }>(AGENTIC_IDENTITIES_QUERY, variables),
    readChainHead(input.indexingStatusClient, "0g-galileo"),
  ]);
  const page = createPageRequest(input);
  const fetchedItems = (data.agenticIdentities ?? []).map(withZeroGSource);
  const items = fetchedItems.slice(0, page.first);
  return {
    items,
    nextCursor: createNextCursor({
      hasNextPage: fetchedItems.length > page.first,
      lastId: items.at(-1)?.id,
    }),
    freshness: buildIndexerFreshness({
      source: "0g-galileo",
      meta: normalizeMeta(data._meta),
      chainHeadBlock: chainHead.block,
      chainHeadStatus: chainHead.status,
      nowSeconds: input.nowSeconds,
    }),
  };
}

export async function getAgenticIdentity(input: {
  client: GraphClient;
  id: string;
  ownerChangeLimit?: number;
  ownerChangeCursor?: string | null;
  nowSeconds?: number;
  indexingStatusClient?: IndexingStatusClient | null;
}): Promise<AgenticIdentityDetail> {
  const variables = buildIdentityDetailQueryVariables(input);
  const [data, chainHead] = await Promise.all([
    input.client.query<{
      agenticIdentity: RawAgenticIdentity | null;
      agenticIdentityOwnerChanges: RawAgenticIdentityOwnerChange[];
      _meta?: RawMeta | null;
    }>(AGENTIC_IDENTITY_DETAIL_QUERY, variables),
    readChainHead(input.indexingStatusClient, "0g-galileo"),
  ]);
  const page = createPageRequest({ limit: input.ownerChangeLimit, cursor: input.ownerChangeCursor });
  const fetchedOwnerChanges = (data.agenticIdentityOwnerChanges ?? []).map(withZeroGOwnerChangeSource);
  const ownerChanges = fetchedOwnerChanges.slice(0, page.first);

  return {
    item: data.agenticIdentity ? withZeroGSource(data.agenticIdentity) : null,
    ownerChanges: {
      items: ownerChanges,
      nextCursor: createNextCursor({
        hasNextPage: fetchedOwnerChanges.length > page.first,
        lastId: ownerChanges.at(-1)?.id,
      }),
    },
    freshness: buildIndexerFreshness({
      source: "0g-galileo",
      meta: normalizeMeta(data._meta),
      chainHeadBlock: chainHead.block,
      chainHeadStatus: chainHead.status,
      nowSeconds: input.nowSeconds,
    }),
  };
}

const OVERVIEW_COLLECTION_LIMIT = 100;

export async function getOnchainOverview(input: {
  hederaClient: GraphClient;
  zeroGClient: GraphClient;
  suppliedLinks?: SuppliedAgentLink[];
  nowSeconds?: number;
  indexingStatusClient?: IndexingStatusClient | null;
}): Promise<OnchainOverview> {
  const [[hederaResult, zeroGResult], [hederaChainHead, zeroGChainHead]] = await Promise.all([
    Promise.allSettled([
      input.hederaClient.query<{
        agentOnchainSummaries: RawAgentSummary[];
        teeMLValidations: RawTeeMLValidation[];
        hederaProtocolSummary: HederaProtocolSummary | null;
        _meta?: RawMeta | null;
      }>(HEDERA_OVERVIEW_QUERY, {
        agentFirst: OVERVIEW_COLLECTION_LIMIT + 1,
        validationFirst: 10,
      }),
      input.zeroGClient.query<{
        agenticIdentities: RawAgenticIdentity[];
        zeroGProtocolSummary: ZeroGProtocolSummary | null;
        _meta?: RawMeta | null;
      }>(ZERO_G_OVERVIEW_QUERY, { identityFirst: OVERVIEW_COLLECTION_LIMIT + 1 }),
    ]),
    Promise.all([
      readChainHead(input.indexingStatusClient, "hedera-testnet"),
      readChainHead(input.indexingStatusClient, "0g-galileo"),
    ]),
  ]);

  if (hederaResult.status === "rejected" && zeroGResult.status === "rejected") {
    throw hederaResult.reason;
  }

  const hederaData = hederaResult.status === "fulfilled" ? hederaResult.value : null;
  const zeroGData = zeroGResult.status === "fulfilled" ? zeroGResult.value : null;

  const rawHederaAgents = hederaData?.agentOnchainSummaries ?? [];
  const rawIdentities = zeroGData?.agenticIdentities ?? [];
  const hederaComplete = hederaData !== null && rawHederaAgents.length <= OVERVIEW_COLLECTION_LIMIT;
  const zeroGComplete = zeroGData !== null && rawIdentities.length <= OVERVIEW_COLLECTION_LIMIT;
  const hederaAgents = rawHederaAgents.slice(0, OVERVIEW_COLLECTION_LIMIT).map(withHederaAgentSource);
  const identities = rawIdentities.slice(0, OVERVIEW_COLLECTION_LIMIT).map(withZeroGSource);
  const agents = buildCrossChainAgentViews({
    hedera: hederaAgents,
    zeroG: identities,
    suppliedLinks: input.suppliedLinks,
    sourceComplete: { hedera: hederaComplete, zeroG: zeroGComplete },
  });
  const hederaSummary = hederaData?.hederaProtocolSummary ?? null;
  const zeroGSummary = zeroGData?.zeroGProtocolSummary ?? null;
  const hederaMeta = normalizeMeta(hederaData?._meta);
  const zeroGMeta = normalizeMeta(zeroGData?._meta);
  const hederaCoverageAvailable = hederaData !== null && hederaMeta !== null && !hederaMeta.hasIndexingErrors;

  return {
    metrics: {
      scope: hederaSummary && zeroGSummary ? "complete" : hederaSummary || zeroGSummary ? "partial" : "unavailable",
      totalAgents: toMetric(hederaSummary?.totalAgents),
      agenticIds: toMetric(zeroGSummary?.distinctIdentityCount),
      teeMLValidations: toMetric(hederaSummary?.totalValidations),
      allow: toMetric(hederaSummary?.totalAllow),
      deny: toMetric(hederaSummary?.totalDeny),
      executions: toMetric(hederaSummary?.totalExecutions),
      payments: null,
      policiesReferenced: toMetric(hederaSummary?.totalPolicies),
    },
    agents,
    agentCollection: {
      limitPerSource: OVERVIEW_COLLECTION_LIMIT,
      hederaComplete,
      zeroGComplete,
    },
    recentValidations: (hederaData?.teeMLValidations ?? []).map(withHederaSource),
    freshness: {
      hedera: buildIndexerFreshness({
        source: "hedera-testnet",
        meta: hederaMeta,
        chainHeadBlock: hederaChainHead.block,
        chainHeadStatus: hederaChainHead.status,
        nowSeconds: input.nowSeconds,
      }),
      zeroG: buildIndexerFreshness({
        source: "0g-galileo",
        meta: zeroGMeta,
        chainHeadBlock: zeroGChainHead.block,
        chainHeadStatus: zeroGChainHead.status,
        nowSeconds: input.nowSeconds,
      }),
    },
    sourceErrors: {
      hedera: hederaResult.status === "rejected" ? "Hedera Subgraph query unavailable." : null,
      zeroG: zeroGResult.status === "rejected" ? "0G Subgraph query unavailable." : null,
    },
    support: {
      executions: hederaCoverageAvailable ? "indexed" : "blocked",
      payments: "unsupported",
      policies: hederaCoverageAvailable ? "indexed" : "blocked",
    },
  };
}

function withHederaSource(item: RawTeeMLValidation): TeeMLValidation {
  return {
    ...item,
    schemaVersion: Number(item.schemaVersion),
    sourceChain: "hedera-testnet",
  };
}

function withHederaAgentSource(item: RawAgentSummary): AgentOnchainSummary {
  return { ...item, sourceChain: "hedera-testnet" };
}

function withZeroGSource(item: RawAgenticIdentity): AgenticIdentity {
  return { ...item, sourceChain: "0g-galileo" };
}

function withZeroGOwnerChangeSource(item: RawAgenticIdentityOwnerChange): AgenticIdentityOwnerChange {
  return { ...item, sourceChain: "0g-galileo" };
}

function normalizeMeta(meta: RawMeta | null | undefined): GraphMeta | null {
  if (meta?.block?.number === null || meta?.block?.number === undefined) return null;
  return {
    block: {
      number: Number(meta.block.number),
      hash: meta.block.hash ?? null,
      timestamp:
        meta.block.timestamp === null || meta.block.timestamp === undefined ? null : Number(meta.block.timestamp),
    },
    deployment: meta.deployment ?? null,
    hasIndexingErrors: meta.hasIndexingErrors ?? false,
  };
}

function toMetric(value: string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

type ChainHeadObservation = {
  block: number | null;
  status: "reported" | "not-configured" | "unavailable";
};

async function readChainHead(
  client: IndexingStatusClient | null | undefined,
  source: "hedera-testnet" | "0g-galileo",
): Promise<ChainHeadObservation> {
  if (!client) return { block: null, status: "not-configured" };
  try {
    const block = await client.getChainHead(source);
    return block === null ? { block: null, status: "unavailable" } : { block, status: "reported" };
  } catch {
    return { block: null, status: "unavailable" };
  }
}
