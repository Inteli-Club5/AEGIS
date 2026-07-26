const EVM_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const HEX_32_RE = /^0x[a-fA-F0-9]{64}$/;
const UINT256_MAX = (1n << 256n) - 1n;
const CANONICAL_TOKEN_ID_RE = /^(0|[1-9][0-9]*)$/;
const CAPABILITY_ID_RE = /^[a-z0-9][a-z0-9._:/-]{0,127}$/;
const AGENT_ID_RE = /^[a-z0-9][a-z0-9._:/-]{0,127}$/;
const MAX_AGENT_CAPABILITIES = 20;

export type AgentSemanticProfile = Readonly<{
  agentId: string;
  agenticId: string;
  contractAddress: `0x${string}`;
  tokenId: string;
  metadataHash: `0x${string}`;
  capabilityIds: readonly string[];
}>;

export type PersistAgentSemanticProfile = (
  profile: AgentSemanticProfile,
) => void | Promise<void>;

export function normalizeAgentCapabilityIds(toolNames: readonly string[]): readonly string[] {
  if (!Array.isArray(toolNames) || toolNames.length === 0) {
    throw new Error("agent_capabilities_required");
  }

  const normalized = toolNames.map(toolName => {
    if (typeof toolName !== "string") {
      throw new Error("invalid_agent_capability_id");
    }
    const capabilityId = toolName.trim().toLowerCase();
    if (!CAPABILITY_ID_RE.test(capabilityId)) {
      throw new Error("invalid_agent_capability_id");
    }
    return capabilityId;
  });
  const capabilityIds = [...new Set(normalized)].sort();
  if (capabilityIds.length > MAX_AGENT_CAPABILITIES) {
    throw new Error("agent_capabilities_too_large");
  }
  if (capabilityIds.length === 0) {
    throw new Error("agent_capabilities_required");
  }
  return Object.freeze(capabilityIds);
}

export function buildStableAgenticId(contractAddress: string, tokenId: string): string {
  return `0g-agentic-id:${normalizeContractAddress(contractAddress)}:${normalizeTokenId(tokenId)}`;
}

export function buildAgentSemanticProfile(input: {
  agentId: string;
  contractAddress: string;
  tokenId: string;
  metadataHash: string;
  toolNames: readonly string[];
}): AgentSemanticProfile {
  const agentId = normalizeAgentId(input.agentId);
  const contractAddress = normalizeContractAddress(input.contractAddress);
  const tokenId = normalizeTokenId(input.tokenId);
  const metadataHash = normalizeMetadataHash(input.metadataHash);
  const capabilityIds = normalizeAgentCapabilityIds(input.toolNames);

  return Object.freeze({
    agentId,
    agenticId: buildStableAgenticId(contractAddress, tokenId),
    contractAddress,
    tokenId,
    metadataHash,
    capabilityIds,
  });
}

function normalizeAgentId(value: string): string {
  if (typeof value !== "string") {
    throw new Error("invalid_agent_id");
  }
  const normalized = value.trim().toLowerCase();
  if (!AGENT_ID_RE.test(normalized)) {
    throw new Error("invalid_agent_id");
  }
  return normalized;
}

function normalizeContractAddress(value: string): `0x${string}` {
  if (typeof value !== "string" || !EVM_ADDRESS_RE.test(value)) {
    throw new Error("invalid_agentic_id_contract_address");
  }
  return value.toLowerCase() as `0x${string}`;
}

function normalizeTokenId(value: string): string {
  if (typeof value !== "string" || !CANONICAL_TOKEN_ID_RE.test(value)) {
    throw new Error("invalid_agentic_id_token_id");
  }
  const tokenId = BigInt(value);
  if (tokenId > UINT256_MAX) {
    throw new Error("invalid_agentic_id_token_id");
  }
  return tokenId.toString();
}

function normalizeMetadataHash(value: string): `0x${string}` {
  if (typeof value !== "string" || !HEX_32_RE.test(value)) {
    throw new Error("invalid_agentic_id_metadata_hash");
  }
  return value.toLowerCase() as `0x${string}`;
}
