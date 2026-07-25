export type AgentStatus = "protected" | "unprotected" | "paused" | "compromised";

export interface Agent {
  id: string;
  name: string;
  type: string;
  status: AgentStatus;
  wallet: string;
  balanceHbar: number;
  policySummary: string;
  lastActionAgo: string;
}

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

export interface AgentProfile {
  id: string;
  name: string;
  type: AgentType;
  description?: string;
  capabilities: Capability[];
  createdAt: string;
}

export interface ProtectedWalletInfo {
  address: string;
  agentSigner: string;
  aegisCosigner: string;
  guardian: string;
  guardianManaged: boolean;
  threshold: "2-of-3";
}

export interface PolicyRecord {
  policyHash: string;
  fields: Record<string, string>;
}

export interface AgenticIdInfo {
  tokenId: string;
  contractAddress: string;
  metadataURI: string;
  explorerUrl: string;
}

export interface AgentDetail extends Agent {
  description?: string;
  capabilities: Capability[];
  createdAt: string;
  walletInfo: ProtectedWalletInfo | null;
  policy: PolicyRecord | null;
  hederaAccountId?: string;
  agenticId?: AgenticIdInfo;
}

export type StatsPeriod = 7 | 30 | 90 | "all";

export interface DashboardStats {
  totalTrades: number;
  approved: number;
  denied: number;
  hbarTransacted: number;
}

export type Verdict = "ALLOW" | "DENY";
export type VerificationMode = "real" | "fallback";

export interface ActivityEntry {
  id: string;
  agentId: string;
  agentName: string;
  actionType: string;
  timestamp: string;
  verdict: Verdict;
  mode: VerificationMode;
  amountHbar: number;
  token: "HBAR";
  reason?: string;
}
