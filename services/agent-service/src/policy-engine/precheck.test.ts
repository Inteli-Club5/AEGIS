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
  InMemoryPrecheckRepository,
  parsePrecheckActionRequest,
  PrecheckService,
  type AgentActorContext,
} from "./precheck.js";
import { NETWORK_ID, type AgentRecord, type Hex32, type PolicyRecord, type PolicyRules, type WalletRecord } from "./types.js";

const AGENT_ID = "018f0000-0000-7000-8000-000000000201";
const WALLET_ID = "018f0000-0000-7000-8000-000000000202";
const POLICY_HASH = `0x${"44".repeat(32)}` as Hex32;
const GOLDEN_ACTION_HASH = "0x4dd5c9735e7b706a72415410018aeda884344b33b87969abd39fcc81e29e2d2b" as Hex32;

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

  it("keeps sensitive values out of sanitized audit events", async () => {
    const repository = seededRepository();
    const service = precheckService(repository);
    const rawReason = "Pay invoice 123 with private business context";
    const rawIdempotencyKey = "idem-sensitive-key";

    await service.precheck(validPrecheckInput(rawIdempotencyKey, { reason: rawReason }));

    const audit = JSON.stringify([...repository.auditEvents.values()]);
    assert.equal(audit.includes(rawReason), false);
    assert.equal(audit.includes(rawIdempotencyKey), false);
    assert.match(audit, /idempotencyKeyHash/);
    assert.match(audit, /requestPayloadHash/);
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
