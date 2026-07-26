import type {
  ZeroGSecurityProfile,
  ZeroGTrustMode,
  ZeroGVerificationMode,
} from "../../teeml/security-profile.js";

export type ZeroGChatMessage = Readonly<{
  role: "system" | "user";
  content: string;
}>;

export type ZeroGProviderCatalogEntry = Readonly<{
  address: string;
  model_id: string;
  canonical_id: string;
  service_type: "chatbot";
  type: "chatbot";
  is_healthy: boolean;
  verifiability: string;
  trust_mode: string | null;
  tee_attested: boolean;
  tee_acknowledged: boolean;
  supported_parameters: readonly string[];
}>;

export type ZeroGRouterConfig = Readonly<{
  baseUrl: string;
  apiKey: string;
  modelId: string;
  timeoutMs: number;
  maxOutputTokens: number;
  securityProfile: ZeroGSecurityProfile;
}>;

export type ZeroGVerifiedChatCompletionInput = Readonly<{
  messages: readonly ZeroGChatMessage[];
  responseFormat?: "json_object";
}>;

export type ZeroGTokenUsage = Readonly<{
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}>;

/**
 * Inputs documented by 0G for a later independent signature/content check.
 * This is a reference only; it is not a proof or attestation.
 */
export type ZeroGSignedContentReference = Readonly<{
  chatId: string;
  chatIdSource: "ZG-Res-Key" | "response.id";
  providerAddress: string;
  modelId: string;
  providerModelId: string;
}>;

export type ZeroGVerifiedChatCompletion = Readonly<{
  responseId: string;
  routerRequestId: string;
  providerAddress: string;
  modelId: string;
  content: string;
  usage: ZeroGTokenUsage;
  latencyMs: number;
  securityProfile: ZeroGSecurityProfile;
  trustMode: ZeroGTrustMode;
  verificationMode: ZeroGVerificationMode;
  sealedInference: boolean;
  teeVerified: true;
  zgResponseKey?: string;
  signedContentReference: ZeroGSignedContentReference;
}>;

export type ZeroGFetch = typeof fetch;

export type ZeroGClock = Readonly<{
  now: () => number;
  setTimeout: (callback: () => void, delayMs: number) => unknown;
  clearTimeout: (handle: unknown) => void;
}>;

export type ZeroGRouterDependencies = Readonly<{
  fetch?: ZeroGFetch;
  clock?: ZeroGClock;
  providerCatalogEntry?: unknown;
}>;
