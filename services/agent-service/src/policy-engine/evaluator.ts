import {
  HEDERA_TESTNET_CHAIN_ID,
  NETWORK_ID,
  type AssetIdentity,
  type DestinationIdentity,
  type Hex32,
  type Policy,
} from "./types.js";

export const PASS_TO_TEEML = "PASS_TO_TEEML" as const;
export const DENY_PRECHECK = "DENY_PRECHECK" as const;

export const LEVEL1_ACTION_TYPES = ["HEDERA_HBAR_TRANSFER", "HEDERA_HTS_FUNGIBLE_TRANSFER"] as const;

export type Level1ActionType = (typeof LEVEL1_ACTION_TYPES)[number];

export type DeterministicPolicyReasonCode =
  | "AGENT_NOT_FOUND"
  | "AGENT_NOT_ACTIVE"
  | "WALLET_NOT_FOUND"
  | "WALLET_AGENT_MISMATCH"
  | "WALLET_NOT_PROTECTED"
  | "NETWORK_NOT_SUPPORTED"
  | "POLICY_NOT_FOUND"
  | "POLICY_AGENT_MISMATCH"
  | "POLICY_WALLET_MISMATCH"
  | "POLICY_NOT_ACTIVE"
  | "POLICY_SUPERSEDED"
  | "POLICY_REVOKED"
  | "POLICY_EXPIRED"
  | "POLICY_VERSION_STALE"
  | "ACTION_CONTEXT_MISMATCH"
  | "ACTION_DEADLINE_EXPIRED"
  | "ACTION_TYPE_NOT_ALLOWED"
  | "ACTION_TYPE_NOT_SUPPORTED"
  | "DESTINATION_NOT_ALLOWED"
  | "ASSET_NOT_FOUND"
  | "ASSET_NOT_ACTIVE"
  | "ASSET_NETWORK_MISMATCH"
  | "ASSET_ACTION_TYPE_MISMATCH"
  | "ASSET_NOT_ALLOWED"
  | "AMOUNT_INVALID"
  | "AMOUNT_BELOW_MIN"
  | "AMOUNT_ABOVE_MAX"
  | "DAILY_LIMIT_EXCEEDED"
  | "ACTION_COUNT_LIMIT_EXCEEDED"
  | "NONCE_INVALID"
  | "NONCE_ALREADY_USED"
  | "ACTION_HASH_INVALID"
  | "ACTION_HASH_MISMATCH";

export type DeterministicPolicyAgent = {
  agentId: string;
  status: "ACTIVE" | "PAUSED" | "RETIRED";
};

export type DeterministicPolicyWallet = {
  walletId: string;
  agentId: string;
  networkId: string;
  status: "ACTIVE_PROTECTED" | "PAUSED" | "RETIRED" | "DEAD";
};

export type AssetCatalogEntry = {
  canonicalAssetId: string;
  networkId: string;
  kind: "HBAR" | "HTS_FUNGIBLE";
  active: boolean;
  decimals: number;
  tokenId?: string;
  symbol?: string;
};

export type NormalizedAction = {
  actionType: string;
  agentId?: string;
  walletId?: string;
  networkId?: string;
  destination: DestinationIdentity;
  assetId: string;
  amount: string;
  deadline: number | null;
};

export type UsageSnapshot = {
  periodAmountUsed: string;
  periodAmountHeld: string;
  periodActionCountUsed: number | string;
  periodActionCountHeld: number | string;
  usedAegisNonces?: readonly (bigint | string)[];
};

export type DeterministicPolicyEvaluationInput = {
  agent: DeterministicPolicyAgent | null;
  wallet: DeterministicPolicyWallet | null;
  policy: Policy | null;
  expectedActivePolicyVersion: number | null;
  normalizedAction: NormalizedAction;
  assetCatalogEntry: AssetCatalogEntry | null;
  usageSnapshot: UsageSnapshot;
  now: number;
  generatedAegisNonce: bigint | string;
  calculatedActionHash: string;
  expectedActionHash?: string | null;
};

export type PassToTeeMlResult = {
  status: typeof PASS_TO_TEEML;
  policyId: string;
  policyVersion: number;
  policyHash: Hex32;
  actionHash: Hex32;
  aegisNonce: string;
  evaluatedAt: number;
};

export type DenyPrecheckResult = {
  status: typeof DENY_PRECHECK;
  code: DeterministicPolicyReasonCode;
  message: string;
  policyId: string | null;
  policyVersion: number | null;
  policyHash: Hex32 | null;
  actionHash: Hex32 | null;
  evaluatedAt: number;
};

export type DeterministicPolicyEvaluationResult = PassToTeeMlResult | DenyPrecheckResult;

const SUPPORTED_ACTION_TYPES = new Set<string>(LEVEL1_ACTION_TYPES);
const HEX32_RE = /^0x[a-f0-9]{64}$/;
const BASE_UNIT_AMOUNT_RE = /^(0|[1-9]\d*)$/;
const HEDERA_ACCOUNT_ID_RE = /^\d+\.\d+\.\d+$/;
const EVM_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const REASON_MESSAGES: Record<DeterministicPolicyReasonCode, string> = {
  AGENT_NOT_FOUND: "agent not found",
  AGENT_NOT_ACTIVE: "agent is not active",
  WALLET_NOT_FOUND: "wallet not found",
  WALLET_AGENT_MISMATCH: "wallet does not belong to agent",
  WALLET_NOT_PROTECTED: "wallet is not active protected",
  NETWORK_NOT_SUPPORTED: "network is not supported",
  POLICY_NOT_FOUND: "policy not found",
  POLICY_AGENT_MISMATCH: "policy does not belong to agent",
  POLICY_WALLET_MISMATCH: "policy does not belong to wallet",
  POLICY_NOT_ACTIVE: "policy is not active",
  POLICY_SUPERSEDED: "policy is superseded",
  POLICY_REVOKED: "policy is revoked",
  POLICY_EXPIRED: "policy is expired",
  POLICY_VERSION_STALE: "policy version is stale",
  ACTION_CONTEXT_MISMATCH: "action context does not match policy",
  ACTION_DEADLINE_EXPIRED: "action deadline is expired",
  ACTION_TYPE_NOT_ALLOWED: "action type is not allowed",
  ACTION_TYPE_NOT_SUPPORTED: "action type is not supported",
  DESTINATION_NOT_ALLOWED: "destination is not allowed",
  ASSET_NOT_FOUND: "asset not found",
  ASSET_NOT_ACTIVE: "asset is not active",
  ASSET_NETWORK_MISMATCH: "asset network does not match",
  ASSET_ACTION_TYPE_MISMATCH: "asset does not match action type",
  ASSET_NOT_ALLOWED: "asset is not allowed",
  AMOUNT_INVALID: "amount is invalid",
  AMOUNT_BELOW_MIN: "amount is below minimum",
  AMOUNT_ABOVE_MAX: "amount is above maximum",
  DAILY_LIMIT_EXCEEDED: "daily limit exceeded",
  ACTION_COUNT_LIMIT_EXCEEDED: "action count limit exceeded",
  NONCE_INVALID: "nonce is invalid",
  NONCE_ALREADY_USED: "nonce was already used",
  ACTION_HASH_INVALID: "action hash is invalid",
  ACTION_HASH_MISMATCH: "action hash does not match",
};

export function evaluateDeterministicPolicy(input: DeterministicPolicyEvaluationInput): DeterministicPolicyEvaluationResult {
  const deny = (code: DeterministicPolicyReasonCode): DenyPrecheckResult => denyResult(code, input);

  if (!input.agent) return deny("AGENT_NOT_FOUND");
  if (input.agent.status !== "ACTIVE") return deny("AGENT_NOT_ACTIVE");

  if (!input.wallet) return deny("WALLET_NOT_FOUND");
  if (normalizeIdentifier(input.wallet.agentId) !== normalizeIdentifier(input.agent.agentId)) return deny("WALLET_AGENT_MISMATCH");
  if (!isProtectedWalletStatus(input.wallet.status)) return deny("WALLET_NOT_PROTECTED");
  if (input.wallet.networkId !== NETWORK_ID) return deny("NETWORK_NOT_SUPPORTED");

  if (!input.policy) return deny("POLICY_NOT_FOUND");
  if (normalizeIdentifier(input.policy.agentId) !== normalizeIdentifier(input.agent.agentId)) return deny("POLICY_AGENT_MISMATCH");
  if (normalizeIdentifier(input.policy.walletId) !== normalizeIdentifier(input.wallet.walletId)) return deny("POLICY_WALLET_MISMATCH");
  if (input.policy.status === "SUPERSEDED") return deny("POLICY_SUPERSEDED");
  if (input.policy.status === "REVOKED") return deny("POLICY_REVOKED");
  if (input.policy.status !== "ACTIVE") return deny("POLICY_NOT_ACTIVE");
  if (input.policy.validUntil !== null && input.now > input.policy.validUntil) return deny("POLICY_EXPIRED");
  if (input.expectedActivePolicyVersion !== input.policy.policyVersion) return deny("POLICY_VERSION_STALE");

  if (actionContextMismatches(input)) return deny("ACTION_CONTEXT_MISMATCH");
  if (input.normalizedAction.deadline !== null && input.now > input.normalizedAction.deadline) return deny("ACTION_DEADLINE_EXPIRED");

  const actionType = input.normalizedAction.actionType.toUpperCase();
  if (!input.policy.rules.allowedActionTypes.map(value => value.toUpperCase()).includes(actionType)) {
    return deny("ACTION_TYPE_NOT_ALLOWED");
  }
  if (!SUPPORTED_ACTION_TYPES.has(actionType)) return deny("ACTION_TYPE_NOT_SUPPORTED");

  if (input.policy.rules.allowedDestinations.length > 0) {
    const destinationKey = destinationCanonicalKey(input.normalizedAction.destination);
    const destinationAllowed =
      destinationKey !== null &&
      input.policy.rules.allowedDestinations.some(
        destination => destinationCanonicalKey(destination) === destinationKey,
      );
    if (!destinationAllowed) return deny("DESTINATION_NOT_ALLOWED");
  }

  if (!input.assetCatalogEntry) return deny("ASSET_NOT_FOUND");
  if (normalizeIdentifier(input.assetCatalogEntry.canonicalAssetId) !== normalizeIdentifier(input.normalizedAction.assetId)) return deny("ASSET_NOT_FOUND");
  if (!input.assetCatalogEntry.active) return deny("ASSET_NOT_ACTIVE");
  if (input.assetCatalogEntry.networkId !== NETWORK_ID) return deny("ASSET_NETWORK_MISMATCH");
  if (!assetMatchesActionType(input.assetCatalogEntry, actionType)) return deny("ASSET_ACTION_TYPE_MISMATCH");
  if (!policyAllowsAsset(input.policy.rules.allowedAssets, input.assetCatalogEntry.canonicalAssetId)) return deny("ASSET_NOT_ALLOWED");

  const amount = parsePositiveAmount(input.normalizedAction.amount);
  if (amount === null) return deny("AMOUNT_INVALID");

  const min = parseOptionalAmount(input.policy.rules.amount.min);
  if (min !== null && amount < min) return deny("AMOUNT_BELOW_MIN");

  const max = parseOptionalAmount(input.policy.rules.amount.max);
  if (max !== null && amount > max) return deny("AMOUNT_ABOVE_MAX");

  const dailyLimit = parseOptionalAmount(input.policy.rules.amount.dailyLimit);
  const usedAmount = parseNonNegativeAmount(input.usageSnapshot.periodAmountUsed);
  const heldAmount = parseNonNegativeAmount(input.usageSnapshot.periodAmountHeld);
  if (dailyLimit !== null && usedAmount !== null && heldAmount !== null && usedAmount + heldAmount + amount > dailyLimit) {
    return deny("DAILY_LIMIT_EXCEEDED");
  }

  const usedCount = parseNonNegativeCount(input.usageSnapshot.periodActionCountUsed);
  const heldCount = parseNonNegativeCount(input.usageSnapshot.periodActionCountHeld);
  const countLimit = input.policy.rules.actionCount.dailyLimit;
  if (countLimit !== null && usedCount !== null && heldCount !== null && usedCount + heldCount + 1n > BigInt(countLimit)) {
    return deny("ACTION_COUNT_LIMIT_EXCEEDED");
  }

  const nonce = normalizeNonce(input.generatedAegisNonce);
  if (nonce === null) return deny("NONCE_INVALID");
  if (input.usageSnapshot.usedAegisNonces?.some(used => normalizeNonce(used) === nonce)) {
    return deny("NONCE_ALREADY_USED");
  }

  const actionHash = normalizeHex32(input.calculatedActionHash);
  if (actionHash === null) return deny("ACTION_HASH_INVALID");

  if (input.expectedActionHash !== undefined && input.expectedActionHash !== null) {
    const expectedActionHash = normalizeHex32(input.expectedActionHash);
    if (expectedActionHash === null) return deny("ACTION_HASH_INVALID");
    if (expectedActionHash !== actionHash) return deny("ACTION_HASH_MISMATCH");
  }

  return {
    status: PASS_TO_TEEML,
    policyId: input.policy.policyId,
    policyVersion: input.policy.policyVersion,
    policyHash: input.policy.policyHash,
    actionHash,
    aegisNonce: nonce,
    evaluatedAt: input.now,
  };
}

function denyResult(code: DeterministicPolicyReasonCode, input: DeterministicPolicyEvaluationInput): DenyPrecheckResult {
  return {
    status: DENY_PRECHECK,
    code,
    message: REASON_MESSAGES[code],
    policyId: input.policy?.policyId ?? null,
    policyVersion: input.policy?.policyVersion ?? null,
    policyHash: input.policy?.policyHash ?? null,
    actionHash: normalizeHex32(input.calculatedActionHash),
    evaluatedAt: input.now,
  };
}

function normalizeIdentifier(value: string): string {
  return value.trim().toLowerCase();
}

function isProtectedWalletStatus(status: DeterministicPolicyWallet["status"]): boolean {
  return status === "ACTIVE_PROTECTED";
}

function actionContextMismatches(input: DeterministicPolicyEvaluationInput): boolean {
  const action = input.normalizedAction;
  if (action.agentId !== undefined && normalizeIdentifier(action.agentId) !== normalizeIdentifier(input.agent?.agentId ?? "")) return true;
  if (action.walletId !== undefined && normalizeIdentifier(action.walletId) !== normalizeIdentifier(input.wallet?.walletId ?? "")) return true;
  if (action.networkId !== undefined && action.networkId !== input.wallet?.networkId) return true;
  return false;
}

function destinationCanonicalKey(destination: DestinationIdentity): string | null {
  if (destination.kind === "EVM_ADDRESS") {
    if (!EVM_ADDRESS_RE.test(destination.value)) return null;
    const chainId = destination.chainId ?? HEDERA_TESTNET_CHAIN_ID;
    if (chainId !== HEDERA_TESTNET_CHAIN_ID) return null;
    return `${destination.kind}:${chainId}:${destination.value.toLowerCase()}`;
  }

  if (destination.kind === "HEDERA_ACCOUNT_ID") {
    if (!HEDERA_ACCOUNT_ID_RE.test(destination.value)) return null;
    const chainId = destination.chainId ?? HEDERA_TESTNET_CHAIN_ID;
    if (chainId !== HEDERA_TESTNET_CHAIN_ID) return null;
    return `${destination.kind}:${chainId}:${destination.value}`;
  }

  if (destination.kind === "URL_ORIGIN") {
    try {
      const url = new URL(destination.value);
      if (url.protocol !== "http:" && url.protocol !== "https:") return null;
      return `${destination.kind}:${url.origin.toLowerCase()}`;
    } catch {
      return null;
    }
  }

  return null;
}

function assetMatchesActionType(asset: AssetCatalogEntry, actionType: string): boolean {
  if (actionType === "HEDERA_HBAR_TRANSFER") return asset.kind === "HBAR" && asset.canonicalAssetId === "hedera:testnet:hbar" && asset.decimals === 8;
  if (actionType === "HEDERA_HTS_FUNGIBLE_TRANSFER") return asset.kind === "HTS_FUNGIBLE" && asset.canonicalAssetId.startsWith("hedera:testnet:hts:");
  return false;
}

function policyAllowsAsset(allowedAssets: readonly AssetIdentity[], canonicalAssetId: string): boolean {
  return allowedAssets.some(asset => policyAssetCanonicalId(asset) === canonicalAssetId);
}

function policyAssetCanonicalId(asset: AssetIdentity): string | null {
  if (asset.kind === "NATIVE") {
    if (asset.chainId !== HEDERA_TESTNET_CHAIN_ID || asset.assetId !== "hbar" || asset.decimals !== 8) return null;
    return "hedera:testnet:hbar";
  }

  if (asset.kind === "HTS") {
    if (asset.chainId !== HEDERA_TESTNET_CHAIN_ID || !HEDERA_ACCOUNT_ID_RE.test(asset.tokenId)) return null;
    return `hedera:testnet:hts:${asset.tokenId}`;
  }

  return null;
}

function parsePositiveAmount(value: string): bigint | null {
  const amount = parseNonNegativeAmount(value);
  if (amount === null || amount <= 0n) return null;
  return amount;
}

function parseOptionalAmount(value: string | null): bigint | null {
  if (value === null) return null;
  return parseNonNegativeAmount(value);
}

function parseNonNegativeAmount(value: string): bigint | null {
  if (!BASE_UNIT_AMOUNT_RE.test(value)) return null;
  return BigInt(value);
}

function parseNonNegativeCount(value: number | string): bigint | null {
  if (typeof value === "number") {
    if (!Number.isInteger(value) || value < 0) return null;
    return BigInt(value);
  }
  if (!BASE_UNIT_AMOUNT_RE.test(value)) return null;
  return BigInt(value);
}

function normalizeNonce(value: bigint | string): string | null {
  if (typeof value === "bigint") return value > 0n ? value.toString() : null;
  if (!/^[1-9]\d*$/.test(value)) return null;
  return BigInt(value).toString();
}

function normalizeHex32(value: string): Hex32 | null {
  if (!HEX32_RE.test(value)) return null;
  return value as Hex32;
}
