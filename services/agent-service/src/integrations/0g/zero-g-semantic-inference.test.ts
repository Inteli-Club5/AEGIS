import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TeeMlError } from "../../teeml/errors.js";
import { UnconfiguredTeeMlInferenceGateway } from "../../teeml/inference-gateway.js";
import {
  HACKATHON_TESTNET_TEETLS_PROFILE,
  PRODUCTION_PRIVATE_TEEML_PROFILE,
} from "../../teeml/security-profile.js";
import {
  createZeroGSemanticInferenceFromEnv,
  resolveZeroGSecurityProfileFromEnv,
  splitZeroGTimeoutBudget,
  ZeroGInferenceOperationalError,
  ZeroGSemanticInferenceGateway,
} from "./zero-g-semantic-inference.js";
import { ZeroGRouterError } from "./zero-g-router-errors.js";
import type { ZeroGVerifiedChatCompletion } from "./zero-g-router-types.js";

const PROVIDER = "0x4870CbC4D07d6Ac2EE5aA865588e5985FE77a4E9";

describe("ZeroGSemanticInferenceGateway", () => {
  it("returns only the normalized completion after signed-content verification", async () => {
    const completion = privateCompletion();
    let verifiedInput: unknown;
    const gateway = new ZeroGSemanticInferenceGateway(
      {
        createVerifiedChatCompletion: async () => completion,
      },
      {
        verify: async (input) => {
          verifiedInput = input;
          return {
            signatureVerified: true,
            providerAddress: PROVIDER,
            modelId: completion.modelId,
            signingAddress: PROVIDER,
          };
        },
      },
      sequenceNow([1_000, 1_456]),
    );

    const result = await gateway.complete([
      { role: "system", content: "system" },
      { role: "user", content: "private data" },
    ]);

    assert.deepEqual(verifiedInput, {
      reference: completion.signedContentReference,
      content: completion.content,
    });
    assert.deepEqual(result, {
      responseId: "chatcmpl-1",
      routerRequestId: "router-request-1",
      providerAddress: PROVIDER,
      modelId: "0gm-1.0-35b-a3b",
      content: '{"verdict":"ALLOW"}',
      promptTokens: 10,
      completionTokens: 4,
      latencyMs: 456,
      securityProfile: PRODUCTION_PRIVATE_TEEML_PROFILE,
      trustMode: "private",
      verificationMode: "TeeML",
      sealedInference: true,
      teeVerified: true,
    });
    assert.equal("signedContentReference" in result, false);
  });

  it("maps unknown post-request verification failures to a sanitized unknown result", async () => {
    const gateway = new ZeroGSemanticInferenceGateway(
      {
        createVerifiedChatCompletion: async () => privateCompletion(),
      },
      {
        verify: async () => {
          throw new Error("raw private response must not leak");
        },
      },
    );

    await assert.rejects(
      () => gateway.complete([{ role: "user", content: "private data" }]),
      (error: unknown) =>
        error instanceof TeeMlError &&
        error.code === "TEEML_UNKNOWN_RESULT" &&
        error.requestDispatched &&
        !error.message.includes("private"),
    );
  });

  it("persists an ambiguous Router timeout as an unknown result classification", async () => {
    const gateway = new ZeroGSemanticInferenceGateway(
      {
        createVerifiedChatCompletion: async () => {
          throw new ZeroGRouterError({
            code: "TEEML_TIMEOUT",
            stage: "UNKNOWN_RESULT",
            reason: "REQUEST_TIMEOUT",
          });
        },
      },
      {
        verify: async () => {
          throw new Error("signature verification must not run");
        },
      },
    );

    await assert.rejects(
      () => gateway.complete([{ role: "user", content: "private data" }]),
      (error: unknown) =>
        error instanceof TeeMlError &&
        error.code === "TEEML_UNKNOWN_RESULT" &&
        error.requestDispatched,
    );
  });

  it("preserves only controlled provider diagnostics for live operations", async () => {
    const gateway = new ZeroGSemanticInferenceGateway(
      {
        createVerifiedChatCompletion: async () => {
          throw new ZeroGRouterError({
            code: "TEEML_PROVIDER_ERROR",
            stage: "PROVIDER_RESPONSE",
            reason: "PROVIDER_HTTP_ERROR",
            httpStatus: 402,
          });
        },
      },
      {
        verify: async () => {
          throw new Error("signature verification must not run");
        },
      },
    );

    await assert.rejects(
      () => gateway.complete([{ role: "user", content: "private data" }]),
      (error: unknown) =>
        error instanceof ZeroGInferenceOperationalError &&
        error.code === "TEEML_PROVIDER_ERROR" &&
        error.providerStage === "PROVIDER_RESPONSE" &&
        error.providerReason === "PROVIDER_HTTP_ERROR" &&
        error.upstreamHttpStatus === 402 &&
        !error.message.includes("private"),
    );
  });

  it("returns an unconfigured fail-closed gateway when required environment is absent", async () => {
    const gateway = createZeroGSemanticInferenceFromEnv({});
    assert.ok(gateway instanceof UnconfiguredTeeMlInferenceGateway);
    await assert.rejects(
      () => gateway.complete(),
      (error: unknown) =>
        error instanceof TeeMlError &&
        error.code === "TEEML_CONFIG_ERROR" &&
        !error.requestDispatched,
    );
  });

  it("rejects a wallet private key configured as the Router API key before network use", async () => {
    const gateway = createZeroGSemanticInferenceFromEnv({
      ZG_ROUTER_API_KEY: "11".repeat(32),
      ZG_TEEML_MODEL: "0gm-1.0-35b-a3b",
    });

    assert.ok(gateway instanceof UnconfiguredTeeMlInferenceGateway);
    await assert.rejects(
      () => gateway.complete(),
      (error: unknown) =>
        error instanceof TeeMlError &&
        error.code === "TEEML_CONFIG_ERROR" &&
        !error.requestDispatched,
    );
  });

  it("defaults to production Private/TeeML and requires an explicit hackathon profile", () => {
    assert.equal(
      resolveZeroGSecurityProfileFromEnv({}),
      PRODUCTION_PRIVATE_TEEML_PROFILE,
    );
    assert.equal(
      resolveZeroGSecurityProfileFromEnv({
        ZG_TEEML_SECURITY_PROFILE: HACKATHON_TESTNET_TEETLS_PROFILE,
      }),
      HACKATHON_TESTNET_TEETLS_PROFILE,
    );
    assert.throws(() =>
      resolveZeroGSecurityProfileFromEnv({
        ZG_TEEML_SECURITY_PROFILE: "automatic-fallback",
      }),
    );
  });

  it("splits the configured end-to-end network timeout across all three phases", () => {
    assert.deepEqual(splitZeroGTimeoutBudget(30_000), {
      routerPhaseMs: 10_000,
      signedVerificationMs: 10_000,
    });
    assert.deepEqual(splitZeroGTimeoutBudget(10), {
      routerPhaseMs: 3,
      signedVerificationMs: 4,
    });
    assert.throws(() => splitZeroGTimeoutBudget(2));
    assert.throws(() => splitZeroGTimeoutBudget(300_001));
  });
});

function privateCompletion(): ZeroGVerifiedChatCompletion {
  return {
    responseId: "chatcmpl-1",
    routerRequestId: "router-request-1",
    providerAddress: PROVIDER,
    modelId: "0gm-1.0-35b-a3b",
    content: '{"verdict":"ALLOW"}',
    usage: {
      promptTokens: 10,
      completionTokens: 4,
      totalTokens: 14,
    },
    latencyMs: 123,
    securityProfile: PRODUCTION_PRIVATE_TEEML_PROFILE,
    trustMode: "private",
    verificationMode: "TeeML",
    sealedInference: true,
    teeVerified: true,
    zgResponseKey: "signed-chat-id",
    signedContentReference: {
      chatId: "signed-chat-id",
      chatIdSource: "ZG-Res-Key",
      providerAddress: PROVIDER,
      modelId: "0gm-1.0-35b-a3b",
      providerModelId: "0GM-1.0-35B-A3B",
    },
  };
}

function sequenceNow(values: number[]): () => number {
  let index = 0;
  return () => values[index++] ?? values.at(-1) ?? 0;
}
