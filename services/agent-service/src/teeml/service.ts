import { randomUUID } from "node:crypto";
import {
  computePolicyHash,
  hashCanonicalValue,
} from "../policy-engine/canonicalize.js";
import {
  forbidden,
  notFound,
} from "../policy-engine/errors.js";
import {
  computeActionHash,
  type AgentActorContext,
} from "../policy-engine/precheck.js";
import {
  NETWORK_ID,
  type Hex32,
} from "../policy-engine/types.js";
import {
  buildTrustedSemanticContext,
  parseTeeMlVerifyRequestBody,
  type TrustedSemanticContextSources,
} from "./context-builder.js";
import { TeeMlError } from "./errors.js";
import {
  computeSemanticContextHash,
  computeTeeMlRequestHash,
} from "./hashing.js";
import type {
  TeeMlInferenceGateway,
  TeeMlInferenceResult,
} from "./inference-gateway.js";
import {
  HACKATHON_TESTNET_TEETLS_PROFILE,
  HACKATHON_TEETLS_ALLOWED_STATUS,
  isExactZeroGSecurityContract,
  PRODUCTION_PRIVATE_TEEML_PROFILE,
  PRODUCTION_TEEML_ALLOWED_STATUS,
  type ZeroGSecurityProfile,
} from "./security-profile.js";
import { parseTeeMlSemanticVerdict } from "./output-parser.js";
import { buildTransientTeeMlMessages } from "./prompt.js";
import type {
  TeeMlRepository,
  TeeMlAvailableTrustedSources,
  TeeMlTrustedSources,
  TeeMlVerificationRecord,
} from "./repository.js";
import type {
  TeeMlSemanticReasonCode,
  TeeMlSemanticVerdictValue,
  TrustedSemanticContext,
  VerifiedTeeMlArtifact,
} from "./types.js";

const RESPONSE_HASH_SCHEMA = "aegis.teeml.response.v1";
const TRACE_HASH_SCHEMA = "aegis.teeml.0g-router-trace.v2";
const DEFAULT_AUDIT_RETENTION_DAYS = 90;
export const DEFAULT_TEEML_PROCESSING_LEASE_SECONDS = 120;

export type TeeMlProcessingResponse = {
  requestId: string;
  status: "TEEML_PROCESSING";
  semanticContextHash: Hex32;
  teemlRequestHash: Hex32;
};

type TeeMlFinalResponseBase = {
  requestId: string;
  reasonCode: TeeMlSemanticReasonCode;
  policyHash: Hex32;
  actionHash: Hex32;
  semanticContextHash: Hex32;
  teemlRequestHash: Hex32;
  teeVerified: true;
  modelId: string;
  evaluatedAt: number;
};

type ProductionPrivateTeeMlResponseSecurity = {
  securityProfile: typeof PRODUCTION_PRIVATE_TEEML_PROFILE;
  trustMode: "private";
  verificationMode: "TeeML";
  sealedInference: true;
};

type HackathonTeeTlsResponseSecurity = {
  securityProfile: typeof HACKATHON_TESTNET_TEETLS_PROFILE;
  trustMode: "verified";
  verificationMode: "TeeTLS";
  sealedInference: false;
};

export type TeeMlFinalResponse = TeeMlFinalResponseBase &
  (
    | (ProductionPrivateTeeMlResponseSecurity & {
        status: typeof PRODUCTION_TEEML_ALLOWED_STATUS;
        verdict: "ALLOW";
      })
    | (HackathonTeeTlsResponseSecurity & {
        status: typeof HACKATHON_TEETLS_ALLOWED_STATUS;
        verdict: "ALLOW";
      })
    | (ProductionPrivateTeeMlResponseSecurity & {
        status: "TEEML_DENIED";
        verdict: "DENY";
      })
    | (HackathonTeeTlsResponseSecurity & {
        status: "TEEML_DENIED";
        verdict: "DENY";
      })
  );

export type TeeMlVerifyResponse =
  | TeeMlProcessingResponse
  | TeeMlFinalResponse;

export type TeeMlServiceOptions = {
  clock?: () => number;
  idGenerator?: () => string;
  auditRetentionDays?: number;
  processingLeaseSeconds?: number;
  securityProfile?: ZeroGSecurityProfile;
};

type ClaimedVerification = {
  kind: "CLAIMED";
  sources: TeeMlAvailableTrustedSources;
  context: TrustedSemanticContext;
  semanticContextHash: Hex32;
  teemlRequestHash: Hex32;
  verificationId: string;
};

type ClaimResult =
  | ClaimedVerification
  | {
      kind: "PROCESSING";
      response: TeeMlProcessingResponse;
    }
  | {
      kind: "FINAL";
      response: TeeMlFinalResponse;
    }
  | {
      kind: "ERROR";
      error: TeeMlError;
    };

export class TeeMlService {
  private readonly clock: () => number;
  private readonly idGenerator: () => string;
  private readonly auditRetentionDays: number;
  private readonly processingLeaseSeconds: number;
  private readonly securityProfile: ZeroGSecurityProfile;

  constructor(
    private readonly repository: TeeMlRepository,
    private readonly inference: TeeMlInferenceGateway,
    options: TeeMlServiceOptions = {},
  ) {
    this.clock = options.clock ?? (() => Math.floor(Date.now() / 1000));
    this.idGenerator = options.idGenerator ?? randomUUID;
    this.auditRetentionDays = positiveInteger(
      options.auditRetentionDays ?? DEFAULT_AUDIT_RETENTION_DAYS,
      "auditRetentionDays",
    );
    this.processingLeaseSeconds = positiveInteger(
      options.processingLeaseSeconds ??
        DEFAULT_TEEML_PROCESSING_LEASE_SECONDS,
      "processingLeaseSeconds",
    );
    this.securityProfile =
      options.securityProfile ?? PRODUCTION_PRIVATE_TEEML_PROFILE;
  }

  async verify(input: {
    requestId: string;
    body: unknown;
    actor: AgentActorContext;
  }): Promise<{
    httpStatus: 200 | 202;
    response: TeeMlVerifyResponse;
  }> {
    const requestId = normalizeIdentifier(input.requestId, "requestId");
    const actorAgentId = normalizeIdentifier(
      input.actor.authenticatedAgentId,
      "authenticatedAgentId",
    );
    if (input.actor.actorType !== "AGENT") {
      forbidden("invalid_actor_type", "actorType must be AGENT");
    }
    const request = parseTeeMlVerifyRequestBody(input.body);
    const now = this.clock();

    const claim = await this.repository.runLocked<ClaimResult>(
      requestId,
      async transaction => {
        const sources = await transaction.getTrustedSources(requestId);
        if (!sources) {
          notFound("teeml_request_not_found", "action request was not found");
        }
        if (sources.agentId !== actorAgentId) {
          forbidden(
            "agent_context_mismatch",
            "authenticated agent does not own this action request",
          );
        }
        const existing = await transaction.getVerification(requestId);
        if (
          existing?.status === "PROCESSING" &&
          existing.createdAt + this.processingLeaseSeconds <= now
        ) {
          await transaction.failVerification({
            eventId: this.idGenerator(),
            verificationId: existing.verificationId,
            requestId: existing.requestId,
            precheckId: existing.precheckId,
            agentId: existing.agentId,
            policyHash: existing.policyHash,
            actionHash: existing.actionHash,
            semanticContextHash: existing.semanticContextHash,
            teemlRequestHash: existing.teemlRequestHash,
            reasonCode: "TEEML_UNKNOWN_RESULT",
            occurredAt: now,
            retentionUntil: retentionUntil(
              now,
              this.auditRetentionDays,
            ),
          });
          return {
            kind: "ERROR",
            error: new TeeMlError(
              "TEEML_UNKNOWN_RESULT",
              "stale TeeML processing result requires manual reconciliation",
              true,
            ),
          };
        }
        if (sources.commitmentStatus !== "AVAILABLE") {
          const error = new TeeMlError(
            "TEEML_TRUSTED_CONTEXT_MISSING",
            "Level 1 v2 action commitment is unavailable for TeeML",
          );
          if (!existing && sources.actionStatus === "PENDING_TEEML") {
            await transaction.failBeforeContext({
              eventId: this.idGenerator(),
              requestId,
              precheckId: sources.precheckId,
              agentId: sources.agentId,
              policyHash: sources.policyHash,
              actionHash: sources.actionHash,
              reasonCode: "TEEML_TRUSTED_CONTEXT_MISSING",
              occurredAt: now,
              retentionUntil: retentionUntil(
                now,
                this.auditRetentionDays,
              ),
            });
          }
          return { kind: "ERROR", error };
        }

        let context: TrustedSemanticContext;
        try {
          context = buildTrustedSemanticContext(
            toContextSources(sources),
            request,
          );
        } catch (error) {
          const teemlError = contextError(error);
          if (!existing && sources.actionStatus === "PENDING_TEEML") {
            await transaction.failBeforeContext({
              eventId: this.idGenerator(),
              requestId,
              precheckId: sources.precheckId,
              agentId: sources.agentId,
              policyHash: sources.policyHash,
              actionHash: sources.actionHash,
              reasonCode:
                teemlError.code === "TEEML_CONFLICT"
                  ? "TEEML_CONFLICT"
                  : "TEEML_TRUSTED_CONTEXT_MISSING",
              occurredAt: now,
              retentionUntil: retentionUntil(
                now,
                this.auditRetentionDays,
              ),
            });
          }
          return { kind: "ERROR", error: teemlError };
        }

        const semanticContextHash = computeSemanticContextHash(context);
        const teemlRequestHash = computeTeeMlRequestHash(
          context,
          semanticContextHash,
        );

        if (existing) {
          if (
            existing.semanticContextHash !== semanticContextHash ||
            existing.teemlRequestHash !== teemlRequestHash
          ) {
            return {
              kind: "ERROR",
              error: new TeeMlError(
                "TEEML_CONFLICT",
                "request already has a TeeML verification for another trusted context",
              ),
            };
          }
          return existingResult(existing, this.securityProfile);
        }

        if (
          sources.actionStatus !== "PENDING_TEEML" ||
          sources.usageHoldStatus !== "HELD" ||
          sources.usageHoldExpiresAt <= now
        ) {
          const error = new TeeMlError(
            "TEEML_CONFLICT",
            "action request or UsageHold is not eligible for TeeML",
          );
          if (sources.actionStatus === "PENDING_TEEML") {
            await transaction.failBeforeContext({
              eventId: this.idGenerator(),
              requestId,
              precheckId: sources.precheckId,
              agentId: sources.agentId,
              policyHash: sources.policyHash,
              actionHash: sources.actionHash,
              reasonCode: "TEEML_CONFLICT",
              occurredAt: now,
              retentionUntil: retentionUntil(
                now,
                this.auditRetentionDays,
              ),
            });
          }
          return { kind: "ERROR", error };
        }

        const verificationId = this.idGenerator();
        await transaction.startVerification({
          verificationId,
          requestId,
          precheckId: sources.precheckId,
          agentId: sources.agentId,
          agenticId: context.agent.agenticId,
          policyId: sources.policyId,
          policyVersion: sources.policyVersion,
          policyHash: sources.policyHash,
          actionHash: sources.actionHash,
          semanticContextHash,
          teemlRequestHash,
          now,
        });

        return {
          kind: "CLAIMED",
          sources,
          context,
          semanticContextHash,
          teemlRequestHash,
          verificationId,
        };
      },
    );

    if (claim.kind === "ERROR") throw claim.error;
    if (claim.kind === "PROCESSING") {
      return { httpStatus: 202, response: claim.response };
    }
    if (claim.kind === "FINAL") {
      return { httpStatus: 200, response: claim.response };
    }

    let transientContext: TrustedSemanticContext | null = claim.context;
    let transientMessages:
      | ReturnType<typeof buildTransientTeeMlMessages>
      | undefined;
    try {
      transientMessages = buildTransientTeeMlMessages({
        context: transientContext,
        semanticContextHash: claim.semanticContextHash,
        teemlRequestHash: claim.teemlRequestHash,
      });
      const inference = await this.inference.complete(transientMessages);
      assertVerifiedInference(inference, this.securityProfile);
      const verdict = parseTeeMlSemanticVerdict(inference.content, {
        requestId,
        policyHash: claim.sources.policyHash,
        actionHash: claim.sources.actionHash,
        semanticContextHash: claim.semanticContextHash,
        teemlRequestHash: claim.teemlRequestHash,
      });
      const artifact = await this.repository.runLocked(
        requestId,
        async transaction => {
        const evaluatedAt = this.clock();
        const current = await transaction.getVerification(requestId);
        assertProcessingVerification(current, claim);
        const currentSources = await transaction.getTrustedSources(requestId);
        if (
          !currentSources ||
          currentSources.commitmentStatus !== "AVAILABLE" ||
          currentSources.actionStatus !== "TEEML_PROCESSING" ||
          (
            verdict.verdict === "ALLOW" &&
            (
              currentSources.usageHoldStatus !== "HELD" ||
              currentSources.usageHoldExpiresAt <= evaluatedAt
            )
          ) ||
          (
            verdict.verdict === "DENY" &&
            currentSources.usageHoldStatus !== "HELD" &&
            currentSources.usageHoldStatus !== "EXPIRED"
          )
        ) {
          throw new TeeMlError(
            "TEEML_CONFLICT",
            "trusted sources or UsageHold changed during TeeML inference",
          );
        }
        let currentContext: TrustedSemanticContext;
        try {
          currentContext = buildTrustedSemanticContext(
            toContextSources(currentSources),
            request,
          );
        } catch (error) {
          throw contextError(error);
        }
        const currentSemanticContextHash =
          computeSemanticContextHash(currentContext);
        const currentTeeMlRequestHash = computeTeeMlRequestHash(
          currentContext,
          currentSemanticContextHash,
        );
        if (
          currentSemanticContextHash !== claim.semanticContextHash ||
          currentTeeMlRequestHash !== claim.teemlRequestHash
        ) {
          throw new TeeMlError(
            "TEEML_CONFLICT",
            "trusted semantic context changed during TeeML inference",
          );
        }
        const currentArtifact = buildArtifact({
          claim,
          inference,
          verdict,
          evaluatedAt,
        });
        await transaction.completeVerification({
          eventId: this.idGenerator(),
          artifact: currentArtifact,
          retentionUntil: retentionUntil(
            evaluatedAt,
            this.auditRetentionDays,
          ),
        });
        return currentArtifact;
      },
      );

      if (
        artifact.verdict === "ALLOW" &&
        artifact.securityProfile === PRODUCTION_PRIVATE_TEEML_PROFILE
      ) {
        // SECURITY(production-handoff): The future signer must accept only a production-private-teeml artifact with sealedInference=true. A hackathon TeeTLS artifact is demonstration evidence and must never authorize production execution.
        // TODO(final-policy-recheck): Re-run the deterministic policy evaluation with a fresh usage snapshot after TeeML approval and before any DecisionReceipt or Safe execution authorization.
        // TODO(agent-verifier-signer): After the TeeML artifact is verified and the final deterministic policy recheck succeeds, build and sign the final DecisionReceipt with the dedicated agentVerifierSigner. Never sign the raw model output directly.
        // TODO(usage-hold-finalization): Keep the UsageHold active after TeeML ALLOW, release it on TeeML DENY or failure, and mark it COMMITTED only after the corresponding Safe/Hedera execution is confirmed.
        // TODO(safe-execution): Bind the final DecisionReceipt to the exact Safe transaction hash and request the required Safe owner signatures only after all AEGIS checks have succeeded.
        // TODO(hedera-execution): Execute the already implemented Hedera action only after the Safe reaches its configured signature threshold and persist the real network receipt.
      }

      return {
        httpStatus: 200,
        response: artifactResponse(artifact),
      };
    } catch (error) {
      const teemlError =
        error instanceof TeeMlError
          ? error
          : new TeeMlError(
              "TEEML_UNKNOWN_RESULT",
              "TeeML inference result is unknown",
              true,
            );
      const failedAt = this.clock();
      await this.repository.runLocked(requestId, async transaction => {
        const current = await transaction.getVerification(requestId);
        assertProcessingVerification(current, claim);
        await transaction.failVerification({
          eventId: this.idGenerator(),
          verificationId: claim.verificationId,
          requestId,
          precheckId: claim.sources.precheckId,
          agentId: claim.sources.agentId,
          policyHash: claim.sources.policyHash,
          actionHash: claim.sources.actionHash,
          semanticContextHash: claim.semanticContextHash,
          teemlRequestHash: claim.teemlRequestHash,
          reasonCode: teemlError.code,
          occurredAt: failedAt,
          retentionUntil: retentionUntil(
            failedAt,
            this.auditRetentionDays,
          ),
        });
      });
      throw teemlError;
    } finally {
      transientMessages = undefined;
      transientContext = null;
    }
  }
}

function toContextSources(
  sources: TeeMlAvailableTrustedSources,
): TrustedSemanticContextSources {
  assertDurableCommitments(sources);
  if (!sources.agentProfile) {
    throw new TeeMlError(
      "TEEML_TRUSTED_CONTEXT_MISSING",
      "durable Agentic ID semantic profile is missing",
    );
  }
  return {
    requestId: sources.requestId,
    action: {
      requestId: sources.requestId,
      agentId: sources.agentId,
      policyId: sources.policyId,
      policyVersion: sources.policyVersion,
      policyHash: sources.policyHash,
      actionHash: sources.actionHash,
      actionType: sources.action.actionType,
      destination: sources.action.destination,
      assetId: sources.action.assetId,
      amount: sources.action.amount,
    },
    policy: {
      policyId: sources.durablePolicy.policyId,
      agentId: sources.durablePolicy.agentId,
      policyVersion: sources.durablePolicy.policyVersion,
      policyHash: sources.durablePolicy.policyHash,
      semanticRules: sources.durablePolicy.semanticRules,
    },
    agentProfile: {
      agentId: sources.agentProfile.agentId,
      agenticId: sources.agentProfile.agenticId,
      capabilityIds: sources.agentProfile.capabilityIds,
    },
  };
}

function assertDurableCommitments(
  sources: TeeMlAvailableTrustedSources,
): void {
  const durablePolicyHash = computePolicyHash({
    agentId: sources.durablePolicy.agentId,
    walletId: sources.durablePolicy.walletId,
    policyVersion: sources.durablePolicy.policyVersion,
    validFrom: sources.durablePolicy.validFrom,
    validUntil: sources.durablePolicy.validUntil,
    rules: sources.durablePolicy.rules,
    semanticRules: sources.durablePolicy.semanticRules,
  });
  if (
    durablePolicyHash !== sources.durablePolicy.policyHash ||
    sources.policyId !== sources.durablePolicy.policyId ||
    sources.agentId !== sources.durablePolicy.agentId ||
    sources.walletId !== sources.durablePolicy.walletId ||
    sources.policyVersion !== sources.durablePolicy.policyVersion ||
    sources.policyHash !== sources.durablePolicy.policyHash
  ) {
    throw new TeeMlError(
      "TEEML_CONFLICT",
      "durable Policy commitment does not match the Level 1 action",
    );
  }

  const actionHash = computeActionHash({
    requestId: sources.requestId,
    agentId: sources.agentId,
    walletId: sources.walletId,
    networkId: NETWORK_ID,
    action: {
      agentId: sources.agentId,
      walletId: sources.walletId,
      ...sources.action,
    },
    policy: {
      policyId: sources.policyId,
      policyVersion: sources.policyVersion,
      policyHash: sources.policyHash,
    },
    aegisNonce: BigInt(sources.aegisNonce),
  });
  if (actionHash !== sources.actionHash) {
    throw new TeeMlError(
      "TEEML_CONFLICT",
      "durable action commitment does not match the Level 1 action",
    );
  }
}

function contextError(error: unknown): TeeMlError {
  if (
    error instanceof TeeMlError &&
    (error.code === "TEEML_TRUSTED_CONTEXT_MISSING" ||
      error.code === "TEEML_CONFLICT")
  ) {
    return error;
  }
  return new TeeMlError(
    "TEEML_TRUSTED_CONTEXT_MISSING",
    "trusted semantic evidence is missing or invalid",
  );
}

function existingResult(
  existing: TeeMlVerificationRecord,
  expectedProfile: ZeroGSecurityProfile,
): ClaimResult {
  if (existing.status === "PROCESSING") {
    return {
      kind: "PROCESSING",
      response: {
        requestId: existing.requestId,
        status: "TEEML_PROCESSING",
        semanticContextHash: existing.semanticContextHash,
        teemlRequestHash: existing.teemlRequestHash,
      },
    };
  }
  if (existing.status === "FAILED") {
    return {
      kind: "ERROR",
      error: new TeeMlError(
        existing.technicalReasonCode ?? "TEEML_UNKNOWN_RESULT",
        "TeeML verification previously failed",
      ),
    };
  }
  return {
    kind: "FINAL",
    response: verificationResponse(existing, expectedProfile),
  };
}

function verificationResponse(
  verification: TeeMlVerificationRecord,
  expectedProfile: ZeroGSecurityProfile,
): TeeMlFinalResponse {
  if (
    (verification.verdict !== "ALLOW" &&
      verification.verdict !== "DENY") ||
    verification.reasonCode === null ||
    verification.modelId === null ||
    verification.securityProfile !== expectedProfile ||
    verification.trustMode === null ||
    verification.verificationMode === null ||
    verification.sealedInference === null ||
    !isExactZeroGSecurityContract({
      securityProfile: verification.securityProfile,
      trustMode: verification.trustMode,
      verificationMode: verification.verificationMode,
      sealedInference: verification.sealedInference,
    }) ||
    verification.teeVerified !== true ||
    verification.evaluatedAt === null
  ) {
    throw new TeeMlError(
      "TEEML_CONFLICT",
      "persisted TeeML result is incomplete",
    );
  }
  return buildFinalResponse({
    requestId: verification.requestId,
    verdict: verification.verdict,
    reasonCode: verification.reasonCode,
    policyHash: verification.policyHash,
    actionHash: verification.actionHash,
    semanticContextHash: verification.semanticContextHash,
    teemlRequestHash: verification.teemlRequestHash,
    securityProfile: verification.securityProfile,
    modelId: verification.modelId,
    evaluatedAt: verification.evaluatedAt,
  });
}

function assertVerifiedInference(
  inference: TeeMlInferenceResult,
  expectedProfile: ZeroGSecurityProfile,
): void {
  if (
    inference.securityProfile !== expectedProfile ||
    !isExactZeroGSecurityContract(inference)
  ) {
    throw new TeeMlError(
      expectedProfile === PRODUCTION_PRIVATE_TEEML_PROFILE
        ? "TEEML_NOT_PRIVATE"
        : "TEEML_NOT_VERIFIED",
      "0G inference security profile did not match the configured contract",
      true,
    );
  }
  if (inference.teeVerified !== true) {
    throw new TeeMlError(
      "TEEML_NOT_VERIFIED",
      "0G inference did not confirm TEE verification",
      true,
    );
  }
  if (
    typeof inference.providerAddress !== "string" ||
    !/^0x[a-fA-F0-9]{40}$/.test(inference.providerAddress) ||
    typeof inference.responseId !== "string" ||
    inference.responseId.length === 0 ||
    typeof inference.modelId !== "string" ||
    inference.modelId.length === 0
  ) {
    throw new TeeMlError(
      "TEEML_OUTPUT_INVALID",
      "0G response identity fields are missing",
      true,
    );
  }
}

function buildArtifact(input: {
  claim: ClaimedVerification;
  inference: TeeMlInferenceResult;
  verdict: ReturnType<typeof parseTeeMlSemanticVerdict>;
  evaluatedAt: number;
}): VerifiedTeeMlArtifact {
  const { claim, inference, verdict } = input;
  const responseHash = hashCanonicalValue({
    schema: RESPONSE_HASH_SCHEMA,
    content: inference.content,
  });
  const traceHash = hashCanonicalValue({
    schema: TRACE_HASH_SCHEMA,
    responseId: inference.responseId,
    routerRequestId: inference.routerRequestId,
    providerAddress: inference.providerAddress?.toLowerCase(),
    modelId: inference.modelId,
    securityProfile: inference.securityProfile,
    trustMode: inference.trustMode,
    verificationMode: inference.verificationMode,
    sealedInference: inference.sealedInference,
    teeVerified: inference.teeVerified,
  });
  return {
    verificationId: claim.verificationId,
    requestId: claim.sources.requestId,
    precheckId: claim.sources.precheckId,
    agentId: claim.sources.agentId,
    agenticId: claim.context.agent.agenticId,
    policyId: claim.sources.policyId,
    policyVersion: claim.sources.policyVersion,
    policyHash: claim.sources.policyHash,
    actionHash: claim.sources.actionHash,
    semanticContextHash: claim.semanticContextHash,
    teemlRequestHash: claim.teemlRequestHash,
    verdict: verdict.verdict,
    reasonCode: verdict.reasonCode,
    providerAddress: inference.providerAddress,
    modelId: inference.modelId,
    securityProfile: inference.securityProfile,
    trustMode: inference.trustMode,
    verificationMode: inference.verificationMode,
    sealedInference: inference.sealedInference,
    teeVerified: true,
    responseId: inference.responseId,
    responseHash,
    traceHash,
    ...(inference.promptTokens === undefined
      ? {}
      : { promptTokens: inference.promptTokens }),
    ...(inference.completionTokens === undefined
      ? {}
      : { completionTokens: inference.completionTokens }),
    latencyMs: inference.latencyMs,
    evaluatedAt: input.evaluatedAt,
  };
}

function artifactResponse(
  artifact: VerifiedTeeMlArtifact,
): TeeMlFinalResponse {
  return buildFinalResponse(artifact);
}

function buildFinalResponse(input: {
  requestId: string;
  verdict: TeeMlSemanticVerdictValue;
  reasonCode: TeeMlSemanticReasonCode;
  policyHash: Hex32;
  actionHash: Hex32;
  semanticContextHash: Hex32;
  teemlRequestHash: Hex32;
  securityProfile: ZeroGSecurityProfile;
  modelId: string;
  evaluatedAt: number;
}): TeeMlFinalResponse {
  const base = {
    requestId: input.requestId,
    reasonCode: input.reasonCode,
    policyHash: input.policyHash,
    actionHash: input.actionHash,
    semanticContextHash: input.semanticContextHash,
    teemlRequestHash: input.teemlRequestHash,
    teeVerified: true as const,
    modelId: input.modelId,
    evaluatedAt: input.evaluatedAt,
  };
  if (input.securityProfile === PRODUCTION_PRIVATE_TEEML_PROFILE) {
    const security = {
      securityProfile: PRODUCTION_PRIVATE_TEEML_PROFILE,
      trustMode: "private" as const,
      verificationMode: "TeeML" as const,
      sealedInference: true as const,
    };
    return input.verdict === "ALLOW"
      ? {
          ...base,
          ...security,
          status: PRODUCTION_TEEML_ALLOWED_STATUS,
          verdict: "ALLOW",
        }
      : { ...base, ...security, status: "TEEML_DENIED", verdict: "DENY" };
  }
  const security = {
    securityProfile: HACKATHON_TESTNET_TEETLS_PROFILE,
    trustMode: "verified" as const,
    verificationMode: "TeeTLS" as const,
    sealedInference: false as const,
  };
  return input.verdict === "ALLOW"
    ? {
        ...base,
        ...security,
        status: HACKATHON_TEETLS_ALLOWED_STATUS,
        verdict: "ALLOW",
      }
    : { ...base, ...security, status: "TEEML_DENIED", verdict: "DENY" };
}

function assertProcessingVerification(
  current: TeeMlVerificationRecord | null,
  claim: ClaimedVerification,
): void {
  if (
    !current ||
    current.status !== "PROCESSING" ||
    current.verificationId !== claim.verificationId ||
    current.semanticContextHash !== claim.semanticContextHash ||
    current.teemlRequestHash !== claim.teemlRequestHash
  ) {
    throw new TeeMlError(
      "TEEML_CONFLICT",
      "TeeML verification state changed concurrently",
    );
  }
}

function normalizeIdentifier(value: string, label: string): string {
  if (typeof value !== "string") {
    throw new TeeMlError(
      "TEEML_CONFLICT",
      `${label} is invalid`,
    );
  }
  const normalized = value.trim().toLowerCase();
  if (normalized.length === 0 || normalized.length > 256) {
    throw new TeeMlError(
      "TEEML_CONFLICT",
      `${label} is invalid`,
    );
  }
  return normalized;
}

function positiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
  return value;
}

function retentionUntil(now: number, days: number): number {
  return now + days * 86_400;
}
