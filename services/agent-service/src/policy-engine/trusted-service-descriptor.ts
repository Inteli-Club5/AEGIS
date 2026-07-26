import { badRequest } from "./errors.js";
import {
  HEDERA_TESTNET_CHAIN_ID,
  MAX_SEMANTIC_RULE_STRING_LENGTH,
  MAX_TRUSTED_SERVICE_SET_ITEMS,
  NETWORK_ID,
  TRUSTED_SERVICE_DESCRIPTOR_RULE_KIND,
  type DestinationIdentity,
  type SemanticRule,
  type TrustedServiceDescriptorV1,
} from "./types.js";

const EVM_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const HEDERA_ACCOUNT_ID_RE = /^\d+\.\d+\.\d+$/;
const HEX32_RE = /^0x[a-fA-F0-9]{64}$/;
const IDENTIFIER_RE = /^[a-z0-9][a-z0-9._:-]*$/;
const INSTRUCTION_SHAPED_TEXT_RE =
  /\b(?:ignore|disregard|override|forget)\b.{0,64}\b(?:instruction|prompt|rule)s?\b|\b(?:return|respond|output)\b.{0,32}\b(?:allow|deny|json)\b|\bsystem\s+prompt\b|\byou\s+are\b|\bact\s+as\b/i;
const HTML_TAG_RE = /<\/?[a-z][^>]*>/i;
const MARKDOWN_RE =
  /```|`[^`]+`|!\[[^\]]*]\([^)]+\)|\[[^\]]+]\([^)]+\)|(?:^|\s)#{1,6}\s|(?:^|\s)(?:[-+*]|\d+\.)\s|(?:\*\*|__)[^*_]+(?:\*\*|__)/;

export type TrustedServiceDescriptorSelector = {
  serviceId: string;
  productId?: string;
  destination: DestinationIdentity;
};

export function normalizeTrustedServiceDescriptor(input: unknown, path: string): TrustedServiceDescriptorV1 {
  const descriptor = objectOf(input, path);
  rejectUnknownKeys(
    descriptor,
    [
      "schemaVersion",
      "providerId",
      "serviceId",
      "productId",
      "networkId",
      "destinationIds",
      "categoryIds",
      "capabilityIds",
      "metadataHash",
      "shortDescription",
    ],
    path,
  );

  if (descriptor.schemaVersion !== "1.0") {
    badRequest("unsupported_trusted_service_descriptor_schema", `${path}.schemaVersion must be 1.0`);
  }
  if (descriptor.networkId !== NETWORK_ID) {
    badRequest("unsupported_trusted_service_network", `${path}.networkId must be ${NETWORK_ID}`);
  }

  const productId = descriptor.productId === undefined ? undefined : normalizedIdentifier(descriptor.productId, `${path}.productId`);
  const shortDescription =
    descriptor.shortDescription === undefined ? undefined : normalizedDescription(descriptor.shortDescription, `${path}.shortDescription`);

  return {
    schemaVersion: "1.0",
    providerId: normalizedIdentifier(descriptor.providerId, `${path}.providerId`),
    serviceId: normalizedIdentifier(descriptor.serviceId, `${path}.serviceId`),
    ...(productId === undefined ? {} : { productId }),
    networkId: NETWORK_ID,
    destinationIds: normalizedSet(descriptor.destinationIds, `${path}.destinationIds`, normalizeDestinationId),
    categoryIds: normalizedSet(descriptor.categoryIds, `${path}.categoryIds`, normalizedIdentifier),
    capabilityIds: normalizedSet(descriptor.capabilityIds, `${path}.capabilityIds`, normalizedIdentifier),
    metadataHash: normalizedHex32(descriptor.metadataHash, `${path}.metadataHash`),
    ...(shortDescription === undefined ? {} : { shortDescription }),
  };
}

export function resolveTrustedServiceDescriptors(
  semanticRules: readonly SemanticRule[],
  selector: TrustedServiceDescriptorSelector,
): TrustedServiceDescriptorV1[] {
  const serviceId = normalizedIdentifier(selector.serviceId, "selector.serviceId");
  const productId = selector.productId === undefined ? undefined : normalizedIdentifier(selector.productId, "selector.productId");
  const destinationId = destinationIdentityValue(selector.destination);

  return semanticRules
    .flatMap((rule, index) =>
      rule.kind === TRUSTED_SERVICE_DESCRIPTOR_RULE_KIND
        ? [normalizeTrustedServiceDescriptor(rule.params, `semanticRules[${index}].params`)]
        : [],
    )
    .filter(
      descriptor =>
        descriptor.serviceId === serviceId &&
        descriptor.productId === productId &&
        descriptor.destinationIds.includes(destinationId),
    )
    .map(descriptor => structuredClone(descriptor));
}

function objectOf(input: unknown, path: string): Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    badRequest("invalid_trusted_service_descriptor", `${path} must be an object`);
  }
  return input as Record<string, unknown>;
}

function rejectUnknownKeys(input: Record<string, unknown>, allowedKeys: string[], path: string): void {
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) badRequest("unknown_property", `${path}.${key} is not allowed`);
  }
}

function normalizedIdentifier(input: unknown, path: string): string {
  if (typeof input !== "string") badRequest("invalid_trusted_service_identifier", `${path} must be a string`);
  const value = input.normalize("NFKC").trim().toLowerCase();
  if (value.length > MAX_SEMANTIC_RULE_STRING_LENGTH) {
    badRequest("semantic_rule_string_too_long", `${path} must not exceed ${MAX_SEMANTIC_RULE_STRING_LENGTH} characters`);
  }
  if (value.length === 0 || !IDENTIFIER_RE.test(value)) {
    badRequest("invalid_trusted_service_identifier", `${path} must contain only lowercase letters, numbers, dot, underscore, colon, or hyphen`);
  }
  return value;
}

function normalizedSet(
  input: unknown,
  path: string,
  normalize: (value: unknown, path: string) => string,
): string[] {
  if (!Array.isArray(input)) badRequest("invalid_trusted_service_set", `${path} must be an array`);
  if (input.length === 0) badRequest("trusted_service_set_empty", `${path} must not be empty`);
  if (input.length > MAX_TRUSTED_SERVICE_SET_ITEMS) {
    badRequest("trusted_service_set_too_large", `${path} must contain at most ${MAX_TRUSTED_SERVICE_SET_ITEMS} items`);
  }
  return [...new Set(input.map((value, index) => normalize(value, `${path}[${index}]`)))].sort();
}

function normalizeDestinationId(input: unknown, path: string): string {
  if (typeof input !== "string") badRequest("invalid_trusted_service_destination", `${path} must be a string`);
  const value = input.normalize("NFKC").trim();
  if (value.length > MAX_SEMANTIC_RULE_STRING_LENGTH) {
    badRequest("semantic_rule_string_too_long", `${path} must not exceed ${MAX_SEMANTIC_RULE_STRING_LENGTH} characters`);
  }
  if (EVM_ADDRESS_RE.test(value)) return value.toLowerCase();
  if (HEDERA_ACCOUNT_ID_RE.test(value)) return value.split(".").map(part => BigInt(part).toString()).join(".");
  try {
    const url = new URL(value);
    if (url.protocol === "http:" || url.protocol === "https:") return url.origin.toLowerCase();
  } catch {
    // The shared error below keeps untrusted destination details out of logs.
  }
  badRequest("invalid_trusted_service_destination", `${path} must be a Hedera testnet EVM address, account ID, or URL origin`);
}

function destinationIdentityValue(destination: DestinationIdentity): string {
  if (destination.kind === "EVM_ADDRESS") {
    if ((destination.chainId ?? HEDERA_TESTNET_CHAIN_ID) !== HEDERA_TESTNET_CHAIN_ID) {
      badRequest("unsupported_trusted_service_network", `selector.destination.chainId must be ${HEDERA_TESTNET_CHAIN_ID}`);
    }
    return normalizeDestinationId(destination.value, "selector.destination.value");
  }
  if (destination.kind === "HEDERA_ACCOUNT_ID") {
    if ((destination.chainId ?? HEDERA_TESTNET_CHAIN_ID) !== HEDERA_TESTNET_CHAIN_ID) {
      badRequest("unsupported_trusted_service_network", `selector.destination.chainId must be ${HEDERA_TESTNET_CHAIN_ID}`);
    }
    return normalizeDestinationId(destination.value, "selector.destination.value");
  }
  return normalizeDestinationId(destination.value, "selector.destination.value");
}

function normalizedHex32(input: unknown, path: string): `0x${string}` {
  if (typeof input !== "string" || !HEX32_RE.test(input)) {
    badRequest("invalid_trusted_service_metadata_hash", `${path} must be a 0x-prefixed 32-byte hex string`);
  }
  return input.toLowerCase() as `0x${string}`;
}

function normalizedDescription(input: unknown, path: string): string {
  if (typeof input !== "string") badRequest("invalid_trusted_service_description", `${path} must be a string`);
  const value = input.normalize("NFKC").trim().replace(/\s+/g, " ");
  if (value.length === 0) badRequest("invalid_trusted_service_description", `${path} must not be empty`);
  if (value.length > MAX_SEMANTIC_RULE_STRING_LENGTH) {
    badRequest("trusted_service_string_too_long", `${path} must not exceed ${MAX_SEMANTIC_RULE_STRING_LENGTH} characters`);
  }
  if (HTML_TAG_RE.test(value) || MARKDOWN_RE.test(value) || INSTRUCTION_SHAPED_TEXT_RE.test(value)) {
    badRequest("unsafe_trusted_service_description", `${path} must be plain descriptive text without markup or instructions`);
  }
  return value;
}
