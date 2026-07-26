import type { Hex32 } from "../policy-engine/types.js";
import type {
  ZeroGSecurityProfile,
  ZeroGTrustMode,
  ZeroGVerificationMode,
} from "./security-profile.js";

export const TEEML_CONTEXT_SCHEMA_VERSION = "1.0" as const;
export const SEMANTIC_CONTEXT_HASH_SCHEMA = "aegis.teeml.semantic-context.v1" as const;
export const TEEML_REQUEST_HASH_SCHEMA = "aegis.teeml.request.v1" as const;

export type TeeMlActionType =
  | "HEDERA_HBAR_TRANSFER"
  | "HEDERA_HTS_FUNGIBLE_TRANSFER";

export type TrustedSemanticContext = {
  schemaVersion: typeof TEEML_CONTEXT_SCHEMA_VERSION;
  requestId: string;
  agent: {
    agentId: string;
    agenticId: string;
    capabilityIds: string[];
  };
  policy: {
    policyId: string;
    policyVersion: number;
    policyHash: Hex32;
    semanticRules: string[];
  };
  action: {
    actionHash: Hex32;
    actionType: TeeMlActionType;
    destination: string;
    assetId: string;
    amount: string;
  };
  trustedService?: {
    providerId: string;
    serviceId: string;
    productId?: string;
    categoryIds: string[];
    capabilityIds: string[];
    metadataHash: Hex32;
    shortDescription?: string;
  };
  trustedOperatorTask?: {
    taskId: string;
    taskType: string;
    taskHash: Hex32;
    shortSummary: string;
    expiresAt: number;
  };
};

export type TeeMlSemanticVerdictValue = "ALLOW" | "DENY";

export const TEEML_SEMANTIC_REASON_CODES = [
  "SEMANTIC_POLICY_MATCH",
  "ACTION_OUTSIDE_SEMANTIC_POLICY",
  "ACTION_OUTSIDE_AGENT_CAPABILITIES",
  "SERVICE_PURPOSE_MISMATCH",
  "TRUSTED_METADATA_MISMATCH",
  "INSUFFICIENT_TRUSTED_CONTEXT",
  "POTENTIAL_PROMPT_INJECTION",
] as const;

export type TeeMlSemanticReasonCode = (typeof TEEML_SEMANTIC_REASON_CODES)[number];

export type TeeMlSemanticVerdict = {
  schemaVersion: typeof TEEML_CONTEXT_SCHEMA_VERSION;
  verdict: TeeMlSemanticVerdictValue;
  reasonCode: TeeMlSemanticReasonCode;
  requestId: string;
  policyHash: Hex32;
  actionHash: Hex32;
  semanticContextHash: Hex32;
  teemlRequestHash: Hex32;
};

export const TEEML_TECHNICAL_REASON_CODES = [
  "TEEML_CONFIG_ERROR",
  "TEEML_PROVIDER_ERROR",
  "TEEML_TIMEOUT",
  "TEEML_OUTPUT_INVALID",
  "TEEML_HASH_MISMATCH",
  "TEEML_NOT_PRIVATE",
  "TEEML_NOT_VERIFIED",
  "TEEML_TRUSTED_CONTEXT_MISSING",
  "TEEML_CONFLICT",
  "TEEML_UNKNOWN_RESULT",
] as const;

export type TeeMlTechnicalReasonCode = (typeof TEEML_TECHNICAL_REASON_CODES)[number];

export type VerifiedTeeMlArtifact = {
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
  verdict: TeeMlSemanticVerdictValue;
  reasonCode: TeeMlSemanticReasonCode;
  providerAddress?: string;
  modelId: string;
  securityProfile: ZeroGSecurityProfile;
  trustMode: ZeroGTrustMode;
  verificationMode: ZeroGVerificationMode;
  sealedInference: boolean;
  teeVerified: true;
  responseId?: string;
  responseHash: Hex32;
  traceHash?: Hex32;
  promptTokens?: number;
  completionTokens?: number;
  latencyMs: number;
  evaluatedAt: number;
};
