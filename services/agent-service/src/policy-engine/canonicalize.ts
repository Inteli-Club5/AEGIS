import { keccak256, stringToHex } from "viem";
import {
  POLICY_HASH_SCHEMA,
  type Hex32,
  type Policy,
  type PolicyHashInput,
  type PolicyRules,
  type SemanticRule,
} from "./types.js";
import { normalizePolicyRules, normalizeSemanticRules } from "./validation.js";

export type JsonCanonicalValue =
  | null
  | string
  | number
  | boolean
  | JsonCanonicalValue[]
  | { [key: string]: JsonCanonicalValue };

export function stableStringify(value: unknown): string {
  return stringifyCanonical(toCanonicalValue(value, "value"));
}

export function hashCanonicalValue(value: unknown): Hex32 {
  return keccak256(stringToHex(stableStringify(value))) as Hex32;
}

export function buildPolicyHashInput(input: {
  agentId: string;
  walletId: string;
  policyVersion: number;
  validFrom: number;
  validUntil: number | null;
  rules: PolicyRules;
  semanticRules: SemanticRule[];
}): PolicyHashInput {
  return {
    schema: POLICY_HASH_SCHEMA,
    agentId: input.agentId.trim().toLowerCase(),
    walletId: input.walletId.trim().toLowerCase(),
    policyVersion: input.policyVersion,
    validFrom: input.validFrom,
    validUntil: input.validUntil,
    rules: normalizePolicyRules(input.rules),
    semanticRules: normalizeSemanticRules(input.semanticRules),
  };
}

export function canonicalizePolicyHashInput(input: Omit<PolicyHashInput, "schema">): string {
  return stableStringify(buildPolicyHashInput(input));
}

export function computePolicyHash(input: Omit<PolicyHashInput, "schema">): Hex32 {
  return keccak256(stringToHex(canonicalizePolicyHashInput(input))) as Hex32;
}

export function computePolicyRecordHash(policy: Pick<Policy, "agentId" | "walletId" | "policyVersion" | "validFrom" | "validUntil" | "rules" | "semanticRules">): Hex32 {
  return computePolicyHash({
    agentId: policy.agentId,
    walletId: policy.walletId,
    policyVersion: policy.policyVersion,
    validFrom: policy.validFrom,
    validUntil: policy.validUntil,
    rules: policy.rules,
    semanticRules: policy.semanticRules,
  });
}

function toCanonicalValue(value: unknown, path: string): JsonCanonicalValue {
  if (value === null) return null;

  if (typeof value === "string" || typeof value === "boolean") return value;

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`${path} must be a finite JSON number`);
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item, index) => toCanonicalValue(item, `${path}[${index}]`));
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const normalized: Record<string, JsonCanonicalValue> = {};
    for (const key of Object.keys(record).sort()) {
      const child = record[key];
      if (child !== undefined) {
        normalized[key] = toCanonicalValue(child, `${path}.${key}`);
      }
    }
    return normalized;
  }

  throw new Error(`${path} contains a non-JSON value`);
}

function stringifyCanonical(value: JsonCanonicalValue): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(item => stringifyCanonical(item)).join(",")}]`;

  return `{${Object.keys(value)
    .sort()
    .map(key => `${JSON.stringify(key)}:${stringifyCanonical(value[key])}`)
    .join(",")}}`;
}

