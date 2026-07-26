import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computePolicyHash } from "../policy-engine/canonicalize.js";
import { PolicyEngineError } from "../policy-engine/errors.js";
import { computeActionHash } from "../policy-engine/precheck.js";
import {
  NETWORK_ID,
  type PolicyRules,
  type SemanticRule,
} from "../policy-engine/types.js";
import { TeeMlError } from "./errors.js";
import type {
  TeeMlInferenceGateway,
  TeeMlInferenceResult,
} from "./inference-gateway.js";
import type {
  AgentSemanticProfileRecord,
  CompleteTeeMlVerificationInput,
  FailTeeMlBeforeContextInput,
  FailTeeMlVerificationInput,
  StartTeeMlVerificationInput,
  TeeMlRepository,
  TeeMlTransaction,
  TeeMlAvailableTrustedSources,
  TeeMlTrustedSources,
  TeeMlVerificationRecord,
} from "./repository.js";
import { TeeMlService } from "./service.js";
import {
  getAllowedActionStatus,
  getAllowedVerificationStatus,
  HACKATHON_TEETLS_ALLOWED_STATUS,
  HACKATHON_TESTNET_TEETLS_PROFILE,
  PRODUCTION_PRIVATE_TEEML_PROFILE,
  type ZeroGSecurityProfile,
} from "./security-profile.js";

const METADATA_HASH = `0x${"33".repeat(32)}` as const;
const PROVIDER = "0x4870cbc4d07d6ac2ee5aa865588e5985fe77a4e9";

describe("TeeMlService", () => {
  it("persists a sanitized ALLOW artifact, keeps the hold, and replays without inference", async () => {
    const repository = new MemoryTeeMlRepository(trustedSources());
    const gateway = new VerdictGateway("ALLOW");
    const service = createService(repository, gateway);

    const first = await service.verify(verifyInput());
    const replay = await service.verify(verifyInput());

    assert.equal(first.httpStatus, 200);
    assert.equal(first.response.status, "TEEML_ALLOWED");
    assert.equal(replay.httpStatus, 200);
    assert.deepEqual(replay.response, first.response);
    assert.equal(gateway.calls, 1);
    assert.equal(repository.sources.actionStatus, "TEEML_ALLOWED");
    assert.equal(repository.sources.usageHoldStatus, "HELD");
    assert.equal(repository.verification?.verdict, "ALLOW");
    assert.equal(repository.verification?.reasonCode, "SEMANTIC_POLICY_MATCH");
    assert.equal("content" in (repository.verification ?? {}), false);
    assert.equal("semanticRules" in (repository.verification ?? {}), false);
  });

  it("persists DENY and releases the UsageHold", async () => {
    const repository = new MemoryTeeMlRepository(trustedSources());
    const service = createService(
      repository,
      new VerdictGateway("DENY", "SERVICE_PURPOSE_MISMATCH"),
    );

    const result = await service.verify(verifyInput());

    assert.equal(result.response.status, "TEEML_DENIED");
    assert.equal(result.response.verdict, "DENY");
    assert.equal(repository.sources.actionStatus, "TEEML_DENIED");
    assert.equal(repository.sources.usageHoldStatus, "RELEASED");
  });

  it("fails closed and releases the hold for invalid or unverified provider output", async () => {
    for (const gateway of [
      new StaticGateway({ content: "```json\n{}\n```" }),
      new ThrowingGateway(
        new TeeMlError(
          "TEEML_NOT_VERIFIED",
          "0G response was not independently verified",
          true,
        ),
      ),
      new ThrowingGateway(
        new TeeMlError(
          "TEEML_PROVIDER_ERROR",
          "sanitized provider failure",
          true,
        ),
      ),
      new ThrowingGateway(
        new TeeMlError("TEEML_TIMEOUT", "sanitized timeout", true),
      ),
    ]) {
      const repository = new MemoryTeeMlRepository(trustedSources());
      const service = createService(repository, gateway);

      await assert.rejects(
        () => service.verify(verifyInput()),
        (error: unknown) =>
          error instanceof TeeMlError &&
          (error.code === "TEEML_OUTPUT_INVALID" ||
            error.code === "TEEML_NOT_VERIFIED" ||
            error.code === "TEEML_PROVIDER_ERROR" ||
            error.code === "TEEML_TIMEOUT"),
      );
      assert.equal(repository.sources.actionStatus, "TEEML_FAILED");
      assert.equal(repository.sources.usageHoldStatus, "RELEASED");
      assert.equal(repository.verification?.status, "FAILED");
    }
  });

  it("accepts an explicitly configured TeeTLS hackathon result without claiming sealed inference", async () => {
    const repository = new MemoryTeeMlRepository(trustedSources());
    const productionGateway = new VerdictGateway("ALLOW");
    const gateway: TeeMlInferenceGateway = {
      complete: async messages => ({
        ...(await productionGateway.complete(messages)),
        securityProfile: HACKATHON_TESTNET_TEETLS_PROFILE,
        trustMode: "verified",
        verificationMode: "TeeTLS",
        sealedInference: false,
      }),
    };
    const service = createService(
      repository,
      gateway,
      () => 1_800_000_000,
      HACKATHON_TESTNET_TEETLS_PROFILE,
    );

    const result = await service.verify(verifyInput());

    assert.equal(result.response.status, HACKATHON_TEETLS_ALLOWED_STATUS);
    if (result.response.status !== HACKATHON_TEETLS_ALLOWED_STATUS) assert.fail();
    assert.equal(result.response.securityProfile, HACKATHON_TESTNET_TEETLS_PROFILE);
    assert.equal(result.response.trustMode, "verified");
    assert.equal(result.response.verificationMode, "TeeTLS");
    assert.equal(result.response.sealedInference, false);
    assert.equal(result.response.teeVerified, true);
    assert.equal(
      repository.sources.actionStatus,
      HACKATHON_TEETLS_ALLOWED_STATUS,
    );
    assert.equal(
      repository.verification?.status,
      HACKATHON_TEETLS_ALLOWED_STATUS,
    );
    assert.equal(repository.sources.usageHoldStatus, "RELEASED");
  });

  it("rejects a TeeTLS result under the default production profile and releases the hold", async () => {
    const repository = new MemoryTeeMlRepository(trustedSources());
    const productionGateway = new VerdictGateway("ALLOW");
    const gateway: TeeMlInferenceGateway = {
      complete: async messages => ({
        ...(await productionGateway.complete(messages)),
        securityProfile: HACKATHON_TESTNET_TEETLS_PROFILE,
        trustMode: "verified",
        verificationMode: "TeeTLS",
        sealedInference: false,
      }),
    };
    const service = createService(repository, gateway);

    await assert.rejects(
      () => service.verify(verifyInput()),
      (error: unknown) =>
        error instanceof TeeMlError && error.code === "TEEML_NOT_PRIVATE",
    );
    assert.equal(repository.sources.actionStatus, "TEEML_FAILED");
    assert.equal(repository.sources.usageHoldStatus, "RELEASED");
  });

  it("rejects replay of a persisted hackathon result under the production profile without another inference", async () => {
    const repository = new MemoryTeeMlRepository(trustedSources());
    const hackathonGateway = new VerdictGateway("ALLOW");
    const hackathonInference: TeeMlInferenceGateway = {
      complete: async messages => ({
        ...(await hackathonGateway.complete(messages)),
        securityProfile: HACKATHON_TESTNET_TEETLS_PROFILE,
        trustMode: "verified",
        verificationMode: "TeeTLS",
        sealedInference: false,
      }),
    };
    await createService(
      repository,
      hackathonInference,
      () => 1_800_000_000,
      HACKATHON_TESTNET_TEETLS_PROFILE,
    ).verify(verifyInput());

    const productionGateway = new VerdictGateway("ALLOW");
    await assert.rejects(
      () => createService(repository, productionGateway).verify(verifyInput()),
      (error: unknown) =>
        error instanceof TeeMlError && error.code === "TEEML_CONFLICT",
    );
    assert.equal(productionGateway.calls, 0);
    assert.equal(
      repository.sources.actionStatus,
      HACKATHON_TEETLS_ALLOWED_STATUS,
    );
    assert.equal(repository.sources.usageHoldStatus, "RELEASED");
  });

  it("rejects agent reason before persistence or inference", async () => {
    const repository = new MemoryTeeMlRepository(trustedSources());
    const gateway = new VerdictGateway("ALLOW");
    const service = createService(repository, gateway);

    await assert.rejects(
      () =>
        service.verify({
          ...verifyInput(),
          body: {
            serviceId: "storage-api",
            productId: "archive-pro",
            reason: "agent-controlled justification",
          },
        }),
      (error: unknown) =>
        error instanceof PolicyEngineError &&
        error.code === "unknown_property",
    );
    assert.equal(gateway.calls, 0);
    assert.equal(repository.verification, null);
    assert.equal(repository.sources.actionStatus, "PENDING_TEEML");
  });

  it("allows only one paid inference while a concurrent request observes PROCESSING", async () => {
    const repository = new MemoryTeeMlRepository(trustedSources());
    let release!: () => void;
    const wait = new Promise<void>(resolve => {
      release = resolve;
    });
    const gateway = new VerdictGateway("ALLOW", undefined, wait);
    const service = createService(repository, gateway);

    const first = service.verify(verifyInput());
    await gateway.started;
    const concurrent = await service.verify(verifyInput());
    assert.equal(concurrent.httpStatus, 202);
    assert.equal(concurrent.response.status, "TEEML_PROCESSING");
    assert.equal(gateway.calls, 1);

    release();
    const completed = await first;
    assert.equal(completed.response.status, "TEEML_ALLOWED");
    assert.equal(gateway.calls, 1);
  });

  it("fails an ALLOW when the UsageHold expires while inference is running", async () => {
    const sources = trustedSources();
    sources.usageHoldExpiresAt = 1_800_000_001;
    const repository = new MemoryTeeMlRepository(sources);
    let now = 1_800_000_000;
    let release!: () => void;
    const wait = new Promise<void>(resolve => {
      release = resolve;
    });
    const gateway = new VerdictGateway("ALLOW", undefined, wait);
    const service = createService(repository, gateway, () => now);

    const verification = service.verify(verifyInput());
    await gateway.started;
    now = sources.usageHoldExpiresAt;
    release();

    await assert.rejects(
      verification,
      (error: unknown) =>
        error instanceof TeeMlError && error.code === "TEEML_CONFLICT",
    );
    assert.equal(repository.sources.actionStatus, "TEEML_FAILED");
    assert.equal(repository.sources.usageHoldStatus, "RELEASED");
  });

  it("persists a valid DENY even when the UsageHold expires during inference", async () => {
    const sources = trustedSources();
    sources.usageHoldExpiresAt = 1_800_000_001;
    const repository = new MemoryTeeMlRepository(sources);
    let now = 1_800_000_000;
    let release!: () => void;
    const wait = new Promise<void>(resolve => {
      release = resolve;
    });
    const gateway = new VerdictGateway(
      "DENY",
      "SERVICE_PURPOSE_MISMATCH",
      wait,
    );
    const service = createService(repository, gateway, () => now);

    const verification = service.verify(verifyInput());
    await gateway.started;
    now = sources.usageHoldExpiresAt;
    repository.sources.usageHoldStatus = "EXPIRED";
    release();
    const result = await verification;

    assert.equal(result.response.status, "TEEML_DENIED");
    assert.equal(repository.sources.actionStatus, "TEEML_DENIED");
    assert.equal(repository.sources.usageHoldStatus, "RELEASED");
  });

  it("fails closed when trusted semantic sources drift during inference", async () => {
    const repository = new MemoryTeeMlRepository(trustedSources());
    let release!: () => void;
    const wait = new Promise<void>(resolve => {
      release = resolve;
    });
    const gateway = new VerdictGateway("ALLOW", undefined, wait);
    const service = createService(repository, gateway);

    const verification = service.verify(verifyInput());
    await gateway.started;
    const availableSources =
      repository.sources as TeeMlAvailableTrustedSources;
    availableSources.agentProfile!.capabilityIds.push("payments.admin");
    release();

    await assert.rejects(
      verification,
      (error: unknown) =>
        error instanceof TeeMlError && error.code === "TEEML_CONFLICT",
    );
    assert.equal(repository.sources.actionStatus, "TEEML_FAILED");
    assert.equal(repository.sources.usageHoldStatus, "RELEASED");
  });

  it("reconciles a stale PROCESSING result before rejecting an unavailable commitment", async () => {
    const repository = new MemoryTeeMlRepository(trustedSources());
    let now = 1_800_000_000;
    let release!: () => void;
    const wait = new Promise<void>(resolve => {
      release = resolve;
    });
    const gateway = new VerdictGateway("ALLOW", undefined, wait);
    const service = createService(repository, gateway, () => now);
    const first = service.verify(verifyInput());
    await gateway.started;
    (repository.sources as { commitmentStatus: string }).commitmentStatus =
      "UNAVAILABLE";
    now += 121;

    await assert.rejects(
      service.verify(verifyInput()),
      (error: unknown) =>
        error instanceof TeeMlError &&
        error.code === "TEEML_UNKNOWN_RESULT",
    );
    assert.equal(repository.sources.actionStatus, "TEEML_FAILED");
    assert.equal(repository.sources.usageHoldStatus, "RELEASED");
    assert.equal(repository.verification?.status, "FAILED");
    assert.equal(gateway.calls, 1);

    release();
    await assert.rejects(first);
  });

  it("fails before inference when the trusted descriptor or durable Agentic ID is absent", async () => {
    for (const mutate of [
      (sources: TeeMlAvailableTrustedSources) => {
        sources.durablePolicy.semanticRules = [];
        refreshCommitments(sources);
      },
      (sources: TeeMlAvailableTrustedSources) => {
        sources.agentProfile = null;
      },
    ]) {
      const sources = trustedSources();
      mutate(sources);
      const repository = new MemoryTeeMlRepository(sources);
      const gateway = new VerdictGateway("ALLOW");
      const service = createService(repository, gateway);

      await assert.rejects(
        () => service.verify(verifyInput()),
        (error: unknown) =>
          error instanceof TeeMlError &&
          error.code === "TEEML_TRUSTED_CONTEXT_MISSING",
      );
      assert.equal(gateway.calls, 0);
      assert.equal(repository.sources.actionStatus, "TEEML_FAILED");
      assert.equal(repository.sources.usageHoldStatus, "RELEASED");
      assert.equal(repository.verification, null);
    }
  });
});

function createService(
  repository: TeeMlRepository,
  gateway: TeeMlInferenceGateway,
  clock: () => number = () => 1_800_000_000,
  securityProfile: ZeroGSecurityProfile = PRODUCTION_PRIVATE_TEEML_PROFILE,
): TeeMlService {
  let id = 0;
  return new TeeMlService(repository, gateway, {
    clock,
    idGenerator: () => `generated-${++id}`,
    auditRetentionDays: 90,
    securityProfile,
  });
}

function verifyInput() {
  return {
    requestId: "request-1",
    body: { serviceId: "storage-api", productId: "archive-pro" },
    actor: { authenticatedAgentId: "agent-1", actorType: "AGENT" as const },
  };
}

class VerdictGateway implements TeeMlInferenceGateway {
  calls = 0;
  readonly started: Promise<void>;
  private signalStarted!: () => void;

  constructor(
    private readonly verdict: "ALLOW" | "DENY",
    private readonly reasonCode = verdict === "ALLOW"
      ? "SEMANTIC_POLICY_MATCH"
      : "SERVICE_PURPOSE_MISMATCH",
    private readonly wait?: Promise<void>,
  ) {
    this.started = new Promise(resolve => {
      this.signalStarted = resolve;
    });
  }

  async complete(
    messages: Parameters<TeeMlInferenceGateway["complete"]>[0],
  ): Promise<TeeMlInferenceResult> {
    this.calls += 1;
    this.signalStarted();
    await this.wait;
    const payload = extractPromptPayload(messages[1]?.content ?? "");
    return result({
      content: JSON.stringify({
        schemaVersion: "1.0",
        verdict: this.verdict,
        reasonCode: this.reasonCode,
        requestId: payload.semanticContext.requestId,
        policyHash: payload.semanticContext.policy.policyHash,
        actionHash: payload.semanticContext.action.actionHash,
        semanticContextHash: payload.semanticContextHash,
        teemlRequestHash: payload.teemlRequestHash,
      }),
    });
  }
}

class StaticGateway implements TeeMlInferenceGateway {
  constructor(private readonly override: Partial<TeeMlInferenceResult>) {}

  async complete(): Promise<TeeMlInferenceResult> {
    return result(this.override);
  }
}

class ThrowingGateway implements TeeMlInferenceGateway {
  constructor(private readonly error: Error) {}

  async complete(): Promise<TeeMlInferenceResult> {
    throw this.error;
  }
}

function result(
  override: Partial<TeeMlInferenceResult>,
): TeeMlInferenceResult {
  return {
    responseId: "chatcmpl-1",
    routerRequestId: "router-request-1",
    providerAddress: PROVIDER,
    modelId: "0gm-1.0-35b-a3b",
    content: "{}",
    promptTokens: 100,
    completionTokens: 30,
    latencyMs: 125,
    securityProfile: PRODUCTION_PRIVATE_TEEML_PROFILE,
    trustMode: "private",
    verificationMode: "TeeML",
    sealedInference: true,
    teeVerified: true,
    ...override,
  };
}

function extractPromptPayload(content: string): any {
  return JSON.parse(content.split("\n")[1] ?? "");
}

class MemoryTeeMlRepository implements TeeMlRepository, TeeMlTransaction {
  verification: TeeMlVerificationRecord | null = null;
  readonly audit: Array<{ outcome: string; reasonCode: string }> = [];
  private queue = Promise.resolve();

  constructor(readonly sources: TeeMlTrustedSources) {}

  async runLocked<T>(
    _requestId: string,
    run: (transaction: TeeMlTransaction) => Promise<T>,
  ): Promise<T> {
    const previous = this.queue;
    let release!: () => void;
    this.queue = new Promise<void>(resolve => {
      release = resolve;
    });
    await previous;
    try {
      return await run(this);
    } finally {
      release();
    }
  }

  async saveAgentSemanticProfile(
    _profile: AgentSemanticProfileRecord,
  ): Promise<void> {}

  async getTrustedSources(): Promise<TeeMlTrustedSources> {
    return structuredClone(this.sources);
  }

  async getVerification(): Promise<TeeMlVerificationRecord | null> {
    return this.verification ? structuredClone(this.verification) : null;
  }

  async startVerification(input: StartTeeMlVerificationInput): Promise<void> {
    this.sources.actionStatus = "TEEML_PROCESSING";
    this.verification = {
      ...input,
      status: "PROCESSING",
      verdict: null,
      reasonCode: null,
      technicalReasonCode: null,
      providerAddress: null,
      modelId: null,
      securityProfile: null,
      trustMode: null,
      verificationMode: null,
      sealedInference: null,
      teeVerified: null,
      responseId: null,
      responseHash: null,
      traceHash: null,
      promptTokens: null,
      completionTokens: null,
      latencyMs: null,
      evaluatedAt: null,
      createdAt: input.now,
      updatedAt: input.now,
    };
  }

  async completeVerification(
    input: CompleteTeeMlVerificationInput,
  ): Promise<void> {
    const artifact = input.artifact;
    this.verification = {
      ...artifact,
      status:
        artifact.verdict === "ALLOW"
          ? getAllowedVerificationStatus(artifact.securityProfile)
          : "DENIED",
      technicalReasonCode: null,
      providerAddress: artifact.providerAddress ?? null,
      modelId: artifact.modelId,
      securityProfile: artifact.securityProfile,
      trustMode: artifact.trustMode,
      verificationMode: artifact.verificationMode,
      sealedInference: artifact.sealedInference,
      teeVerified: true,
      responseId: artifact.responseId ?? null,
      responseHash: artifact.responseHash,
      traceHash: artifact.traceHash ?? null,
      promptTokens: artifact.promptTokens ?? null,
      completionTokens: artifact.completionTokens ?? null,
      latencyMs: artifact.latencyMs,
      evaluatedAt: artifact.evaluatedAt,
      createdAt: this.verification!.createdAt,
      updatedAt: artifact.evaluatedAt,
    };
    this.sources.actionStatus =
      artifact.verdict === "ALLOW"
        ? getAllowedActionStatus(artifact.securityProfile)
        : "TEEML_DENIED";
    if (
      artifact.verdict === "DENY" ||
      (this.sources.actionStatus === HACKATHON_TEETLS_ALLOWED_STATUS &&
        !input.keepUsageHoldForExecution)
    ) {
      this.sources.usageHoldStatus = "RELEASED";
    }
    this.audit.push({
      outcome: this.sources.actionStatus,
      reasonCode: artifact.reasonCode,
    });
  }

  async commitUsageHold(): Promise<void> {
    this.sources.usageHoldStatus = "COMMITTED";
  }

  async releaseUsageHold(): Promise<void> {
    this.sources.usageHoldStatus = "RELEASED";
  }

  async failVerification(input: FailTeeMlVerificationInput): Promise<void> {
    this.verification = {
      ...this.verification!,
      status: "FAILED",
      technicalReasonCode: input.reasonCode,
      evaluatedAt: input.occurredAt,
      updatedAt: input.occurredAt,
    };
    this.sources.actionStatus = "TEEML_FAILED";
    this.sources.usageHoldStatus = "RELEASED";
    this.audit.push({
      outcome: "TEEML_FAILED",
      reasonCode: input.reasonCode,
    });
  }

  async failBeforeContext(input: FailTeeMlBeforeContextInput): Promise<void> {
    this.sources.actionStatus = "TEEML_FAILED";
    this.sources.usageHoldStatus = "RELEASED";
    this.audit.push({
      outcome: "TEEML_FAILED",
      reasonCode: input.reasonCode,
    });
  }
}

function trustedSources(): TeeMlAvailableTrustedSources {
  const rules: PolicyRules = {
    allowedActionTypes: ["HEDERA_HBAR_TRANSFER"],
    allowedDestinations: [
      {
        kind: "HEDERA_ACCOUNT_ID",
        value: "0.0.1234",
        chainId: 296,
      },
    ],
    allowedAssets: [
      {
        kind: "NATIVE",
        chainId: 296,
        assetId: "hbar",
        decimals: 8,
      },
    ],
    amount: { min: "1", max: "1000", dailyLimit: "10000" },
    actionCount: { dailyLimit: 100 },
  };
  const semanticRules: SemanticRule[] = [
    {
      ruleId: "purpose",
      kind: "TEXT",
      params: { purpose: "archive approved audit records" },
    },
    trustedServiceRule(),
  ];
  const durablePolicy = {
    policyId: "policy-1",
    agentId: "agent-1",
    walletId: "wallet-1",
    policyVersion: 3,
    validFrom: 1_700_000_000,
    validUntil: null,
    rules,
    semanticRules,
  };
  const policyHash = computePolicyHash(durablePolicy);
  const action = {
    actionType: "HEDERA_HBAR_TRANSFER",
    destination: {
      kind: "HEDERA_ACCOUNT_ID" as const,
      value: "0.0.1234",
      chainId: 296,
    },
    assetId: "hbar",
    amount: "100",
    actionDeadline: 1_900_000_000,
  };
  const actionHash = computeActionHash({
    requestId: "request-1",
    agentId: "agent-1",
    walletId: "wallet-1",
    networkId: NETWORK_ID,
    action: {
      agentId: "agent-1",
      walletId: "wallet-1",
      ...action,
    },
    policy: {
      policyId: durablePolicy.policyId,
      policyVersion: durablePolicy.policyVersion,
      policyHash,
    },
    aegisNonce: 1n,
  });

  return {
    commitmentStatus: "AVAILABLE",
    requestId: "request-1",
    actionStatus: "PENDING_TEEML",
    precheckId: "precheck-1",
    agentId: "agent-1",
    walletId: "wallet-1",
    policyId: "policy-1",
    policyVersion: 3,
    policyHash,
    actionHash,
    aegisNonce: "1",
    action,
    durablePolicy: {
      ...durablePolicy,
      policyHash,
    },
    agentProfile: {
      agentId: "agent-1",
      agenticId:
        "0g-agentic-id:0x1111111111111111111111111111111111111111:1",
      contractAddress:
        "0x1111111111111111111111111111111111111111",
      tokenId: "1",
      metadataHash: `0x${"44".repeat(32)}`,
      capabilityIds: ["archive.write", "archive.read"],
      registeredAt: 1_700_000_000,
      updatedAt: 1_700_000_000,
    },
    usageHoldId: "hold-1",
    usageHoldStatus: "HELD",
    usageHoldExpiresAt: 1_900_000_000,
  };
}

function refreshCommitments(
  sources: TeeMlAvailableTrustedSources,
): void {
  const policyHash = computePolicyHash({
    agentId: sources.durablePolicy.agentId,
    walletId: sources.durablePolicy.walletId,
    policyVersion: sources.durablePolicy.policyVersion,
    validFrom: sources.durablePolicy.validFrom,
    validUntil: sources.durablePolicy.validUntil,
    rules: sources.durablePolicy.rules,
    semanticRules: sources.durablePolicy.semanticRules,
  });
  sources.durablePolicy.policyHash = policyHash;
  sources.policyHash = policyHash;
  sources.actionHash = computeActionHash({
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
      policyHash,
    },
    aegisNonce: BigInt(sources.aegisNonce),
  });
}

function trustedServiceRule(): SemanticRule {
  return {
    ruleId: "service-catalog",
    kind: "TRUSTED_SERVICE_DESCRIPTOR_V1",
    params: {
      schemaVersion: "1.0",
      providerId: "provider-a",
      serviceId: "storage-api",
      productId: "archive-pro",
      networkId: "hedera:testnet",
      destinationIds: ["0.0.1234"],
      categoryIds: ["archive", "storage"],
      capabilityIds: ["archive.write"],
      metadataHash: METADATA_HASH,
      shortDescription: "Approved archival storage.",
    },
  };
}
