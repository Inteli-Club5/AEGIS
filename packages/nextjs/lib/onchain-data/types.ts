export type Hex = `0x${string}`;
export type SourceChain = "hedera-testnet" | "0g-galileo";

export type GraphMeta = {
  block: {
    number: number;
    hash?: string | null;
    timestamp?: number | null;
  };
  deployment?: string | null;
  hasIndexingErrors: boolean;
};

export type IndexerFreshness = {
  source: SourceChain;
  indexedBlock: number | null;
  indexedBlockTimestamp: number | null;
  chainHeadBlock: number | null;
  chainHeadStatus: "reported" | "not-configured" | "unavailable";
  lagBlocks: number | null;
  ageSeconds: number | null;
  available: boolean;
  hasIndexingErrors: boolean | null;
  stale: boolean;
  deployment: string | null;
  checkedAt: string;
};

export type TeeMLValidation = {
  id: string;
  requestId: Hex;
  agentIdHash: Hex;
  agenticIdTokenId: string;
  safe: Hex;
  policyHash: Hex;
  actionHash: Hex;
  semanticContextHash: Hex;
  teemlRequestHash: Hex;
  artifactHash: Hex;
  modelIdHash: Hex;
  verdict: "ALLOW" | "DENY";
  reasonCodeHash: Hex;
  recorder: Hex;
  schemaVersion: number;
  transactionHash: Hex;
  blockNumber: string;
  blockTimestamp: string;
  logIndex: string;
  sourceChain: "hedera-testnet";
};

export type SafeExecution = {
  id: string;
  safe: Hex;
  agentIdHash?: Hex | null;
  safeTxHash: Hex;
  success: boolean;
  refundPayment: string;
  transactionHash: Hex;
  blockNumber: string;
  blockTimestamp: string;
  logIndex: string;
  sourceChain: "hedera-testnet";
};

export type PolicyReference = {
  id: string;
  policyHash: Hex;
  validationCount: string;
  allowCount: string;
  denyCount: string;
  firstReferencedAt: string;
  lastReferencedAt: string;
  sourceChain: "hedera-testnet";
};

export type AgentOnchainSummary = {
  id: string;
  agentIdHash: Hex;
  safe: Hex;
  agenticIdTokenId: string;
  validationCount: string;
  allowCount: string;
  denyCount: string;
  executionCount: string;
  executionSuccessCount: string;
  executionFailureCount: string;
  policyCount: string;
  firstActivityAt?: string | null;
  lastActivityAt?: string | null;
  sourceChain: "hedera-testnet";
};

export type DailyAgentMetric = {
  id: string;
  day: string;
  agentIdHash: Hex;
  validationCount: string;
  allowCount: string;
  denyCount: string;
  executionCount: string;
  executionSuccessCount: string;
  executionFailureCount: string;
};

export type AgenticIdentity = {
  id: string;
  contract: Hex;
  tokenId: string;
  owner: Hex;
  status: "ACTIVE" | "BURNED";
  seenMint: boolean;
  mintTransactionHash?: Hex | null;
  mintBlockNumber?: string | null;
  mintBlockTimestamp?: string | null;
  transactionHash: Hex;
  blockNumber: string;
  blockTimestamp: string;
  logIndex: string;
  firstSeenAt: string;
  lastUpdatedAt: string;
  currentAuthorizationCount: string;
  totalAuthorizationEvents: string;
  sourceChain: "0g-galileo";
};

export type AgenticIdentityOwnerChange = {
  id: string;
  identity: { id: string };
  contract: Hex;
  tokenId: string;
  previousOwner: Hex;
  newOwner: Hex;
  changeType: "MINT" | "TRANSFER" | "BURN";
  transactionHash: Hex;
  blockNumber: string;
  blockTimestamp: string;
  logIndex: string;
  sourceChain: "0g-galileo";
};

export type HederaAgentDetail = {
  item: AgentOnchainSummary | null;
  recentValidations: TeeMLValidation[];
  freshness: IndexerFreshness;
};

export type AgenticIdentityDetail = {
  item: AgenticIdentity | null;
  ownerChanges: {
    items: AgenticIdentityOwnerChange[];
    nextCursor: string | null;
  };
  freshness: IndexerFreshness;
};

export type SuppliedAgentLink = {
  agentId: string;
  safe?: string | null;
  agenticIdTokenId?: string | null;
  agenticIdContract?: string | null;
  agenticIdNetwork?: "0g-galileo" | null;
};

export type CrossChainAgentView = {
  id: string;
  agentId?: string;
  agentIdHash?: Hex | null;
  safe?: Hex | null;
  hedera: AgentOnchainSummary | null;
  zeroG: AgenticIdentity | null;
  state: "complete" | "hedera-only" | "zero-g-only" | "ambiguous" | "mismatch";
  matchedBy: Array<"agentIdHash" | "agenticId">;
  missingSources: SourceChain[];
  warnings: string[];
};

export type CrossChainAgentFilters = {
  agentIdHash?: string;
  safe?: string;
  owner?: string;
  status?: "ACTIVE" | "BURNED";
  tokenId?: string;
  contract?: string;
  dateFrom?: number;
  dateTo?: number;
};

export type CrossChainAgentPage = {
  items: CrossChainAgentView[];
  nextCursor: string | null;
  freshness: {
    hedera: IndexerFreshness;
    zeroG: IndexerFreshness;
  };
  sourceErrors: {
    hedera: string | null;
    zeroG: string | null;
  };
  collection: {
    phase: "hedera" | "zeroG";
    sourceWindowSize: number;
    candidateCap: number;
    candidateLookupTruncated: {
      hedera: boolean;
      zeroG: boolean;
    };
    snapshotBlocks: {
      hedera: number | null;
      zeroG: number | null;
    };
  };
};

export type OnchainOverviewMetrics = {
  scope: "complete" | "partial" | "unavailable";
  totalAgents: number | null;
  agenticIds: number | null;
  teeMLValidations: number | null;
  allow: number | null;
  deny: number | null;
  executions: number | null;
  payments: number | null;
  policiesReferenced: number | null;
};

export type HederaProtocolSummary = {
  id: string;
  totalAgents: string;
  totalValidations: string;
  totalAllow: string;
  totalDeny: string;
  totalExecutions: string;
  totalExecutionSuccess: string;
  totalExecutionFailure: string;
  totalPolicies: string;
  firstActivityAt?: string | null;
  lastActivityAt?: string | null;
};

export type ZeroGProtocolSummary = {
  id: string;
  distinctIdentityCount: string;
  mintEventCount: string;
  transferEventCount: string;
  burnEventCount: string;
  currentIdentityCount: string;
  totalOwnerChanges: string;
  firstActivityAt?: string | null;
  lastActivityAt?: string | null;
};

export type OnchainOverview = {
  metrics: OnchainOverviewMetrics;
  agents: CrossChainAgentView[];
  agentCollection: {
    limitPerSource: number;
    hederaComplete: boolean;
    zeroGComplete: boolean;
  };
  recentValidations: TeeMLValidation[];
  freshness: {
    hedera: IndexerFreshness;
    zeroG: IndexerFreshness;
  };
  sourceErrors: {
    hedera: string | null;
    zeroG: string | null;
  };
  support: {
    executions: "indexed" | "blocked" | "unsupported";
    payments: "indexed" | "blocked" | "unsupported";
    policies: "indexed" | "blocked" | "unsupported";
  };
};

export type PaginatedResult<T> = {
  items: T[];
  nextCursor: string | null;
  freshness: IndexerFreshness;
};
