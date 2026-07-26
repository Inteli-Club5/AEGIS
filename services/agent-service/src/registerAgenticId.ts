import {
  getAddress,
  isAddress,
  keccak256,
  stringToHex,
  type Hex,
} from "viem";
import {
  buildAgenticIdRegistrationCommitment,
  buildCanonicalAgentProfileMetadata,
  buildCanonicalAgenticIdIntelligentData,
  stableStringify,
} from "../../../packages/agentic-id-contract/index.js";
import { getAgent, setAgentAgenticId } from "./store.js";
import {
  buildAgentSemanticProfile,
  normalizeAgentCapabilityIds,
  type AgentSemanticProfile,
} from "./teeml/agent-semantic-profile.js";
import {
  AgenticIdRegistrationStoreError,
  type AgenticIdRegistrationRepository,
} from "./teeml/agentic-id-registration.js";
import type { AgentProfile } from "./types.js";

const DEFAULT_AGENTIC_ID_CONTRACT =
  "0x2700F6A3e505402C9daB154C5c6ab9cAEC98EF1F";
const DEFAULT_ZERO_G_GALILEO_CHAIN_ID = 16602;
const MAX_DASHBOARD_RESPONSE_BYTES = 256 * 1024;
const DEFAULT_AGENTIC_ID_REQUEST_TIMEOUT_MS = 300_000;
const MAX_AGENTIC_ID_REQUEST_TIMEOUT_MS = 900_000;
const MIN_INTERNAL_TOKEN_LENGTH = 32;
const activeRegistrations = new Map<string, Promise<AgentProfile>>();

export class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function getDashboardUrl(): string {
  let url: URL;
  try {
    url = new URL(
      process.env.AEGIS_DASHBOARD_URL ?? "http://localhost:3000",
    );
  } catch {
    throw new HttpError(500, "AEGIS_DASHBOARD_URL is invalid");
  }
  const localHttp =
    url.protocol === "http:" &&
    (url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      url.hostname === "[::1]");
  if (
    (url.protocol !== "https:" && !localHttp) ||
    url.username !== "" ||
    url.password !== "" ||
    url.search !== "" ||
    url.hash !== "" ||
    (url.pathname !== "/" && url.pathname !== "")
  ) {
    throw new HttpError(500, "AEGIS_DASHBOARD_URL is invalid");
  }
  return url.origin;
}

export type RegisterAgenticIdDependencies = {
  registrationRepository?: AgenticIdRegistrationRepository;
  policyHash?: Hex;
  now?: () => number;
};

export async function registerAgenticId(
  agentId: string,
  dependencies: RegisterAgenticIdDependencies = {},
): Promise<AgentProfile> {
  const active = activeRegistrations.get(agentId);
  if (active) return await active;

  const registration = performAgenticIdRegistration(agentId, dependencies);
  activeRegistrations.set(agentId, registration);
  try {
    return await registration;
  } finally {
    if (activeRegistrations.get(agentId) === registration) {
      activeRegistrations.delete(agentId);
    }
  }
}

async function performAgenticIdRegistration(
  agentId: string,
  dependencies: RegisterAgenticIdDependencies,
): Promise<AgentProfile> {
  const profile = getAgent(agentId);
  if (!profile) throw new Error("agent_not_found");
  if (!profile.safeAddress) throw new Error("agent_wallet_not_created");
  if (!isAddress(profile.ownerWallet)) {
    throw new HttpError(
      400,
      "ownerWallet must be a valid EVM address to register an Agentic ID",
    );
  }
  if (!isAddress(profile.safeAddress)) {
    throw new HttpError(
      409,
      "agent Safe wallet must be a valid EVM address to register an Agentic ID",
    );
  }
  if (!dependencies.registrationRepository) {
    throw new HttpError(503, "agentic_id_registration_store_unavailable");
  }

  const request = buildNormalizedRegistrationRequest(
    profile,
    requirePolicyHash(dependencies.policyHash),
  );
  const expectedContractAddress = getExpectedAgenticIdContractAddress();
  const expectedChainId = getExpectedAgenticIdChainId();
  request.expectedAgenticIdContractAddress = expectedContractAddress;
  request.expectedChainId = expectedChainId;
  const registrationHash = buildAgenticIdRegistrationHash({
    request,
    expectedContractAddress,
    expectedChainId,
  });
  const now = dependencies.now ?? (() => Math.floor(Date.now() / 1_000));
  const registrationIdentity = {
    agentId: request.aegisAgentId,
    registrationHash,
    ownerAddress: request.ownerAddress.toLowerCase() as `0x${string}`,
    safeAddress: request.agentWalletAddress.toLowerCase() as `0x${string}`,
  };
  let completedRegistration;
  try {
    completedRegistration =
      await dependencies.registrationRepository.findCompleted(
        registrationIdentity,
      );
  } catch (error) {
    throw mapRegistrationStoreError(error);
  }
  if (completedRegistration) {
    validateCompletedRegistration(
      profile,
      completedRegistration.semanticProfile,
      request,
      expectedContractAddress,
    );
    return hydrateAgenticId(
      agentId,
      completedRegistration.semanticProfile,
      completedRegistration.metadataURI,
      completedRegistration.explorerUrl,
    );
  }

  const dashboardUrl = getDashboardUrl();
  const internalToken = getAgenticIdInternalToken();
  const requestTimeoutMs = getAgenticIdRegistrationTimeoutMs();
  const claimedAt = now();

  let claim;
  try {
    claim = await dependencies.registrationRepository.claim({
      ...registrationIdentity,
      now: claimedAt,
    });
  } catch (error) {
    throw mapRegistrationStoreError(error);
  }

  if (claim.status === "IN_PROGRESS" || claim.status === "UNKNOWN") {
    throw new HttpError(
      409,
      "agentic_id_registration_requires_reconciliation",
    );
  }
  if (claim.status === "COMPLETED") {
    validateCompletedRegistration(
      profile,
      claim.semanticProfile,
      request,
      expectedContractAddress,
    );
    return hydrateAgenticId(
      agentId,
      claim.semanticProfile,
      claim.metadataURI,
      claim.explorerUrl,
    );
  }

  if (profile.agenticId) {
    await markRegistrationUnknown(
      dependencies.registrationRepository,
      request.aegisAgentId,
      registrationHash,
      now(),
    );
    throw new HttpError(
      409,
      "agentic_id_registration_requires_reconciliation",
    );
  }

  let completed = false;
  try {
    const response = await fetch(`${dashboardUrl}/api/0g/agentic-id`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": registrationHash,
        Authorization: `Bearer ${internalToken}`,
      },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(requestTimeoutMs),
    });
    const body = await readBoundedJsonResponse(response);
    if (!response.ok) {
      throw new HttpError(
        response.status,
        `0G Agentic ID registration failed with status ${response.status}`,
      );
    }

    const responseFields = parseSuccessfulResponse(body);
    validateSuccessfulResponse(
      responseFields,
      request,
      expectedContractAddress,
      expectedChainId,
    );
    const semanticProfile = buildAgentSemanticProfile({
      agentId: request.aegisAgentId,
      contractAddress: responseFields.agenticIdContractAddress,
      tokenId: responseFields.agenticIdTokenId,
      metadataHash: responseFields.metadataHash,
      toolNames: request.capabilities,
    });
    const completedAt = now();
    await dependencies.registrationRepository.complete({
      agentId: request.aegisAgentId,
      registrationHash,
      semanticProfile,
      metadataURI: responseFields.metadataURI,
      explorerUrl: responseFields.explorerUrl,
      completedAt,
    });
    completed = true;
    return hydrateAgenticId(
      agentId,
      {
        ...semanticProfile,
        capabilityIds: [...semanticProfile.capabilityIds],
        registeredAt: completedAt,
        updatedAt: completedAt,
      },
      responseFields.metadataURI,
      responseFields.explorerUrl,
    );
  } catch (error) {
    if (!completed) {
      await markRegistrationUnknown(
        dependencies.registrationRepository,
        request.aegisAgentId,
        registrationHash,
        now(),
      );
    }
    if (error instanceof HttpError) throw error;
    if (error instanceof AgenticIdRegistrationStoreError) {
      throw mapRegistrationStoreError(error);
    }
    throw new HttpError(502, "0G Agentic ID registration result is unknown");
  }
}

type NormalizedRegistrationRequest = {
  aegisAgentId: string;
  ownerAddress: `0x${string}`;
  agentName: string;
  agentDescription: string;
  agentType: string;
  capabilities: readonly string[];
  agentWalletAddress: `0x${string}`;
  policyHash: Hex;
  expectedAgenticIdContractAddress?: `0x${string}`;
  expectedChainId?: number;
};

type SuccessfulAgenticIdResponse = {
  aegisAgentId: string;
  chainId: number;
  agenticIdTokenId: string;
  agenticIdContractAddress: string;
  metadataHash: string;
  metadataURI: string;
  explorerUrl: string;
  ownerAddress: string;
  finalTokenOwner: string;
  metadata: Record<string, unknown>;
  intelligentData: unknown[];
};

function buildNormalizedRegistrationRequest(
  profile: AgentProfile,
  policyHash: Hex,
): NormalizedRegistrationRequest {
  const aegisAgentId = profile.agentId.trim().toLowerCase();
  const agentName = profile.name.trim();
  const agentDescription = (profile.description || profile.name).trim();
  const agentType = profile.type.trim();
  if (
    aegisAgentId.length === 0 ||
    agentName.length === 0 ||
    agentDescription.length === 0 ||
    agentType.length === 0
  ) {
    throw new HttpError(400, "agent profile is invalid for Agentic ID registration");
  }
  return {
    aegisAgentId,
    ownerAddress: getAddress(profile.ownerWallet),
    agentName,
    agentDescription,
    agentType,
    capabilities: normalizeAgentCapabilityIds(profile.toolNames),
    agentWalletAddress: getAddress(profile.safeAddress!),
    policyHash,
  };
}

function requirePolicyHash(value: Hex | undefined): Hex {
  if (
    typeof value !== "string" ||
    !/^0x[0-9a-fA-F]{64}$/.test(value) ||
    /^0x0{64}$/i.test(value)
  ) {
    throw new HttpError(
      409,
      "an active non-zero policyHash is required for Agentic ID registration",
    );
  }
  return value.toLowerCase() as Hex;
}

function getExpectedAgenticIdContractAddress(): `0x${string}` {
  const configured =
    process.env.ZERO_G_AGENTIC_ID_CONTRACT_ADDRESS ??
    process.env.AGENTIC_ID_CONTRACT ??
    DEFAULT_AGENTIC_ID_CONTRACT;
  if (!isAddress(configured)) {
    throw new HttpError(
      500,
      "ZERO_G_AGENTIC_ID_CONTRACT_ADDRESS is invalid",
    );
  }
  return getAddress(configured);
}

function getExpectedAgenticIdChainId(): number {
  const configured =
    process.env.ZERO_G_GALILEO_CHAIN_ID ??
    String(DEFAULT_ZERO_G_GALILEO_CHAIN_ID);
  const chainId = Number(configured);
  if (!Number.isSafeInteger(chainId) || chainId <= 0) {
    throw new HttpError(500, "ZERO_G_GALILEO_CHAIN_ID is invalid");
  }
  return chainId;
}

function getAgenticIdInternalToken(): string {
  const token = process.env.AEGIS_AGENTIC_ID_INTERNAL_TOKEN;
  if (!token || token.length < MIN_INTERNAL_TOKEN_LENGTH) {
    throw new HttpError(
      503,
      "AEGIS_AGENTIC_ID_INTERNAL_TOKEN is not configured",
    );
  }
  return token;
}

function getAgenticIdRegistrationTimeoutMs(): number {
  const configured =
    process.env.AEGIS_AGENTIC_ID_REGISTRATION_TIMEOUT_MS ??
    String(DEFAULT_AGENTIC_ID_REQUEST_TIMEOUT_MS);
  const timeoutMs = Number(configured);
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs <= 0 ||
    timeoutMs > MAX_AGENTIC_ID_REQUEST_TIMEOUT_MS
  ) {
    throw new HttpError(
      500,
      "AEGIS_AGENTIC_ID_REGISTRATION_TIMEOUT_MS is invalid",
    );
  }
  return timeoutMs;
}

function buildAgenticIdRegistrationHash(input: {
  request: NormalizedRegistrationRequest;
  expectedContractAddress: `0x${string}`;
  expectedChainId: number;
}): Hex {
  return keccak256(
    stringToHex(
      stableStringify(
        buildAgenticIdRegistrationCommitment({
          request: input.request,
          chainId: input.expectedChainId,
          contractAddress: input.expectedContractAddress.toLowerCase(),
        }),
      ),
    ),
  );
}

async function readBoundedJsonResponse(response: Response): Promise<unknown> {
  if (!response.body) {
    throw new HttpError(
      502,
      "0G Agentic ID registration response is invalid",
    );
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_DASHBOARD_RESPONSE_BYTES) {
        await reader.cancel();
        throw new HttpError(
          502,
          "0G Agentic ID registration response is invalid",
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new HttpError(
      502,
      "0G Agentic ID registration response is invalid",
    );
  }
}

function parseSuccessfulResponse(body: unknown): SuccessfulAgenticIdResponse {
  if (!isRecord(body)) return invalidRegistrationResponse();
  const metadata = body.metadata;
  const intelligentData = body.intelligentData;
  if (!isRecord(metadata) || !Array.isArray(intelligentData)) {
    return invalidRegistrationResponse();
  }
  const chainId = body.chainId;
  if (!Number.isSafeInteger(chainId) || (chainId as number) <= 0) {
    return invalidRegistrationResponse();
  }
  const fields: SuccessfulAgenticIdResponse = {
    aegisAgentId: requiredResponseString(body, "aegisAgentId"),
    chainId: chainId as number,
    agenticIdTokenId: requiredResponseString(body, "agenticIdTokenId"),
    agenticIdContractAddress: requiredResponseString(
      body,
      "agenticIdContractAddress",
    ),
    metadataHash: requiredResponseString(body, "metadataHash"),
    metadataURI: requiredResponseString(body, "metadataURI"),
    explorerUrl: requiredResponseString(body, "explorerUrl"),
    ownerAddress: requiredResponseString(body, "ownerAddress"),
    finalTokenOwner: requiredResponseString(body, "finalTokenOwner"),
    metadata,
    intelligentData,
  };
  if (fields.metadataURI.length > 2_048 || fields.explorerUrl.length > 2_048) {
    return invalidRegistrationResponse();
  }
  return fields;
}

function validateSuccessfulResponse(
  response: SuccessfulAgenticIdResponse,
  request: NormalizedRegistrationRequest,
  expectedContractAddress: `0x${string}`,
  expectedChainId: number,
): void {
  const expectedMetadata = buildExpectedMetadata(request);
  const expectedMetadataHash = keccak256(
    stringToHex(stableStringify(expectedMetadata)),
  );
  const expectedIntelligentData = buildExpectedIntelligentData(
    request,
    expectedMetadataHash,
  );
  if (
    response.aegisAgentId !== request.aegisAgentId ||
    response.chainId !== expectedChainId ||
    !sameAddress(response.ownerAddress, request.ownerAddress) ||
    !sameAddress(response.finalTokenOwner, request.ownerAddress) ||
    !sameAddress(
      response.agenticIdContractAddress,
      expectedContractAddress,
    ) ||
    response.metadataHash.toLowerCase() !==
      expectedMetadataHash.toLowerCase() ||
    stableStringify(response.metadata) !== stableStringify(expectedMetadata) ||
    stableStringify(response.intelligentData) !==
      stableStringify(expectedIntelligentData)
  ) {
    invalidRegistrationResponse();
  }
}

function validateCompletedRegistration(
  inMemoryProfile: AgentProfile,
  durableProfile: {
    agentId: string;
    agenticId: string;
    contractAddress: `0x${string}`;
    tokenId: string;
    metadataHash: Hex;
    capabilityIds: readonly string[];
  },
  request: NormalizedRegistrationRequest,
  expectedContractAddress: `0x${string}`,
): void {
  const expectedCapabilities = [...request.capabilities];
  const durableCapabilities = [...durableProfile.capabilityIds].sort();
  if (
    durableProfile.agentId !== request.aegisAgentId ||
    durableProfile.contractAddress !==
      expectedContractAddress.toLowerCase() ||
    JSON.stringify(durableCapabilities) !==
      JSON.stringify(expectedCapabilities)
  ) {
    throw new HttpError(409, "agentic_id_registration_conflict");
  }
  if (
    inMemoryProfile.agenticId &&
    (
      inMemoryProfile.agenticId.agenticId !== durableProfile.agenticId ||
      inMemoryProfile.agenticId.contractAddress.toLowerCase() !==
        durableProfile.contractAddress ||
      inMemoryProfile.agenticId.tokenId !== durableProfile.tokenId ||
      inMemoryProfile.agenticId.metadataHash.toLowerCase() !==
        durableProfile.metadataHash ||
      JSON.stringify([...inMemoryProfile.agenticId.capabilityIds].sort()) !==
        JSON.stringify(expectedCapabilities)
    )
  ) {
    throw new HttpError(409, "agentic_id_registration_conflict");
  }
}

function buildExpectedMetadata(
  request: NormalizedRegistrationRequest,
): Record<string, unknown> {
  return buildCanonicalAgentProfileMetadata(request);
}

function buildExpectedIntelligentData(
  request: NormalizedRegistrationRequest,
  metadataHash: Hex,
): Array<{ dataDescription: string; dataHash: Hex }> {
  return buildCanonicalAgenticIdIntelligentData(
    request,
    metadataHash,
    hashAgenticField,
  );
}

function hashAgenticField(value: unknown): Hex {
  const normalizedValue =
    typeof value === "string" ? value.trim() : stableStringify(value);
  return keccak256(stringToHex(normalizedValue));
}

function sameAddress(left: string, right: string): boolean {
  return (
    isAddress(left) &&
    isAddress(right) &&
    getAddress(left).toLowerCase() === getAddress(right).toLowerCase()
  );
}

function requiredResponseString(
  body: Record<string, unknown>,
  field: keyof SuccessfulAgenticIdResponse,
): string {
  const value = body[field];
  if (typeof value !== "string" || value.length === 0) {
    return invalidRegistrationResponse();
  }
  return value;
}

function invalidRegistrationResponse(): never {
  throw new HttpError(502, "0G Agentic ID registration response is invalid");
}

async function markRegistrationUnknown(
  repository: AgenticIdRegistrationRepository,
  agentId: string,
  registrationHash: Hex,
  now: number,
): Promise<void> {
  try {
    await repository.markUnknown({ agentId, registrationHash, now });
  } catch {
    throw new HttpError(500, "agentic_id_registration_state_unknown");
  }
}

function mapRegistrationStoreError(error: unknown): HttpError {
  if (error instanceof AgenticIdRegistrationStoreError) {
    if (error.code === "CONFLICT") {
      return new HttpError(409, "agentic_id_registration_conflict");
    }
    if (error.code === "INVALID_STATE") {
      return new HttpError(
        409,
        "agentic_id_registration_requires_reconciliation",
      );
    }
  }
  return new HttpError(503, "agentic_id_registration_store_unavailable");
}

function hydrateAgenticId(
  agentId: string,
  semanticProfile: AgentSemanticProfile & {
    registeredAt?: number;
    updatedAt?: number;
  },
  metadataURI: string,
  explorerUrl: string,
): AgentProfile {
  const updated = setAgentAgenticId(agentId, {
    agenticId: semanticProfile.agenticId,
    tokenId: semanticProfile.tokenId,
    contractAddress: semanticProfile.contractAddress,
    metadataHash: semanticProfile.metadataHash,
    capabilityIds: [...semanticProfile.capabilityIds],
    metadataURI,
    explorerUrl,
  });
  if (!updated) throw new Error("agent_not_found");
  return updated;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
