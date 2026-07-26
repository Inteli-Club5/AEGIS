import type { Hex32, PolicyRules, SemanticRule } from "~~/lib/policy/hash";

export type AgentStatus = "protected" | "unprotected" | "paused" | "compromised";
export type AgentLifecycleStatus = "ACTIVE" | "PAUSED" | "RETIRED";

export type Agent = {
  id: string;
  name: string;
  type: string;
  status: AgentStatus;
  wallet: string;
  policySummary: string;
};

export type AgentType = "Payment Agent" | "API Buyer" | "Treasury Agent" | "DeFi Agent" | "Custom";

export type Capability =
  | "pay_service_provider"
  | "call_api"
  | "transfer_tokens"
  | "execute_defi_action"
  | "request_approval";

export const CAPABILITY_LABELS: Record<Capability, string> = {
  pay_service_provider: "Pay service provider",
  call_api: "Call API",
  transfer_tokens: "Transfer tokens",
  execute_defi_action: "Execute DeFi action",
  request_approval: "Request approval",
};

export type AgentProfile = {
  id: string;
  name: string;
  type: AgentType;
  description?: string;
  capabilities: Capability[];
  createdAt: string;
};

export type ProtectedWalletInfo = {
  walletId: string;
  address: string;
  networkId: "hedera:testnet";
  status: "PROTECTED" | "PAUSED" | "RETIRED" | "DEAD";
  agentSigner?: string;
  aegisCosigner?: string;
  guardian?: string;
  guardianManaged: boolean;
  threshold: "2-of-3";
};

export type PolicyStatus = "DRAFT" | "ACTIVE" | "SUPERSEDED" | "REVOKED";
export type EffectivePolicyStatus = PolicyStatus | "EXPIRED";

export type Policy = {
  policyId: string;
  agentId: string;
  walletId: string;
  policyVersion: number;
  policyHash: Hex32;
  status: PolicyStatus;
  validFrom: number;
  validUntil: number | null;
  rules: PolicyRules;
  semanticRules: SemanticRule[];
  createdAt: number;
  updatedAt: number;
  activatedAt: number | null;
  revokedAt: number | null;
  supersededAt: number | null;
  supersededByPolicyId: string | null;
};

export type PolicyRecord = Policy;

export type AgenticIdInfo = {
  tokenId: string;
  contractAddress: string;
  metadataURI: string;
  explorerUrl: string;
};

export type AgentDetail = Agent & {
  agentLifecycleStatus: AgentLifecycleStatus;
  description?: string;
  capabilities: Capability[];
  createdAt: string;
  walletInfo: ProtectedWalletInfo | null;
  policy: Policy | null;
  policyVersions: Policy[];
  activePolicy: Policy | null;
  effectivePolicyStatus: EffectivePolicyStatus | null;
  policyLoadError?: string;
  hederaAccountId?: string;
  agenticId?: AgenticIdInfo;
};
