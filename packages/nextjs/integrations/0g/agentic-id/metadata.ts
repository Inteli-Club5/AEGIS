import type { AgentProfileMetadata, AgenticIdIntelligentData, CreateAgenticIdForAegisAgentInput } from "./types";
import { type Hex, keccak256, stringToHex } from "viem";

const normalizeCapabilities = (capabilities: string[]) =>
  capabilities.map(capability => capability.trim()).filter(Boolean);

const sortObjectKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(sortObjectKeys);
  }

  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((sorted, key) => {
        sorted[key] = sortObjectKeys((value as Record<string, unknown>)[key]);
        return sorted;
      }, {});
  }

  return value;
};

export const stableStringify = (value: unknown) => JSON.stringify(sortObjectKeys(value));

export const hashAgenticField = (value: unknown): Hex => {
  const normalizedValue = typeof value === "string" ? value.trim() : stableStringify(value);
  return keccak256(stringToHex(normalizedValue));
};

export const buildAgentProfileMetadata = (
  input: CreateAgenticIdForAegisAgentInput,
): AgentProfileMetadata & Record<string, unknown> => {
  const capabilities = normalizeCapabilities(input.capabilities);

  const baseMetadata: AgentProfileMetadata = {
    name: input.agentName.trim(),
    description: input.agentDescription.trim(),
    attributes: [
      { trait_type: "Agent Type", value: input.agentType.trim() },
      { trait_type: "Capabilities", value: capabilities.join(", ") || "None" },
      { trait_type: "AEGIS Agent ID", value: input.aegisAgentId.trim() },
      { trait_type: "Policy Hash", value: input.policyHash.trim() },
    ],
    aegis: {
      schemaVersion: "aegis.agent-profile.v1",
      aegisAgentId: input.aegisAgentId.trim(),
      ownerAddress: input.ownerAddress.trim(),
      agentType: input.agentType.trim(),
      capabilities,
      agentWalletAddress: input.agentWalletAddress.trim(),
      policyHash: input.policyHash.trim(),
    },
  };

  if (!input.metadata) {
    return baseMetadata;
  }

  return {
    ...baseMetadata,
    extensions: input.metadata,
  };
};

export const buildMetadataHash = (metadata: Record<string, unknown>): Hex =>
  keccak256(stringToHex(stableStringify(metadata)));

export const buildAgenticIdIntelligentData = (
  input: CreateAgenticIdForAegisAgentInput,
  metadataHash: Hex,
): AgenticIdIntelligentData[] => {
  const capabilities = normalizeCapabilities(input.capabilities);

  return [
    { dataDescription: "aegisAgentId", dataHash: hashAgenticField(input.aegisAgentId) },
    { dataDescription: "agentName", dataHash: hashAgenticField(input.agentName) },
    { dataDescription: "agentDescription", dataHash: hashAgenticField(input.agentDescription) },
    { dataDescription: "agentType", dataHash: hashAgenticField(input.agentType) },
    { dataDescription: "capabilities", dataHash: hashAgenticField(capabilities) },
    { dataDescription: "agentWalletAddress", dataHash: hashAgenticField(input.agentWalletAddress) },
    { dataDescription: "policyHash", dataHash: hashAgenticField(input.policyHash) },
    { dataDescription: "metadataHash", dataHash: metadataHash },
  ];
};
