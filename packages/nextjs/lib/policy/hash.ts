// Mirrors services/agent-service/src/policy-engine/{types,canonicalize,auth}.ts.
//
// The operator signs an EIP-712 commitment that binds a `policyHash` the BACKEND
// independently recomputes from the submitted policy fields -- it never trusts a
// client-supplied hash (services/agent-service/src/policy-engine/service.ts). If this file's
// stableStringify/hash logic drifts from the backend's even slightly (key order, number
// formatting, an extra/missing object key), every signature silently fails with
// "invalid_operator_signature" and no other clue why. There is no shared package between
// packages/nextjs and services/agent-service yet -- keep both files in sync by hand.
import { type Hex, keccak256, stringToHex } from "viem";

export const POLICY_HASH_SCHEMA = "aegis.policy.level1.v1";
export const OPERATOR_MESSAGE_SCHEMA = "aegis.policy.commitment.v1";
export const NETWORK_ID = "hedera:testnet";
export const HEDERA_TESTNET_CHAIN_ID = 296;

export type BaseUnitAmount = string;
export type Hex32 = `0x${string}`;

export type DestinationIdentity =
  | { kind: "EVM_ADDRESS"; value: string; chainId: number }
  | { kind: "HEDERA_ACCOUNT_ID"; value: string; chainId?: number }
  | { kind: "URL_ORIGIN"; value: string };

export type AssetIdentity =
  | { kind: "NATIVE"; chainId: number; assetId: "hbar"; decimals: 8 }
  | { kind: "HTS"; chainId: number; tokenId: string; decimals: number };

export type SemanticRule = { ruleId: string; kind: string; params: Record<string, unknown> };

export type PolicyRules = {
  allowedActionTypes: string[];
  allowedDestinations: DestinationIdentity[];
  allowedAssets: AssetIdentity[];
  amount: { min: BaseUnitAmount | null; max: BaseUnitAmount | null; dailyLimit: BaseUnitAmount | null };
  actionCount: { dailyLimit: number | null };
};

export const ACTION_TYPES = [
  "HEDERA_HBAR_TRANSFER",
  "HEDERA_HTS_FUNGIBLE_TRANSFER",
  "SERVICE_PAYMENT",
  "TRANSFER",
] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

type JsonCanonicalValue =
  | null
  | string
  | number
  | boolean
  | JsonCanonicalValue[]
  | { [key: string]: JsonCanonicalValue };

function toCanonicalValue(value: unknown, path: string): JsonCanonicalValue {
  if (value === null) return null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`${path} must be a finite JSON number`);
    return value;
  }
  if (Array.isArray(value)) return value.map((item, index) => toCanonicalValue(item, `${path}[${index}]`));
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const normalized: Record<string, JsonCanonicalValue> = {};
    for (const key of Object.keys(record).sort()) {
      const child = record[key];
      if (child !== undefined) normalized[key] = toCanonicalValue(child, `${path}.${key}`);
    }
    return normalized;
  }
  throw new Error(`${path} contains a non-JSON value`);
}

function stringifyCanonical(value: JsonCanonicalValue): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean")
    return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(item => stringifyCanonical(item)).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map(key => `${JSON.stringify(key)}:${stringifyCanonical(value[key])}`)
    .join(",")}}`;
}

export function stableStringify(value: unknown): string {
  return stringifyCanonical(toCanonicalValue(value, "value"));
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function uniqueSortedByCanonical<T>(values: T[]): T[] {
  const byCanonical = new Map<string, T>();
  for (const value of values) byCanonical.set(stableStringify(value), value);
  return [...byCanonical.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([, value]) => value);
}

export function evmAddressDestination(value: `0x${string}`): DestinationIdentity {
  return { kind: "EVM_ADDRESS", value: value.toLowerCase(), chainId: HEDERA_TESTNET_CHAIN_ID };
}

export function hederaAccountDestination(accountId: string): DestinationIdentity {
  return { kind: "HEDERA_ACCOUNT_ID", value: accountId };
}

export function urlOriginDestination(url: string): DestinationIdentity {
  return { kind: "URL_ORIGIN", value: new URL(url).origin.toLowerCase() };
}

export function nativeHbarAsset(): AssetIdentity {
  return { kind: "NATIVE", chainId: HEDERA_TESTNET_CHAIN_ID, assetId: "hbar", decimals: 8 };
}

export function htsAsset(tokenId: string, decimals: number): AssetIdentity {
  return { kind: "HTS", chainId: HEDERA_TESTNET_CHAIN_ID, tokenId, decimals };
}

export function finalizePolicyRules(rules: {
  allowedActionTypes: ActionType[];
  allowedDestinations: DestinationIdentity[];
  allowedAssets: AssetIdentity[];
  amount: { min: BaseUnitAmount | null; max: BaseUnitAmount | null; dailyLimit: BaseUnitAmount | null };
  actionCount: { dailyLimit: number | null };
}): PolicyRules {
  return {
    allowedActionTypes: uniqueSorted(rules.allowedActionTypes),
    allowedDestinations: uniqueSortedByCanonical(rules.allowedDestinations),
    allowedAssets: uniqueSortedByCanonical(rules.allowedAssets),
    amount: rules.amount,
    actionCount: rules.actionCount,
  };
}

export type PolicyHashInput = {
  schema: typeof POLICY_HASH_SCHEMA;
  agentId: string;
  walletId: string;
  policyVersion: number;
  validFrom: number;
  validUntil: number | null;
  rules: PolicyRules;
  semanticRules: SemanticRule[];
};

export function computePolicyHash(input: {
  agentId: string;
  walletId: string;
  policyVersion: number;
  validFrom: number;
  validUntil: number | null;
  rules: PolicyRules;
  semanticRules: SemanticRule[];
}): Hex32 {
  const hashInput: PolicyHashInput = {
    schema: POLICY_HASH_SCHEMA,
    agentId: input.agentId.trim().toLowerCase(),
    walletId: input.walletId.trim().toLowerCase(),
    policyVersion: input.policyVersion,
    validFrom: input.validFrom,
    validUntil: input.validUntil,
    rules: input.rules,
    semanticRules: uniqueSortedByCanonical(input.semanticRules),
  };
  return keccak256(stringToHex(stableStringify(hashInput))) as Hex32;
}

export function createPolicyIdFromHash(policyHash: Hex32): string {
  return `pol_${policyHash.slice(2, 34)}`.toLowerCase();
}

export const POLICY_COMMITMENT_DOMAIN = {
  name: "AEGIS Policy Engine",
  version: "1",
  chainId: HEDERA_TESTNET_CHAIN_ID,
} as const;

export const POLICY_COMMITMENT_TYPES = {
  PolicyCommitment: [
    { name: "schema", type: "string" },
    { name: "operation", type: "string" },
    { name: "networkId", type: "string" },
    { name: "operatorAddress", type: "address" },
    { name: "agentId", type: "string" },
    { name: "walletId", type: "string" },
    { name: "policyId", type: "string" },
    { name: "sourcePolicyId", type: "string" },
    { name: "policyVersion", type: "uint256" },
    { name: "policyHash", type: "bytes32" },
    { name: "validFrom", type: "uint256" },
    { name: "validUntil", type: "uint256" },
    { name: "hasValidUntil", type: "bool" },
  ],
} as const;

export type PolicyOperation = "CREATE_POLICY" | "UPDATE_POLICY" | "ACTIVATE_POLICY" | "REVOKE_POLICY";

export type PolicyCommitment = {
  schema: typeof OPERATOR_MESSAGE_SCHEMA;
  operation: PolicyOperation;
  networkId: typeof NETWORK_ID;
  operatorAddress: `0x${string}`;
  agentId: string;
  walletId: string;
  policyId: string;
  sourcePolicyId: string;
  policyVersion: bigint;
  policyHash: Hex32;
  validFrom: bigint;
  validUntil: bigint;
  hasValidUntil: boolean;
};

export function buildPolicyCommitment(input: {
  operation: PolicyOperation;
  operatorAddress: `0x${string}`;
  agentId: string;
  walletId: string;
  policyId: string;
  sourcePolicyId?: string;
  policyVersion: number;
  policyHash: Hex32;
  validFrom: number;
  validUntil: number | null;
}): PolicyCommitment {
  return {
    schema: OPERATOR_MESSAGE_SCHEMA,
    operation: input.operation,
    networkId: NETWORK_ID,
    operatorAddress: input.operatorAddress,
    agentId: input.agentId.toLowerCase(),
    walletId: input.walletId.toLowerCase(),
    policyId: input.policyId.toLowerCase(),
    sourcePolicyId: input.sourcePolicyId?.toLowerCase() ?? "",
    policyVersion: BigInt(input.policyVersion),
    policyHash: input.policyHash,
    validFrom: BigInt(input.validFrom),
    validUntil: BigInt(input.validUntil ?? 0),
    hasValidUntil: input.validUntil !== null,
  };
}

export function toBaseUnitAmount(value: bigint): BaseUnitAmount {
  return value.toString();
}

export type { Hex };
