import type { TeeMlChatMessage } from "./prompt.js";
import { TeeMlError } from "./errors.js";
import type {
  ZeroGSecurityProfile,
  ZeroGTrustMode,
  ZeroGVerificationMode,
} from "./security-profile.js";

export type TeeMlInferenceResult = {
  responseId?: string;
  routerRequestId: string;
  providerAddress?: string;
  modelId: string;
  content: string;
  promptTokens?: number;
  completionTokens?: number;
  latencyMs: number;
  securityProfile: ZeroGSecurityProfile;
  trustMode: ZeroGTrustMode;
  verificationMode: ZeroGVerificationMode;
  sealedInference: boolean;
  teeVerified: true;
};

export type TeeMlInferenceGateway = {
  complete(
    messages: readonly TeeMlChatMessage[],
  ): Promise<TeeMlInferenceResult>;
};

export class UnconfiguredTeeMlInferenceGateway
  implements TeeMlInferenceGateway
{
  async complete(): Promise<never> {
    throw new TeeMlError(
      "TEEML_CONFIG_ERROR",
      "0G Router configuration is missing",
    );
  }
}
