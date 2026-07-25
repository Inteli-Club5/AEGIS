export type AgentType = "Payment" | "API Buyer" | "DeFi" | "Treasury" | "Other";

export * from "./policy-engine/types.js";

export type CreateAgentInput = {
  ownerWallet: string;
  name: string;
  type: AgentType;
  endpoint?: string;
  description?: string;
};

// Public-facing profile - never includes the agent's private key.
export type AgentProfile = {
  agentId: string;
  ownerWallet: string;
  name: string;
  type: AgentType;
  endpoint?: string;
  description?: string;
  hederaAccountId: string;
  evmAddress: string;
  publicKey: string;
  toolNames: string[];
  status: "active" | "inactive";
  createdAt: string;
  safeAddress?: string;
  agenticId?: {
    tokenId: string;
    contractAddress: string;
    metadataURI: string;
    explorerUrl: string;
  };
};
