import { TeeMlError } from "../../teeml/errors.js";
import {
  UnconfiguredTeeMlInferenceGateway,
  type TeeMlInferenceGateway,
  type TeeMlInferenceResult,
} from "../../teeml/inference-gateway.js";
import {
  HACKATHON_TESTNET_TEETLS_PROFILE,
  parseZeroGSecurityProfile,
  type ZeroGSecurityProfile,
} from "../../teeml/security-profile.js";
import type { TeeMlChatMessage } from "../../teeml/prompt.js";
import { createZeroGDirectInferenceFromEnv } from "./zero-g-direct-inference.js";
import { ZeroGRouterClient } from "./zero-g-router-client.js";
import {
  ZeroGRouterError,
  type ZeroGRouterFailureReason,
  type ZeroGRouterFailureStage,
} from "./zero-g-router-errors.js";
import {
  OFFICIAL_ZERO_G_MAINNET_ROUTER_BASE_URL,
  resolveZeroGRouterNetwork,
} from "./zero-g-network.js";
import {
  ZeroGSignedResponseVerificationError,
  ZeroGSignedResponseVerifier,
  type ZeroGSignedResponseVerificationFailureReason,
} from "./zero-g-signed-response-verifier.js";

export const DEFAULT_ZERO_G_ROUTER_BASE_URL =
  OFFICIAL_ZERO_G_MAINNET_ROUTER_BASE_URL;
export const DEFAULT_ZERO_G_TEEML_TIMEOUT_MS = 30_000;
export const DEFAULT_ZERO_G_TEEML_MAX_OUTPUT_TOKENS = 768;
const MAX_ZERO_G_TEEML_TIMEOUT_MS = 5 * 60 * 1_000;

type ZeroGOperationalStage =
  | ZeroGRouterFailureStage
  | "BEFORE_VERIFICATION";
type ZeroGOperationalReason =
  | ZeroGRouterFailureReason
  | ZeroGSignedResponseVerificationFailureReason;

export class ZeroGInferenceOperationalError extends TeeMlError {
  constructor(
    code: ConstructorParameters<typeof TeeMlError>[0],
    requestDispatched: boolean,
    readonly providerStage: ZeroGOperationalStage,
    readonly providerReason: ZeroGOperationalReason,
    readonly upstreamHttpStatus?: number,
  ) {
    super(code, code, requestDispatched);
    this.name = "ZeroGInferenceOperationalError";
  }
}

export class ZeroGSemanticInferenceGateway implements TeeMlInferenceGateway {
  constructor(
    private readonly router: Pick<
      ZeroGRouterClient,
      "createVerifiedChatCompletion"
    >,
    private readonly signedResponseVerifier: Pick<
      ZeroGSignedResponseVerifier,
      "verify"
    >,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async complete(
    messages: readonly TeeMlChatMessage[],
  ): Promise<TeeMlInferenceResult> {
    const startedAt = this.now();
    try {
      const completion = await this.router.createVerifiedChatCompletion({
        messages,
        responseFormat: "json_object",
      });
      await this.signedResponseVerifier.verify({
        reference: completion.signedContentReference,
        content: completion.content,
      });
      return {
        responseId: completion.responseId,
        routerRequestId: completion.routerRequestId,
        providerAddress: completion.providerAddress,
        modelId: completion.modelId,
        content: completion.content,
        promptTokens: completion.usage.promptTokens,
        completionTokens: completion.usage.completionTokens,
        latencyMs: elapsedMilliseconds(startedAt, this.now()),
        securityProfile: completion.securityProfile,
        trustMode: completion.trustMode,
        verificationMode: completion.verificationMode,
        sealedInference: completion.sealedInference,
        teeVerified: true,
      };
    } catch (error) {
      throw mapZeroGError(error);
    }
  }
}

export function createZeroGSemanticInferenceFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): TeeMlInferenceGateway {
  if (
    parseZeroGSecurityProfile(env.ZG_TEEML_SECURITY_PROFILE) ===
    HACKATHON_TESTNET_TEETLS_PROFILE
  ) {
    // The Router's own completion proxy leaves the hackathon TeeTLS provider's
    // signed-response endpoint unresolvable afterward (chat_id_not_found),
    // reproduced consistently and confirmed independent of verify_tee. The
    // SDK's direct broker/ledger session against the same provider verifies
    // successfully, so the hackathon profile bypasses the Router entirely.
    // See docs/0g/teeml-semantic-verifier.md.
    return createZeroGDirectInferenceFromEnv(env);
  }

  const apiKey = env.ZG_ROUTER_API_KEY;
  const modelId = env.ZG_TEEML_MODEL;
  if (!apiKey || !modelId) {
    return new UnconfiguredTeeMlInferenceGateway();
  }

  const timeoutMs = parseEnvPositiveInteger(
    env.ZG_TEEML_TIMEOUT_MS,
    DEFAULT_ZERO_G_TEEML_TIMEOUT_MS,
  );
  const maxOutputTokens = parseEnvPositiveInteger(
    env.ZG_TEEML_MAX_OUTPUT_TOKENS,
    DEFAULT_ZERO_G_TEEML_MAX_OUTPUT_TOKENS,
  );
  if (timeoutMs === null || maxOutputTokens === null) {
    return new UnconfiguredTeeMlInferenceGateway();
  }

  try {
    const timeoutBudget = splitZeroGTimeoutBudget(timeoutMs);
    const network = resolveZeroGRouterNetwork(
      env.ZG_ROUTER_BASE_URL ?? DEFAULT_ZERO_G_ROUTER_BASE_URL,
    );
    const securityProfile = parseZeroGSecurityProfile(
      env.ZG_TEEML_SECURITY_PROFILE,
    );
    return new ZeroGSemanticInferenceGateway(
      new ZeroGRouterClient({
        baseUrl: network.routerBaseUrl,
        apiKey,
        modelId,
        timeoutMs: timeoutBudget.routerPhaseMs,
        maxOutputTokens,
        securityProfile,
      }),
      new ZeroGSignedResponseVerifier({
        timeoutMs: timeoutBudget.signedVerificationMs,
        network: network.name,
        securityProfile,
      }),
    );
  } catch {
    return new UnconfiguredTeeMlInferenceGateway();
  }
}

export function resolveZeroGSecurityProfileFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): ZeroGSecurityProfile {
  return parseZeroGSecurityProfile(env.ZG_TEEML_SECURITY_PROFILE);
}

export function splitZeroGTimeoutBudget(timeoutMs: number): Readonly<{
  routerPhaseMs: number;
  signedVerificationMs: number;
}> {
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < 3 ||
    timeoutMs > MAX_ZERO_G_TEEML_TIMEOUT_MS
  ) {
    throw new Error("ZG_TEEML_TIMEOUT_MS must be between 3 and 300000");
  }
  const routerPhaseMs = Math.floor(timeoutMs / 3);
  return {
    routerPhaseMs,
    signedVerificationMs: timeoutMs - routerPhaseMs * 2,
  };
}

function parseEnvPositiveInteger(
  value: string | undefined,
  defaultValue: number,
): number | null {
  if (value === undefined || value.trim() === "") return defaultValue;
  if (!/^[1-9][0-9]*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function mapZeroGError(error: unknown): TeeMlError {
  if (error instanceof TeeMlError) return error;
  if (error instanceof ZeroGRouterError) {
    if (error.stage === "UNKNOWN_RESULT") {
      return new ZeroGInferenceOperationalError(
        "TEEML_UNKNOWN_RESULT",
        true,
        error.stage,
        error.reason,
        error.httpStatus,
      );
    }
    return new ZeroGInferenceOperationalError(
      error.code,
      error.stage !== "BEFORE_SEND",
      error.stage,
      error.reason,
      error.httpStatus,
    );
  }
  if (error instanceof ZeroGSignedResponseVerificationError) {
    return new ZeroGInferenceOperationalError(
      error.code,
      true,
      error.stage,
      error.reason,
      error.httpStatus,
    );
  }
  return new TeeMlError("TEEML_UNKNOWN_RESULT", "TEEML_UNKNOWN_RESULT", true);
}

function elapsedMilliseconds(startedAt: number, completedAt: number): number {
  if (!Number.isFinite(startedAt) || !Number.isFinite(completedAt)) {
    return 0;
  }
  return Math.max(0, Math.round(completedAt - startedAt));
}
