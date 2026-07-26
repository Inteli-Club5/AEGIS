import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ZeroGRouterClient } from "./zero-g-router-client.js";
import { ZeroGRouterError } from "./zero-g-router-errors.js";
import {
  HACKATHON_TESTNET_TEETLS_PROFILE,
  PRODUCTION_PRIVATE_TEEML_PROFILE,
} from "../../teeml/security-profile.js";
import type {
  ZeroGClock,
  ZeroGFetch,
  ZeroGProviderCatalogEntry,
  ZeroGRouterConfig,
} from "./zero-g-router-types.js";

const MODEL_ID = "0gm-1.0-35b-a3b";
const API_KEY = "sk-test-secret-that-must-not-leak";
const PROVIDER_ADDRESS = "0x4870CbC4D07d6Ac2EE5aA865588e5985FE77a4E9";
const OTHER_PROVIDER_ADDRESS = "0xd9966e13a6026Fcca4b13E7ff95c94DE268C471C";
const PRIVATE_PROMPT = "private semantic context must never appear in an error";

const BASE_CONFIG: ZeroGRouterConfig = {
  baseUrl: "https://router-api.0g.ai/v1",
  apiKey: API_KEY,
  modelId: MODEL_ID,
  timeoutMs: 30_000,
  maxOutputTokens: 256,
  securityProfile: PRODUCTION_PRIVATE_TEEML_PROFILE,
};

describe("ZeroGRouterClient", () => {
  it("forces private routing, prevents secondary providers, requests TEE verification, and exposes the response key", async () => {
    const calls: Array<{ input: string | URL | Request; init?: RequestInit }> = [];
    const fetch: ZeroGFetch = async (input, init) => {
      calls.push({ input, init });
      return completionResponse(validEnvelope(), { "ZG-Res-Key": "signed-chat-id" });
    };
    const messages = Object.freeze([
      Object.freeze({ role: "system" as const, content: "Return JSON only." }),
      Object.freeze({ role: "user" as const, content: PRIVATE_PROMPT }),
    ]);
    const client = createClient(fetch, sequenceClock([1_000, 1_125]));

    const result = await client.createVerifiedChatCompletion({
      messages,
      responseFormat: "json_object",
    });

    assert.equal(calls.length, 1);
    assert.equal(String(calls[0].input), "https://router-api.0g.ai/v1/chat/completions");
    assert.equal(calls[0].init?.method, "POST");
    assert.equal(calls[0].init?.redirect, "error");
    const headers = new Headers(calls[0].init?.headers);
    assert.equal(headers.get("Authorization"), `Bearer ${API_KEY}`);
    assert.equal(headers.get("X-0G-Provider-Trust-Mode"), "private");
    assert.equal(headers.get("X-0G-Provider-Allow-Fallbacks"), "false");
    assert.equal(headers.get("X-0G-Provider-Address"), PROVIDER_ADDRESS);
    assert.equal(headers.get("Content-Type"), "application/json");
    assert.deepEqual(JSON.parse(String(calls[0].init?.body)), {
      model: MODEL_ID,
      messages,
      temperature: 0,
      max_tokens: 256,
      stream: false,
      verify_tee: true,
      response_format: { type: "json_object" },
    });
    assert.equal(result.trustMode, "private");
    assert.equal(result.verificationMode, "TeeML");
    assert.equal(result.sealedInference, true);
    assert.equal(result.teeVerified, true);
    assert.equal(result.zgResponseKey, "signed-chat-id");
    assert.deepEqual(result.signedContentReference, {
      chatId: "signed-chat-id",
      chatIdSource: "ZG-Res-Key",
      providerAddress: PROVIDER_ADDRESS,
      modelId: MODEL_ID,
      providerModelId: "0GM-1.0-35B-A3B",
    });
    assert.equal(result.latencyMs, 125);
  });

  it("queries the official provider catalog when no prevalidated entry is supplied", async () => {
    const calls: Array<{ input: string | URL | Request; init?: RequestInit }> = [];
    const fetch: ZeroGFetch = async (input, init) => {
      calls.push({ input, init });
      if (calls.length === 1) {
        return jsonResponse({ object: "list", data: [privateProvider()] });
      }
      return completionResponse(validEnvelope());
    };
    const client = createClient(fetch, undefined, {}, null);

    const result = await client.createVerifiedChatCompletion({
      messages: [{ role: "user", content: PRIVATE_PROMPT }],
    });

    assert.equal(calls.length, 2);
    assert.equal(String(calls[0].input), "https://router-api.0g.ai/v1/providers");
    assert.equal(calls[0].init?.method, "GET");
    assert.equal(calls[0].init?.redirect, "error");
    assert.equal(new Headers(calls[0].init?.headers).has("Authorization"), false);
    assert.equal(calls[1].init?.method, "POST");
    assert.equal(calls[1].init?.redirect, "error");
    assert.equal(result.signedContentReference.chatIdSource, "response.id");
    assert.equal(result.signedContentReference.chatId, "chatcmpl-1");
  });

  it("omits JSON object mode when the eligible provider does not advertise it", async () => {
    let requestBody: Record<string, unknown> | undefined;
    const client = createClient(
      async (_input, init) => {
        requestBody = JSON.parse(String(init?.body));
        return completionResponse(validEnvelope());
      },
      undefined,
      {},
      privateProvider({ supported_parameters: [] }),
    );

    await client.createVerifiedChatCompletion({
      messages: [{ role: "user", content: PRIVATE_PROMPT }],
      responseFormat: "json_object",
    });

    assert.equal(requestBody?.response_format, undefined);
  });

  it("uses the official testnet Router only for the explicit TeeTLS profile and ignores unrelated catalog entries", async () => {
    const calls: Array<{ input: string | URL | Request; init?: RequestInit }> = [];
    const provider = teeTlsProvider();
    const client = createClient(
      async (input, init) => {
        calls.push({ input, init });
        if (calls.length === 1) {
          return jsonResponse({
            object: "list",
            data: [
              { canonical_id: "unrelated-model" },
              provider,
            ],
          });
        }
        return completionResponse(validEnvelope({
          model: "qwen2.5-omni",
          x_0g_trace: {
            ...validTrace(),
            provider: provider.address,
          },
        }));
      },
      undefined,
      {
        baseUrl: "https://router-api-testnet.integratenetwork.work/v1",
        modelId: "qwen2.5-omni",
        securityProfile: HACKATHON_TESTNET_TEETLS_PROFILE,
      },
      null,
    );

    await client.createVerifiedChatCompletion({
      messages: [{ role: "user", content: PRIVATE_PROMPT }],
    });

    assert.equal(
      String(calls[0].input),
      "https://router-api-testnet.integratenetwork.work/v1/providers",
    );
    assert.equal(
      String(calls[1].input),
      "https://router-api-testnet.integratenetwork.work/v1/chat/completions",
    );
  });

  it("rejects a non-private provider before sending inference", async () => {
    let calls = 0;
    const client = createClient(
      async () => {
        calls += 1;
        return completionResponse(validEnvelope());
      },
      undefined,
      {},
      privateProvider({ trust_mode: "verified" }),
    );

    await expectRouterError(
      client.createVerifiedChatCompletion({
        messages: [{ role: "user", content: PRIVATE_PROMPT }],
      }),
      {
        code: "TEEML_NOT_PRIVATE",
        stage: "BEFORE_SEND",
        reason: "PROVIDER_NOT_PRIVATE",
      },
    );
    assert.equal(calls, 0);
  });

  it("requires TeeML verifiability plus attested and acknowledged TEE catalog state", async () => {
    const ineligibleEntries: ZeroGProviderCatalogEntry[] = [
      privateProvider({ verifiability: "TeeTLS" }),
      privateProvider({ is_healthy: false }),
      privateProvider({ tee_attested: false }),
      privateProvider({ tee_acknowledged: false }),
    ];

    for (const providerCatalogEntry of ineligibleEntries) {
      let calls = 0;
      const client = createClient(
        async () => {
          calls += 1;
          return completionResponse(validEnvelope());
        },
        undefined,
        {},
        providerCatalogEntry,
      );

      await expectRouterError(
        client.createVerifiedChatCompletion({
          messages: [{ role: "user", content: PRIVATE_PROMPT }],
        }),
        {
          code: "TEEML_NOT_PRIVATE",
          stage: "BEFORE_SEND",
          reason: "PROVIDER_NOT_PRIVATE",
        },
      );
      assert.equal(calls, 0);
    }
  });

  it("uses an explicitly pinned verified TeeTLS provider only in the hackathon testnet profile", async () => {
    const calls: Array<{ input: string | URL | Request; init?: RequestInit }> = [];
    const provider = teeTlsProvider();
    const client = createClient(
      async (input, init) => {
        calls.push({ input, init });
        return completionResponse(
          validEnvelope({
            model: "qwen2.5-omni",
            x_0g_trace: {
              ...validTrace(),
              provider: provider.address,
            },
          }),
        );
      },
      undefined,
      {
        baseUrl: "https://router-api-testnet.integratenetwork.work/v1",
        modelId: "qwen2.5-omni",
        securityProfile: HACKATHON_TESTNET_TEETLS_PROFILE,
      },
      provider,
    );

    const result = await client.createVerifiedChatCompletion({
      messages: [{ role: "user", content: PRIVATE_PROMPT }],
      responseFormat: "json_object",
    });

    const headers = new Headers(calls[0].init?.headers);
    assert.equal(headers.get("X-0G-Provider-Trust-Mode"), "verified");
    assert.equal(headers.get("X-0G-Provider-Allow-Fallbacks"), "false");
    assert.equal(headers.get("X-0G-Provider-Address"), provider.address);
    assert.equal(result.securityProfile, HACKATHON_TESTNET_TEETLS_PROFILE);
    assert.equal(result.trustMode, "verified");
    assert.equal(result.verificationMode, "TeeTLS");
    assert.equal(result.sealedInference, false);
    assert.equal(result.teeVerified, true);
  });

  it("accepts the current TeeTLS catalog shape without inventing a trust_mode field", async () => {
    const provider = teeTlsProvider();
    const providerWithoutTrustMode = { ...provider } as Record<string, unknown>;
    delete providerWithoutTrustMode.trust_mode;
    const client = createClient(
      async () =>
        completionResponse(
          validEnvelope({
            model: "qwen2.5-omni",
            x_0g_trace: {
              ...validTrace(),
              provider: provider.address,
            },
          }),
        ),
      undefined,
      {
        baseUrl: "https://router-api-testnet.integratenetwork.work/v1",
        modelId: "qwen2.5-omni",
        securityProfile: HACKATHON_TESTNET_TEETLS_PROFILE,
      },
      providerWithoutTrustMode,
    );

    const result = await client.createVerifiedChatCompletion({
      messages: [{ role: "user", content: PRIVATE_PROMPT }],
    });

    assert.equal(result.verificationMode, "TeeTLS");
    assert.equal(result.trustMode, "verified");
  });

  it("rejects the hackathon TeeTLS profile outside the official testnet before network use", () => {
    assert.throws(
      () =>
        createClient(
          async () => completionResponse(validEnvelope()),
          undefined,
          { securityProfile: HACKATHON_TESTNET_TEETLS_PROFILE },
          teeTlsProvider(),
        ),
      (error: unknown) =>
        error instanceof ZeroGRouterError &&
        error.code === "TEEML_CONFIG_ERROR" &&
        error.stage === "BEFORE_SEND",
    );
  });

  it("rejects the production Private/TeeML profile outside mainnet before network use", () => {
    assert.throws(
      () =>
        createClient(
          async () => completionResponse(validEnvelope()),
          undefined,
          { baseUrl: "https://router-api-testnet.integratenetwork.work/v1" },
          privateProvider(),
        ),
      (error: unknown) =>
        error instanceof ZeroGRouterError &&
        error.code === "TEEML_CONFIG_ERROR" &&
        error.stage === "BEFORE_SEND",
    );
  });

  it("never accepts TeeTLS as an implicit fallback for the production profile", async () => {
    let calls = 0;
    const client = createClient(
      async () => {
        calls += 1;
        return completionResponse(validEnvelope());
      },
      undefined,
      {},
      privateProvider({ verifiability: "TeeTLS", trust_mode: null }),
    );

    await expectRouterError(
      client.createVerifiedChatCompletion({
        messages: [{ role: "user", content: PRIVATE_PROMPT }],
      }),
      {
        code: "TEEML_NOT_PRIVATE",
        stage: "BEFORE_SEND",
        reason: "PROVIDER_NOT_PRIVATE",
      },
    );
    assert.equal(calls, 0);
  });

  it("rejects a response whose Router TEE verification flag is not true", async () => {
    const client = createClient(async () =>
      completionResponse(validEnvelope({ x_0g_trace: { ...validTrace(), tee_verified: false } })),
    );

    await expectRouterError(
      client.createVerifiedChatCompletion({
        messages: [{ role: "user", content: PRIVATE_PROMPT }],
      }),
      {
        code: "TEEML_NOT_VERIFIED",
        stage: "PROVIDER_RESPONSE",
        reason: "PROVIDER_NOT_TEE_VERIFIED",
      },
    );
  });

  it("rejects a provider identity that does not match the validated catalog entry", async () => {
    const client = createClient(async () =>
      completionResponse(validEnvelope({ x_0g_trace: { ...validTrace(), provider: OTHER_PROVIDER_ADDRESS } })),
    );

    await expectRouterError(
      client.createVerifiedChatCompletion({
        messages: [{ role: "user", content: PRIVATE_PROMPT }],
      }),
      {
        code: "TEEML_PROVIDER_ERROR",
        stage: "PROVIDER_RESPONSE",
        reason: "PROVIDER_MISMATCH",
      },
    );
  });

  it("rejects a completion model that differs from the configured private model", async () => {
    const client = createClient(async () => completionResponse(validEnvelope({ model: "other-model" })));

    await expectRouterError(
      client.createVerifiedChatCompletion({
        messages: [{ role: "user", content: PRIVATE_PROMPT }],
      }),
      {
        code: "TEEML_OUTPUT_INVALID",
        stage: "PROVIDER_RESPONSE",
        reason: "RESPONSE_MODEL_MISMATCH",
      },
    );
  });

  it("bounds response identifiers and token counters before persistence", async () => {
    const invalidEnvelopes = [
      validEnvelope({ id: "x".repeat(513) }),
      validEnvelope({
        x_0g_trace: {
          ...validTrace(),
          request_id: "x".repeat(513),
        },
      }),
      validEnvelope({
        usage: {
          prompt_tokens: 2_147_483_648,
          completion_tokens: 4,
          total_tokens: 2_147_483_652,
        },
      }),
    ];
    for (const envelope of invalidEnvelopes) {
      const client = createClient(async () => completionResponse(envelope));
      await expectRouterError(
        client.createVerifiedChatCompletion({
          messages: [{ role: "user", content: PRIVATE_PROMPT }],
        }),
        {
          code: "TEEML_OUTPUT_INVALID",
          stage: "PROVIDER_RESPONSE",
          reason: "RESPONSE_ENVELOPE_INVALID",
        },
      );
    }

    const oversizedHeaderClient = createClient(async () =>
      completionResponse(validEnvelope(), {
        "ZG-Res-Key": "x".repeat(513),
      }),
    );
    await expectRouterError(
      oversizedHeaderClient.createVerifiedChatCompletion({
        messages: [{ role: "user", content: PRIVATE_PROMPT }],
      }),
      {
        code: "TEEML_OUTPUT_INVALID",
        stage: "PROVIDER_RESPONSE",
        reason: "RESPONSE_ENVELOPE_INVALID",
      },
    );
  });

  it("rejects a malformed provider model identifier before paid inference", async () => {
    let calls = 0;
    const client = createClient(
      async () => {
        calls += 1;
        return completionResponse(validEnvelope());
      },
      undefined,
      {},
      privateProvider({ model_id: `invalid model ${"x".repeat(256)}` }),
    );

    await expectRouterError(
      client.createVerifiedChatCompletion({
        messages: [{ role: "user", content: PRIVATE_PROMPT }],
      }),
      {
        code: "TEEML_PROVIDER_ERROR",
        stage: "BEFORE_SEND",
        reason: "CATALOG_INVALID",
      },
    );
    assert.equal(calls, 0);
  });

  it("treats an inference timeout as an unknown paid-request result", async () => {
    const fetch: ZeroGFetch = async (_input, init) =>
      await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(new DOMException(`${PRIVATE_PROMPT} ${API_KEY}`, "AbortError")),
          { once: true },
        );
      });
    const clock: ZeroGClock = {
      now: () => 0,
      setTimeout: callback => {
        queueMicrotask(callback);
        return "timer";
      },
      clearTimeout: () => undefined,
    };
    const client = createClient(fetch, clock);

    const error = await captureRouterError(
      client.createVerifiedChatCompletion({
        messages: [{ role: "user", content: PRIVATE_PROMPT }],
      }),
    );

    assert.equal(error.code, "TEEML_TIMEOUT");
    assert.equal(error.stage, "UNKNOWN_RESULT");
    assert.equal(error.reason, "REQUEST_TIMEOUT");
    assertSanitized(error);
  });

  it("fails closed on an invalid OpenAI response envelope", async () => {
    const invalid = validEnvelope();
    Reflect.deleteProperty(invalid, "usage");
    const client = createClient(async () => completionResponse(invalid));

    await expectRouterError(
      client.createVerifiedChatCompletion({
        messages: [{ role: "user", content: PRIVATE_PROMPT }],
      }),
      {
        code: "TEEML_OUTPUT_INVALID",
        stage: "PROVIDER_RESPONSE",
        reason: "RESPONSE_ENVELOPE_INVALID",
      },
    );
  });

  it("rejects tool calls, function calls, refusals, and separate reasoning output", async () => {
    for (const extra of [
      { tool_calls: [{ id: "call-1" }] },
      { function_call: { name: "approve" } },
      { refusal: "I cannot evaluate this request" },
      { reasoning_content: "private hidden reasoning" },
    ]) {
      const client = createClient(async () =>
        completionResponse(
          validEnvelope({
            choices: [
              {
                index: 0,
                message: {
                  role: "assistant",
                  content: '{"verdict":"ALLOW"}',
                  ...extra,
                },
              },
            ],
          }),
        ),
      );

      await expectRouterError(
        client.createVerifiedChatCompletion({
          messages: [{ role: "user", content: PRIVATE_PROMPT }],
        }),
        {
          code: "TEEML_OUTPUT_INVALID",
          stage: "PROVIDER_RESPONSE",
          reason: "RESPONSE_ENVELOPE_INVALID",
        },
      );
    }
  });

  it("classifies malformed JSON after an HTTP response as invalid output", async () => {
    const client = createClient(async () =>
      new Response(`{"private":"${PRIVATE_PROMPT}"`, {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expectRouterError(
      client.createVerifiedChatCompletion({
        messages: [{ role: "user", content: PRIVATE_PROMPT }],
      }),
      {
        code: "TEEML_OUTPUT_INVALID",
        stage: "PROVIDER_RESPONSE",
        reason: "RESPONSE_ENVELOPE_INVALID",
      },
    );
  });

  it("rejects an oversized completion body while streaming", async () => {
    const oversized = new Uint8Array(512 * 1024 + 1);
    const client = createClient(async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(oversized);
            controller.close();
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    await expectRouterError(
      client.createVerifiedChatCompletion({
        messages: [{ role: "user", content: PRIVATE_PROMPT }],
      }),
      {
        code: "TEEML_OUTPUT_INVALID",
        stage: "PROVIDER_RESPONSE",
        reason: "RESPONSE_ENVELOPE_INVALID",
      },
    );
  });

  it("rejects an oversized provider catalog before sending inference", async () => {
    let calls = 0;
    const client = createClient(
      async () => {
        calls += 1;
        return new Response("{}", {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Content-Length": String(2 * 1024 * 1024 + 1),
          },
        });
      },
      undefined,
      {},
      null,
    );

    await expectRouterError(
      client.createVerifiedChatCompletion({
        messages: [{ role: "user", content: PRIVATE_PROMPT }],
      }),
      {
        code: "TEEML_PROVIDER_ERROR",
        stage: "BEFORE_SEND",
        reason: "CATALOG_INVALID",
      },
    );
    assert.equal(calls, 1);
  });

  it("never retries after an ambiguous network failure and keeps upstream details sanitized", async () => {
    let calls = 0;
    const client = createClient(async () => {
      calls += 1;
      throw new Error(`${PRIVATE_PROMPT}; key=${API_KEY}; raw={"choices":[]}`);
    });

    const error = await captureRouterError(
      client.createVerifiedChatCompletion({
        messages: [{ role: "user", content: PRIVATE_PROMPT }],
      }),
    );

    assert.equal(calls, 1);
    assert.equal(error.code, "TEEML_UNKNOWN_RESULT");
    assert.equal(error.stage, "UNKNOWN_RESULT");
    assert.equal(error.reason, "REQUEST_OUTCOME_UNKNOWN");
    assertSanitized(error);
  });

  it("rejects an unofficial base URL without exposing the key or invoking fetch", () => {
    let calls = 0;

    assert.throws(
      () =>
        createClient(
          async () => {
            calls += 1;
            return completionResponse(validEnvelope());
          },
          undefined,
          { baseUrl: "https://example.invalid/v1" },
        ),
      error => {
        assert.ok(error instanceof ZeroGRouterError);
        assert.equal(error.code, "TEEML_CONFIG_ERROR");
        assert.equal(error.stage, "BEFORE_SEND");
        assertSanitized(error);
        return true;
      },
    );
    assert.equal(calls, 0);
  });

  it("rejects a wallet-shaped secret before any Router request", () => {
    let calls = 0;
    const walletPrivateKey = "11".repeat(32);

    assert.throws(
      () =>
        createClient(
          async () => {
            calls += 1;
            return completionResponse(validEnvelope());
          },
          undefined,
          { apiKey: walletPrivateKey },
        ),
      error => {
        assert.ok(error instanceof ZeroGRouterError);
        assert.equal(error.code, "TEEML_CONFIG_ERROR");
        assert.equal(error.stage, "BEFORE_SEND");
        assert.equal(error.reason, "CONFIG_INVALID");
        assert.equal(JSON.stringify(error).includes(walletPrivateKey), false);
        return true;
      },
    );
    assert.equal(calls, 0);
  });

  it("rejects an output-token limit above the short verdict ceiling", () => {
    assert.throws(
      () =>
        createClient(async () => completionResponse(validEnvelope()), undefined, {
          maxOutputTokens: 769,
        }),
      error => {
        assert.ok(error instanceof ZeroGRouterError);
        assert.equal(error.code, "TEEML_CONFIG_ERROR");
        assert.equal(error.stage, "BEFORE_SEND");
        return true;
      },
    );
  });

  it("keeps provider HTTP errors free of response bodies", async () => {
    const client = createClient(async () =>
      jsonResponse(
        { error: { message: `${PRIVATE_PROMPT}; ${API_KEY}` } },
        { status: 503 },
      ),
    );

    const error = await captureRouterError(
      client.createVerifiedChatCompletion({
        messages: [{ role: "user", content: PRIVATE_PROMPT }],
      }),
    );

    assert.equal(error.code, "TEEML_PROVIDER_ERROR");
    assert.equal(error.stage, "PROVIDER_RESPONSE");
    assert.equal(error.httpStatus, 503);
    assertSanitized(error);
  });
});

function createClient(
  fetch: ZeroGFetch,
  clock?: ZeroGClock,
  config: Partial<ZeroGRouterConfig> = {},
  providerCatalogEntry: unknown | null = privateProvider(),
): ZeroGRouterClient {
  return new ZeroGRouterClient(
    { ...BASE_CONFIG, ...config },
    {
      fetch,
      ...(clock ? { clock } : {}),
      ...(providerCatalogEntry === null ? {} : { providerCatalogEntry }),
    },
  );
}

function privateProvider(
  overrides: Partial<ZeroGProviderCatalogEntry> = {},
): ZeroGProviderCatalogEntry {
  return {
    address: PROVIDER_ADDRESS,
    model_id: "0GM-1.0-35B-A3B",
    canonical_id: MODEL_ID,
    service_type: "chatbot",
    type: "chatbot",
    is_healthy: true,
    verifiability: "TeeML",
    trust_mode: "private",
    tee_attested: true,
    tee_acknowledged: true,
    supported_parameters: ["response_format"],
    ...overrides,
  };
}

function teeTlsProvider(): ZeroGProviderCatalogEntry {
  return privateProvider({
    address: "0xa48f01287233509FD694a22Bf840225062E67836",
    model_id: "qwen/qwen2.5-omni-7b",
    canonical_id: "qwen2.5-omni",
    verifiability: "TeeTLS",
    trust_mode: null,
  });
}

function validTrace(): Record<string, unknown> {
  return {
    request_id: "router-request-1",
    provider: PROVIDER_ADDRESS,
    tee_verified: true,
  };
}

function validEnvelope(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "chatcmpl-1",
    model: MODEL_ID,
    choices: [{ index: 0, message: { role: "assistant", content: '{"verdict":"ALLOW"}' } }],
    usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 },
    x_0g_trace: validTrace(),
    ...overrides,
  };
}

function completionResponse(
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
): Response {
  return jsonResponse(body, { headers });
}

function jsonResponse(
  body: Record<string, unknown>,
  init: { status?: number; headers?: Record<string, string> } = {},
): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "Content-Type": "application/json", ...init.headers },
  });
}

function sequenceClock(values: number[]): ZeroGClock {
  let nextIndex = 0;
  return {
    now: () => values[nextIndex++] ?? values.at(-1) ?? 0,
    setTimeout: () => "timer",
    clearTimeout: () => undefined,
  };
}

async function captureRouterError(promise: Promise<unknown>): Promise<ZeroGRouterError> {
  try {
    await promise;
    assert.fail("expected ZeroGRouterError");
  } catch (error) {
    assert.ok(error instanceof ZeroGRouterError);
    return error;
  }
}

async function expectRouterError(
  promise: Promise<unknown>,
  expected: Pick<ZeroGRouterError, "code" | "stage" | "reason">,
): Promise<void> {
  const error = await captureRouterError(promise);
  assert.equal(error.code, expected.code);
  assert.equal(error.stage, expected.stage);
  assert.equal(error.reason, expected.reason);
  assertSanitized(error);
}

function assertSanitized(error: ZeroGRouterError): void {
  const serialized = JSON.stringify(error);
  for (const secret of [PRIVATE_PROMPT, API_KEY, "choices", "raw"]) {
    assert.equal(error.message.includes(secret), false);
    assert.equal(serialized.includes(secret), false);
  }
}
