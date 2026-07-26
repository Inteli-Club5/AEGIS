import type { GraphMeta, IndexerFreshness, SourceChain } from "./types.ts";

export function buildIndexerFreshness(input: {
  source: SourceChain;
  meta: GraphMeta | null | undefined;
  chainHeadBlock?: number | null;
  chainHeadStatus?: IndexerFreshness["chainHeadStatus"];
  nowSeconds?: number;
  staleAfterSeconds?: number;
}): IndexerFreshness {
  const nowSeconds = input.nowSeconds ?? Math.floor(Date.now() / 1_000);
  const staleAfterSeconds = input.staleAfterSeconds ?? 120;
  const indexedBlock = toFiniteNumber(input.meta?.block.number);
  const indexedBlockTimestamp = toFiniteNumber(input.meta?.block.timestamp);
  const chainHeadBlock = toFiniteNumber(input.chainHeadBlock);
  const chainHeadStatus = chainHeadBlock !== null ? "reported" : (input.chainHeadStatus ?? "not-configured");
  const ageSeconds = indexedBlockTimestamp === null ? null : Math.max(0, nowSeconds - indexedBlockTimestamp);
  const lagBlocks =
    indexedBlock === null || chainHeadBlock === null ? null : Math.max(0, chainHeadBlock - indexedBlock);
  const available = input.meta !== null && input.meta !== undefined;
  const hasIndexingErrors = available ? (input.meta?.hasIndexingErrors ?? null) : null;

  return {
    source: input.source,
    indexedBlock,
    indexedBlockTimestamp,
    chainHeadBlock,
    chainHeadStatus,
    lagBlocks,
    ageSeconds,
    available,
    hasIndexingErrors,
    stale: !available || hasIndexingErrors === true || ageSeconds === null || ageSeconds > staleAfterSeconds,
    deployment: input.meta?.deployment ?? null,
    checkedAt: new Date(nowSeconds * 1_000).toISOString(),
  };
}

function toFiniteNumber(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}
