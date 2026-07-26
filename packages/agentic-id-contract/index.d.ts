export const AGENTIC_ID_REGISTRATION_SCHEMA:
  "aegis.agentic-id-registration.v1";
export const AGENT_PROFILE_SCHEMA: "aegis.agent-profile.v1";

export type CanonicalAgentProfileInput = {
  aegisAgentId: string;
  ownerAddress: string;
  agentName: string;
  agentDescription: string;
  agentType: string;
  capabilities: readonly string[];
  agentWalletAddress: string;
  policyHash: string;
  metadata?: Record<string, unknown>;
};

export type CanonicalAgenticIdIntelligentDatum<Hash extends string> = {
  dataDescription: string;
  dataHash: Hash;
};

export function stableStringify(value: unknown): string;

export function buildCanonicalAgentProfileMetadata(
  input: CanonicalAgentProfileInput,
): Record<string, unknown>;

export function buildCanonicalAgenticIdIntelligentData<Hash extends string>(
  input: CanonicalAgentProfileInput,
  metadataHash: Hash,
  hashValue: (value: unknown) => Hash,
): Array<CanonicalAgenticIdIntelligentDatum<Hash>>;

export function buildAgenticIdRegistrationCommitment<
  Request extends CanonicalAgentProfileInput,
>(input: {
  request: Request;
  chainId: number;
  contractAddress: string;
}): {
  schemaVersion: typeof AGENTIC_ID_REGISTRATION_SCHEMA;
  request: Request;
  chainId: number;
  contractAddress: string;
};
