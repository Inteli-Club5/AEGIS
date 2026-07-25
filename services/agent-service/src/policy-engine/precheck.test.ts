import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DENY_PRECHECK,
  PASS_TO_TEEML,
  evaluateDeterministicPolicy,
  type DeterministicPolicyEvaluationInput,
} from "./evaluator.js";
import {
  computeActionHash,
  computePrecheckRequestPayloadHash,
  computeSemanticContextHash,
  InMemoryPrecheckRepository,
  parsePrecheckActionRequest,
  PrecheckService,
  type AgentActorContext,
  type UsageHoldRecord,
} from "./precheck.js";
import { PolicyEngineError } from "./errors.js";
import { NETWORK_ID, type AgentRecord, type Hex32, type PolicyRecord, type PolicyRules, type WalletRecord } from "./types.js";

const AGENT_ID = "018f0000-0000-7000-8000-000000000201";
const WALLET_ID = "018f0000-0000-7000-8000-000000000202";
const POLICY_HASH = `0x${"44".repeat(32)}` as Hex32;
const GOLDEN_ACTION_HASH = "0x1c8a5088c6bea1bacbd47e663d5132795a61ed68784e1d06b0c7f366a88a2f48" as Hex32;

describe("PrecheckService", () => {
  it("calls the deterministic evaluator with explicit now and creates a UsageHold only on PASS_TO_TEEML", async () => {
    const repository = seededRepository();
    const captured: DeterministicPolicyEvaluationInput[] = [];
    const service = precheckService(repository, {
      evaluator: input => {
        captured.push(input);
        return evaluateDeterministicPolicy(input);
      },
    });

    const result = await service.precheck(validPrecheckInput("idem-pass"));

    assert.equal(result.httpStatus, 202);
    assert.equal(result.response.status, "PENDING_TEEML");
    assert.equal(repository.usageHolds.size, 1);
    assert.equal(repository.precheckRecords.size, 1);
    const evaluatorInput = captured[0];
    assert.ok(evaluatorInput);
    assert.equal(evaluatorInput.now, 1_784_900_010);
    assert.equal(evaluatorInput.generatedAegisNonce, 1n);
    assert.equal(evaluatorInput.policy?.policyId, "policy-1");
  });

  it("persists DENY_PRECHECK without creating a UsageHold", async () => {
    const repository = seededRepository();
    const service = precheckService(repository);

    const result = await service.precheck(
      validPrecheckInput("idem-deny", {
        destination: { kind: "HEDERA_ACCOUNT_ID", value: "0.0.999999" },
      }),
    );

    assert.equal(result.httpStatus, 200);
    assert.equal(result.response.status, DENY_PRECHECK);
    assert.equal(result.response.status === DENY_PRECHECK ? result.response.code : null, "DESTINATION_NOT_ALLOWED");
    assert.equal(repository.usageHolds.size, 0);
    assert.equal(repository.precheckRecords.size, 1);
    assert.equal(repository.auditEvents.size, 1);
  });

  it("returns the same persisted response for the same idempotency key and payload", async () => {
    const repository = seededRepository();
    const service = precheckService(repository);

    const first = await service.precheck(validPrecheckInput("idem-retry"));
    const second = await service.precheck(validPrecheckInput("idem-retry"));

    assert.deepEqual(second.response, first.response);
    assert.equal(second.idempotentReplay, true);
    assert.equal(repository.actionRequests.size, 1);
    assert.equal(repository.precheckRecords.size, 1);
    assert.equal(repository.usageHolds.size, 1);
    assert.equal(repository.auditEvents.size, 1);
    assert.equal(repository.nextNonces.get(WALLET_ID), 2n);
  });

  it("rejects the same idempotency key with a different normalized payload", async () => {
    const repository = seededRepository();
    const service = precheckService(repository);

    await service.precheck(validPrecheckInput("idem-conflict"));

    await assert.rejects(
      () => service.precheck(validPrecheckInput("idem-conflict", { amount: "2" })),
      (error: unknown) => error instanceof Error && "code" in error && error.code === "IDEMPOTENCY_CONFLICT",
    );
  });

  it("rejects empty or oversized idempotency keys before persistence", async () => {
    const repository = seededRepository();
    const service = precheckService(repository);

    await rejectsWithCode(() => service.precheck(validPrecheckInput("   ")), "missing_idempotency_key");
    await rejectsWithCode(() => service.precheck(validPrecheckInput("x".repeat(513))), "missing_idempotency_key");
    assert.equal(repository.actionRequests.size, 0);
    assert.equal(repository.precheckRecords.size, 0);
    assert.equal(repository.usageHolds.size, 0);
  });

  it("does not allocate a second nonce or audit event on retry", async () => {
    const repository = seededRepository();
    const service = precheckService(repository);

    const first = await service.precheck(validPrecheckInput("idem-nonce"));
    const second = await service.precheck(validPrecheckInput("idem-nonce"));

    assert.equal(first.response.status === "PENDING_TEEML" ? first.response.aegisNonce : null, "1");
    assert.equal(second.response.status === "PENDING_TEEML" ? second.response.aegisNonce : null, "1");
    assert.equal(repository.nextNonces.get(WALLET_ID), 2n);
    assert.equal(repository.auditEvents.size, 1);
  });

  it("rolls back request, precheck, nonce, hold, and audit writes when a repository step fails", async () => {
    const repository = seededRepository();
    repository.failOn = "audit_event";
    const service = precheckService(repository);

    await assert.rejects(() => service.precheck(validPrecheckInput("idem-rollback")));

    assert.equal(repository.actionRequests.size, 0);
    assert.equal(repository.precheckRecords.size, 0);
    assert.equal(repository.usageHolds.size, 0);
    assert.equal(repository.auditEvents.size, 0);
    assert.equal(repository.nextNonces.size, 0);
  });

  it("keeps semantic context text out of persisted records", async () => {
    const repository = seededRepository();
    const service = precheckService(repository);
    const rawSemanticContext = "Pay invoice 123 with private business context";
    const rawIdempotencyKey = "idem-sensitive-key";

    await service.precheck(validPrecheckInput(rawIdempotencyKey, { semanticContext: rawSemanticContext }));

    const persisted = JSON.stringify({
      actionRequests: [...repository.actionRequests.values()],
      precheckRecords: [...repository.precheckRecords.values()],
      usageHolds: [...repository.usageHolds.values()],
      auditEvents: [...repository.auditEvents.values()],
    });
    const audit = JSON.stringify([...repository.auditEvents.values()]);
    const [request] = [...repository.actionRequests.values()];
    assert.ok(request);
    assert.equal(request.semanticContextHash, computeSemanticContextHash(rawSemanticContext));
    assert.equal(persisted.includes(rawSemanticContext), false);
    assert.equal(audit.includes(rawIdempotencyKey), false);
    assert.match(audit, /idempotencyKeyHash/);
    assert.match(audit, /requestPayloadHash/);
  });

  it("expires and counts held and committed usage in the in-memory repository", async () => {
    const repository = seededRepository();
    repository.usageHolds.set("hold-active", baseUsageHold({ usageHoldId: "hold-active", amount: "2", heldAt: 10, expiresAt: 1_000 }));
    repository.usageHolds.set("hold-expired", baseUsageHold({ usageHoldId: "hold-expired", amount: "9", heldAt: 10, expiresAt: 50 }));
    repository.usageHolds.set(
      "hold-committed",
      baseUsageHold({ usageHoldId: "hold-committed", amount: "3", status: "COMMITTED", heldAt: 20, expiresAt: 300, committedAt: 30 }),
    );
    repository.usageHolds.set("hold-other-policy", baseUsageHold({ usageHoldId: "hold-other-policy", policyId: "other-policy", amount: "100" }));

    await repository.runInTransaction(async tx => {
      await tx.expireUsageHolds(100);
      const snapshot = await tx.getUsageSnapshot({
        agentId: AGENT_ID,
        walletId: WALLET_ID,
        policyId: "policy-1",
        windowStart: 0,
        windowEnd: 1_000,
        now: 100,
      });

      assert.deepEqual(snapshot, {
        periodAmountUsed: "3",
        periodAmountHeld: "2",
        periodActionCountUsed: "1",
        periodActionCountHeld: "1",
      });
    });

    assert.equal(repository.usageHolds.get("hold-expired")?.status, "EXPIRED");
    assert.equal(repository.usageHolds.get("hold-expired")?.expiredAt, 100);
  });

  it("rejects duplicate action request and precheck writes in the in-memory repository", async () => {
    const repository = seededRepository();
    const service = precheckService(repository);
    await service.precheck(validPrecheckInput("idem-unique"));

    const request = [...repository.actionRequests.values()][0];
    const precheck = [...repository.precheckRecords.values()][0];
    assert.ok(request);
    assert.ok(precheck);

    await repository.runInTransaction(async tx => {
      await rejectsWithCode(() => tx.insertActionRequest({ ...request, requestId: "request-duplicate-idempotency" }), "database_unique_constraint");
      await rejectsWithCode(
        () => tx.insertActionRequest({ ...request, requestId: "request-duplicate-nonce", idempotencyKeyHash: `0x${"99".repeat(32)}` as Hex32 }),
        "database_unique_constraint",
      );
      await rejectsWithCode(() => tx.insertPrecheckRecord({ ...precheck, precheckId: "precheck-duplicate-request" }), "database_unique_constraint");
    });
  });

  it("rejects malformed action request bodies before evaluation", () => {
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ ...baseBody(), destination: null }, "invalid_object"],
      [{ ...baseBody(), actionType: "" }, "invalid_string"],
      [{ ...baseBody(), amount: "0" }, "invalid_base_unit_amount"],
      [{ ...baseBody(), actionDeadline: -1 }, "invalid_unix_seconds"],
      [{ ...baseBody(), destination: { kind: "EVM_ADDRESS", value: "0xabc" } }, "invalid_evm_address"],
      [{ ...baseBody(), destination: { kind: "HEDERA_ACCOUNT_ID", value: "123456" } }, "invalid_hedera_account_id"],
      [{ ...baseBody(), destination: { kind: "HEDERA_ACCOUNT_ID", value: "0.0.123456", chainId: 297 } }, "unsupported_chain_id"],
      [{ ...baseBody(), destination: { kind: "URL_ORIGIN", value: "ftp://api.example.com" } }, "invalid_url_origin"],
      [{ ...baseBody(), destination: { kind: "URL_ORIGIN", value: "not a url" } }, "invalid_url_origin"],
      [{ ...baseBody(), destination: { kind: "UNKNOWN", value: "0.0.123456" } }, "unsupported_destination_kind"],
      [{ ...baseBody(), semanticContext: undefined }, "invalid_string"],
      [{ ...baseBody(), semanticContext: "x".repeat(2_001) }, "invalid_semantic_context"],
      [{ ...baseBody(), reason: "legacy private reason" }, "unknown_property"],
    ];

    for (const [body, code] of cases) {
      throwsWithCode(() => parsePrecheckActionRequest({ agentId: AGENT_ID, walletId: WALLET_ID }, body), code);
    }
  });

  it("computes deterministic actionHash golden values from normalized action context", () => {
    const action = parsePrecheckActionRequest({ agentId: AGENT_ID, walletId: WALLET_ID }, baseBody());
    const policy = basePolicy();
    const hash = computeActionHash({
      requestId: "01984799-0000-7000-8000-000000000001",
      agentId: AGENT_ID,
      walletId: WALLET_ID,
      networkId: NETWORK_ID,
      action,
      policy,
      aegisNonce: 1n,
    });

    assert.equal(hash, GOLDEN_ACTION_HASH);
    assert.equal(
      computeActionHash({
        requestId: "01984799-0000-7000-8000-000000000001",
        agentId: AGENT_ID,
        walletId: WALLET_ID,
        networkId: NETWORK_ID,
        action: parsePrecheckActionRequest({ agentId: AGENT_ID, walletId: WALLET_ID }, { ...baseBody(), amount: "2" }),
        policy,
        aegisNonce: 1n,
      }) === hash,
      false,
    );
    assert.equal(
      computeActionHash({
        requestId: "01984799-0000-7000-8000-000000000001",
        agentId: AGENT_ID,
        walletId: WALLET_ID,
        networkId: NETWORK_ID,
        action,
        policy: { ...policy, policyVersion: 2 },
        aegisNonce: 1n,
      }) === hash,
      false,
    );
    assert.equal(
      computeActionHash({
        requestId: "01984799-0000-7000-8000-000000000001",
        agentId: AGENT_ID,
        walletId: WALLET_ID,
        networkId: NETWORK_ID,
        action,
        policy,
        aegisNonce: 2n,
      }) === hash,
      false,
    );
    assert.equal(computePrecheckRequestPayloadHash(action), computePrecheckRequestPayloadHash(parsePrecheckActionRequest({ agentId: AGENT_ID, walletId: WALLET_ID }, baseBody())));
  });
});

function precheckService(
  repository: InMemoryPrecheckRepository,
  overrides: Partial<ConstructorParameters<typeof PrecheckService>[1]> = {},
): PrecheckService {
  const ids = ["request-1", "precheck-1", "hold-1", "event-1", "request-2", "precheck-2", "hold-2", "event-2"];
  return new PrecheckService(repository, {
    clock: () => 1_784_900_010,
    idGenerator: () => ids.shift() ?? "extra-id",
    ...overrides,
  });
}

function validPrecheckInput(idempotencyKey: string, overrides: Record<string, unknown> = {}) {
  return {
    params: { agentId: AGENT_ID, walletId: WALLET_ID },
    body: { ...baseBody(), ...overrides },
    idempotencyKey,
    actor: { authenticatedAgentId: AGENT_ID, actorType: "AGENT" } satisfies AgentActorContext,
  };
}

function baseBody() {
  return {
    actionType: "HEDERA_HBAR_TRANSFER",
    destination: { kind: "HEDERA_ACCOUNT_ID", value: "0.0.123456" },
    assetId: "hedera:testnet:hbar",
    amount: "1",
    actionDeadline: 1_784_900_300,
    semanticContext: "Pay approved provider invoice",
  };
}

function seededRepository(): InMemoryPrecheckRepository {
  const repository = new InMemoryPrecheckRepository();
  repository.agents.set(AGENT_ID, baseAgent());
  repository.wallets.set(WALLET_ID, baseWallet());
  repository.policies.set("policy-1", basePolicy());
  return repository;
}

function baseAgent(overrides: Partial<AgentRecord> = {}): AgentRecord {
  return {
    agentId: AGENT_ID,
    ownerAddress: "0x0000000000000000000000000000000000000abc",
    status: "ACTIVE",
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function baseWallet(overrides: Partial<WalletRecord> = {}): WalletRecord {
  return {
    walletId: WALLET_ID,
    agentId: AGENT_ID,
    networkId: NETWORK_ID,
    safeAddress: "0x0000000000000000000000000000000000000def",
    status: "PROTECTED",
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function basePolicy(overrides: Partial<PolicyRecord> = {}): PolicyRecord {
  return {
    policyId: "policy-1",
    policySeriesId: "policy-1",
    agentId: AGENT_ID,
    walletId: WALLET_ID,
    policyVersion: 1,
    policyHash: POLICY_HASH,
    status: "ACTIVE",
    validFrom: 1,
    validUntil: 1_784_901_000,
    rules: baseRules(),
    semanticRules: [],
    operatorAddress: "0x0000000000000000000000000000000000000abc",
    operatorSignature: "0x01",
    operatorMessage: "{}",
    operatorCommitment: `0x${"55".repeat(32)}`,
    createdAt: 1,
    updatedAt: 1,
    activatedAt: 1,
    revokedAt: null,
    supersededAt: null,
    supersededByPolicyId: null,
    ...overrides,
  };
}

function baseRules(overrides: Partial<PolicyRules> = {}): PolicyRules {
  return {
    allowedActionTypes: overrides.allowedActionTypes ?? ["HEDERA_HBAR_TRANSFER", "HEDERA_HTS_FUNGIBLE_TRANSFER"],
    allowedDestinations: overrides.allowedDestinations ?? [{ kind: "HEDERA_ACCOUNT_ID", value: "0.0.123456" }],
    allowedAssets: overrides.allowedAssets ?? [
      { kind: "NATIVE", chainId: 296, assetId: "hbar", decimals: 8, symbol: "HBAR" },
      { kind: "HTS", chainId: 296, tokenId: "0.0.12345", decimals: 6, symbol: "DEMO" },
    ],
    amount: overrides.amount ?? { min: "1", max: "10", dailyLimit: "10" },
    actionCount: overrides.actionCount ?? { dailyLimit: 10 },
  };
}

function baseUsageHold(overrides: Partial<UsageHoldRecord> = {}): UsageHoldRecord {
  return {
    usageHoldId: "hold-1",
    requestId: "request-1",
    precheckId: "precheck-1",
    agentId: AGENT_ID,
    walletId: WALLET_ID,
    policyId: "policy-1",
    policyVersion: 1,
    policyHash: POLICY_HASH,
    assetId: "hedera:testnet:hbar",
    amount: "1",
    actionCount: 1,
    status: "HELD",
    heldAt: 1,
    expiresAt: 300,
    releasedAt: null,
    expiredAt: null,
    committedAt: null,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

async function rejectsWithCode(operation: () => unknown | Promise<unknown>, code: string) {
  await assert.rejects(
    async () => {
      await operation();
    },
    (error: unknown) => error instanceof PolicyEngineError && error.code === code,
  );
}

function throwsWithCode(operation: () => unknown, code: string) {
  assert.throws(operation, (error: unknown) => error instanceof PolicyEngineError && error.code === code);
}
