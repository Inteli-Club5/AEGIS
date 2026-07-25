import type { Address, Hex } from "viem";

export type AgenticIdIntelligentData = {
  dataDescription: string;
  dataHash: Hex;
};

export type AgentProfileMetadata = {
  name: string;
  description: string;
  attributes: Array<{
    trait_type: string;
    value: string;
  }>;
  aegis: {
    schemaVersion: "aegis.agent-profile.v1";
    aegisAgentId: string;
    ownerAddress: string;
    agentType: string;
    capabilities: string[];
    agentWalletAddress: string;
    policyHash: string;
  };
};

export type CreateAgenticIdForAegisAgentInput = {
  aegisAgentId: string;
  ownerAddress: Address;
  agentName: string;
  agentDescription: string;
  agentType: string;
  capabilities: string[];
  agentWalletAddress: Address;
  policyHash: Hex;
  expectedChainId: number;
  expectedAgenticIdContractAddress: Address;
  metadata?: Record<string, unknown>;
};

export type CreateAgenticIdForAegisAgentResult = {
  aegisAgentId: string;
  chainId: number;
  agenticIdTokenId: string;
  agenticIdContractAddress: Address;
  metadataHash: Hex;
  metadataRootHash: string;
  metadataURI: string;
  metadata: Record<string, unknown>;
  intelligentData: AgenticIdIntelligentData[];
  metadataUploadTxHash: string;
  mintTxHash: Hex;
  txHash: Hex;
  setTokenUriTxHash: Hex;
  transferTxHash: Hex | null;
  explorerUrl: string;
  ownerAddress: Address;
  serviceSignerAddress: Address;
  finalTokenOwner: Address;
};

export type AgentProfile = CreateAgenticIdForAegisAgentInput &
  CreateAgenticIdForAegisAgentResult & {
    createdAt: string;
  };
