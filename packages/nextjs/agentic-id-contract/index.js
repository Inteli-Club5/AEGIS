// Vendored copy of packages/agentic-id-contract/index.js -- the Vercel CLI
// deploy uploads only this package's own directory (no sibling package
// access), so the shared module lives here too. Keep both copies (and the
// services/agent-service one) in sync by hand, same pattern as
// packages/nextjs/lib/policy/hash.ts.
export const AGENTIC_ID_REGISTRATION_SCHEMA =
  "aegis.agentic-id-registration.v1";
export const AGENT_PROFILE_SCHEMA = "aegis.agent-profile.v1";

export function stableStringify(value) {
  return JSON.stringify(sortObjectKeys(value));
}

export function buildCanonicalAgentProfileMetadata(input) {
  const capabilities = normalizeCapabilities(input.capabilities);
  const baseMetadata = {
    name: input.agentName.trim(),
    description: input.agentDescription.trim(),
    attributes: [
      { trait_type: "Agent Type", value: input.agentType.trim() },
      {
        trait_type: "Capabilities",
        value: capabilities.join(", ") || "None",
      },
      { trait_type: "AEGIS Agent ID", value: input.aegisAgentId.trim() },
      { trait_type: "Policy Hash", value: input.policyHash.trim() },
    ],
    aegis: {
      schemaVersion: AGENT_PROFILE_SCHEMA,
      aegisAgentId: input.aegisAgentId.trim(),
      ownerAddress: input.ownerAddress.trim(),
      agentType: input.agentType.trim(),
      capabilities,
      agentWalletAddress: input.agentWalletAddress.trim(),
      policyHash: input.policyHash.trim(),
    },
  };
  if (!input.metadata) return baseMetadata;
  return { ...baseMetadata, extensions: input.metadata };
}

export function buildCanonicalAgenticIdIntelligentData(
  input,
  metadataHash,
  hashValue,
) {
  const capabilities = normalizeCapabilities(input.capabilities);
  return [
    {
      dataDescription: "aegisAgentId",
      dataHash: hashValue(input.aegisAgentId),
    },
    { dataDescription: "agentName", dataHash: hashValue(input.agentName) },
    {
      dataDescription: "agentDescription",
      dataHash: hashValue(input.agentDescription),
    },
    { dataDescription: "agentType", dataHash: hashValue(input.agentType) },
    { dataDescription: "capabilities", dataHash: hashValue(capabilities) },
    {
      dataDescription: "agentWalletAddress",
      dataHash: hashValue(input.agentWalletAddress),
    },
    { dataDescription: "policyHash", dataHash: hashValue(input.policyHash) },
    { dataDescription: "metadataHash", dataHash: metadataHash },
  ];
}

export function buildAgenticIdRegistrationCommitment(input) {
  return {
    schemaVersion: AGENTIC_ID_REGISTRATION_SCHEMA,
    request: input.request,
    chainId: input.chainId,
    contractAddress: input.contractAddress.toLowerCase(),
  };
}

function normalizeCapabilities(capabilities) {
  return capabilities.map(capability => capability.trim()).filter(Boolean);
}

function sortObjectKeys(value) {
  if (Array.isArray(value)) return value.map(sortObjectKeys);
  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((sorted, key) => {
        sorted[key] = sortObjectKeys(value[key]);
        return sorted;
      }, {});
  }
  return value;
}
