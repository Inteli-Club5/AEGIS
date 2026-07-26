export const POLICY_HASH_SCHEMA = "aegis.policy.level1.v1";
export const OPERATOR_MESSAGE_SCHEMA = "aegis.policy.commitment.v1";
export const NETWORK_ID = "hedera:testnet";
export const HEDERA_TESTNET_CHAIN_ID = 296;

export type BaseUnitAmount = string;
export type UnixSeconds = number;
export type Hex32 = `0x${string}`;

export type PolicyStatus = "DRAFT" | "ACTIVE" | "SUPERSEDED" | "REVOKED";
export type EffectivePolicyStatus = PolicyStatus | "EXPIRED";

export type AgentStatus = "ACTIVE" | "PAUSED" | "RETIRED";
export type WalletStatus = "PROTECTED" | "PAUSED" | "RETIRED" | "DEAD";
export type WalletCreationStatus =
  | "INITIALIZED"
  | "PREPARED"
  | "BROADCAST"
  | "FAILED"
  | "COMPLETED";
export type WalletCreationFailureCode = "TRANSACTION_REVERTED";
export type WalletGuardianSource =
  | "REQUESTED"
  | "CONFIGURED_AEGIS"
  | "OWNER_FALLBACK";
export type WalletDeploymentProvenance =
  | "BROADCAST_RECEIPT"
  | "PREDICTED_SAFE_RECONCILIATION";

export type DestinationIdentity = {
  kind: "EVM_ADDRESS" | "HEDERA_ACCOUNT_ID" | "URL_ORIGIN";
  value: string;
  chainId?: number;
};

export type AssetIdentity =
  | {
      kind: "NATIVE";
      chainId: number;
      assetId: "hbar";
      decimals: number;
      symbol?: string;
    }
  | {
      kind: "HTS";
      chainId: number;
      tokenId: string;
      decimals: number;
      symbol?: string;
    };

export type SemanticRule = {
  ruleId: string;
  kind: string;
  params: Record<string, unknown>;
};

export type PolicyRules = {
  allowedActionTypes: string[];
  allowedDestinations: DestinationIdentity[];
  allowedAssets: AssetIdentity[];
  amount: {
    min: BaseUnitAmount | null;
    max: BaseUnitAmount | null;
    dailyLimit: BaseUnitAmount | null;
  };
  actionCount: {
    dailyLimit: number | null;
  };
};

export type Policy = {
  policyId: string;
  agentId: string;
  walletId: string;
  policyVersion: number;
  policyHash: Hex32;
  status: PolicyStatus;
  validFrom: UnixSeconds;
  validUntil: UnixSeconds | null;
  rules: PolicyRules;
  semanticRules: SemanticRule[];
  createdAt: UnixSeconds;
  updatedAt: UnixSeconds;
  activatedAt: UnixSeconds | null;
  revokedAt: UnixSeconds | null;
  supersededAt: UnixSeconds | null;
  supersededByPolicyId: string | null;
};

export type PolicyHashInput = {
  schema: typeof POLICY_HASH_SCHEMA;
  agentId: string;
  walletId: string;
  policyVersion: number;
  validFrom: UnixSeconds;
  validUntil: UnixSeconds | null;
  rules: PolicyRules;
  semanticRules: SemanticRule[];
};

export type CreatePolicyRequest = {
  agentId: string;
  walletId: string;
  validFrom: UnixSeconds;
  validUntil: UnixSeconds | null;
  rules: PolicyRules;
  semanticRules?: SemanticRule[];
};

export type UpdatePolicyRequest = {
  policyId: string;
  expectedPolicyVersion: number;
  validFrom?: UnixSeconds;
  validUntil?: UnixSeconds | null;
  rules?: PolicyRules;
  semanticRules?: SemanticRule[];
};

export type ActivatePolicyRequest = {
  policyId: string;
  expectedPolicyVersion: number;
  expectedPolicyHash: Hex32;
};

export type RevokePolicyRequest = {
  policyId: string;
  expectedPolicyVersion: number;
  expectedPolicyHash: Hex32;
  reason?: string;
};

export type AgentRecord = {
  agentId: string;
  ownerAddress: `0x${string}`;
  status: AgentStatus;
  createdAt: UnixSeconds;
  updatedAt: UnixSeconds;
};

export type WalletRecord = {
  walletId: string;
  agentId: string;
  networkId: typeof NETWORK_ID;
  safeAddress: `0x${string}`;
  status: WalletStatus;
  createdAt: UnixSeconds;
  updatedAt: UnixSeconds;
};

export type WalletCreationOperationRecord = {
  operationId: string;
  agentId: string;
  networkId: typeof NETWORK_ID;
  walletId: string;
  recoveryGuardianAddress: `0x${string}`;
  guardianSource: WalletGuardianSource;
  saltNonce: string;
  status: WalletCreationStatus;
  predictedSafeAddress: `0x${string}` | null;
  transactionHash: `0x${string}` | null;
  owners: `0x${string}`[] | null;
  threshold: number | null;
  deploymentProvenance: WalletDeploymentProvenance | null;
  failureCode: WalletCreationFailureCode | null;
  createdAt: UnixSeconds;
  updatedAt: UnixSeconds;
};

export type CompleteWalletCreationInput = {
  operationId: string;
  safeAddress: `0x${string}`;
  transactionHash: `0x${string}` | null;
  owners: `0x${string}`[];
  threshold: number;
  deploymentProvenance: WalletDeploymentProvenance;
  now: UnixSeconds;
};

export type OperatorAuth = {
  operatorAddress: string;
  signature: string;
};

export type OperatorProof = {
  operatorAddress: `0x${string}`;
  operatorSignature: `0x${string}`;
  operatorMessage: string;
  operatorCommitment: Hex32;
};

export type PolicyOperation =
  | "CREATE_POLICY"
  | "UPDATE_POLICY"
  | "ACTIVATE_POLICY"
  | "REVOKE_POLICY";

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

export type PolicyRecord = Policy & {
  policySeriesId: string;
  operatorAddress: `0x${string}`;
  operatorSignature: `0x${string}`;
  operatorMessage: string;
  operatorCommitment: Hex32;
};

export type CreatePolicyResponse = {
  policy: Policy;
};

export type UpdatePolicyResponse = {
  policy: Policy;
  previousPolicyId: string;
  previousPolicyVersion: number;
  previousPolicyHash: Hex32;
};

export type ActivatePolicyResponse = {
  policy: Policy;
  supersededPolicy: {
    policyId: string;
    policyVersion: number;
    policyHash: Hex32;
    status: "SUPERSEDED";
  } | null;
};

export type RevokePolicyResponse = {
  policy: Policy;
};

export type ActivePolicyResponse = {
  policy: Policy | null;
  effectiveStatus: EffectivePolicyStatus | null;
};
