import type { Policy } from "../types/aegis.ts";
import { formatBaseUnitAmount, parseDisplayAmount } from "./amount.ts";
import {
  type DestinationIdentity,
  type PolicyRules,
  evmAddressDestination,
  finalizePolicyRules,
  hederaAccountDestination,
  htsAsset,
  nativeHbarAsset,
} from "./hash.ts";
import { getAddress, isAddress } from "viem";

const EVM_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const HEDERA_ACCOUNT_ID_RE = /^\d+\.\d+\.\d+$/;

export type PolicyAssetKind = "HBAR" | "HTS";
export type PolicyDestinationKind = "HEDERA_ACCOUNT_ID" | "EVM_ADDRESS";
export type PolicyDestinationFormValue = {
  kind: PolicyDestinationKind;
  value: string;
};

export type RecoveryGuardianMode = "DEFAULT" | "CUSTOM";

export type PolicyFormValues = {
  assetKind: PolicyAssetKind;
  htsTokenId: string;
  htsDecimals: string;
  destinations: PolicyDestinationFormValue[];
  minAmount: string;
  maxAmount: string;
  dailyAmount: string;
  dailyActionCount: string;
  validFromMode: "NOW" | "CUSTOM";
  validFromLocal: string;
  validUntilMode: "NONE" | "CUSTOM";
  validUntilLocal: string;
  recoveryGuardianMode: RecoveryGuardianMode;
  recoveryGuardianAddress: string;
};

export function parsePolicyForm(
  values: PolicyFormValues,
  nowSeconds = Math.floor(Date.now() / 1000),
): {
  rules: PolicyRules;
  validFrom: number;
  validUntil: number | null;
  recoveryGuardianAddress?: `0x${string}`;
} {
  const destinations = values.destinations.filter(destination => destination.value.trim());

  const asset =
    values.assetKind === "HBAR"
      ? nativeHbarAsset()
      : htsAsset(parseHtsTokenId(values.htsTokenId), parseHtsDecimals(values.htsDecimals));
  const decimals = asset.decimals;
  const rules = finalizePolicyRules({
    allowedActionTypes: [values.assetKind === "HBAR" ? "HEDERA_HBAR_TRANSFER" : "HEDERA_HTS_FUNGIBLE_TRANSFER"],
    allowedDestinations: destinations.map(parseDestination),
    allowedAssets: [asset],
    amount: {
      min: parseOptionalAmount(values.minAmount, decimals),
      max: parseOptionalAmount(values.maxAmount, decimals),
      dailyLimit: parseOptionalAmount(values.dailyAmount, decimals),
    },
    actionCount: {
      dailyLimit: parseOptionalActionCount(values.dailyActionCount),
    },
  });

  if (rules.amount.min !== null && rules.amount.max !== null && BigInt(rules.amount.min) > BigInt(rules.amount.max)) {
    throw new Error("Minimum amount cannot be greater than the maximum amount.");
  }

  const validFrom =
    values.validFromMode === "NOW"
      ? nowSeconds
      : parseLocalDateTime(values.validFromLocal, "Choose when this policy starts.");
  const validUntil =
    values.validUntilMode === "NONE"
      ? null
      : parseLocalDateTime(values.validUntilLocal, "Choose when this policy expires.");
  if (validUntil !== null && validUntil <= validFrom) {
    throw new Error("Policy expiry must be after its start.");
  }

  const recoveryGuardianAddress =
    values.recoveryGuardianMode === "CUSTOM" ? parseRecoveryGuardianAddress(values.recoveryGuardianAddress) : undefined;

  return { rules, validFrom, validUntil, recoveryGuardianAddress };
}

function parseRecoveryGuardianAddress(value: string): `0x${string}` {
  const trimmed = value.trim();
  if (!isAddress(trimmed, { strict: false })) {
    throw new Error(`"${trimmed}" must be a valid EVM address to use as the recovery guardian.`);
  }
  return getAddress(trimmed) as `0x${string}`;
}

export function policyToFormValues(policy: Policy): PolicyFormValues {
  const asset = policy.rules.allowedAssets[0];
  if (!asset) {
    throw new Error("This policy has no configured asset.");
  }
  const decimals = asset.decimals;

  return {
    assetKind: asset.kind === "NATIVE" ? "HBAR" : "HTS",
    htsTokenId: asset.kind === "HTS" ? asset.tokenId : "",
    htsDecimals: asset.kind === "HTS" ? String(asset.decimals) : "",
    destinations: policy.rules.allowedDestinations
      .filter(
        (destination): destination is DestinationIdentity & { kind: PolicyDestinationKind } =>
          destination.kind === "HEDERA_ACCOUNT_ID" || destination.kind === "EVM_ADDRESS",
      )
      .map(destination => ({ kind: destination.kind, value: destination.value })),
    minAmount: formatOptionalAmount(policy.rules.amount.min, decimals),
    maxAmount: formatOptionalAmount(policy.rules.amount.max, decimals),
    dailyAmount: formatOptionalAmount(policy.rules.amount.dailyLimit, decimals),
    dailyActionCount: policy.rules.actionCount.dailyLimit === null ? "" : String(policy.rules.actionCount.dailyLimit),
    validFromMode: "CUSTOM",
    validFromLocal: formatLocalDateTime(policy.validFrom),
    validUntilMode: policy.validUntil === null ? "NONE" : "CUSTOM",
    validUntilLocal: policy.validUntil === null ? "" : formatLocalDateTime(policy.validUntil),
    recoveryGuardianMode: "DEFAULT",
    recoveryGuardianAddress: "",
  };
}

export function emptyPolicyFormValues(): PolicyFormValues {
  return {
    assetKind: "HBAR",
    htsTokenId: "",
    htsDecimals: "",
    destinations: [],
    minAmount: "",
    maxAmount: "",
    dailyAmount: "",
    dailyActionCount: "",
    validFromMode: "NOW",
    validFromLocal: "",
    validUntilMode: "NONE",
    validUntilLocal: "",
    recoveryGuardianMode: "DEFAULT",
    recoveryGuardianAddress: "",
  };
}

function parseDestination(destination: PolicyDestinationFormValue): DestinationIdentity {
  const value = destination.value.trim();
  if (destination.kind === "EVM_ADDRESS" && EVM_ADDRESS_RE.test(value)) {
    return evmAddressDestination(value as `0x${string}`);
  }
  if (destination.kind === "HEDERA_ACCOUNT_ID" && HEDERA_ACCOUNT_ID_RE.test(value)) {
    return hederaAccountDestination(value);
  }

  const expected = destination.kind === "EVM_ADDRESS" ? "a 0x-prefixed EVM address" : "a Hedera account ID (0.0.x)";
  throw new Error(`"${value}" must be ${expected}.`);
}

function parseOptionalAmount(value: string, decimals: number): string | null {
  return value.trim() ? parseDisplayAmount(value, decimals) : null;
}

function parseOptionalActionCount(value: string): number | null {
  const normalized = value.trim();
  if (!normalized) return null;
  if (!/^(0|[1-9]\d*)$/.test(normalized)) {
    throw new Error("Daily action count must be a non-negative integer.");
  }
  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error("Daily action count is too large.");
  }
  return parsed;
}

function parseHtsTokenId(value: string): string {
  const normalized = value.trim();
  if (!HEDERA_ACCOUNT_ID_RE.test(normalized)) {
    throw new Error("HTS token ID must use shard.realm.num format.");
  }
  return normalized;
}

function parseHtsDecimals(value: string): number {
  const normalized = value.trim();
  if (!/^(0|[1-9]\d*)$/.test(normalized)) {
    throw new Error("HTS decimals must be an integer between 0 and 30.");
  }
  const parsed = Number(normalized);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 30) {
    throw new Error("HTS decimals must be an integer between 0 and 30.");
  }
  return parsed;
}

function parseLocalDateTime(value: string, emptyMessage: string): number {
  const normalized = value.trim();
  if (!normalized) throw new Error(emptyMessage);
  const milliseconds = new Date(normalized).getTime();
  if (!Number.isFinite(milliseconds)) throw new Error("Enter a valid date and time.");
  return Math.floor(milliseconds / 1000);
}

function formatOptionalAmount(value: string | null, decimals: number): string {
  return value === null ? "" : formatBaseUnitAmount(value, decimals);
}

function formatLocalDateTime(unixSeconds: number): string {
  const date = new Date(unixSeconds * 1000);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(
    date.getMinutes(),
  )}`;
}
