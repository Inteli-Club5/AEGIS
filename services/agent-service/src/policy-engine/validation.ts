import {
  HEDERA_TESTNET_CHAIN_ID,
  MAX_SEMANTIC_RULES,
  MAX_SEMANTIC_RULES_PAYLOAD_BYTES,
  MAX_SEMANTIC_RULE_STRING_LENGTH,
  NETWORK_ID,
  TRUSTED_SERVICE_DESCRIPTOR_RULE_KIND,
  type ActivatePolicyRequest,
  type AssetIdentity,
  type BaseUnitAmount,
  type CreatePolicyRequest,
  type DestinationIdentity,
  type Hex32,
  type PolicyRules,
  type RevokePolicyRequest,
  type SemanticRule,
  type UpdatePolicyRequest,
} from "./types.js";
import { badRequest } from "./errors.js";
import { stableStringify } from "./canonicalize.js";
import { normalizeTrustedServiceDescriptor } from "./trusted-service-descriptor.js";

const EVM_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const HEDERA_ACCOUNT_ID_RE = /^\d+\.\d+\.\d+$/;
const HEX32_RE = /^0x[a-f0-9]{64}$/;
const ACTION_TYPES = new Set(["SERVICE_PAYMENT", "TRANSFER", "HEDERA_HBAR_TRANSFER", "HEDERA_HTS_FUNGIBLE_TRANSFER"]);

export function parseCreatePolicyRequest(input: unknown): CreatePolicyRequest {
  const body = objectOf(input, "body");
  rejectUnknownKeys(body, ["agentId", "walletId", "validFrom", "validUntil", "rules", "semanticRules"], "body");

  return {
    agentId: requiredIdentifier(body.agentId, "body.agentId"),
    walletId: requiredIdentifier(body.walletId, "body.walletId"),
    validFrom: unixSeconds(body.validFrom, "body.validFrom"),
    validUntil: nullableUnixSeconds(body.validUntil, "body.validUntil"),
    rules: normalizePolicyRules(body.rules),
    semanticRules: body.semanticRules === undefined ? [] : normalizeSemanticRules(requiredArray(body.semanticRules, "body.semanticRules")),
  };
}

export function parseUpdatePolicyRequest(policyId: string, input: unknown): UpdatePolicyRequest {
  const body = objectOf(input, "body");
  rejectUnknownKeys(body, ["expectedPolicyVersion", "validFrom", "validUntil", "rules", "semanticRules"], "body");

  const request: UpdatePolicyRequest = {
    policyId: requiredIdentifier(policyId, "policyId"),
    expectedPolicyVersion: positiveInteger(body.expectedPolicyVersion, "body.expectedPolicyVersion"),
  };

  if (body.validFrom !== undefined) request.validFrom = unixSeconds(body.validFrom, "body.validFrom");
  if (body.validUntil !== undefined) request.validUntil = nullableUnixSeconds(body.validUntil, "body.validUntil");
  if (body.rules !== undefined) request.rules = normalizePolicyRules(body.rules);
  if (body.semanticRules !== undefined) request.semanticRules = normalizeSemanticRules(requiredArray(body.semanticRules, "body.semanticRules"));

  return request;
}

export function parseActivatePolicyRequest(policyId: string, input: unknown): ActivatePolicyRequest {
  const body = objectOf(input, "body");
  rejectUnknownKeys(body, ["expectedPolicyVersion", "expectedPolicyHash"], "body");

  return {
    policyId: requiredIdentifier(policyId, "policyId"),
    expectedPolicyVersion: positiveInteger(body.expectedPolicyVersion, "body.expectedPolicyVersion"),
    expectedPolicyHash: hex32(body.expectedPolicyHash, "body.expectedPolicyHash"),
  };
}

export function parseRevokePolicyRequest(policyId: string, input: unknown): RevokePolicyRequest {
  const body = objectOf(input, "body");
  rejectUnknownKeys(body, ["expectedPolicyVersion", "expectedPolicyHash", "reason"], "body");

  const request: RevokePolicyRequest = {
    policyId: requiredIdentifier(policyId, "policyId"),
    expectedPolicyVersion: positiveInteger(body.expectedPolicyVersion, "body.expectedPolicyVersion"),
    expectedPolicyHash: hex32(body.expectedPolicyHash, "body.expectedPolicyHash"),
  };

  if (body.reason !== undefined) {
    if (typeof body.reason !== "string" || body.reason.trim().length === 0 || body.reason.length > 280) {
      badRequest("invalid_reason", "body.reason must be a non-empty string up to 280 characters");
    }
    request.reason = body.reason.trim();
  }

  return request;
}

export function normalizePolicyRules(input: unknown): PolicyRules {
  const rules = objectOf(input, "rules");
  rejectUnknownKeys(rules, ["allowedActionTypes", "allowedDestinations", "allowedAssets", "amount", "actionCount"], "rules");

  const allowedActionTypes = uniqueSorted(
    requiredArray(rules.allowedActionTypes, "rules.allowedActionTypes").map((value, index) => actionType(value, `rules.allowedActionTypes[${index}]`)),
  );

  const allowedDestinations = uniqueSortedByCanonical(
    requiredArray(rules.allowedDestinations, "rules.allowedDestinations").map((value, index) =>
      normalizeDestination(value, `rules.allowedDestinations[${index}]`),
    ),
  );

  const allowedAssets = uniqueSortedByCanonical(
    requiredArray(rules.allowedAssets, "rules.allowedAssets").map((value, index) => normalizeAsset(value, `rules.allowedAssets[${index}]`)),
  );

  if (allowedActionTypes.length === 0) badRequest("empty_allowed_action_types", "rules.allowedActionTypes must not be empty");
  if (allowedDestinations.length === 0) badRequest("empty_allowed_destinations", "rules.allowedDestinations must not be empty");
  if (allowedAssets.length === 0) badRequest("empty_allowed_assets", "rules.allowedAssets must not be empty");

  const amount = objectOf(rules.amount, "rules.amount");
  rejectUnknownKeys(amount, ["min", "max", "dailyLimit"], "rules.amount");
  const min = nullableBaseUnitAmount(amount.min, "rules.amount.min");
  const max = nullableBaseUnitAmount(amount.max, "rules.amount.max");
  const dailyLimit = nullableBaseUnitAmount(amount.dailyLimit, "rules.amount.dailyLimit");

  if (min !== null && max !== null && BigInt(min) > BigInt(max)) {
    badRequest("invalid_amount_range", "rules.amount.min must be less than or equal to rules.amount.max");
  }

  const actionCount = objectOf(rules.actionCount, "rules.actionCount");
  rejectUnknownKeys(actionCount, ["dailyLimit"], "rules.actionCount");

  return {
    allowedActionTypes,
    allowedDestinations,
    allowedAssets,
    amount: { min, max, dailyLimit },
    actionCount: {
      dailyLimit: actionCount.dailyLimit === null ? null : nonNegativeInteger(actionCount.dailyLimit, "rules.actionCount.dailyLimit"),
    },
  };
}

export function normalizeSemanticRules(input: unknown[]): SemanticRule[] {
  if (input.length > MAX_SEMANTIC_RULES) {
    badRequest("semantic_rules_too_many", `semanticRules must contain at most ${MAX_SEMANTIC_RULES} rules`);
  }
  const normalized = uniqueSortedByCanonical(
    input.map((value, index) => {
      const rule = objectOf(value, `semanticRules[${index}]`);
      rejectUnknownKeys(rule, ["ruleId", "kind", "params"], `semanticRules[${index}]`);

      const kind = boundedSemanticString(rule.kind, `semanticRules[${index}].kind`);
      return {
        ruleId: boundedSemanticString(rule.ruleId, `semanticRules[${index}].ruleId`).toLowerCase(),
        kind: kind.toUpperCase() === TRUSTED_SERVICE_DESCRIPTOR_RULE_KIND ? TRUSTED_SERVICE_DESCRIPTOR_RULE_KIND : kind,
        params:
          kind.toUpperCase() === TRUSTED_SERVICE_DESCRIPTOR_RULE_KIND
            ? normalizeTrustedServiceDescriptor(rule.params, `semanticRules[${index}].params`)
            : jsonRecord(rule.params, `semanticRules[${index}].params`),
      };
    }),
  );
  if (new TextEncoder().encode(stableStringify(normalized)).byteLength > MAX_SEMANTIC_RULES_PAYLOAD_BYTES) {
    badRequest(
      "semantic_rules_payload_too_large",
      `semanticRules canonical payload must not exceed ${MAX_SEMANTIC_RULES_PAYLOAD_BYTES} bytes`,
    );
  }
  return normalized;
}

export function getEffectivePolicyStatus(input: { status: string; validUntil: number | null }, now: number): string {
  const suppliedNow = unixSeconds(now, "now");
  if (input.status === "ACTIVE" && input.validUntil !== null && suppliedNow > input.validUntil) {
    return "EXPIRED";
  }
  return input.status;
}

function normalizeDestination(input: unknown, path: string): DestinationIdentity {
  const destination = objectOf(input, path);
  const kind = destination.kind;
  if (kind === "EVM_ADDRESS") {
    rejectUnknownKeys(destination, ["kind", "value", "chainId"], path);
    return {
      kind,
      value: evmAddress(destination.value, `${path}.value`),
      chainId: destinationChainId(destination.chainId, `${path}.chainId`),
    };
  }

  if (kind === "HEDERA_ACCOUNT_ID") {
    rejectUnknownKeys(destination, ["kind", "value", "chainId"], path);
    const chainId = destination.chainId === undefined ? undefined : destinationChainId(destination.chainId, `${path}.chainId`);
    return {
      kind,
      value: hederaAccountId(destination.value, `${path}.value`),
      ...(chainId === undefined ? {} : { chainId }),
    };
  }

  if (kind === "URL_ORIGIN") {
    rejectUnknownKeys(destination, ["kind", "value"], path);
    return { kind, value: urlOrigin(destination.value, `${path}.value`) };
  }

  badRequest("unsupported_destination_kind", `${path}.kind must be EVM_ADDRESS, HEDERA_ACCOUNT_ID, or URL_ORIGIN`);
}

function normalizeAsset(input: unknown, path: string): AssetIdentity {
  const asset = objectOf(input, path);
  const kind = asset.kind;

  if (kind === "NATIVE") {
    rejectUnknownKeys(asset, ["kind", "chainId", "assetId", "decimals", "symbol"], path);
    const chainId = chainIdForHedera(asset.chainId, `${path}.chainId`);
    if (asset.assetId !== "hbar") badRequest("unsupported_native_asset", `${path}.assetId must be hbar`);
    const decimals = integerInRange(asset.decimals, `${path}.decimals`, 0, 30);
    if (decimals !== 8) badRequest("invalid_hbar_decimals", `${path}.decimals must be 8 for hbar`);
    return { kind, chainId, assetId: "hbar", decimals };
  }

  if (kind === "HTS") {
    rejectUnknownKeys(asset, ["kind", "chainId", "tokenId", "decimals", "symbol"], path);
    return {
      kind,
      chainId: chainIdForHedera(asset.chainId, `${path}.chainId`),
      tokenId: hederaAccountId(asset.tokenId, `${path}.tokenId`),
      decimals: integerInRange(asset.decimals, `${path}.decimals`, 0, 30),
    };
  }

  if (kind === "ERC20") {
    badRequest("unsupported_asset_kind", `${path}.kind ERC20 is outside the Hedera Level 1 asset catalog`);
  }

  badRequest("unsupported_asset_kind", `${path}.kind must be NATIVE or HTS for ${NETWORK_ID}`);
}

function objectOf(input: unknown, path: string): Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    badRequest("invalid_object", `${path} must be an object`);
  }
  return input as Record<string, unknown>;
}

function rejectUnknownKeys(input: Record<string, unknown>, allowedKeys: string[], path: string): void {
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) {
      badRequest("unknown_property", `${path}.${key} is not allowed`);
    }
  }
}

function requiredArray(input: unknown, path: string): unknown[] {
  if (!Array.isArray(input)) badRequest("invalid_array", `${path} must be an array`);
  return input;
}

function requiredString(input: unknown, path: string): string {
  if (typeof input !== "string" || input.trim().length === 0) {
    badRequest("invalid_string", `${path} must be a non-empty string`);
  }
  return input.trim();
}

function requiredIdentifier(input: unknown, path: string): string {
  return requiredString(input, path).toLowerCase();
}

function boundedSemanticString(input: unknown, path: string): string {
  const value = requiredString(input, path);
  if (value.length > MAX_SEMANTIC_RULE_STRING_LENGTH) {
    badRequest("semantic_rule_string_too_long", `${path} must not exceed ${MAX_SEMANTIC_RULE_STRING_LENGTH} characters`);
  }
  return value;
}

function actionType(input: unknown, path: string): string {
  const normalized = requiredString(input, path).toUpperCase();
  if (!ACTION_TYPES.has(normalized)) {
    badRequest("unsupported_action_type", `${path} must be TRANSFER, SERVICE_PAYMENT, HEDERA_HBAR_TRANSFER, or HEDERA_HTS_FUNGIBLE_TRANSFER`);
  }
  return normalized;
}

function unixSeconds(input: unknown, path: string): number {
  if (!Number.isInteger(input) || (input as number) < 0) {
    badRequest("invalid_unix_seconds", `${path} must be a non-negative integer Unix timestamp in seconds`);
  }
  return input as number;
}

function nullableUnixSeconds(input: unknown, path: string): number | null {
  if (input === null) return null;
  return unixSeconds(input, path);
}

function positiveInteger(input: unknown, path: string): number {
  if (!Number.isInteger(input) || (input as number) < 1) {
    badRequest("invalid_positive_integer", `${path} must be a positive integer`);
  }
  return input as number;
}

function nonNegativeInteger(input: unknown, path: string): number {
  if (!Number.isInteger(input) || (input as number) < 0) {
    badRequest("invalid_non_negative_integer", `${path} must be a non-negative integer or null`);
  }
  return input as number;
}

function integerInRange(input: unknown, path: string, min: number, max: number): number {
  if (!Number.isInteger(input) || (input as number) < min || (input as number) > max) {
    badRequest("invalid_integer_range", `${path} must be an integer between ${min} and ${max}`);
  }
  return input as number;
}

function nullableBaseUnitAmount(input: unknown, path: string): BaseUnitAmount | null {
  if (input === null) return null;
  return baseUnitAmount(input, path);
}

function baseUnitAmount(input: unknown, path: string): BaseUnitAmount {
  if (typeof input !== "string" || !/^(0|[1-9]\d*)$/.test(input)) {
    badRequest("invalid_base_unit_amount", `${path} must be an integer base-unit string`);
  }
  return BigInt(input).toString();
}

function evmAddress(input: unknown, path: string): `0x${string}` {
  const value = requiredString(input, path);
  if (!EVM_ADDRESS_RE.test(value)) badRequest("invalid_evm_address", `${path} must be a 20-byte EVM address`);
  return value.toLowerCase() as `0x${string}`;
}

function hederaAccountId(input: unknown, path: string): string {
  const value = requiredString(input, path);
  if (!HEDERA_ACCOUNT_ID_RE.test(value)) badRequest("invalid_hedera_account_id", `${path} must use shard.realm.num format`);
  return value;
}

function destinationChainId(input: unknown, path: string): number {
  if (input === undefined) return HEDERA_TESTNET_CHAIN_ID;
  return chainIdForHedera(input, path);
}

function chainIdForHedera(input: unknown, path: string): typeof HEDERA_TESTNET_CHAIN_ID {
  if (input !== HEDERA_TESTNET_CHAIN_ID) {
    badRequest("unsupported_chain_id", `${path} must be ${HEDERA_TESTNET_CHAIN_ID} for ${NETWORK_ID}`);
  }
  return HEDERA_TESTNET_CHAIN_ID;
}

function urlOrigin(input: unknown, path: string): string {
  const value = requiredString(input, path);
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      badRequest("invalid_url_origin", `${path} must use http or https`);
    }
    return url.origin.toLowerCase();
  } catch (error) {
    if (error instanceof Error && error.message === "invalid_url_origin") throw error;
    badRequest("invalid_url_origin", `${path} must be a valid URL origin`);
  }
}

function hex32(input: unknown, path: string): Hex32 {
  if (typeof input !== "string" || !HEX32_RE.test(input)) {
    badRequest("invalid_hex32", `${path} must be a lowercase 0x-prefixed 32-byte hex string`);
  }
  return input as Hex32;
}

function jsonRecord(input: unknown, path: string): Record<string, unknown> {
  const record = objectOf(input, path);
  validateJsonValue(record, path);
  return record;
}

function validateJsonValue(input: unknown, path: string): void {
  if (input === null) return;
  if (typeof input === "string") {
    if (input.length > MAX_SEMANTIC_RULE_STRING_LENGTH) {
      badRequest("semantic_rule_string_too_long", `${path} must not exceed ${MAX_SEMANTIC_RULE_STRING_LENGTH} characters`);
    }
    return;
  }
  if (typeof input === "boolean") return;
  if (typeof input === "number") {
    if (!Number.isFinite(input)) badRequest("invalid_json_value", `${path} must contain only finite JSON numbers`);
    return;
  }
  if (Array.isArray(input)) {
    input.forEach((value, index) => validateJsonValue(value, `${path}[${index}]`));
    return;
  }
  if (typeof input === "object") {
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      if (key.length > MAX_SEMANTIC_RULE_STRING_LENGTH) {
        badRequest("semantic_rule_string_too_long", `${path} property names must not exceed ${MAX_SEMANTIC_RULE_STRING_LENGTH} characters`);
      }
      if (value === undefined) badRequest("invalid_json_value", `${path}.${key} must not be undefined`);
      validateJsonValue(value, `${path}.${key}`);
    }
    return;
  }
  badRequest("invalid_json_value", `${path} must contain only JSON values`);
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function uniqueSortedByCanonical<T>(values: T[]): T[] {
  const byCanonical = new Map<string, T>();
  for (const value of values) {
    byCanonical.set(stableStringify(value), value);
  }
  return [...byCanonical.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, value]) => value);
}
