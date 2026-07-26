import { ZeroGRouterError } from "./zero-g-router-errors.js";
import { resolveZeroGRouterNetwork } from "./zero-g-network.js";
import {
  getZeroGSecurityContract,
  type ZeroGSecurityContract,
} from "../../teeml/security-profile.js";
import type {
  ZeroGClock,
  ZeroGFetch,
  ZeroGVerifiedChatCompletion,
  ZeroGVerifiedChatCompletionInput,
  ZeroGProviderCatalogEntry,
  ZeroGRouterConfig,
  ZeroGRouterDependencies,
  ZeroGTokenUsage,
} from "./zero-g-router-types.js";

const CHAT_COMPLETIONS_PATH = "chat/completions";
const PROVIDERS_PATH = "providers";
const EVM_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const MODEL_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/;
const MAX_API_KEY_LENGTH = 4096;
const MAX_MESSAGE_COUNT = 8;
const MAX_MESSAGE_CHARS = 128 * 1024;
const MAX_TIMEOUT_MS = 5 * 60 * 1000;
const MAX_OUTPUT_TOKENS = 768;
const MAX_COMPLETION_RESPONSE_BYTES = 512 * 1024;
const MAX_PROVIDER_CATALOG_BYTES = 2 * 1024 * 1024;
const MAX_RESPONSE_ID_CHARS = 512;
const MAX_POSTGRES_INTEGER = 2_147_483_647;

const SYSTEM_CLOCK: ZeroGClock = {
  now: () => Date.now(),
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeout: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

type JsonRecord = Record<string, unknown>;

type CompletionEnvelope = {
  id: string;
  model: string;
  content: string;
  usage: ZeroGTokenUsage;
  trace: {
    requestId: string;
    providerAddress: string;
    teeVerified: true;
  };
};

export class ZeroGRouterClient {
  readonly #baseUrl: string;
  readonly #apiKey: string;
  readonly #modelId: string;
  readonly #timeoutMs: number;
  readonly #maxOutputTokens: number;
  readonly #fetch: ZeroGFetch;
  readonly #clock: ZeroGClock;
  readonly #providerCatalogEntry: unknown;
  readonly #securityContract: ZeroGSecurityContract;

  constructor(config: ZeroGRouterConfig, dependencies: ZeroGRouterDependencies = {}) {
    const network = resolveZeroGRouterNetwork(config.baseUrl);
    this.#baseUrl = network.routerBaseUrl;
    this.#apiKey = parseApiKey(config.apiKey);
    this.#modelId = parseModelId(config.modelId);
    this.#timeoutMs = parsePositiveInteger(config.timeoutMs, MAX_TIMEOUT_MS);
    this.#maxOutputTokens = parsePositiveInteger(config.maxOutputTokens, MAX_OUTPUT_TOKENS);
    this.#fetch = dependencies.fetch ?? fetch;
    this.#clock = dependencies.clock ?? SYSTEM_CLOCK;
    this.#providerCatalogEntry = dependencies.providerCatalogEntry;
    this.#securityContract = getZeroGSecurityContract(config.securityProfile);
    if (network.name !== this.#securityContract.requiredNetwork) {
      throw routerError("TEEML_CONFIG_ERROR", "BEFORE_SEND", "CONFIG_INVALID");
    }
  }

  async createVerifiedChatCompletion(input: ZeroGVerifiedChatCompletionInput): Promise<ZeroGVerifiedChatCompletion> {
    const messages = parseMessages(input.messages);
    if (input.responseFormat !== undefined && input.responseFormat !== "json_object") {
      throw routerError("TEEML_CONFIG_ERROR", "BEFORE_SEND", "CONFIG_INVALID");
    }

    const catalog = this.#providerCatalogEntry !== undefined
      ? [parseCatalogEntry(this.#providerCatalogEntry, this.#modelId)]
      : await this.#fetchProviderCatalog();

    const eligibleProviders = catalog
      .filter(entry =>
        isEligibleProvider(entry, this.#modelId, this.#securityContract),
      )
      .sort((left, right) =>
        left.address.toLowerCase().localeCompare(right.address.toLowerCase()),
      );
    const selectedProvider = eligibleProviders[0];
    if (!selectedProvider) {
      throw securityProfileMismatch("BEFORE_SEND", this.#securityContract);
    }

    const requestBody: JsonRecord = {
      model: this.#modelId,
      messages,
      temperature: 0,
      max_tokens: this.#maxOutputTokens,
      stream: false,
      verify_tee: true,
    };
    if (
      input.responseFormat === "json_object" &&
      eligibleProviders.every(entry =>
        entry.supported_parameters.includes("response_format"),
      )
    ) {
      requestBody.response_format = { type: "json_object" };
    }

    const startedAt = this.#clock.now();
    const controller = new AbortController();
    let timedOut = false;
    const timeoutHandle = this.#clock.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.#timeoutMs);

    try {
      const response = await this.#fetch(buildUrl(this.#baseUrl, CHAT_COMPLETIONS_PATH), {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${this.#apiKey}`,
          "Content-Type": "application/json",
          "X-0G-Provider-Address": selectedProvider.address,
          "X-0G-Provider-Allow-Fallbacks": "false",
          "X-0G-Provider-Trust-Mode": this.#securityContract.trustMode,
        },
        body: JSON.stringify(requestBody),
        redirect: "error",
        signal: controller.signal,
      });

      if (timedOut || controller.signal.aborted) {
        throw routerError("TEEML_TIMEOUT", "UNKNOWN_RESULT", "REQUEST_TIMEOUT");
      }
      if (!response.ok) {
        throw routerError("TEEML_PROVIDER_ERROR", "PROVIDER_RESPONSE", "PROVIDER_HTTP_ERROR", response.status);
      }

      let rawEnvelope: unknown;
      try {
        rawEnvelope = await readBoundedJsonResponse(
          response,
          MAX_COMPLETION_RESPONSE_BYTES,
        );
      } catch {
        if (timedOut || controller.signal.aborted) {
          throw routerError("TEEML_TIMEOUT", "UNKNOWN_RESULT", "REQUEST_TIMEOUT");
        }
        throw invalidEnvelope();
      }
      const envelope = parseCompletionEnvelope(rawEnvelope, this.#modelId);
      const responseProvider = findProvider(
        catalog,
        envelope.trace.providerAddress,
      );

      if (
        !responseProvider ||
        responseProvider.address.toLowerCase() !==
          selectedProvider.address.toLowerCase()
      ) {
        throw routerError("TEEML_PROVIDER_ERROR", "PROVIDER_RESPONSE", "PROVIDER_MISMATCH");
      }
      assertEligibleProvider(
        responseProvider,
        this.#modelId,
        this.#securityContract,
        "PROVIDER_RESPONSE",
      );

      const zgResponseKey = parseOptionalHeader(response.headers.get("ZG-Res-Key"));
      const chatId = zgResponseKey ?? envelope.id;

      return {
        responseId: envelope.id,
        routerRequestId: envelope.trace.requestId,
        providerAddress: responseProvider.address,
        modelId: envelope.model,
        content: envelope.content,
        usage: envelope.usage,
        latencyMs: elapsedMilliseconds(startedAt, this.#clock.now()),
        securityProfile: this.#securityContract.securityProfile,
        trustMode: this.#securityContract.trustMode,
        verificationMode: this.#securityContract.verificationMode,
        sealedInference: this.#securityContract.sealedInference,
        teeVerified: true,
        ...(zgResponseKey ? { zgResponseKey } : {}),
        signedContentReference: {
          chatId,
          chatIdSource: zgResponseKey ? "ZG-Res-Key" : "response.id",
          providerAddress: responseProvider.address,
          modelId: envelope.model,
          providerModelId: responseProvider.model_id,
        },
      };
    } catch (error) {
      if (error instanceof ZeroGRouterError) {
        throw error;
      }
      if (timedOut || controller.signal.aborted) {
        throw routerError("TEEML_TIMEOUT", "UNKNOWN_RESULT", "REQUEST_TIMEOUT");
      }
      throw routerError("TEEML_UNKNOWN_RESULT", "UNKNOWN_RESULT", "REQUEST_OUTCOME_UNKNOWN");
    } finally {
      this.#clock.clearTimeout(timeoutHandle);
    }
  }

  async #fetchProviderCatalog(): Promise<ZeroGProviderCatalogEntry[]> {
    const controller = new AbortController();
    let timedOut = false;
    const timeoutHandle = this.#clock.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.#timeoutMs);

    try {
      const response = await this.#fetch(buildUrl(this.#baseUrl, PROVIDERS_PATH), {
        method: "GET",
        headers: { Accept: "application/json" },
        redirect: "error",
        signal: controller.signal,
      });

      if (timedOut || controller.signal.aborted) {
        throw routerError("TEEML_PROVIDER_ERROR", "BEFORE_SEND", "CATALOG_UNAVAILABLE");
      }
      if (!response.ok) {
        throw routerError("TEEML_PROVIDER_ERROR", "BEFORE_SEND", "CATALOG_UNAVAILABLE", response.status);
      }

      let rawCatalog: unknown;
      try {
        rawCatalog = await readBoundedJsonResponse(
          response,
          MAX_PROVIDER_CATALOG_BYTES,
        );
      } catch {
        if (timedOut || controller.signal.aborted) {
          throw routerError("TEEML_PROVIDER_ERROR", "BEFORE_SEND", "CATALOG_UNAVAILABLE");
        }
        throw routerError("TEEML_PROVIDER_ERROR", "BEFORE_SEND", "CATALOG_INVALID");
      }
      if (!isRecord(rawCatalog) || rawCatalog.object !== "list" || !Array.isArray(rawCatalog.data)) {
        throw routerError("TEEML_PROVIDER_ERROR", "BEFORE_SEND", "CATALOG_INVALID");
      }

      return rawCatalog.data
        .filter(
          entry =>
            isRecord(entry) && entry.canonical_id === this.#modelId,
        )
        .map(entry => parseCatalogEntry(entry, this.#modelId));
    } catch (error) {
      if (error instanceof ZeroGRouterError) {
        throw error;
      }
      if (timedOut || controller.signal.aborted) {
        throw routerError("TEEML_PROVIDER_ERROR", "BEFORE_SEND", "CATALOG_UNAVAILABLE");
      }
      throw routerError("TEEML_PROVIDER_ERROR", "BEFORE_SEND", "CATALOG_UNAVAILABLE");
    } finally {
      this.#clock.clearTimeout(timeoutHandle);
    }
  }
}

function parseApiKey(value: string): string {
  if (
    typeof value !== "string" ||
    value.length <= "sk-".length ||
    value.length > MAX_API_KEY_LENGTH ||
    value.trim() !== value ||
    !value.startsWith("sk-") ||
    !/^[\x21-\x7e]+$/.test(value)
  ) {
    throw routerError("TEEML_CONFIG_ERROR", "BEFORE_SEND", "CONFIG_INVALID");
  }
  return value;
}

function parseModelId(value: string): string {
  if (typeof value !== "string" || !MODEL_ID_RE.test(value)) {
    throw routerError("TEEML_CONFIG_ERROR", "BEFORE_SEND", "CONFIG_INVALID");
  }
  return value;
}

function parsePositiveInteger(value: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || value <= 0 || value > maximum) {
    throw routerError("TEEML_CONFIG_ERROR", "BEFORE_SEND", "CONFIG_INVALID");
  }
  return value;
}

function parseMessages(value: readonly unknown[]): Array<{ role: "system" | "user"; content: string }> {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_MESSAGE_COUNT) {
    throw routerError("TEEML_CONFIG_ERROR", "BEFORE_SEND", "CONFIG_INVALID");
  }

  let totalChars = 0;
  const parsed = value.map(message => {
    if (
      !isRecord(message) ||
      (message.role !== "system" && message.role !== "user") ||
      typeof message.content !== "string" ||
      message.content.length === 0 ||
      Object.keys(message).some(key => key !== "role" && key !== "content")
    ) {
      throw routerError("TEEML_CONFIG_ERROR", "BEFORE_SEND", "CONFIG_INVALID");
    }
    totalChars += message.content.length;
    const role: "system" | "user" = message.role;
    return { role, content: message.content };
  });

  if (totalChars > MAX_MESSAGE_CHARS) {
    throw routerError("TEEML_CONFIG_ERROR", "BEFORE_SEND", "CONFIG_INVALID");
  }
  return parsed;
}

function parseCatalogEntry(value: unknown, expectedModelId: string): ZeroGProviderCatalogEntry {
  if (
    !isRecord(value) ||
    typeof value.address !== "string" ||
    !EVM_ADDRESS_RE.test(value.address) ||
    typeof value.model_id !== "string" ||
    !MODEL_ID_RE.test(value.model_id) ||
    typeof value.canonical_id !== "string" ||
    value.canonical_id !== expectedModelId ||
    value.service_type !== "chatbot" ||
    value.type !== "chatbot" ||
    typeof value.is_healthy !== "boolean" ||
    typeof value.verifiability !== "string" ||
    (value.trust_mode !== undefined &&
      value.trust_mode !== null &&
      typeof value.trust_mode !== "string") ||
    typeof value.tee_attested !== "boolean" ||
    typeof value.tee_acknowledged !== "boolean"
  ) {
    throw routerError("TEEML_PROVIDER_ERROR", "BEFORE_SEND", "CATALOG_INVALID");
  }

  const supportedParameters =
    value.supported_parameters === undefined
      ? []
      : Array.isArray(value.supported_parameters) &&
          value.supported_parameters.every(
            parameter => typeof parameter === "string",
          )
        ? [...new Set(value.supported_parameters)].sort()
        : null;
  if (supportedParameters === null) {
    throw routerError("TEEML_PROVIDER_ERROR", "BEFORE_SEND", "CATALOG_INVALID");
  }

  return {
    address: value.address,
    model_id: value.model_id,
    canonical_id: value.canonical_id,
    service_type: value.service_type,
    type: value.type,
    is_healthy: value.is_healthy,
    verifiability: value.verifiability,
    trust_mode: value.trust_mode ?? null,
    tee_attested: value.tee_attested,
    tee_acknowledged: value.tee_acknowledged,
    supported_parameters: supportedParameters,
  };
}

function isEligibleProvider(
  entry: ZeroGProviderCatalogEntry,
  expectedModelId: string,
  security: ZeroGSecurityContract,
): boolean {
  const catalogTrustModeMatches =
    security.trustMode === "private"
      ? entry.trust_mode === "private"
      : entry.trust_mode === null || entry.trust_mode === "verified";
  return (
    entry.canonical_id === expectedModelId &&
    entry.service_type === "chatbot" &&
    entry.type === "chatbot" &&
    entry.is_healthy === true &&
    entry.verifiability === security.verificationMode &&
    catalogTrustModeMatches &&
    entry.tee_attested === true &&
    entry.tee_acknowledged === true
  );
}

function assertEligibleProvider(
  entry: ZeroGProviderCatalogEntry,
  expectedModelId: string,
  security: ZeroGSecurityContract,
  stage: "BEFORE_SEND" | "PROVIDER_RESPONSE",
): void {
  if (!isEligibleProvider(entry, expectedModelId, security)) {
    throw securityProfileMismatch(stage, security);
  }
}

function securityProfileMismatch(
  stage: "BEFORE_SEND" | "PROVIDER_RESPONSE",
  security: ZeroGSecurityContract,
): ZeroGRouterError {
  return security.trustMode === "private"
    ? routerError("TEEML_NOT_PRIVATE", stage, "PROVIDER_NOT_PRIVATE")
    : routerError(
        "TEEML_NOT_VERIFIED",
        stage,
        "PROVIDER_SECURITY_PROFILE_MISMATCH",
      );
}

function findProvider(
  catalog: readonly ZeroGProviderCatalogEntry[],
  providerAddress: string,
): ZeroGProviderCatalogEntry | undefined {
  const matches = catalog.filter(entry => entry.address.toLowerCase() === providerAddress.toLowerCase());
  return matches.length === 1 ? matches[0] : undefined;
}

function parseCompletionEnvelope(value: unknown, expectedModelId: string): CompletionEnvelope {
  if (!isRecord(value)) {
    throw invalidEnvelope();
  }

  const id = parseBoundedVisibleString(value.id, MAX_RESPONSE_ID_CHARS);
  const model =
    typeof value.model === "string" && MODEL_ID_RE.test(value.model)
      ? value.model
      : invalidEnvelope();
  if (model !== expectedModelId) {
    throw routerError("TEEML_OUTPUT_INVALID", "PROVIDER_RESPONSE", "RESPONSE_MODEL_MISMATCH");
  }

  if (
    !Array.isArray(value.choices) ||
    value.choices.length !== 1 ||
    !isRecord(value.choices[0])
  ) {
    throw invalidEnvelope();
  }
  const message = value.choices[0].message;
  if (
    !isRecord(message) ||
    message.role !== "assistant" ||
    message.tool_calls != null ||
    message.function_call != null ||
    message.reasoning_content != null ||
    message.refusal != null
  ) {
    throw invalidEnvelope();
  }
  const content = parseRequiredString(message.content);

  const usage = parseUsage(value.usage);
  if (!isRecord(value.x_0g_trace)) {
    throw invalidEnvelope();
  }
  const requestId = parseBoundedVisibleString(
    value.x_0g_trace.request_id,
    MAX_RESPONSE_ID_CHARS,
  );
  const providerAddress = parseRequiredString(value.x_0g_trace.provider);
  if (!EVM_ADDRESS_RE.test(providerAddress)) {
    throw invalidEnvelope();
  }
  if (value.x_0g_trace.tee_verified !== true) {
    throw routerError("TEEML_NOT_VERIFIED", "PROVIDER_RESPONSE", "PROVIDER_NOT_TEE_VERIFIED");
  }

  return {
    id,
    model,
    content,
    usage,
    trace: { requestId, providerAddress, teeVerified: true },
  };
}

function parseUsage(value: unknown): ZeroGTokenUsage {
  if (!isRecord(value)) {
    throw invalidEnvelope();
  }
  const promptTokens = parseTokenCount(value.prompt_tokens);
  const completionTokens = parseTokenCount(value.completion_tokens);
  const totalTokens = parseTokenCount(value.total_tokens);
  return { promptTokens, completionTokens, totalTokens };
}

function parseTokenCount(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > MAX_POSTGRES_INTEGER
  ) {
    throw invalidEnvelope();
  }
  return value;
}

function parseRequiredString(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) {
    throw invalidEnvelope();
  }
  return value;
}

function parseBoundedVisibleString(
  value: unknown,
  maxLength: number,
): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > maxLength ||
    !/^[\x21-\x7e]+$/.test(value)
  ) {
    throw invalidEnvelope();
  }
  return value;
}

function parseOptionalHeader(value: string | null): string | undefined {
  if (value === null) {
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  if (
    trimmed.length > MAX_RESPONSE_ID_CHARS ||
    !/^[\x21-\x7e]+$/.test(trimmed)
  ) {
    throw invalidEnvelope();
  }
  return trimmed;
}

function elapsedMilliseconds(start: number, end: number): number {
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return 0;
  }
  return Math.max(0, Math.round(end - start));
}

function buildUrl(baseUrl: string, path: string): string {
  return `${baseUrl}/${path}`;
}

async function readBoundedJsonResponse(
  response: Response,
  maxBytes: number,
): Promise<unknown> {
  const contentLength = response.headers.get("content-length");
  if (contentLength !== null) {
    const parsedLength = Number(contentLength);
    if (
      !Number.isSafeInteger(parsedLength) ||
      parsedLength < 0 ||
      parsedLength > maxBytes
    ) {
      throw new Error("RESPONSE_SIZE_INVALID");
    }
  }
  if (!response.body) {
    throw new Error("RESPONSE_BODY_MISSING");
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
      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw new Error("RESPONSE_SIZE_INVALID");
      }
      rawBody += decoder.decode(chunk.value, { stream: true });
    }
    rawBody += decoder.decode();
    if (rawBody.length === 0) {
      throw new Error("RESPONSE_BODY_MISSING");
    }
    return JSON.parse(rawBody) as unknown;
  } finally {
    rawBody = undefined;
    reader.releaseLock();
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalidEnvelope(): ZeroGRouterError {
  return routerError("TEEML_OUTPUT_INVALID", "PROVIDER_RESPONSE", "RESPONSE_ENVELOPE_INVALID");
}

function routerError(
  code: ConstructorParameters<typeof ZeroGRouterError>[0]["code"],
  stage: ConstructorParameters<typeof ZeroGRouterError>[0]["stage"],
  reason: ConstructorParameters<typeof ZeroGRouterError>[0]["reason"],
  httpStatus?: number,
): ZeroGRouterError {
  return new ZeroGRouterError({ code, stage, reason, ...(httpStatus === undefined ? {} : { httpStatus }) });
}
