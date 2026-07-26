import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Wallet } from "ethers";
import {
  createPinnedProviderLookup,
  isBodylessHttpResponseStatus,
  selectPinnedPublicProviderAddress,
  ZeroGSignedResponseVerificationError,
  ZeroGSignedResponseVerifier,
  type ZeroGOnChainProvider,
  type ZeroGReadOnlyBroker,
  type ZeroGSignedResponseVerifierDependencies,
} from "./zero-g-signed-response-verifier.js";
import {
  OFFICIAL_ZERO_G_MAINNET_RPC_URL,
  OFFICIAL_ZERO_G_TESTNET_RPC_URL,
} from "./zero-g-network.js";
import type { ZeroGClock, ZeroGFetch } from "./zero-g-router-types.js";
import {
  HACKATHON_TESTNET_TEETLS_PROFILE,
  PRODUCTION_PRIVATE_TEEML_PROFILE,
  type ZeroGSecurityProfile,
} from "../../teeml/security-profile.js";

const PROVIDER_ADDRESS = "0x4870CbC4D07d6Ac2EE5aA865588e5985FE77a4E9";
const OTHER_PROVIDER_ADDRESS = "0xd9966e13a6026Fcca4b13E7ff95c94DE268C471C";
const MODEL_ID = "0gm-1.0-35b-a3b";
const PROVIDER_MODEL_ID = "0GM-1.0-35B-A3B";
const CHAT_ID = "signed-chat-id";
const PRIVATE_CONTENT = '{"verdict":"ALLOW","secret":"must-not-leak"}';
const PRIVATE_SIGNATURE_MARKER = "private-signature-must-not-leak";
const BROKER_SIGNER = new Wallet(
  "0x59c6995e998f97a5a0044976f0945389dc9e86dae88c7a8412f4603b6b78690d",
);
const TARGET_SIGNER = new Wallet(
  "0x8b3a350cf5c34c9194ca3a545d3b2a9f6fcb473f20f2b5ea4fc6f91e20f77aa9",
);

describe("ZeroGSignedResponseVerifier", () => {
  it("resolves the exact provider through the official mainnet RPC and verifies its signed content", async () => {
    let rpcUrl = "";
    let chainId = 0;
    const broker: ZeroGReadOnlyBroker = {
      inference: {
        listService: async () => [sdkService()],
        getProviderModels: async () => {
          throw new Error("single-model provider must not query its public model catalog");
        },
      },
    };
    const signature = await BROKER_SIGNER.signMessage(PRIVATE_CONTENT);
    const calls: Array<{ input: string | URL | Request; init?: RequestInit }> = [];
    const verifier = new ZeroGSignedResponseVerifier(
      { timeoutMs: 30_000 },
      {
        createReadOnlyBroker: async (value, valueChainId) => {
          rpcUrl = value;
          chainId = valueChainId;
          return broker;
        },
        fetch: signatureFetch({ text: PRIVATE_CONTENT, signature }, calls),
      },
    );

    const result = await verifier.verify(input());

    assert.equal(rpcUrl, OFFICIAL_ZERO_G_MAINNET_RPC_URL);
    assert.equal(chainId, 16_661);
    assert.equal(calls.length, 1);
    assert.equal(
      String(calls[0].input),
      `https://provider.example/v1/proxy/signature/${CHAT_ID}?model=${PROVIDER_MODEL_ID}`,
    );
    assert.equal(calls[0].init?.method, "GET");
    assert.deepEqual(result, {
      signatureVerified: true,
      providerAddress: PROVIDER_ADDRESS,
      modelId: MODEL_ID,
      signingAddress: BROKER_SIGNER.address,
    });
    assert.equal(JSON.stringify(result).includes(PRIVATE_CONTENT), false);
    assert.equal(JSON.stringify(result).includes(signature), false);
  });

  it("resolves hackathon TeeTLS providers through the paired official testnet RPC", async () => {
    let rpcUrl = "";
    let chainId = 0;
    const signature = await BROKER_SIGNER.signMessage(PRIVATE_CONTENT);
    const verifier = new ZeroGSignedResponseVerifier(
      {
        timeoutMs: 30_000,
        network: "testnet",
        securityProfile: HACKATHON_TESTNET_TEETLS_PROFILE,
      },
      {
        createReadOnlyBroker: async (value, valueChainId) => {
          rpcUrl = value;
          chainId = valueChainId;
          return {
            inference: {
              listService: async () => [sdkService()],
              getProviderModels: async () => {
                throw new Error("single-model provider must not query its public model catalog");
              },
            },
          };
        },
        fetch: signatureFetch({ text: PRIVATE_CONTENT, signature }),
      },
    );

    await verifier.verify(input());

    assert.equal(rpcUrl, OFFICIAL_ZERO_G_TESTNET_RPC_URL);
    assert.equal(chainId, 16_602);
  });

  it("rejects the production profile on testnet before provider resolution", () => {
    assert.throws(
      () =>
        new ZeroGSignedResponseVerifier({
          timeoutMs: 30_000,
          network: "testnet",
          securityProfile: PRODUCTION_PRIVATE_TEEML_PROFILE,
        }),
      (error: unknown) =>
        error instanceof ZeroGSignedResponseVerificationError &&
        error.code === "TEEML_CONFIG_ERROR" &&
        error.stage === "BEFORE_VERIFICATION",
    );
  });

  it("uses TargetTeeAddress for a separated decentralized TeeML provider", async () => {
    const signature = await TARGET_SIGNER.signMessage(PRIVATE_CONTENT);
    const verifier = createVerifier({
      provider: provider({
        additionalInfo: JSON.stringify({
          TargetSeparated: true,
          TargetTeeAddress: TARGET_SIGNER.address,
          ProviderType: "decentralized",
        }),
      }),
      fetch: signatureFetch({ text: PRIVATE_CONTENT, signature }),
    });

    const result = await verifier.verify(input());

    assert.equal(result.signingAddress, TARGET_SIGNER.address);
  });

  it("uses the acknowledged broker signer for the explicit centralized TeeTLS hackathon profile", async () => {
    const signature = await BROKER_SIGNER.signMessage(PRIVATE_CONTENT);
    const verifier = createVerifier({
      securityProfile: HACKATHON_TESTNET_TEETLS_PROFILE,
      provider: provider({
        additionalInfo: JSON.stringify({
          TargetSeparated: true,
          TargetTeeAddress: "",
          ProviderType: "centralized",
        }),
      }),
      fetch: signatureFetch({ text: PRIVATE_CONTENT, signature }),
    });

    const result = await verifier.verify(input());

    assert.equal(result.signingAddress, BROKER_SIGNER.address);
  });

  it("never applies the centralized TeeTLS signer exception to the production profile", async () => {
    let fetchCalls = 0;
    const verifier = createVerifier({
      provider: provider({
        additionalInfo: JSON.stringify({
          TargetSeparated: true,
          TargetTeeAddress: "",
          ProviderType: "centralized",
        }),
      }),
      fetch: async () => {
        fetchCalls += 1;
        return jsonResponse({});
      },
    });

    await expectVerificationError(verifier.verify(input()), {
      code: "TEEML_NOT_VERIFIED",
      reason: "ONCHAIN_PROVIDER_INELIGIBLE",
    });
    assert.equal(fetchCalls, 0);
  });

  it("rejects malformed or unsafe separated-target metadata", async () => {
    for (const additionalInfo of [
      {
        TargetSeparated: true,
        TargetTeeAddress: TARGET_SIGNER.address,
        ProviderType: "centralized",
      },
      {
        TargetSeparated: true,
        ProviderType: "decentralized",
      },
      {
        TargetSeparated: "true",
        TargetTeeAddress: TARGET_SIGNER.address,
        ProviderType: "decentralized",
      },
      {
        TargetSeparated: true,
        TargetTeeAddress: TARGET_SIGNER.address,
        ProviderType: "unknown",
      },
      {
        TargetSeparated: false,
        TargetTeeAddress: "not-an-address",
        ProviderType: "decentralized",
      },
    ]) {
      let fetchCalls = 0;
      const verifier = createVerifier({
        provider: provider({
          additionalInfo: JSON.stringify(additionalInfo),
        }),
        fetch: async () => {
          fetchCalls += 1;
          return jsonResponse({});
        },
      });

      await expectVerificationError(verifier.verify(input()), {
        code: "TEEML_NOT_VERIFIED",
        reason: "ONCHAIN_PROVIDER_INELIGIBLE",
      });
      assert.equal(fetchCalls, 0);
    }
  });

  it("fails closed instead of using the SDK multi-model outbound discovery path", async () => {
    let modelQueries = 0;
    const broker: ZeroGReadOnlyBroker = {
      inference: {
        listService: async () => [
          sdkService({
            model: "default-model",
            additionalInfo: JSON.stringify({ MultiModel: true }),
          }),
        ],
        getProviderModels: async address => {
          modelQueries += 1;
          return {
            provider: address,
            models: [{ id: PROVIDER_MODEL_ID }],
          };
        },
      },
    };
    const verifier = new ZeroGSignedResponseVerifier(
      { timeoutMs: 30_000 },
      {
        createReadOnlyBroker: async () => broker,
      },
    );

    await expectVerificationError(verifier.verify(input()), {
      code: "TEEML_NOT_VERIFIED",
      reason: "ONCHAIN_PROVIDER_INELIGIBLE",
    });

    assert.equal(modelQueries, 0);
  });

  it("fails closed before signature download for ineligible or mismatched on-chain providers", async () => {
    const providers = [
      provider({ verifiability: "TeeTLS" }),
      provider({ teeSignerAcknowledged: false }),
      provider({ model: "other-model" }),
      provider({ providerAddress: OTHER_PROVIDER_ADDRESS }),
    ];

    for (const onChainProvider of providers) {
      let fetchCalls = 0;
      const verifier = createVerifier({
        provider: onChainProvider,
        fetch: async () => {
          fetchCalls += 1;
          return jsonResponse({});
        },
      });

      await expectVerificationError(verifier.verify(input()), {
        code: "TEEML_NOT_VERIFIED",
        reason: "ONCHAIN_PROVIDER_INELIGIBLE",
      });
      assert.equal(fetchCalls, 0);
    }
  });

  it("rejects a byte-different signed text even when its signature is valid", async () => {
    const differentText = `${PRIVATE_CONTENT} `;
    const signature = await BROKER_SIGNER.signMessage(differentText);
    const verifier = createVerifier({
      fetch: signatureFetch({ text: differentText, signature }),
    });

    await expectVerificationError(verifier.verify(input()), {
      code: "TEEML_NOT_VERIFIED",
      reason: "SIGNED_CONTENT_MISMATCH",
    });
  });

  it("rejects an invalid signature without exposing content or signature details", async () => {
    const verifier = createVerifier({
      fetch: signatureFetch({
        text: PRIVATE_CONTENT,
        signature: `0x${"00".repeat(65)}`,
      }),
    });

    const error = await captureVerificationError(verifier.verify(input()));

    assert.equal(error.code, "TEEML_NOT_VERIFIED");
    assert.equal(error.reason, "SIGNATURE_INVALID");
    assertSanitized(error);
  });

  it("rejects malformed or extra signature response properties", async () => {
    const malformedResponses = [
      { text: PRIVATE_CONTENT },
      { text: PRIVATE_CONTENT, signature: PRIVATE_SIGNATURE_MARKER },
      {
        text: PRIVATE_CONTENT,
        signature: `0x${"11".repeat(65)}`,
        rawProof: PRIVATE_CONTENT,
      },
    ];

    for (const response of malformedResponses) {
      const verifier = createVerifier({ fetch: signatureFetch(response) });
      const error = await captureVerificationError(verifier.verify(input()));

      assert.equal(error.code, "TEEML_NOT_VERIFIED");
      assert.equal(error.reason, "SIGNATURE_RESPONSE_INVALID");
      assertSanitized(error);
    }
  });

  it("aborts a timed-out signature download once and never retries", async () => {
    let fetchCalls = 0;
    const fetch: ZeroGFetch = async (_input, init) => {
      fetchCalls += 1;
      return await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(new DOMException(PRIVATE_CONTENT, "AbortError")),
          { once: true },
        );
      });
    };
    const clock: ZeroGClock = {
      now: () => 0,
      setTimeout: callback => {
        queueMicrotask(callback);
        return "timer";
      },
      clearTimeout: () => undefined,
    };
    const verifier = createVerifier({ fetch, clock });

    const error = await captureVerificationError(verifier.verify(input()));

    assert.equal(fetchCalls, 1);
    assert.equal(error.code, "TEEML_TIMEOUT");
    assert.equal(error.reason, "SIGNATURE_FETCH_TIMEOUT");
    assertSanitized(error);
  });

  it("bounds on-chain provider resolution with the same end-to-end deadline", async () => {
    let resolverCalls = 0;
    let fetchCalls = 0;
    const clock: ZeroGClock = {
      now: () => 0,
      setTimeout: callback => {
        queueMicrotask(callback);
        return "timer";
      },
      clearTimeout: () => undefined,
    };
    const verifier = new ZeroGSignedResponseVerifier(
      { timeoutMs: 30_000 },
      {
        clock,
        resolveProvider: async () => {
          resolverCalls += 1;
          return await new Promise<ZeroGOnChainProvider>(() => undefined);
        },
        fetch: async () => {
          fetchCalls += 1;
          return jsonResponse({});
        },
      },
    );

    const error = await captureVerificationError(verifier.verify(input()));

    assert.equal(resolverCalls, 1);
    assert.equal(fetchCalls, 0);
    assert.equal(error.code, "TEEML_TIMEOUT");
    assert.equal(error.reason, "ONCHAIN_PROVIDER_TIMEOUT");
    assertSanitized(error);
  });

  it("rejects private provider URL literals and disables redirects", async () => {
    for (const providerUrl of [
      "https://127.0.0.1",
      "https://localhost.",
      "https://[::1]",
    ]) {
      const privateUrlVerifier = createVerifier({
        provider: provider({ providerUrl }),
      });
      await expectVerificationError(privateUrlVerifier.verify(input()), {
        code: "TEEML_NOT_VERIFIED",
        reason: "ONCHAIN_PROVIDER_INELIGIBLE",
      });
    }

    const signature = await BROKER_SIGNER.signMessage(PRIVATE_CONTENT);
    const calls: Array<{ input: string | URL | Request; init?: RequestInit }> = [];
    const verifier = createVerifier({
      fetch: signatureFetch({ text: PRIVATE_CONTENT, signature }, calls),
    });
    await verifier.verify(input());
    assert.equal(calls[0]?.init?.redirect, "error");
  });

  it("pins only public DNS answers for the provider connection", async () => {
    assert.deepEqual(
      selectPinnedPublicProviderAddress([
        { address: "93.184.216.34", family: 4 },
      ]),
      { address: "93.184.216.34", family: 4 },
    );
    for (const addresses of [
      [{ address: "127.0.0.1", family: 4 }],
      [{ address: "169.254.169.254", family: 4 }],
      [{ address: "::ffff:127.0.0.1", family: 6 }],
      [{ address: "ff02::1", family: 6 }],
      [{ address: "fec0::1", family: 6 }],
      [{ address: "2001:db8::1", family: 6 }],
      [{ address: "2001::1", family: 6 }],
      [{ address: "2002:7f00:1::", family: 6 }],
      [{ address: "3ffe::1", family: 6 }],
      [
        { address: "93.184.216.34", family: 4 },
        { address: "10.0.0.1", family: 4 },
      ],
    ]) {
      assert.throws(
        () => selectPinnedPublicProviderAddress(addresses),
        /PROVIDER_ADDRESS_FORBIDDEN/,
      );
    }

    const verifier = new ZeroGSignedResponseVerifier(
      { timeoutMs: 30_000 },
      {
        resolveProvider: async () => provider(),
        resolveProviderAddresses: async () => [
          { address: "127.0.0.1", family: 4 },
        ],
      },
    );
    await expectVerificationError(verifier.verify(input()), {
      code: "TEEML_NOT_VERIFIED",
      reason: "SIGNATURE_UNAVAILABLE",
    });
  });

  it("honors both Node lookup callback shapes for a pinned public address", async () => {
    const selected = { address: "93.184.216.34", family: 4 };
    const lookup = createPinnedProviderLookup(async () => [selected]);

    await new Promise<void>((resolve, reject) => {
      lookup("provider.example", { all: true }, (error, addresses, family) => {
        try {
          assert.ifError(error);
          assert.deepEqual(addresses, [selected]);
          assert.equal(family, undefined);
          resolve();
        } catch (assertionError) {
          reject(assertionError);
        }
      });
    });
    await new Promise<void>((resolve, reject) => {
      lookup("provider.example", {}, (error, address, family) => {
        try {
          assert.ifError(error);
          assert.equal(address, selected.address);
          assert.equal(family, selected.family);
          resolve();
        } catch (assertionError) {
          reject(assertionError);
        }
      });
    });
  });

  it("rejects bodyless upstream statuses before constructing a Fetch Response", () => {
    assert.equal(isBodylessHttpResponseStatus(204), true);
    assert.equal(isBodylessHttpResponseStatus(205), true);
    assert.equal(isBodylessHttpResponseStatus(304), true);
    assert.equal(isBodylessHttpResponseStatus(200), false);
    assert.equal(isBodylessHttpResponseStatus(500), false);
  });

  it("rejects an oversized signature body while streaming", async () => {
    const verifier = createVerifier({
      fetch: async () =>
        new Response("x".repeat(256 * 1024 + 1), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    });

    await expectVerificationError(verifier.verify(input()), {
      code: "TEEML_NOT_VERIFIED",
      reason: "SIGNATURE_RESPONSE_INVALID",
    });
  });

  it("sanitizes resolver and fetch failures without attaching an upstream cause", async () => {
    const resolverFailure = new ZeroGSignedResponseVerifier(
      { timeoutMs: 30_000 },
      {
        resolveProvider: async () => {
          throw new Error(`${PRIVATE_CONTENT} ${PRIVATE_SIGNATURE_MARKER}`);
        },
      },
    );
    const fetchFailure = createVerifier({
      fetch: async () => {
        throw new Error(`${PRIVATE_CONTENT} ${PRIVATE_SIGNATURE_MARKER}`);
      },
    });

    const resolverError = await captureVerificationError(resolverFailure.verify(input()));
    const fetchError = await captureVerificationError(fetchFailure.verify(input()));

    assert.equal(resolverError.code, "TEEML_PROVIDER_ERROR");
    assert.equal(resolverError.reason, "ONCHAIN_PROVIDER_UNAVAILABLE");
    assert.equal(fetchError.code, "TEEML_NOT_VERIFIED");
    assert.equal(fetchError.reason, "SIGNATURE_UNAVAILABLE");
    assertSanitized(resolverError);
    assertSanitized(fetchError);
  });

  it("rejects malformed references before resolving a provider", async () => {
    let resolverCalls = 0;
    const verifier = new ZeroGSignedResponseVerifier(
      { timeoutMs: 30_000 },
      {
        resolveProvider: async () => {
          resolverCalls += 1;
          return provider();
        },
      },
    );

    const error = await captureVerificationError(
      verifier.verify({
        reference: {
          ...input().reference,
          providerAddress: "not-an-address",
        },
        content: PRIVATE_CONTENT,
      }),
    );

    assert.equal(resolverCalls, 0);
    assert.equal(error.code, "TEEML_CONFIG_ERROR");
    assert.equal(error.reason, "VERIFICATION_INPUT_INVALID");
    assertSanitized(error);
  });
});

type CreateVerifierOptions = {
  provider?: ZeroGOnChainProvider;
  fetch?: ZeroGFetch;
  clock?: ZeroGClock;
  securityProfile?: ZeroGSecurityProfile;
};

function createVerifier(options: CreateVerifierOptions = {}): ZeroGSignedResponseVerifier {
  const dependencies: ZeroGSignedResponseVerifierDependencies = {
    resolveProvider: async () => options.provider ?? provider(),
    fetch: options.fetch ?? (async () => jsonResponse({})),
    ...(options.clock ? { clock: options.clock } : {}),
  };
  return new ZeroGSignedResponseVerifier(
    {
      timeoutMs: 30_000,
      ...(options.securityProfile
        ? {
            network: "testnet" as const,
            securityProfile: options.securityProfile,
          }
        : {}),
    },
    dependencies,
  );
}

function input() {
  return {
    reference: {
      chatId: CHAT_ID,
      chatIdSource: "ZG-Res-Key" as const,
      providerAddress: PROVIDER_ADDRESS,
      modelId: MODEL_ID,
      providerModelId: PROVIDER_MODEL_ID,
    },
    content: PRIVATE_CONTENT,
  };
}

function provider(overrides: Partial<ZeroGOnChainProvider> = {}): ZeroGOnChainProvider {
  return {
    providerAddress: PROVIDER_ADDRESS,
    providerUrl: "https://provider.example",
    model: PROVIDER_MODEL_ID,
    verifiability: "TeeML",
    additionalInfo: "{}",
    teeSignerAddress: BROKER_SIGNER.address,
    teeSignerAcknowledged: true,
    ...overrides,
  };
}

function sdkService(overrides: Record<string, unknown> = {}) {
  return {
    provider: PROVIDER_ADDRESS,
    serviceType: "chatbot",
    url: "https://provider.example",
    inputPrice: 1n,
    outputPrice: 1n,
    updatedAt: 1n,
    model: PROVIDER_MODEL_ID,
    verifiability: "TeeML",
    additionalInfo: "{}",
    teeSignerAddress: BROKER_SIGNER.address,
    teeSignerAcknowledged: true,
    ...overrides,
  };
}

function signatureFetch(
  payload: unknown,
  calls: Array<{ input: string | URL | Request; init?: RequestInit }> = [],
): ZeroGFetch {
  return async (inputValue, init) => {
    calls.push({ input: inputValue, init });
    return jsonResponse(payload);
  };
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function captureVerificationError(
  promise: Promise<unknown>,
): Promise<ZeroGSignedResponseVerificationError> {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof ZeroGSignedResponseVerificationError);
    return error;
  }
  assert.fail("expected ZeroGSignedResponseVerificationError");
}

async function expectVerificationError(
  promise: Promise<unknown>,
  expected: Pick<ZeroGSignedResponseVerificationError, "code" | "reason">,
): Promise<void> {
  const error = await captureVerificationError(promise);
  assert.equal(error.code, expected.code);
  assert.equal(error.reason, expected.reason);
  assertSanitized(error);
}

function assertSanitized(error: ZeroGSignedResponseVerificationError): void {
  const serialized = `${error.message}\n${error.stack ?? ""}\n${JSON.stringify(error)}`;
  assert.equal(serialized.includes(PRIVATE_CONTENT), false);
  assert.equal(serialized.includes(PRIVATE_SIGNATURE_MARKER), false);
  assert.equal(Object.hasOwn(error, "cause"), false);
}
