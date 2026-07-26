import type { SourceChain } from "./types.ts";

export type IndexNodeStatusData = {
  indexingStatusForCurrentVersion?: {
    chains?: Array<{
      network?: string | null;
      chainHeadBlock?: { number?: number | string | null } | null;
    }> | null;
  } | null;
};

export function extractChainHead(data: IndexNodeStatusData, expectedNetwork: SourceChain): number | null {
  const chain = data.indexingStatusForCurrentVersion?.chains?.find(item => item.network === expectedNetwork);
  const value = chain?.chainHeadBlock?.number;
  if (value === null || value === undefined) return null;
  const numeric = Number(value);
  return Number.isSafeInteger(numeric) && numeric >= 0 ? numeric : null;
}
