import { lookup as dnsLookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { createRequire } from "node:module";
import { isIP, type LookupFunction } from "node:net";
import { Readable } from "node:stream";
import type * as ZeroGComputeSdk from "@0gfoundation/0g-compute-ts-sdk";
import type {
  ZeroGClock,
  ZeroGFetch,
  ZeroGSignedContentReference,
} from "./zero-g-router-types.js";
import {
  getZeroGSecurityContract,
  HACKATHON_TESTNET_TEETLS_PROFILE,
  PRODUCTION_PRIVATE_TEEML_PROFILE,
  type ZeroGSecurityProfile,
} from "../../teeml/security-profile.js";
import {
  getZeroGNetwork,
  type ZeroGNetworkName,
} from "./zero-g-network.js";

const require = createRequire(import.meta.url);
const {
  InferenceVerifier,
  createZGComputeNetworkReadOnlyBroker,
} = require("@0gfoundation/0g-compute-ts-sdk") as typeof ZeroGComputeSdk;

const PROVIDER_PAGE_SIZE = 50;
const MAX_PROVIDER_PAGES = 20;
const MAX_TIMEOUT_MS = 5 * 60 * 1000;
const MAX_SIGNED_CONTENT_CHARS = 128 * 1024;
const MAX_SIGNATURE_RESPONSE_BYTES = 256 * 1024;
const EVM_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const EVM_SIGNATURE_RE = /^0x[0-9a-fA-F]{130}$/;
const MODEL_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/;
const CHAT_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,511}$/;

const SYSTEM_CLOCK: ZeroGClock = {
  now: () => Date.now(),
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeout: (handle) =>
    clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export type ZeroGOnChainProvider = Readonly<{
  providerAddress: string;
  providerUrl: string;
  model: string;
  verifiability: string;
  additionalInfo: string;
  teeSignerAddress: string;
  teeSignerAcknowledged: boolean;
}>;

export type ZeroGReadOnlyBroker = Readonly<{
  inference: Readonly<{
    listService: (
      offset?: number,
      limit?: number,
      includeUnacknowledged?: boolean,
    ) => Promise<readonly unknown[]>;
    getProviderModels: (providerAddress: string) => Promise<unknown>;
  }>;
}>;

export type ZeroGOnChainProviderResolver = (
  providerAddress: string,
  modelId: string,
) => Promise<ZeroGOnChainProvider>;

export type ZeroGProviderAddress = Readonly<{
  address: string;
  family: number;
}>;

export type ZeroGProviderAddressResolver = (
  hostname: string,
) => Promise<readonly ZeroGProviderAddress[]>;

export type ZeroGSignedResponseVerifierDependencies = Readonly<{
  resolveProvider?: ZeroGOnChainProviderResolver;
  createReadOnlyBroker?: (
    rpcUrl: string,
    chainId: number,
  ) => Promise<ZeroGReadOnlyBroker>;
  fetch?: ZeroGFetch;
  resolveProviderAddresses?: ZeroGProviderAddressResolver;
  clock?: ZeroGClock;
  verifySignature?: (
    message: string,
    signature: string,
    expectedAddress: string,
  ) => boolean;
}>;

export type ZeroGSignedResponseVerifierConfig = Readonly<{
  timeoutMs: number;
  network?: ZeroGNetworkName;
  securityProfile?: ZeroGSecurityProfile;
}>;

export type ZeroGSignedResponseVerificationInput = Readonly<{
  reference: ZeroGSignedContentReference;
  content: string;
}>;

export type ZeroGSignedResponseVerification = Readonly<{
  signatureVerified: true;
  providerAddress: string;
  modelId: string;
  signingAddress: string;
}>;

export type ZeroGSignedResponseVerificationErrorCode =
  | "TEEML_CONFIG_ERROR"
  | "TEEML_PROVIDER_ERROR"
  | "TEEML_NOT_VERIFIED"
  | "TEEML_TIMEOUT";

export type ZeroGSignedResponseVerificationFailureReason =
  | "VERIFICATION_INPUT_INVALID"
  | "ONCHAIN_PROVIDER_UNAVAILABLE"
  | "ONCHAIN_PROVIDER_TIMEOUT"
  | "ONCHAIN_PROVIDER_INELIGIBLE"
  | "SIGNATURE_UNAVAILABLE"
  | "SIGNATURE_FETCH_TIMEOUT"
  | "SIGNATURE_RESPONSE_INVALID"
  | "SIGNED_CONTENT_MISMATCH"
  | "SIGNATURE_INVALID";

type ZeroGSignedResponseVerificationErrorOptions = Readonly<{
  code: ZeroGSignedResponseVerificationErrorCode;
  reason: ZeroGSignedResponseVerificationFailureReason;
  stage: "BEFORE_VERIFICATION" | "PROVIDER_RESPONSE";
  httpStatus?: number;
}>;

/**
 * Contains stable classifications only. Upstream errors, signed content, and
 * signatures are deliberately never retained as an Error cause or message.
 */
export class ZeroGSignedResponseVerificationError extends Error {
  readonly code: ZeroGSignedResponseVerificationErrorCode;
  readonly reason: ZeroGSignedResponseVerificationFailureReason;
  readonly stage: "BEFORE_VERIFICATION" | "PROVIDER_RESPONSE";
  readonly httpStatus?: number;

  constructor(options: ZeroGSignedResponseVerificationErrorOptions) {
    super(options.code);
    this.name = "ZeroGSignedResponseVerificationError";
    this.code = options.code;
    this.reason = options.reason;
    this.stage = options.stage;
    this.httpStatus = options.httpStatus;
  }
}

export class ZeroGSignedResponseVerifier {
  readonly #timeoutMs: number;
  readonly #resolveProvider: ZeroGOnChainProviderResolver;
  readonly #fetch: ZeroGFetch;
  readonly #clock: ZeroGClock;
  readonly #verifySignature: (
    message: string,
    signature: string,
    expectedAddress: string,
  ) => boolean;
  readonly #securityProfile: ZeroGSecurityProfile;

  constructor(
    config: ZeroGSignedResponseVerifierConfig,
    dependencies: ZeroGSignedResponseVerifierDependencies = {},
  ) {
    this.#timeoutMs = parseTimeout(config.timeoutMs);
    this.#fetch =
      dependencies.fetch ??
      createPinnedProviderFetch(
        dependencies.resolveProviderAddresses ??
          resolveProviderAddressesWithSystemDns,
      );
    this.#clock = dependencies.clock ?? SYSTEM_CLOCK;
    this.#securityProfile =
      config.securityProfile ?? PRODUCTION_PRIVATE_TEEML_PROFILE;
    const networkName = config.network ?? "mainnet";
    if (networkName !== getZeroGSecurityContract(this.#securityProfile).requiredNetwork) {
      throw verificationError(
        "TEEML_CONFIG_ERROR",
        "VERIFICATION_INPUT_INVALID",
        "BEFORE_VERIFICATION",
      );
    }
    this.#verifySignature =
      dependencies.verifySignature ?? InferenceVerifier.verifySignature;

    if (dependencies.resolveProvider) {
      this.#resolveProvider = dependencies.resolveProvider;
    } else {
      const createReadOnlyBroker =
        dependencies.createReadOnlyBroker ??
        (async (rpcUrl, chainId) =>
          await createZGComputeNetworkReadOnlyBroker(rpcUrl, chainId));
      const network = getZeroGNetwork(networkName);
      this.#resolveProvider =
        createProviderResolver(
          createReadOnlyBroker,
          network.rpcUrl,
          network.chainId,
        );
    }
  }

  async verify(
    rawInput: ZeroGSignedResponseVerificationInput,
  ): Promise<ZeroGSignedResponseVerification> {
    const input = parseInput(rawInput);
    const deadline = this.#clock.now() + this.#timeoutMs;
    const provider = await this.#resolveProviderBeforeDeadline(
      input.reference.providerAddress,
      input.reference.providerModelId,
      deadline,
    );

    const signingAddress = assertEligibleProvider(
      provider,
      input.reference.providerAddress,
      input.reference.providerModelId,
      this.#securityProfile,
    );
    const signatureUrl = buildSignatureUrl(
      provider.providerUrl,
      input.reference.chatId,
      input.reference.providerModelId,
    );

    let signedResponse: SignedResponse | undefined;
    try {
      signedResponse = await this.#fetchSignedResponse(
        signatureUrl,
        remainingTime(deadline, this.#clock.now()),
      );

      if (signedResponse.text !== input.content) {
        throw verificationError(
          "TEEML_NOT_VERIFIED",
          "SIGNED_CONTENT_MISMATCH",
          "PROVIDER_RESPONSE",
        );
      }

      let isValid = false;
      try {
        isValid = this.#verifySignature(
          signedResponse.text,
          signedResponse.signature,
          signingAddress,
        );
      } catch {
        isValid = false;
      }
      if (!isValid) {
        throw verificationError(
          "TEEML_NOT_VERIFIED",
          "SIGNATURE_INVALID",
          "PROVIDER_RESPONSE",
        );
      }

      return {
        signatureVerified: true,
        providerAddress: provider.providerAddress,
        modelId: input.reference.modelId,
        signingAddress,
      };
    } finally {
      signedResponse = undefined;
    }
  }

  async #resolveProviderBeforeDeadline(
    providerAddress: string,
    modelId: string,
    deadline: number,
  ): Promise<ZeroGOnChainProvider> {
    const timeoutMs = remainingTime(deadline, this.#clock.now());
    let rejectTimeout:
      | ((error: ZeroGSignedResponseVerificationError) => void)
      | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      rejectTimeout = reject;
    });
    const timeoutHandle = this.#clock.setTimeout(() => {
      rejectTimeout?.(
        verificationError(
          "TEEML_TIMEOUT",
          "ONCHAIN_PROVIDER_TIMEOUT",
          "PROVIDER_RESPONSE",
        ),
      );
    }, timeoutMs);

    try {
      return await Promise.race([
        this.#resolveProvider(providerAddress, modelId),
        timeout,
      ]);
    } catch (error) {
      if (error instanceof ZeroGSignedResponseVerificationError) {
        throw error;
      }
      throw verificationError(
        "TEEML_PROVIDER_ERROR",
        "ONCHAIN_PROVIDER_UNAVAILABLE",
        "PROVIDER_RESPONSE",
      );
    } finally {
      this.#clock.clearTimeout(timeoutHandle);
      rejectTimeout = undefined;
    }
  }

  async #fetchSignedResponse(
    url: URL,
    timeoutMs: number,
  ): Promise<SignedResponse> {
    const controller = new AbortController();
    let timedOut = false;
    let rejectTimeout:
      | ((error: ZeroGSignedResponseVerificationError) => void)
      | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      rejectTimeout = reject;
    });
    const timeoutHandle = this.#clock.setTimeout(() => {
      timedOut = true;
      controller.abort();
      rejectTimeout?.(
        verificationError(
          "TEEML_TIMEOUT",
          "SIGNATURE_FETCH_TIMEOUT",
          "PROVIDER_RESPONSE",
        ),
      );
    }, timeoutMs);

    const download = async (): Promise<SignedResponse> => {
      const response = await this.#fetch(url, {
        method: "GET",
        headers: { Accept: "application/json" },
        redirect: "error",
        signal: controller.signal,
      });
      if (!response.ok) {
        throw verificationError(
          "TEEML_NOT_VERIFIED",
          "SIGNATURE_UNAVAILABLE",
          "PROVIDER_RESPONSE",
          response.status,
        );
      }
      return await parseSignedResponse(response);
    };

    try {
      return await Promise.race([download(), timeout]);
    } catch (error) {
      if (error instanceof ZeroGSignedResponseVerificationError) {
        throw error;
      }
      if (timedOut || controller.signal.aborted) {
        throw verificationError(
          "TEEML_TIMEOUT",
          "SIGNATURE_FETCH_TIMEOUT",
          "PROVIDER_RESPONSE",
        );
      }
      throw verificationError(
        "TEEML_NOT_VERIFIED",
        "SIGNATURE_UNAVAILABLE",
        "PROVIDER_RESPONSE",
      );
    } finally {
      this.#clock.clearTimeout(timeoutHandle);
      rejectTimeout = undefined;
    }
  }
}

function createProviderResolver(
  createReadOnlyBroker: (
    rpcUrl: string,
    chainId: number,
  ) => Promise<ZeroGReadOnlyBroker>,
  rpcUrl: string,
  chainId: number,
): ZeroGOnChainProviderResolver {
  return async (providerAddress, modelId) => {
    const broker = await createReadOnlyBroker(rpcUrl, chainId);
    const wantedAddress = providerAddress.toLowerCase();
    let matchedService: unknown;

    for (let page = 0; page < MAX_PROVIDER_PAGES; page += 1) {
      const offset = page * PROVIDER_PAGE_SIZE;
      const services = await broker.inference.listService(
        offset,
        PROVIDER_PAGE_SIZE,
        true,
      );
      matchedService = services.find((service) => {
        const provider = readStringProperty(service, "provider");
        return provider?.toLowerCase() === wantedAddress;
      });
      if (matchedService !== undefined) {
        break;
      }
      if (services.length < PROVIDER_PAGE_SIZE) {
        break;
      }
    }

    const provider = parseOnChainProvider(matchedService);
    if (provider.model === modelId) {
      return provider;
    }

    // Multi-model discovery in SDK 0.9.0 performs an indirect outbound request
    // to the provider URL. This branch accepts only the exact on-chain model
    // entry and never follows that unbounded discovery path.
    return provider;
  };
}

function parseInput(
  rawInput: ZeroGSignedResponseVerificationInput,
): ZeroGSignedResponseVerificationInput {
  if (
    !isRecord(rawInput) ||
    !hasOnlyKeys(rawInput, ["reference", "content"]) ||
    typeof rawInput.content !== "string" ||
    rawInput.content.length === 0 ||
    rawInput.content.length > MAX_SIGNED_CONTENT_CHARS ||
    !isRecord(rawInput.reference) ||
    !hasOnlyKeys(rawInput.reference, [
      "chatId",
      "chatIdSource",
      "providerAddress",
      "modelId",
      "providerModelId",
    ]) ||
    typeof rawInput.reference.chatId !== "string" ||
    !CHAT_ID_RE.test(rawInput.reference.chatId) ||
    (rawInput.reference.chatIdSource !== "ZG-Res-Key" &&
      rawInput.reference.chatIdSource !== "response.id") ||
    typeof rawInput.reference.providerAddress !== "string" ||
    !EVM_ADDRESS_RE.test(rawInput.reference.providerAddress) ||
    typeof rawInput.reference.modelId !== "string" ||
    !MODEL_ID_RE.test(rawInput.reference.modelId) ||
    typeof rawInput.reference.providerModelId !== "string" ||
    !MODEL_ID_RE.test(rawInput.reference.providerModelId)
  ) {
    throw verificationError(
      "TEEML_CONFIG_ERROR",
      "VERIFICATION_INPUT_INVALID",
      "BEFORE_VERIFICATION",
    );
  }

  return rawInput;
}

function assertEligibleProvider(
  rawProvider: ZeroGOnChainProvider,
  expectedAddress: string,
  expectedModel: string,
  securityProfile: ZeroGSecurityProfile,
): string {
  if (
    !isRecord(rawProvider) ||
    typeof rawProvider.providerAddress !== "string" ||
    !EVM_ADDRESS_RE.test(rawProvider.providerAddress) ||
    rawProvider.providerAddress.toLowerCase() !==
      expectedAddress.toLowerCase() ||
    typeof rawProvider.model !== "string" ||
    rawProvider.model !== expectedModel ||
    rawProvider.verifiability !== "TeeML" ||
    rawProvider.teeSignerAcknowledged !== true ||
    typeof rawProvider.teeSignerAddress !== "string" ||
    !EVM_ADDRESS_RE.test(rawProvider.teeSignerAddress) ||
    typeof rawProvider.additionalInfo !== "string"
  ) {
    throw verificationError(
      "TEEML_NOT_VERIFIED",
      "ONCHAIN_PROVIDER_INELIGIBLE",
      "PROVIDER_RESPONSE",
    );
  }

  const additionalInfo = parseAdditionalInfo(rawProvider.additionalInfo);
  const rawProviderType = additionalInfo.ProviderType;
  if (
    rawProviderType !== undefined &&
    rawProviderType !== "centralized" &&
    rawProviderType !== "decentralized"
  ) {
    throw verificationError(
      "TEEML_NOT_VERIFIED",
      "ONCHAIN_PROVIDER_INELIGIBLE",
      "PROVIDER_RESPONSE",
    );
  }
  const providerType = rawProviderType ?? "decentralized";
  const rawTargetSeparated = additionalInfo.TargetSeparated;
  if (
    rawTargetSeparated !== undefined &&
    typeof rawTargetSeparated !== "boolean"
  ) {
    throw verificationError(
      "TEEML_NOT_VERIFIED",
      "ONCHAIN_PROVIDER_INELIGIBLE",
      "PROVIDER_RESPONSE",
    );
  }
  const targetTeeAddress = additionalInfo.TargetTeeAddress;
  if (
    targetTeeAddress !== undefined &&
    (typeof targetTeeAddress !== "string" ||
      (targetTeeAddress.length > 0 &&
        !EVM_ADDRESS_RE.test(targetTeeAddress)))
  ) {
    throw verificationError(
      "TEEML_NOT_VERIFIED",
      "ONCHAIN_PROVIDER_INELIGIBLE",
      "PROVIDER_RESPONSE",
    );
  }

  let signingAddress = rawProvider.teeSignerAddress;
  if (rawTargetSeparated === true) {
    if (providerType === "centralized") {
      // SECURITY(hackathon-only): TeeTLS verifies the broker TEE and signed
      // response, but the upstream model may process plaintext. Production
      // keeps the stricter decentralized Private/TeeML signer path below.
      if (securityProfile !== HACKATHON_TESTNET_TEETLS_PROFILE) {
        throw verificationError(
          "TEEML_NOT_VERIFIED",
          "ONCHAIN_PROVIDER_INELIGIBLE",
          "PROVIDER_RESPONSE",
        );
      }
    } else {
      if (
        typeof targetTeeAddress !== "string" ||
        !EVM_ADDRESS_RE.test(targetTeeAddress)
      ) {
        throw verificationError(
          "TEEML_NOT_VERIFIED",
          "ONCHAIN_PROVIDER_INELIGIBLE",
          "PROVIDER_RESPONSE",
        );
      }
      signingAddress = targetTeeAddress;
    }
  }

  return signingAddress;
}

function parseOnChainProvider(value: unknown): ZeroGOnChainProvider {
  const providerAddress = readStringProperty(value, "provider");
  const providerUrl = readStringProperty(value, "url");
  const model = readStringProperty(value, "model");
  const verifiability = readStringProperty(value, "verifiability");
  const additionalInfo = readStringProperty(value, "additionalInfo");
  const teeSignerAddress = readStringProperty(value, "teeSignerAddress");
  const teeSignerAcknowledged = readBooleanProperty(
    value,
    "teeSignerAcknowledged",
  );

  if (
    providerAddress === undefined ||
    providerUrl === undefined ||
    model === undefined ||
    verifiability === undefined ||
    additionalInfo === undefined ||
    teeSignerAddress === undefined ||
    teeSignerAcknowledged === undefined
  ) {
    throw new Error("ONCHAIN_PROVIDER_INVALID");
  }
  return {
    providerAddress,
    providerUrl,
    model,
    verifiability,
    additionalInfo,
    teeSignerAddress,
    teeSignerAcknowledged,
  };
}

function parseAdditionalInfo(value: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!isRecord(parsed)) {
      throw new Error("ADDITIONAL_INFO_INVALID");
    }
    return parsed;
  } catch {
    throw verificationError(
      "TEEML_NOT_VERIFIED",
      "ONCHAIN_PROVIDER_INELIGIBLE",
      "PROVIDER_RESPONSE",
    );
  }
}

function buildSignatureUrl(
  providerUrl: string,
  chatId: string,
  modelId: string,
): URL {
  let baseUrl: URL;
  try {
    baseUrl = new URL(providerUrl);
  } catch {
    throw verificationError(
      "TEEML_NOT_VERIFIED",
      "ONCHAIN_PROVIDER_INELIGIBLE",
      "PROVIDER_RESPONSE",
    );
  }
  const normalizedHostname = normalizeProviderHostname(baseUrl.hostname);
  if (
    baseUrl.protocol !== "https:" ||
    baseUrl.username !== "" ||
    baseUrl.password !== "" ||
    normalizedHostname.length === 0 ||
    isIP(normalizedHostname) !== 0 ||
    isForbiddenProviderHostname(normalizedHostname) ||
    baseUrl.search !== "" ||
    baseUrl.hash !== ""
  ) {
    throw verificationError(
      "TEEML_NOT_VERIFIED",
      "ONCHAIN_PROVIDER_INELIGIBLE",
      "PROVIDER_RESPONSE",
    );
  }
  baseUrl.hostname = normalizedHostname;

  const normalizedBase = baseUrl.toString().replace(/\/+$/, "");
  const signatureUrl = new URL(
    `${normalizedBase}/v1/proxy/signature/${encodeURIComponent(chatId)}`,
  );
  signatureUrl.searchParams.set("model", modelId);
  return signatureUrl;
}

function createPinnedProviderFetch(
  resolveProviderAddresses: ZeroGProviderAddressResolver,
): ZeroGFetch {
  const lookup = createPinnedProviderLookup(resolveProviderAddresses);
  return (async (input, init) => {
    if (input instanceof Request) {
      throw new Error("PROVIDER_REQUEST_INVALID");
    }
    const url = input instanceof URL ? input : new URL(input);
    if (
      url.protocol !== "https:" ||
      normalizeProviderHostname(url.hostname).length === 0 ||
      init?.method !== "GET" ||
      init.redirect !== "error" ||
      (init.body !== undefined && init.body !== null)
    ) {
      throw new Error("PROVIDER_REQUEST_INVALID");
    }

    const headers: Record<string, string> = {};
    new Headers(init.headers).forEach((value, key) => {
      headers[key] = value;
    });

    return await new Promise<Response>((resolve, reject) => {
      const request = httpsRequest(
        url,
        {
          agent: false,
          headers,
          lookup,
          method: "GET",
          signal: init.signal ?? undefined,
        },
        (incoming) => {
          try {
            const status = incoming.statusCode;
            if (
              status === undefined ||
              status < 200 ||
              status > 599 ||
              isBodylessHttpResponseStatus(status)
            ) {
              incoming.destroy();
              reject(new Error("PROVIDER_RESPONSE_INVALID"));
              return;
            }
            const responseHeaders = new Headers();
            for (const [key, value] of Object.entries(incoming.headers)) {
              if (Array.isArray(value)) {
                for (const item of value) responseHeaders.append(key, item);
              } else if (value !== undefined) {
                responseHeaders.set(key, value);
              }
            }
            resolve(
              new Response(
                Readable.toWeb(incoming) as ReadableStream<Uint8Array>,
                {
                  headers: responseHeaders,
                  status,
                  statusText: incoming.statusMessage,
                },
              ),
            );
          } catch {
            incoming.destroy();
            reject(new Error("PROVIDER_RESPONSE_INVALID"));
          }
        },
      );
      request.once("error", reject);
      request.end();
    });
  }) as ZeroGFetch;
}

export function isBodylessHttpResponseStatus(status: number): boolean {
  return status === 204 || status === 205 || status === 304;
}

export function createPinnedProviderLookup(
  resolveProviderAddresses: ZeroGProviderAddressResolver,
): LookupFunction {
  return (hostname, options, callback) => {
    void resolveProviderAddresses(normalizeProviderHostname(hostname)).then(
      (addresses) => {
        try {
          const selected = selectPinnedPublicProviderAddress(addresses);
          if (options.all === true) {
            callback(null, [selected]);
          } else {
            callback(null, selected.address, selected.family);
          }
        } catch {
          callback(providerAddressError(), "", 0);
        }
      },
      () => callback(providerAddressError(), "", 0),
    );
  };
}

async function resolveProviderAddressesWithSystemDns(
  hostname: string,
): Promise<readonly ZeroGProviderAddress[]> {
  return await dnsLookup(hostname, { all: true, verbatim: true });
}

export function selectPinnedPublicProviderAddress(
  addresses: readonly ZeroGProviderAddress[],
): ZeroGProviderAddress {
  if (!Array.isArray(addresses) || addresses.length === 0) {
    throw providerAddressError();
  }
  const normalized = addresses.map((candidate) => {
    if (
      !candidate ||
      typeof candidate.address !== "string" ||
      (candidate.family !== 4 && candidate.family !== 6) ||
      isIP(candidate.address) !== candidate.family ||
      isForbiddenIpAddress(candidate.address)
    ) {
      throw providerAddressError();
    }
    return {
      address: candidate.address,
      family: candidate.family,
    };
  });
  return normalized[0];
}

function providerAddressError(): NodeJS.ErrnoException {
  const error = new Error(
    "PROVIDER_ADDRESS_FORBIDDEN",
  ) as NodeJS.ErrnoException;
  error.code = "EACCES";
  return error;
}

type SignedResponse = Readonly<{
  text: string;
  signature: string;
}>;

async function parseSignedResponse(
  response: Response,
): Promise<SignedResponse> {
  let rawBody: string | undefined;
  try {
    rawBody = await readBoundedResponseText(
      response,
      MAX_SIGNATURE_RESPONSE_BYTES,
    );
    if (rawBody.length === 0) {
      throw new Error("SIGNATURE_RESPONSE_SIZE_INVALID");
    }
    const parsed: unknown = JSON.parse(rawBody);
    if (
      !isRecord(parsed) ||
      !hasOnlyKeys(parsed, ["text", "signature"]) ||
      typeof parsed.text !== "string" ||
      parsed.text.length === 0 ||
      parsed.text.length > MAX_SIGNED_CONTENT_CHARS ||
      typeof parsed.signature !== "string" ||
      !EVM_SIGNATURE_RE.test(parsed.signature)
    ) {
      throw new Error("SIGNATURE_RESPONSE_SCHEMA_INVALID");
    }
    return { text: parsed.text, signature: parsed.signature };
  } catch {
    throw verificationError(
      "TEEML_NOT_VERIFIED",
      "SIGNATURE_RESPONSE_INVALID",
      "PROVIDER_RESPONSE",
    );
  } finally {
    rawBody = undefined;
  }
}

async function readBoundedResponseText(
  response: Response,
  maxBytes: number,
): Promise<string> {
  const contentLength = response.headers.get("content-length");
  if (contentLength !== null) {
    const parsedLength = Number(contentLength);
    if (
      !Number.isSafeInteger(parsedLength) ||
      parsedLength < 0 ||
      parsedLength > maxBytes
    ) {
      throw new Error("SIGNATURE_RESPONSE_SIZE_INVALID");
    }
  }
  if (!response.body) {
    throw new Error("SIGNATURE_RESPONSE_BODY_MISSING");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let text = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      totalBytes += chunk.value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw new Error("SIGNATURE_RESPONSE_SIZE_INVALID");
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    return text;
  } finally {
    reader.releaseLock();
  }
}

function isForbiddenProviderHostname(hostname: string): boolean {
  const normalized = normalizeProviderHostname(hostname);
  if (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local") ||
    normalized.endsWith(".internal")
  ) {
    return true;
  }

  const ipVersion = isIP(normalized);
  return ipVersion !== 0 && isForbiddenIpAddress(normalized);
}

function isForbiddenIpAddress(address: string): boolean {
  const normalized = address.toLowerCase().replace(/^\[|\]$/g, "");
  const ipVersion = isIP(normalized);
  if (ipVersion === 4) {
    const [first, second] = normalized.split(".").map(Number);
    return (
      first === 0 ||
      first === 10 ||
      first === 127 ||
      (first === 100 && second >= 64 && second <= 127) ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168) ||
      (first === 198 && (second === 18 || second === 19)) ||
      first >= 224
    );
  }
  if (ipVersion === 6) {
    const hextets = expandIpv6Hextets(normalized);
    if (!hextets) return true;
    // Provider egress accepts only the currently allocated global-unicast
    // block. This rejects multicast, local, mapped, documentation, transition,
    // and reserved IPv6 ranges by default.
    return (
      hextets[0]! < 0x2000 ||
      hextets[0]! > 0x3fff ||
      (hextets[0] === 0x2001 && hextets[1] === 0) ||
      (hextets[0] === 0x2001 && hextets[1] === 0x0db8) ||
      hextets[0] === 0x2002 ||
      hextets[0] === 0x3ffe
    );
  }
  return false;
}

function expandIpv6Hextets(address: string): number[] | null {
  const sections = address.split("::");
  if (sections.length > 2) return null;
  const left = sections[0] ? sections[0].split(":") : [];
  const right =
    sections.length === 2 && sections[1] ? sections[1].split(":") : [];
  if (sections.length === 1 && left.length !== 8) return null;
  const missing = 8 - left.length - right.length;
  if (missing < 0 || (sections.length === 2 && missing < 1)) {
    return null;
  }
  const hextets = [
    ...left,
    ...Array.from({ length: missing }, () => "0"),
    ...right,
  ].map((value) => Number.parseInt(value, 16));
  return hextets.length === 8 &&
    hextets.every(
      (value) => Number.isInteger(value) && value >= 0 && value <= 0xffff,
    )
    ? hextets
    : null;
}

function normalizeProviderHostname(hostname: string): string {
  return hostname
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.+$/, "");
}

function parseTimeout(value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0 || value > MAX_TIMEOUT_MS) {
    throw verificationError(
      "TEEML_CONFIG_ERROR",
      "VERIFICATION_INPUT_INVALID",
      "BEFORE_VERIFICATION",
    );
  }
  return value;
}

function remainingTime(deadline: number, now: number): number {
  const remaining = Math.floor(deadline - now);
  if (!Number.isSafeInteger(remaining) || remaining <= 0) {
    throw verificationError(
      "TEEML_TIMEOUT",
      "ONCHAIN_PROVIDER_TIMEOUT",
      "PROVIDER_RESPONSE",
    );
  }
  return remaining;
}

function verificationError(
  code: ZeroGSignedResponseVerificationErrorCode,
  reason: ZeroGSignedResponseVerificationFailureReason,
  stage: "BEFORE_VERIFICATION" | "PROVIDER_RESPONSE",
  httpStatus?: number,
): ZeroGSignedResponseVerificationError {
  return new ZeroGSignedResponseVerificationError({
    code,
    reason,
    stage,
    ...(httpStatus === undefined ? {} : { httpStatus }),
  });
}

function readStringProperty(
  value: unknown,
  property: string,
): string | undefined {
  if (value === null || typeof value !== "object") {
    return undefined;
  }
  const candidate = (value as Record<string, unknown>)[property];
  return typeof candidate === "string" ? candidate : undefined;
}

function readBooleanProperty(
  value: unknown,
  property: string,
): boolean | undefined {
  if (value === null || typeof value !== "object") {
    return undefined;
  }
  const candidate = (value as Record<string, unknown>)[property];
  return typeof candidate === "boolean" ? candidate : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
): boolean {
  const allowedKeys = new Set(allowed);
  return (
    Object.keys(value).length === allowed.length &&
    Object.keys(value).every((key) => allowedKeys.has(key))
  );
}
