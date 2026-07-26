import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ZeroGRouterError } from "./zero-g-router-errors.js";
import {
  OFFICIAL_ZERO_G_MAINNET_ROUTER_BASE_URL,
  OFFICIAL_ZERO_G_TESTNET_ROUTER_BASE_URL,
  resolveZeroGRouterNetwork,
} from "./zero-g-network.js";

describe("0G Router network profiles", () => {
  it("pairs each official Router with its fixed RPC and chain ID", () => {
    assert.deepEqual(
      resolveZeroGRouterNetwork(OFFICIAL_ZERO_G_MAINNET_ROUTER_BASE_URL),
      {
        name: "mainnet",
        routerBaseUrl: "https://router-api.0g.ai/v1",
        rpcUrl: "https://evmrpc.0g.ai",
        chainId: 16_661,
      },
    );
    assert.deepEqual(
      resolveZeroGRouterNetwork(`${OFFICIAL_ZERO_G_TESTNET_ROUTER_BASE_URL}/`),
      {
        name: "testnet",
        routerBaseUrl:
          "https://router-api-testnet.integratenetwork.work/v1",
        rpcUrl: "https://evmrpc-testnet.0g.ai",
        chainId: 16_602,
      },
    );
  });

  it("rejects unofficial or ambiguous Router URLs before network use", () => {
    for (const value of [
      "http://router-api-testnet.integratenetwork.work/v1",
      "https://router-api-testnet.integratenetwork.work:443/v1",
      "https://user@router-api-testnet.integratenetwork.work/v1",
      "https://router-api-testnet.integratenetwork.work/v1/chat/completions",
      "https://router-api-testnet.integratenetwork.work/v1?network=mainnet",
      "https://router-api-testnet.integratenetwork.work.evil.example/v1",
      "https://router-api.0g.ai.evil.example/v1",
    ]) {
      assert.throws(
        () => resolveZeroGRouterNetwork(value),
        error =>
          error instanceof ZeroGRouterError &&
          error.code === "TEEML_CONFIG_ERROR" &&
          error.stage === "BEFORE_SEND" &&
          error.reason === "CONFIG_INVALID",
      );
    }
  });
});
