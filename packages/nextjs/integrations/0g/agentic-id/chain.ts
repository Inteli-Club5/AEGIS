import { getEnvValue } from "./env";
import "server-only";

export const DEFAULT_0G_AGENTIC_ID_CONTRACT_ADDRESS = "0x2700F6A3e505402C9daB154C5c6ab9cAEC98EF1F";
export const DEFAULT_0G_GALILEO_RPC_URL = "https://evmrpc-testnet.0g.ai";
export const DEFAULT_0G_GALILEO_CHAIN_ID = 16602;
export const DEFAULT_0G_EXPLORER_BASE_URL = "https://chainscan-galileo.0g.ai";
export const DEFAULT_0G_STORAGE_INDEXER_URL = "https://indexer-storage-testnet-turbo.0g.ai";
export const DEFAULT_0G_STORAGE_URI_PREFIX = "0g-storage://";

const parseChainId = (value: string | undefined) => {
  if (!value) {
    return DEFAULT_0G_GALILEO_CHAIN_ID;
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error("ZERO_G_GALILEO_CHAIN_ID must be a positive safe integer.");
  }

  return parsed;
};

export const ZERO_G_GALILEO_CHAIN_ID = parseChainId(getEnvValue(["ZERO_G_GALILEO_CHAIN_ID"]));

export const getServerZeroGGalileoRpcUrl = () => getEnvValue(["ZERO_G_GALILEO_RPC_URL"]) || DEFAULT_0G_GALILEO_RPC_URL;

export const getZeroGExplorerBaseUrl = () =>
  (getEnvValue(["ZERO_G_EXPLORER_BASE_URL"]) || DEFAULT_0G_EXPLORER_BASE_URL).replace(/\/$/, "");

export const getZeroGStorageIndexerUrl = () =>
  getEnvValue(["ZERO_G_STORAGE_INDEXER_URL"]) || DEFAULT_0G_STORAGE_INDEXER_URL;

export const getZeroGStorageUriPrefix = () =>
  getEnvValue(["ZERO_G_STORAGE_URI_PREFIX"]) || DEFAULT_0G_STORAGE_URI_PREFIX;

export const getZeroGAgenticIdContractAddress = () =>
  getEnvValue(["ZERO_G_AGENTIC_ID_CONTRACT_ADDRESS"]) || DEFAULT_0G_AGENTIC_ID_CONTRACT_ADDRESS;

export const getZeroGExplorerTxUrl = (txHash: string) => `${getZeroGExplorerBaseUrl()}/tx/${txHash}`;

export const getZeroGExplorerAddressUrl = (address: string) => `${getZeroGExplorerBaseUrl()}/address/${address}`;
