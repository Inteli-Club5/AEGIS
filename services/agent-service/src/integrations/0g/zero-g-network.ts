import { ZeroGRouterError } from "./zero-g-router-errors.js";

export const OFFICIAL_ZERO_G_MAINNET_ROUTER_BASE_URL =
  "https://router-api.0g.ai/v1";
export const OFFICIAL_ZERO_G_TESTNET_ROUTER_BASE_URL =
  "https://router-api-testnet.integratenetwork.work/v1";
export const OFFICIAL_ZERO_G_MAINNET_RPC_URL = "https://evmrpc.0g.ai";
export const OFFICIAL_ZERO_G_TESTNET_RPC_URL =
  "https://evmrpc-testnet.0g.ai";

export type ZeroGNetworkName = "mainnet" | "testnet";

export type ZeroGRouterNetwork = Readonly<{
  name: ZeroGNetworkName;
  routerBaseUrl: string;
  rpcUrl: string;
  chainId: number;
}>;

const NETWORKS: readonly ZeroGRouterNetwork[] = [
  {
    name: "mainnet",
    routerBaseUrl: OFFICIAL_ZERO_G_MAINNET_ROUTER_BASE_URL,
    rpcUrl: OFFICIAL_ZERO_G_MAINNET_RPC_URL,
    chainId: 16_661,
  },
  {
    name: "testnet",
    routerBaseUrl: OFFICIAL_ZERO_G_TESTNET_ROUTER_BASE_URL,
    rpcUrl: OFFICIAL_ZERO_G_TESTNET_RPC_URL,
    chainId: 16_602,
  },
];

export function resolveZeroGRouterNetwork(value: string): ZeroGRouterNetwork {
  const network = NETWORKS.find(
    candidate =>
      value === candidate.routerBaseUrl ||
      value === `${candidate.routerBaseUrl}/`,
  );
  if (!network) {
    throw invalidNetworkConfig();
  }
  return network;
}

export function getZeroGNetwork(name: ZeroGNetworkName): ZeroGRouterNetwork {
  const network = NETWORKS.find(candidate => candidate.name === name);
  if (!network) {
    throw invalidNetworkConfig();
  }
  return network;
}

function invalidNetworkConfig(): ZeroGRouterError {
  return new ZeroGRouterError({
    code: "TEEML_CONFIG_ERROR",
    stage: "BEFORE_SEND",
    reason: "CONFIG_INVALID",
  });
}
