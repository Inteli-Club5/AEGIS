import type {
  PersistedNormalizedAction,
  UsageHoldStatus,
} from "../policy-engine/precheck.js";
import type {
  Hex32,
  PolicyRules,
  SemanticRule,
} from "../policy-engine/types.js";
import type {
  TeeMlSemanticReasonCode,
  TeeMlSemanticVerdictValue,
  TeeMlTechnicalReasonCode,
  VerifiedTeeMlArtifact,
} from "./types.js";
import { TeeMlError } from "./errors.js";
import type {
  ZeroGSecurityProfile,
  ZeroGTrustMode,
  ZeroGVerificationMode,
} from "./security-profile.js";

export type TeeMlActionStatus =
  | "PENDING_TEEML"
  | "TEEML_PROCESSING"
  | "TEEML_ALLOWED"
  | "TEETLS_HACKATHON_ALLOWED"
  | "TEEML_DENIED"
  | "TEEML_FAILED";

export type AgentSemanticProfileRecord = {
  agentId: string;
  agenticId: string;
  contractAddress: `0x${string}`;
  tokenId: string;
  metadataHash: Hex32;
  capabilityIds: string[];
  registeredAt: number;
  updatedAt: number;
};

type TeeMlTrustedSourceBase = {
  requestId: string;
  actionStatus: TeeMlActionStatus;
  precheckId: string;
  agentId: string;
  walletId: string;
  policyId: string;
  policyVersion: number;
  policyHash: Hex32;
  actionHash: Hex32;
  usageHoldId: string;
  usageHoldStatus: UsageHoldStatus;
  usageHoldExpiresAt: number;
};

export type TeeMlAvailableTrustedSources = TeeMlTrustedSourceBase & {
  commitmentStatus: "AVAILABLE";
  aegisNonce: string;
  action: PersistedNormalizedAction;
  durablePolicy: {
    policyId: string;
    agentId: string;
    walletId: string;
    policyVersion: number;
    policyHash: Hex32;
    validFrom: number;
    validUntil: number | null;
    rules: PolicyRules;
    semanticRules: SemanticRule[];
  };
  agentProfile: AgentSemanticProfileRecord | null;
};

export type TeeMlTrustedSources =
  | TeeMlAvailableTrustedSources
  | (TeeMlTrustedSourceBase & {
      commitmentStatus: "UNAVAILABLE";
    });

export type TeeMlVerificationStatus =
  | "PROCESSING"
  | "ALLOWED"
  | "TEETLS_HACKATHON_ALLOWED"
  | "DENIED"
  | "FAILED";

export type TeeMlVerificationRecord = {
  verificationId: string;
  requestId: string;
  precheckId: string;
  agentId: string;
  agenticId: string;
  policyId: string;
  policyVersion: number;
  policyHash: Hex32;
  actionHash: Hex32;
  semanticContextHash: Hex32;
  teemlRequestHash: Hex32;
  status: TeeMlVerificationStatus;
  verdict: TeeMlSemanticVerdictValue | null;
  reasonCode: TeeMlSemanticReasonCode | null;
  technicalReasonCode: TeeMlTechnicalReasonCode | null;
  providerAddress: string | null;
  modelId: string | null;
  securityProfile: ZeroGSecurityProfile | null;
  trustMode: ZeroGTrustMode | null;
  verificationMode: ZeroGVerificationMode | null;
  sealedInference: boolean | null;
  teeVerified: true | null;
  responseId: string | null;
  responseHash: Hex32 | null;
  traceHash: Hex32 | null;
  promptTokens: number | null;
  completionTokens: number | null;
  latencyMs: number | null;
  evaluatedAt: number | null;
  createdAt: number;
  updatedAt: number;
};

export type StartTeeMlVerificationInput = {
  verificationId: string;
  requestId: string;
  precheckId: string;
  agentId: string;
  agenticId: string;
  policyId: string;
  policyVersion: number;
  policyHash: Hex32;
  actionHash: Hex32;
  semanticContextHash: Hex32;
  teemlRequestHash: Hex32;
  now: number;
};

export type FailTeeMlBeforeContextInput = {
  eventId: string;
  requestId: string;
  precheckId: string;
  agentId: string;
  policyHash: Hex32;
  actionHash: Hex32;
  reasonCode: "TEEML_TRUSTED_CONTEXT_MISSING" | "TEEML_CONFLICT";
  occurredAt: number;
  retentionUntil: number;
};

export type FailTeeMlVerificationInput = {
  eventId: string;
  verificationId: string;
  requestId: string;
  precheckId: string;
  agentId: string;
  policyHash: Hex32;
  actionHash: Hex32;
  semanticContextHash: Hex32;
  teemlRequestHash: Hex32;
  reasonCode: TeeMlTechnicalReasonCode;
  occurredAt: number;
  retentionUntil: number;
};

export type CompleteTeeMlVerificationInput = {
  eventId: string;
  artifact: VerifiedTeeMlArtifact;
  retentionUntil: number;
};

export type TeeMlTransaction = {
  getTrustedSources(requestId: string): Promise<TeeMlTrustedSources | null>;
  getVerification(requestId: string): Promise<TeeMlVerificationRecord | null>;
  startVerification(input: StartTeeMlVerificationInput): Promise<void>;
  completeVerification(input: CompleteTeeMlVerificationInput): Promise<void>;
  failVerification(input: FailTeeMlVerificationInput): Promise<void>;
  failBeforeContext(input: FailTeeMlBeforeContextInput): Promise<void>;
};

export type TeeMlRepository = {
  runLocked<T>(
    requestId: string,
    run: (transaction: TeeMlTransaction) => Promise<T>,
  ): Promise<T>;
  saveAgentSemanticProfile(profile: AgentSemanticProfileRecord): Promise<void>;
};

export class UnconfiguredTeeMlRepository implements TeeMlRepository {
  async runLocked(): Promise<never> {
    throw new TeeMlError(
      "TEEML_CONFIG_ERROR",
      "DATABASE_URL is required for TeeML persistence",
    );
  }

  async saveAgentSemanticProfile(): Promise<never> {
    throw new TeeMlError(
      "TEEML_CONFIG_ERROR",
      "DATABASE_URL is required for TeeML persistence",
    );
  }
}
