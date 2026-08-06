import { getEnvValue, getRequiredEnvValue } from "./env";
import "server-only";

export const DEFAULT_0G_GALILEO_RPC_URL = "https://evmrpc-testnet.0g.ai";
export const DEFAULT_0G_EXPLORER_BASE_URL = "https://chainscan-galileo.0g.ai";
export const DEFAULT_0G_STORAGE_INDEXER_URL = "https://indexer-storage-testnet-turbo.0g.ai";
export const DEFAULT_0G_STORAGE_URI_PREFIX = "0g-storage://";

const parseChainId = (value: string) => {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error("ZERO_G_GALILEO_CHAIN_ID must be a positive safe integer.");
  }

  return parsed;
};

// No silent testnet default: an unset or malformed value must fail when
// actually used, not silently register a real Agentic ID against the wrong
// 0G network. Lazy (not a module-level constant) so it doesn't fail the
// whole import graph - e.g. `next build`'s page-data collection - for
// unrelated pages that merely import this module.
export const getZeroGGalileoChainId = () => parseChainId(getRequiredEnvValue(["ZERO_G_GALILEO_CHAIN_ID"]));

export const getServerZeroGGalileoRpcUrl = () => getEnvValue(["ZERO_G_GALILEO_RPC_URL"]) || DEFAULT_0G_GALILEO_RPC_URL;

export const getZeroGExplorerBaseUrl = () =>
  (getEnvValue(["ZERO_G_EXPLORER_BASE_URL"]) || DEFAULT_0G_EXPLORER_BASE_URL).replace(/\/$/, "");

export const getZeroGStorageIndexerUrl = () =>
  getEnvValue(["ZERO_G_STORAGE_INDEXER_URL"]) || DEFAULT_0G_STORAGE_INDEXER_URL;

export const getZeroGStorageUriPrefix = () =>
  getEnvValue(["ZERO_G_STORAGE_URI_PREFIX"]) || DEFAULT_0G_STORAGE_URI_PREFIX;

// No silent testnet default here either: same rationale as ZERO_G_GALILEO_CHAIN_ID above.
export const getZeroGAgenticIdContractAddress = () => getRequiredEnvValue(["ZERO_G_AGENTIC_ID_CONTRACT_ADDRESS"]);

export const getZeroGExplorerTxUrl = (txHash: string) => `${getZeroGExplorerBaseUrl()}/tx/${txHash}`;

export const getZeroGExplorerAddressUrl = (address: string) => `${getZeroGExplorerBaseUrl()}/address/${address}`;
