import { createRequire } from "node:module";
import { ethers } from "ethers";
import type * as ZeroGComputeSdk from "@0gfoundation/0g-compute-ts-sdk";
import { TeeMlError } from "../../teeml/errors.js";
import {
  UnconfiguredTeeMlInferenceGateway,
  type TeeMlInferenceGateway,
  type TeeMlInferenceResult,
} from "../../teeml/inference-gateway.js";
import type { TeeMlChatMessage } from "../../teeml/prompt.js";
import { HACKATHON_TESTNET_TEETLS_PROFILE } from "../../teeml/security-profile.js";
import { getZeroGNetwork } from "./zero-g-network.js";

const require = createRequire(import.meta.url);
const { createZGComputeNetworkBroker } =
  require("@0gfoundation/0g-compute-ts-sdk") as typeof ZeroGComputeSdk;



const EVM_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const PRIVATE_KEY_RE = /^0x[0-9a-fA-F]{64}$/;
const MODEL_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/;

const LEDGER_INITIAL_BALANCE_A0GI = 5;
const MAX_COMPLETION_RESPONSE_BYTES = 512 * 1024;

type Broker = Awaited<ReturnType<typeof createZGComputeNetworkBroker>>;

export type ZeroGDirectInferenceConfig = Readonly<{
  privateKey: string;
  providerAddress: string;
  expectedProviderModelId: string;
  timeoutMs: number;
  maxOutputTokens: number;
}>;

export type ZeroGDirectInferenceDependencies = Readonly<{
  now?: () => number;
  createBroker?: () => Promise<Broker>;
  fetch?: typeof fetch;
}>;

export class ZeroGDirectInferenceGateway implements TeeMlInferenceGateway {
  readonly #config: ZeroGDirectInferenceConfig;
  readonly #now: () => number;
  readonly #createBroker: () => Promise<Broker>;
  readonly #fetch: typeof fetch;
  #brokerPromise: Promise<Broker> | undefined;
  #readyPromise: Promise<void> | undefined;

  constructor(
    config: ZeroGDirectInferenceConfig,
    dependencies: ZeroGDirectInferenceDependencies = {},
  ) {
    if (!PRIVATE_KEY_RE.test(config.privateKey)) {
      throw new Error("ZG_COMPUTE_PRIVATE_KEY is invalid");
    }
    if (!EVM_ADDRESS_RE.test(config.providerAddress)) {
      throw new Error("ZG_TEEML_PROVIDER_ADDRESS is invalid");
    }
    if (!MODEL_ID_RE.test(config.expectedProviderModelId)) {
      throw new Error("ZG_TEEML_PROVIDER_MODEL_ID is invalid");
    }
    this.#config = config;
    this.#now = dependencies.now ?? (() => Date.now());
    this.#createBroker =
      dependencies.createBroker ??
      (async () => {
        const network = getZeroGNetwork("testnet");
        const provider = new ethers.JsonRpcProvider(network.rpcUrl);
        const wallet = new ethers.Wallet(config.privateKey, provider);
        return await createZGComputeNetworkBroker(wallet);
      });
    this.#fetch = dependencies.fetch ?? fetch;
  }

  async complete(
    messages: readonly TeeMlChatMessage[],
  ): Promise<TeeMlInferenceResult> {
    const startedAt = this.#now();
    const broker = await this.#getBroker();
    await this.#ensureReady(broker);

    const metadata = await this.#callBroker(() =>
      broker.inference.getServiceMetadata(this.#config.providerAddress),
    );
    if (metadata.model !== this.#config.expectedProviderModelId) {
      throw new TeeMlError(
        "TEEML_CONFIG_ERROR",
        "0G provider model does not match the configured model",
        false,
      );
    }

    const headers = await this.#callBroker(() =>
      broker.inference.getRequestHeaders(this.#config.providerAddress),
    );

    const controller = new AbortController();
    const timeoutHandle = setTimeout(
      () => controller.abort(),
      this.#config.timeoutMs,
    );
    let response: Response;
    try {
      response = await this.#fetch(`${metadata.endpoint}/chat/completions`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          ...(headers as unknown as Record<string, string>),
        },
        body: JSON.stringify({
          model: metadata.model,
          messages,
          temperature: 0,
          max_tokens: this.#config.maxOutputTokens,
          stream: false,
          verify_tee: true,
          // The pinned provider's catalog entry advertises "response_format"
          // support; the strict verdict parser rejects anything else anyway.
          response_format: { type: "json_object" },
        }),
        redirect: "error",
        signal: controller.signal,
      });
    } catch {
      // An abort here only stops the client from waiting; the provider may
      // already have received and billed the request. Treat it the same way
      // the Router path treats an ambiguous completion-phase timeout: assume
      // dispatched so operators reconcile rather than silently discount it.
      if (controller.signal.aborted) {
        throw new TeeMlError(
          "TEEML_TIMEOUT",
          "0G direct completion request timed out",
          true,
        );
      }
      throw new TeeMlError(
        "TEEML_PROVIDER_ERROR",
        "0G direct completion request failed",
        false,
      );
    } finally {
      clearTimeout(timeoutHandle);
    }

    if (!response.ok) {
      throw new TeeMlError(
        "TEEML_PROVIDER_ERROR",
        `0G provider returned HTTP ${response.status}`,
        true,
      );
    }

    const body = await readBoundedJsonCompletion(response);
    // The completion body's own "model" field is a display-friendly name from
    // the provider itself (e.g. "qwen2.5-omni-7b"), not the fully-qualified
    // on-chain registry id `metadata.model` (e.g. "qwen/qwen2.5-omni-7b") -
    // confirmed to differ in practice, so it is not compared here. The
    // provider is already pinned by address, and `metadata.model` (checked
    // above against `ZG_TEEML_PROVIDER_MODEL_ID`) is the authoritative value.
    const zgResKey = response.headers.get("ZG-Res-Key");
    const chatId = zgResKey ?? body.id;
    const content = body.choices?.[0]?.message?.content;
    if (
      typeof chatId !== "string" ||
      chatId.length === 0 ||
      typeof content !== "string" ||
      content.length === 0 ||
      typeof body.id !== "string" ||
      body.id.length === 0
    ) {
      throw new TeeMlError(
        "TEEML_OUTPUT_INVALID",
        "0G direct completion response is missing required fields",
        true,
      );
    }


    let verified: boolean | null;
    try {
      verified = await broker.inference.processResponse(
        this.#config.providerAddress,
        chatId,
        JSON.stringify(body.usage ?? {}),
      );
    } catch {
      throw new TeeMlError(
        "TEEML_NOT_VERIFIED",
        "0G direct signature verification failed",
        true,
      );
    }
    if (verified !== true) {
      throw new TeeMlError(
        "TEEML_NOT_VERIFIED",
        "0G direct signature verification rejected the response",
        true,
      );
    }

    return {
      responseId: body.id,
      routerRequestId: chatId,
      providerAddress: this.#config.providerAddress,
      modelId: metadata.model,
      content,
      promptTokens: body.usage?.prompt_tokens,
      completionTokens: body.usage?.completion_tokens,
      latencyMs: Math.max(0, Math.round(this.#now() - startedAt)),
      securityProfile: HACKATHON_TESTNET_TEETLS_PROFILE,
      trustMode: "verified",
      verificationMode: "TeeTLS",
      sealedInference: false,
      teeVerified: true,
    };
  }

  async #getBroker(): Promise<Broker> {
    if (!this.#brokerPromise) {
      const created = this.#createBroker();
      this.#brokerPromise = created.catch(error => {
        this.#brokerPromise = undefined;
        throw error;
      });
    }
    return this.#brokerPromise;
  }

  async #ensureReady(broker: Broker): Promise<void> {
    if (this.#readyPromise) return this.#readyPromise;
    const setup = (async () => {
      try {
        await broker.ledger.getLedger();
      } catch {
        await broker.ledger.addLedger(LEDGER_INITIAL_BALANCE_A0GI);
      }
      try {
        // Idempotent on the SDK side for an already-acknowledged signer; a
        // genuine failure here still fails closed below, since the pinned
        // provider then fails eligibility in getRequestHeaders/verify.
        await broker.inference.acknowledgeProviderSigner(
          this.#config.providerAddress,
        );
      } catch {
        // See comment above - swallowed intentionally.
      }
    })();
    this.#readyPromise = setup.catch(error => {
      this.#readyPromise = undefined;
      throw error;
    });
    return this.#readyPromise;
  }

  async #callBroker<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch {
      throw new TeeMlError(
        "TEEML_PROVIDER_ERROR",
        "0G direct provider call failed",
        false,
      );
    }
  }
}

type DirectCompletionBody = Readonly<{
  id?: string;
  model?: string;
  choices?: ReadonlyArray<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}>;

async function readBoundedJsonCompletion(
  response: Response,
): Promise<DirectCompletionBody> {
  const contentLength = response.headers.get("content-length");
  if (contentLength !== null) {
    const parsedLength = Number(contentLength);
    if (
      !Number.isSafeInteger(parsedLength) ||
      parsedLength < 0 ||
      parsedLength > MAX_COMPLETION_RESPONSE_BYTES
    ) {
      throw new TeeMlError(
        "TEEML_OUTPUT_INVALID",
        "0G direct completion response exceeded the size limit",
        true,
      );
    }
  }
  if (!response.body) {
    throw new TeeMlError(
      "TEEML_OUTPUT_INVALID",
      "0G direct completion response body is missing",
      true,
    );
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let rawBody: string | undefined = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      totalBytes += chunk.value.byteLength;
      if (totalBytes > MAX_COMPLETION_RESPONSE_BYTES) {
        await reader.cancel();
        throw new TeeMlError(
          "TEEML_OUTPUT_INVALID",
          "0G direct completion response exceeded the size limit",
          true,
        );
      }
      rawBody += decoder.decode(chunk.value, { stream: true });
    }
    rawBody += decoder.decode();
    if (rawBody.length === 0) {
      throw new TeeMlError(
        "TEEML_OUTPUT_INVALID",
        "0G direct completion response body is empty",
        true,
      );
    }
    try {
      return JSON.parse(rawBody) as DirectCompletionBody;
    } catch {
      throw new TeeMlError(
        "TEEML_OUTPUT_INVALID",
        "0G direct completion response is not valid JSON",
        true,
      );
    }
  } finally {
    rawBody = undefined;
    reader.releaseLock();
  }
}

export function createZeroGDirectInferenceFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): TeeMlInferenceGateway {
  const privateKey = env.ZG_COMPUTE_PRIVATE_KEY;
  const providerAddress = env.ZG_TEEML_PROVIDER_ADDRESS;
  const expectedProviderModelId = env.ZG_TEEML_PROVIDER_MODEL_ID;
  if (!privateKey || !providerAddress || !expectedProviderModelId) {
    return new UnconfiguredTeeMlInferenceGateway();
  }
  const timeoutMs = parseEnvPositiveInteger(env.ZG_TEEML_TIMEOUT_MS, 30_000);
  // See the matching comment in zero-g-router-client.ts: the strict verdict
  // schema needs well over 256 tokens or valid output truncates mid-JSON.
  const maxOutputTokens = parseEnvPositiveInteger(
    env.ZG_TEEML_MAX_OUTPUT_TOKENS,
    768,
  );
  if (timeoutMs === null || maxOutputTokens === null) {
    return new UnconfiguredTeeMlInferenceGateway();
  }
  try {
    return new ZeroGDirectInferenceGateway({
      privateKey,
      providerAddress,
      expectedProviderModelId,
      timeoutMs,
      maxOutputTokens,
    });
  } catch {
    return new UnconfiguredTeeMlInferenceGateway();
  }
}

function parseEnvPositiveInteger(
  value: string | undefined,
  defaultValue: number,
): number | null {
  if (value === undefined || value.trim() === "") return defaultValue;
  if (!/^[1-9][0-9]*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}