import type { Hex32 } from "../policy-engine/types.js";
import type { AgentSemanticProfile } from "./agent-semantic-profile.js";
import type { AgentSemanticProfileRecord } from "./repository.js";

export type AgenticIdRegistrationClaim =
  | { status: "CLAIMED" }
  | { status: "IN_PROGRESS" }
  | { status: "UNKNOWN" }
  | CompletedAgenticIdRegistration;

export type CompletedAgenticIdRegistration = {
  status: "COMPLETED";
  semanticProfile: AgentSemanticProfileRecord;
  metadataURI: string;
  explorerUrl: string;
};

export type ClaimAgenticIdRegistrationInput = {
  agentId: string;
  registrationHash: Hex32;
  ownerAddress: `0x${string}`;
  safeAddress: `0x${string}`;
  now: number;
};

export type MarkAgenticIdRegistrationUnknownInput = Pick<
  ClaimAgenticIdRegistrationInput,
  "agentId" | "registrationHash" | "now"
>;

export type FindCompletedAgenticIdRegistrationInput = Omit<
  ClaimAgenticIdRegistrationInput,
  "now"
>;

export type CompleteAgenticIdRegistrationInput = {
  agentId: string;
  registrationHash: Hex32;
  semanticProfile: AgentSemanticProfile;
  metadataURI: string;
  explorerUrl: string;
  completedAt: number;
};

export type AgenticIdRegistrationRepository = {
  findCompleted(
    input: FindCompletedAgenticIdRegistrationInput,
  ): Promise<CompletedAgenticIdRegistration | null>;
  claim(
    input: ClaimAgenticIdRegistrationInput,
  ): Promise<AgenticIdRegistrationClaim>;
  complete(input: CompleteAgenticIdRegistrationInput): Promise<void>;
  markUnknown(input: MarkAgenticIdRegistrationUnknownInput): Promise<void>;
};

export type AgenticIdRegistrationStoreErrorCode =
  | "CONFLICT"
  | "INVALID_STATE"
  | "UNAVAILABLE";

export class AgenticIdRegistrationStoreError extends Error {
  constructor(
    readonly code: AgenticIdRegistrationStoreErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export class UnconfiguredAgenticIdRegistrationRepository
  implements AgenticIdRegistrationRepository
{
  async findCompleted(): Promise<never> {
    throw new AgenticIdRegistrationStoreError(
      "UNAVAILABLE",
      "agentic_id_registration_store_unavailable",
    );
  }

  async claim(): Promise<never> {
    throw new AgenticIdRegistrationStoreError(
      "UNAVAILABLE",
      "agentic_id_registration_store_unavailable",
    );
  }

  async complete(): Promise<never> {
    throw new AgenticIdRegistrationStoreError(
      "UNAVAILABLE",
      "agentic_id_registration_store_unavailable",
    );
  }

  async markUnknown(): Promise<never> {
    throw new AgenticIdRegistrationStoreError(
      "UNAVAILABLE",
      "agentic_id_registration_store_unavailable",
    );
  }
}
