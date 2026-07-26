import {
  POLICY_REFERENCES_QUERY,
  POLICY_REFERENCE_BY_ID_QUERY,
  type PolicyReferenceFilters,
  SAFE_EXECUTIONS_QUERY,
  SAFE_EXECUTION_BY_ID_QUERY,
  type SafeExecutionFilters,
  buildPolicyReferenceVariables,
  buildSafeExecutionVariables,
} from "./coverageQueries.ts";
import { buildIndexerFreshness } from "./freshness.ts";
import type { IndexingStatusClient } from "./indexingStatus.ts";
import { createNextCursor, createPageRequest } from "./pagination.ts";
import type { GraphClient } from "./serverClients.ts";
import type { GraphMeta, IndexerFreshness, PaginatedResult, PolicyReference, SafeExecution } from "./types.ts";

type RawMeta = {
  block?: { number?: number | string | null; hash?: string | null; timestamp?: number | string | null } | null;
  deployment?: string | null;
  hasIndexingErrors?: boolean | null;
};

type RawSafeExecution = Omit<SafeExecution, "sourceChain">;
type RawPolicyReference = Omit<PolicyReference, "sourceChain">;

export async function listSafeExecutions(input: {
  client: GraphClient;
  limit?: number;
  cursor?: string | null;
  filters?: SafeExecutionFilters;
  nowSeconds?: number;
  indexingStatusClient?: IndexingStatusClient | null;
}): Promise<PaginatedResult<SafeExecution>> {
  const [data, chainHead] = await Promise.all([
    input.client.query<{ safeExecutions: RawSafeExecution[]; _meta?: RawMeta | null }>(
      SAFE_EXECUTIONS_QUERY,
      buildSafeExecutionVariables(input),
    ),
    readChainHead(input.indexingStatusClient),
  ]);
  const page = createPageRequest(input);
  const fetchedItems = (data.safeExecutions ?? []).map(withSafeExecutionSource);
  const items = fetchedItems.slice(0, page.first);
  return {
    items,
    nextCursor: createNextCursor({
      hasNextPage: fetchedItems.length > page.first,
      lastId: items.at(-1)?.id,
    }),
    freshness: freshness(data._meta, chainHead, input.nowSeconds),
  };
}

export async function getSafeExecution(input: {
  client: GraphClient;
  id: string;
  nowSeconds?: number;
  indexingStatusClient?: IndexingStatusClient | null;
}): Promise<{ item: SafeExecution | null; freshness: IndexerFreshness }> {
  const [data, chainHead] = await Promise.all([
    input.client.query<{ safeExecution: RawSafeExecution | null; _meta?: RawMeta | null }>(SAFE_EXECUTION_BY_ID_QUERY, {
      id: input.id,
    }),
    readChainHead(input.indexingStatusClient),
  ]);
  return {
    item: data.safeExecution ? withSafeExecutionSource(data.safeExecution) : null,
    freshness: freshness(data._meta, chainHead, input.nowSeconds),
  };
}

export async function listPolicyReferences(input: {
  client: GraphClient;
  limit?: number;
  cursor?: string | null;
  filters?: PolicyReferenceFilters;
  nowSeconds?: number;
  indexingStatusClient?: IndexingStatusClient | null;
}): Promise<PaginatedResult<PolicyReference>> {
  const [data, chainHead] = await Promise.all([
    input.client.query<{ policyReferences: RawPolicyReference[]; _meta?: RawMeta | null }>(
      POLICY_REFERENCES_QUERY,
      buildPolicyReferenceVariables(input),
    ),
    readChainHead(input.indexingStatusClient),
  ]);
  const page = createPageRequest(input);
  const fetchedItems = (data.policyReferences ?? []).map(withPolicySource);
  const items = fetchedItems.slice(0, page.first);
  return {
    items,
    nextCursor: createNextCursor({
      hasNextPage: fetchedItems.length > page.first,
      lastId: items.at(-1)?.id,
    }),
    freshness: freshness(data._meta, chainHead, input.nowSeconds),
  };
}

export async function getPolicyReference(input: {
  client: GraphClient;
  id: string;
  nowSeconds?: number;
  indexingStatusClient?: IndexingStatusClient | null;
}): Promise<{ item: PolicyReference | null; freshness: IndexerFreshness }> {
  const [data, chainHead] = await Promise.all([
    input.client.query<{ policyReference: RawPolicyReference | null; _meta?: RawMeta | null }>(
      POLICY_REFERENCE_BY_ID_QUERY,
      { id: input.id },
    ),
    readChainHead(input.indexingStatusClient),
  ]);
  return {
    item: data.policyReference ? withPolicySource(data.policyReference) : null,
    freshness: freshness(data._meta, chainHead, input.nowSeconds),
  };
}

function withSafeExecutionSource(item: RawSafeExecution): SafeExecution {
  return { ...item, sourceChain: "hedera-testnet" };
}

function withPolicySource(item: RawPolicyReference): PolicyReference {
  return { ...item, sourceChain: "hedera-testnet" };
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

type ChainHeadObservation = {
  block: number | null;
  status: IndexerFreshness["chainHeadStatus"];
};

async function readChainHead(client: IndexingStatusClient | null | undefined): Promise<ChainHeadObservation> {
  if (!client) return { block: null, status: "not-configured" };
  try {
    const block = await client.getChainHead("hedera-testnet");
    return block === null ? { block: null, status: "unavailable" } : { block, status: "reported" };
  } catch {
    return { block: null, status: "unavailable" };
  }
}

function freshness(
  meta: RawMeta | null | undefined,
  chainHead: ChainHeadObservation,
  nowSeconds?: number,
): IndexerFreshness {
  return buildIndexerFreshness({
    source: "hedera-testnet",
    meta: normalizeMeta(meta),
    chainHeadBlock: chainHead.block,
    chainHeadStatus: chainHead.status,
    nowSeconds,
  });
}
