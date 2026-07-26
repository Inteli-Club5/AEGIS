import { buildCrossChainAgentViews } from "./aggregate.ts";
import {
  type NormalizedCrossChainAgentFilters,
  matchesCrossChainAgentFilters,
  normalizeCrossChainAgentFilters,
} from "./crossChainFilters.ts";
import { buildIndexerFreshness } from "./freshness.ts";
import type { IndexingStatusClient } from "./indexingStatus.ts";
import { HEDERA_AGENT_CANDIDATES_QUERY, ZERO_G_IDENTITY_CANDIDATES_QUERY } from "./queries.ts";
import { listAgenticIdentities, listHederaAgentSummaries } from "./repository.ts";
import type { GraphClient } from "./serverClients.ts";
import type {
  AgentOnchainSummary,
  AgenticIdentity,
  CrossChainAgentFilters,
  CrossChainAgentPage,
  CrossChainAgentView,
  GraphMeta,
  IndexerFreshness,
  SourceChain,
} from "./types.ts";
import { keccak256, stringToHex } from "viem";

const SOURCE_WINDOW_SIZE = 100;
const CANDIDATE_CAP = 999;
const DEFAULT_AGGREGATE_PAGE_SIZE = 25;
const MAX_AGGREGATE_PAGE_SIZE = 100;
const MAX_EMPTY_WINDOW_ADVANCES = 16;

type Phase = "hedera" | "zeroG";

type CursorState = {
  phase: Phase;
  sourceCursor: string | null;
  afterKey: string | null;
  hederaBlock: number | null;
  zeroGBlock: number | null;
};

type RawMeta = {
  block?: { number?: number | string | null; hash?: string | null; timestamp?: number | string | null } | null;
  deployment?: string | null;
  hasIndexingErrors?: boolean | null;
};

type RawAgentSummary = Omit<AgentOnchainSummary, "sourceChain">;
type RawAgenticIdentity = Omit<AgenticIdentity, "sourceChain">;

type CandidatePage<T> = {
  items: T[];
  truncated: boolean;
  freshness: IndexerFreshness;
};

type SettledCandidatePage<T> =
  | { ok: true; page: CandidatePage<T> }
  | { ok: false; page: CandidatePage<T>; error: string };

export async function listCrossChainAgents(input: {
  hederaClient: GraphClient;
  zeroGClient: GraphClient;
  filters?: CrossChainAgentFilters;
  limit?: number;
  cursor?: string | null;
  nowSeconds?: number;
  indexingStatusClient?: IndexingStatusClient | null;
}): Promise<CrossChainAgentPage> {
  const filters = normalizeCrossChainAgentFilters(input.filters ?? {});
  const fingerprint = fingerprintFilters(filters);
  const initialState: CursorState = input.cursor
    ? decodeCursor(input.cursor, fingerprint)
    : { phase: "hedera", sourceCursor: null, afterKey: null, hederaBlock: null, zeroGBlock: null };
  const pageSize = normalizePageSize(input.limit);
  let state = initialState;
  let lastEmptyPage: CrossChainAgentPage | null = null;

  for (let advance = 0; advance < MAX_EMPTY_WINDOW_ADVANCES; advance += 1) {
    const result = await readCursorState(input, filters, fingerprint, state, pageSize);
    if (result.items.length > 0 || result.nextCursor === null) return result;
    lastEmptyPage = result;
    state = decodeCursor(result.nextCursor, fingerprint);
  }

  return lastEmptyPage!;
}

async function readCursorState(
  input: Parameters<typeof listCrossChainAgents>[0],
  filters: NormalizedCrossChainAgentFilters,
  fingerprint: string,
  state: CursorState,
  pageSize: number,
): Promise<CrossChainAgentPage> {
  if (state.phase === "hedera") {
    try {
      return await readHederaPhase(input, filters, fingerprint, state, pageSize);
    } catch (hederaError) {
      try {
        return await readZeroGPhase(
          input,
          filters,
          fingerprint,
          { ...state, phase: "zeroG", sourceCursor: null, afterKey: null },
          pageSize,
          "Hedera Subgraph query unavailable.",
        );
      } catch {
        throw hederaError;
      }
    }
  }

  return readZeroGPhase(input, filters, fingerprint, state, pageSize);
}

async function readHederaPhase(
  input: Parameters<typeof listCrossChainAgents>[0],
  filters: NormalizedCrossChainAgentFilters,
  fingerprint: string,
  state: CursorState,
  pageSize: number,
): Promise<CrossChainAgentPage> {
  const canonical = await listHederaAgentSummaries({
    client: input.hederaClient,
    indexingStatusClient: input.indexingStatusClient,
    limit: SOURCE_WINDOW_SIZE,
    cursor: state.sourceCursor,
    blockNumber: state.hederaBlock ?? undefined,
    agentIdHash: filters.agentIdHash,
    safe: filters.safe,
    agenticIdTokenId: filters.tokenId,
    nowSeconds: input.nowSeconds,
  });
  const hederaBlock = resolveSnapshotBlock(state.hederaBlock, canonical.freshness, "Hedera");
  const tokenIds = uniqueTokenIds(canonical.items.map(item => item.agenticIdTokenId));
  const [hederaCandidates, zeroGCandidates] = await Promise.all([
    settleCandidates(
      queryHederaCandidates({
        client: input.hederaClient,
        tokenIds,
        blockNumber: hederaBlock,
        nowSeconds: input.nowSeconds,
        indexingStatusClient: input.indexingStatusClient,
      }),
      "hedera-testnet",
      input.nowSeconds,
      "Hedera candidate lookup unavailable.",
    ),
    settleCandidates(
      queryZeroGCandidates({
        client: input.zeroGClient,
        tokenIds,
        blockNumber: state.zeroGBlock ?? undefined,
        nowSeconds: input.nowSeconds,
        indexingStatusClient: input.indexingStatusClient,
      }),
      "0g-galileo",
      input.nowSeconds,
      "0G candidate lookup unavailable.",
    ),
  ]);
  const zeroGBlock = resolveOptionalSnapshotBlock(state.zeroGBlock, zeroGCandidates.page.freshness);
  const hederaEvidence = mergeById(hederaCandidates.page.items, canonical.items);
  const zeroGEvidence = zeroGCandidates.page.items;
  const canonicalIds = new Set(canonical.items.map(item => item.id.toLowerCase()));
  const views = buildCrossChainAgentViews({
    hedera: hederaEvidence,
    zeroG: zeroGEvidence,
    sourceComplete: {
      hedera: hederaCandidates.ok && !hederaCandidates.page.truncated,
      zeroG: zeroGCandidates.ok && !zeroGCandidates.page.truncated,
    },
  })
    .filter(view => view.hedera !== null && canonicalIds.has(view.hedera.id.toLowerCase()))
    .filter(view => matchesCrossChainAgentFilters(view, hederaEvidence, zeroGEvidence, filters))
    .sort(compareByOwnership);

  return pageWindow({
    phase: "hedera",
    views,
    pageSize,
    state,
    fingerprint,
    hederaBlock,
    zeroGBlock,
    nextSourceCursor: canonical.nextCursor,
    nextPhase: "zeroG",
    freshness: { hedera: canonical.freshness, zeroG: zeroGCandidates.page.freshness },
    sourceErrors: {
      hedera: hederaCandidates.ok ? null : hederaCandidates.error,
      zeroG: zeroGCandidates.ok ? null : zeroGCandidates.error,
    },
    candidateTruncated: {
      hedera: hederaCandidates.page.truncated,
      zeroG: zeroGCandidates.page.truncated,
    },
  });
}

async function readZeroGPhase(
  input: Parameters<typeof listCrossChainAgents>[0],
  filters: NormalizedCrossChainAgentFilters,
  fingerprint: string,
  state: CursorState,
  pageSize: number,
  inheritedHederaError: string | null = null,
): Promise<CrossChainAgentPage> {
  const canonical = await listAgenticIdentities({
    client: input.zeroGClient,
    indexingStatusClient: input.indexingStatusClient,
    limit: SOURCE_WINDOW_SIZE,
    cursor: state.sourceCursor,
    blockNumber: state.zeroGBlock ?? undefined,
    owner: filters.owner,
    status: filters.status,
    contract: filters.contract,
    tokenId: filters.tokenId,
    nowSeconds: input.nowSeconds,
  });
  const zeroGBlock = resolveSnapshotBlock(state.zeroGBlock, canonical.freshness, "0G");
  const tokenIds = uniqueTokenIds(canonical.items.map(item => item.tokenId));
  const [hederaCandidates, zeroGCandidates] = await Promise.all([
    settleCandidates(
      queryHederaCandidates({
        client: input.hederaClient,
        tokenIds,
        blockNumber: state.hederaBlock ?? undefined,
        nowSeconds: input.nowSeconds,
        indexingStatusClient: input.indexingStatusClient,
      }),
      "hedera-testnet",
      input.nowSeconds,
      "Hedera candidate lookup unavailable.",
    ),
    settleCandidates(
      queryZeroGCandidates({
        client: input.zeroGClient,
        tokenIds,
        blockNumber: zeroGBlock,
        nowSeconds: input.nowSeconds,
        indexingStatusClient: input.indexingStatusClient,
      }),
      "0g-galileo",
      input.nowSeconds,
      "0G candidate lookup unavailable.",
    ),
  ]);
  const hederaBlock = resolveOptionalSnapshotBlock(state.hederaBlock, hederaCandidates.page.freshness);
  const hederaEvidence = hederaCandidates.page.items;
  const zeroGEvidence = mergeById(zeroGCandidates.page.items, canonical.items);
  const canonicalIds = new Set(canonical.items.map(item => item.id.toLowerCase()));
  const hederaTokens = new Set(hederaEvidence.map(item => normalizeTokenId(item.agenticIdTokenId)));
  const views = buildCrossChainAgentViews({
    hedera: hederaEvidence,
    zeroG: zeroGEvidence,
    sourceComplete: {
      hedera: inheritedHederaError === null && hederaCandidates.ok && !hederaCandidates.page.truncated,
      zeroG: zeroGCandidates.ok && !zeroGCandidates.page.truncated,
    },
  })
    .filter(
      view =>
        view.zeroG !== null &&
        canonicalIds.has(view.zeroG.id.toLowerCase()) &&
        (inheritedHederaError !== null || !hederaTokens.has(normalizeTokenId(view.zeroG.tokenId))),
    )
    .filter(view => matchesCrossChainAgentFilters(view, hederaEvidence, zeroGEvidence, filters))
    .sort(compareByOwnership);

  return pageWindow({
    phase: "zeroG",
    views,
    pageSize,
    state,
    fingerprint,
    hederaBlock,
    zeroGBlock,
    nextSourceCursor: canonical.nextCursor,
    nextPhase: null,
    freshness: { hedera: hederaCandidates.page.freshness, zeroG: canonical.freshness },
    sourceErrors: {
      hedera: inheritedHederaError ?? (hederaCandidates.ok ? null : hederaCandidates.error),
      zeroG: zeroGCandidates.ok ? null : zeroGCandidates.error,
    },
    candidateTruncated: {
      hedera: hederaCandidates.page.truncated,
      zeroG: zeroGCandidates.page.truncated,
    },
  });
}

function pageWindow(input: {
  phase: Phase;
  views: CrossChainAgentView[];
  pageSize: number;
  state: CursorState;
  fingerprint: string;
  hederaBlock: number | null;
  zeroGBlock: number | null;
  nextSourceCursor: string | null;
  nextPhase: Phase | null;
  freshness: CrossChainAgentPage["freshness"];
  sourceErrors: CrossChainAgentPage["sourceErrors"];
  candidateTruncated: { hedera: boolean; zeroG: boolean };
}): CrossChainAgentPage {
  const remaining = input.state.afterKey
    ? input.views.filter(view => ownershipKey(view).localeCompare(input.state.afterKey!) > 0)
    : input.views;
  const items = remaining.slice(0, input.pageSize);
  const hasMoreInWindow = remaining.length > input.pageSize;
  let nextState: CursorState | null = null;

  if (hasMoreInWindow && items.length > 0) {
    nextState = {
      phase: input.phase,
      sourceCursor: input.state.sourceCursor,
      afterKey: ownershipKey(items[items.length - 1]!),
      hederaBlock: input.hederaBlock,
      zeroGBlock: input.zeroGBlock,
    };
  } else if (input.nextSourceCursor) {
    nextState = {
      phase: input.phase,
      sourceCursor: input.nextSourceCursor,
      afterKey: null,
      hederaBlock: input.hederaBlock,
      zeroGBlock: input.zeroGBlock,
    };
  } else if (input.nextPhase) {
    nextState = {
      phase: input.nextPhase,
      sourceCursor: null,
      afterKey: null,
      hederaBlock: input.hederaBlock,
      zeroGBlock: input.zeroGBlock,
    };
  }

  return {
    items,
    nextCursor: nextState ? encodeCursor(nextState, input.fingerprint) : null,
    freshness: input.freshness,
    sourceErrors: input.sourceErrors,
    collection: {
      phase: input.phase,
      sourceWindowSize: SOURCE_WINDOW_SIZE,
      candidateCap: CANDIDATE_CAP,
      candidateLookupTruncated: input.candidateTruncated,
      snapshotBlocks: { hedera: input.hederaBlock, zeroG: input.zeroGBlock },
    },
  };
}

async function queryHederaCandidates(input: {
  client: GraphClient;
  tokenIds: string[];
  blockNumber?: number;
  nowSeconds?: number;
  indexingStatusClient?: IndexingStatusClient | null;
}): Promise<CandidatePage<AgentOnchainSummary>> {
  const variables = candidateVariables("agenticIdTokenId_in", input.tokenIds, input.blockNumber);
  const [data, chainHead] = await Promise.all([
    input.client.query<{ agentOnchainSummaries: RawAgentSummary[]; _meta?: RawMeta | null }>(
      HEDERA_AGENT_CANDIDATES_QUERY,
      variables,
    ),
    readChainHead(input.indexingStatusClient, "hedera-testnet"),
  ]);
  const raw = data.agentOnchainSummaries ?? [];
  return {
    items: raw.slice(0, CANDIDATE_CAP).map(item => ({ ...item, sourceChain: "hedera-testnet" })),
    truncated: raw.length > CANDIDATE_CAP,
    freshness: buildIndexerFreshness({
      source: "hedera-testnet",
      meta: normalizeMeta(data._meta),
      chainHeadBlock: chainHead.block,
      chainHeadStatus: chainHead.status,
      nowSeconds: input.nowSeconds,
    }),
  };
}

async function queryZeroGCandidates(input: {
  client: GraphClient;
  tokenIds: string[];
  blockNumber?: number;
  nowSeconds?: number;
  indexingStatusClient?: IndexingStatusClient | null;
}): Promise<CandidatePage<AgenticIdentity>> {
  const variables = candidateVariables("tokenId_in", input.tokenIds, input.blockNumber);
  const [data, chainHead] = await Promise.all([
    input.client.query<{ agenticIdentities: RawAgenticIdentity[]; _meta?: RawMeta | null }>(
      ZERO_G_IDENTITY_CANDIDATES_QUERY,
      variables,
    ),
    readChainHead(input.indexingStatusClient, "0g-galileo"),
  ]);
  const raw = data.agenticIdentities ?? [];
  return {
    items: raw.slice(0, CANDIDATE_CAP).map(item => ({ ...item, sourceChain: "0g-galileo" })),
    truncated: raw.length > CANDIDATE_CAP,
    freshness: buildIndexerFreshness({
      source: "0g-galileo",
      meta: normalizeMeta(data._meta),
      chainHeadBlock: chainHead.block,
      chainHeadStatus: chainHead.status,
      nowSeconds: input.nowSeconds,
    }),
  };
}

function candidateVariables(filterName: string, tokenIds: string[], blockNumber?: number) {
  return {
    first: CANDIDATE_CAP + 1,
    where: { [filterName]: tokenIds },
    ...(blockNumber === undefined ? {} : { block: { number: blockNumber } }),
  };
}

async function settleCandidates<T>(
  promise: Promise<CandidatePage<T>>,
  source: SourceChain,
  nowSeconds: number | undefined,
  error: string,
): Promise<SettledCandidatePage<T>> {
  try {
    return { ok: true, page: await promise };
  } catch {
    return {
      ok: false,
      error,
      page: { items: [], truncated: false, freshness: unavailableFreshness(source, nowSeconds) },
    };
  }
}

function uniqueTokenIds(values: string[]): string[] {
  return [...new Set(values.map(normalizeTokenId))];
}

function mergeById<T extends { id: string }>(primary: T[], required: T[]): T[] {
  return [...new Map([...primary, ...required].map(item => [item.id.toLowerCase(), item])).values()];
}

function normalizeTokenId(value: string): string {
  if (!/^\d+$/.test(value.trim())) throw new Error("Expected an unsigned decimal Agentic ID token.");
  return BigInt(value.trim()).toString();
}

function compareByOwnership(left: CrossChainAgentView, right: CrossChainAgentView): number {
  return ownershipKey(left).localeCompare(ownershipKey(right));
}

function ownershipKey(view: CrossChainAgentView): string {
  if (view.hedera) return `h:${view.hedera.id.toLowerCase()}`;
  if (view.zeroG) return `z:${view.zeroG.id.toLowerCase()}`;
  throw new Error("A cross-chain agent view requires at least one indexed source entity.");
}

function normalizePageSize(value: number | undefined): number {
  if (!Number.isInteger(value) || Number(value) <= 0) return DEFAULT_AGGREGATE_PAGE_SIZE;
  return Math.min(Number(value), MAX_AGGREGATE_PAGE_SIZE);
}

function fingerprintFilters(filters: NormalizedCrossChainAgentFilters): string {
  return keccak256(stringToHex(JSON.stringify(filters)));
}

function encodeCursor(state: CursorState, filterFingerprint: string): string {
  return Buffer.from(JSON.stringify({ version: 2, ...state, filterFingerprint })).toString("base64url");
}

function decodeCursor(cursor: string, expectedFingerprint: string): CursorState {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as Record<string, unknown>;
    if (
      parsed.version !== 2 ||
      (parsed.phase !== "hedera" && parsed.phase !== "zeroG") ||
      !nullableString(parsed.sourceCursor, 4_096) ||
      !nullableOwnershipKey(parsed.afterKey) ||
      !nullableBlock(parsed.hederaBlock) ||
      !nullableBlock(parsed.zeroGBlock) ||
      parsed.filterFingerprint !== expectedFingerprint
    ) {
      throw new Error("invalid cursor payload");
    }
    return {
      phase: parsed.phase,
      sourceCursor: parsed.sourceCursor,
      afterKey: parsed.afterKey,
      hederaBlock: parsed.hederaBlock,
      zeroGBlock: parsed.zeroGBlock,
    } as CursorState;
  } catch {
    throw new Error("Invalid cross-chain agent pagination cursor or filter scope.");
  }
}

function nullableString(value: unknown, maxLength: number): value is string | null {
  return value === null || (typeof value === "string" && value.length > 0 && value.length <= maxLength);
}

function nullableOwnershipKey(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && /^[hz]:0x[0-9a-f]{2,256}$/.test(value));
}

function nullableBlock(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isSafeInteger(value) && value >= 0);
}

function resolveSnapshotBlock(current: number | null, freshness: IndexerFreshness, label: string): number {
  if (current !== null) return current;
  if (freshness.indexedBlock === null) throw new Error(`${label} Subgraph did not return an indexed snapshot block.`);
  return freshness.indexedBlock;
}

function resolveOptionalSnapshotBlock(current: number | null, freshness: IndexerFreshness): number | null {
  return current ?? freshness.indexedBlock;
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
  status: "reported" | "not-configured" | "unavailable";
};

async function readChainHead(
  client: IndexingStatusClient | null | undefined,
  source: SourceChain,
): Promise<ChainHeadObservation> {
  if (!client) return { block: null, status: "not-configured" };
  try {
    const block = await client.getChainHead(source);
    return block === null ? { block: null, status: "unavailable" } : { block, status: "reported" };
  } catch {
    return { block: null, status: "unavailable" };
  }
}

function unavailableFreshness(source: SourceChain, nowSeconds?: number): IndexerFreshness {
  return buildIndexerFreshness({ source, meta: null, nowSeconds, chainHeadStatus: "unavailable" });
}
