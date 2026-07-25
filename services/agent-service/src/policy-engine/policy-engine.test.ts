import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { buildPolicyCommitment, POLICY_COMMITMENT_DOMAIN, POLICY_COMMITMENT_TYPES } from "./auth.js";
import { computePolicyHash, computePolicyRecordHash } from "./canonicalize.js";
import { PolicyEngineError } from "./errors.js";
import { InMemoryPolicyRepository } from "./repository.js";
import { createPolicyIdFromHash, PolicyLifecycleService } from "./service.js";
import { NETWORK_ID, type CreatePolicyRequest, type Hex32, type Policy, type PolicyCommitment, type PolicyRules } from "./types.js";
import {
  getEffectivePolicyStatus,
  parseActivatePolicyRequest,
  parseCreatePolicyRequest,
  parseRevokePolicyRequest,
  parseUpdatePolicyRequest,
} from "./validation.js";

const owner = privateKeyToAccount(generatePrivateKey());
const other = privateKeyToAccount(generatePrivateKey());

const AGENT_ID = "018f0000-0000-7000-8000-000000000001";
const WALLET_ID = "018f0000-0000-7000-8000-000000000002";
const SAFE_ADDRESS = "0x0000000000000000000000000000000000000abc";

const GOLDEN_POLICY_HASH = "0x955f255d436d6af3f3da4983e077746857dca9906e32869606f970efcba3d21e";

describe("Policy Engine Level 1 lifecycle", () => {
  it("creates a valid DRAFT policy", async () => {
    const { service } = await seededService();
    const body = baseCreatePolicyRequest();
    const response = await service.createPolicy(body, await signCreate(service, body), 1000);

    assert.equal(response.policy.status, "DRAFT");
    assert.equal(response.policy.policyVersion, 1);
    assert.equal(response.policy.agentId, AGENT_ID);
    assert.equal(response.policy.walletId, WALLET_ID);
    assert.match(response.policy.policyHash, /^0x[a-f0-9]{64}$/);
    assert.equal(response.policy.createdAt, 1000);
  });

  it("rejects unknown properties", async () => {
    const { service } = await seededService();
    const body = { ...baseCreatePolicyRequest(), policyHash: "0xdead" };
    await rejectsWithCode(() => service.createPolicy(body, { operatorAddress: owner.address, signature: "0x00" }), "unknown_property");
  });

  it("rejects invalid and floating point amounts", async () => {
    const { service } = await seededService();
    const body = baseCreatePolicyRequest({
      amount: { min: "1", max: "10.5", dailyLimit: "100" },
    });

    await rejectsWithCode(() => service.createPolicy(body, { operatorAddress: owner.address, signature: "0x00" }), "invalid_base_unit_amount");
  });

  it("rejects assets outside the Hedera Level 1 catalog", async () => {
    const { service } = await seededService();
    const body = baseCreatePolicyRequest({
      allowedAssets: [
        {
          kind: "ERC20",
          chainId: 296,
          contractAddress: "0x00000000000000000000000000000000000000aa",
          decimals: 18,
        },
      ] as never,
    });

    await rejectsWithCode(() => service.createPolicy(body, { operatorAddress: owner.address, signature: "0x00" }), "unsupported_asset_kind");
  });

  it("rejects a non-owner operator", async () => {
    const { service } = await seededService();
    const body = baseCreatePolicyRequest();

    await rejectsWithCode(async () => service.createPolicy(body, await signCreate(service, body, other)), "operator_not_owner");
  });

  it("rejects paused, retired, or dead wallets", async () => {
    for (const walletStatus of ["PAUSED", "RETIRED", "DEAD"] as const) {
      const { service } = await seededService({ walletStatus });
      const body = baseCreatePolicyRequest();

      await rejectsWithCode(async () => service.createPolicy(body, await signCreate(service, body)), "wallet_not_protected");
    }
  });

  it("rejects invalid operator signatures", async () => {
    const { service } = await seededService();
    const body = baseCreatePolicyRequest();
    const commitment = createCommitment(body, owner.address.toLowerCase() as `0x${string}`);
    const invalidSignature = await signCommitment(commitment, other);

    await rejectsWithCode(
      () => service.createPolicy(body, { operatorAddress: owner.address, signature: invalidSignature }),
      "invalid_operator_signature",
    );
  });

  it("rejects replay when policyHash, walletId, agentId, version, or validity is altered", async () => {
    const { service } = await seededService();
    const body = baseCreatePolicyRequest();
    const commitment = createCommitment(body, owner.address.toLowerCase() as `0x${string}`);
    const cases: PolicyCommitment[] = [
      { ...commitment, policyHash: ("0x" + "11".repeat(32)) as Hex32 },
      { ...commitment, walletId: "018f0000-0000-7000-8000-000000000099" },
      { ...commitment, agentId: "018f0000-0000-7000-8000-000000000098" },
      { ...commitment, policyVersion: 2n },
      { ...commitment, validUntil: 3000n },
    ];

    for (const altered of cases) {
      const signature = await signCommitment(altered, owner);
      await rejectsWithCode(() => service.createPolicy(body, { operatorAddress: owner.address, signature }), "invalid_operator_signature");
    }
  });

  it("uses deterministic canonical policy hashing", () => {
    const input = parseCreatePolicyRequest(baseCreatePolicyRequest());
    const hash = computePolicyHash({
      agentId: input.agentId,
      walletId: input.walletId,
      policyVersion: 1,
      validFrom: input.validFrom,
      validUntil: input.validUntil,
      rules: input.rules,
      semanticRules: input.semanticRules ?? [],
    });

    assert.equal(hash, GOLDEN_POLICY_HASH);
  });

  it("hashes semantically unordered arrays consistently", () => {
    const left = parseCreatePolicyRequest(baseCreatePolicyRequest());
    const right = parseCreatePolicyRequest(
      baseCreatePolicyRequest({
        allowedActionTypes: ["SERVICE_PAYMENT", "TRANSFER", "TRANSFER"],
        allowedDestinations: [
          { kind: "URL_ORIGIN", value: "https://api.example.com/v1/pay" },
          { kind: "EVM_ADDRESS", value: "0x00000000000000000000000000000000000000aa", chainId: 296 },
          { kind: "EVM_ADDRESS", value: "0x00000000000000000000000000000000000000AA", chainId: 296 },
        ],
        allowedAssets: [
          { kind: "HTS", chainId: 296, tokenId: "0.0.12345", decimals: 6, symbol: "DEMO" },
          { kind: "NATIVE", chainId: 296, assetId: "hbar", decimals: 8, symbol: "HBAR" },
          { kind: "NATIVE", chainId: 296, assetId: "hbar", decimals: 8 },
        ],
        semanticRules: [
          { ruleId: "purpose", kind: "TEXT", params: { value: "pay approved providers" } },
          { kind: "TEXT", ruleId: "invoice", params: { required: true } },
        ],
      }),
    );

    assert.equal(hashForCreate(left), hashForCreate(right));
  });

  it("changes the hash when destination, amount, validity, or semanticRules change", () => {
    const base = parseCreatePolicyRequest(baseCreatePolicyRequest());
    const baseHash = hashForCreate(base);

    const destinationChanged = parseCreatePolicyRequest(
      baseCreatePolicyRequest({
        allowedDestinations: [{ kind: "EVM_ADDRESS", value: "0x00000000000000000000000000000000000000bb", chainId: 296 }],
      }),
    );
    const amountChanged = parseCreatePolicyRequest(baseCreatePolicyRequest({ amount: { min: "1", max: "101", dailyLimit: "1000" } }));
    const validityChanged = parseCreatePolicyRequest({ ...baseCreatePolicyRequest(), validUntil: 2001 });
    const semanticChanged = parseCreatePolicyRequest(
      baseCreatePolicyRequest({
        semanticRules: [{ ruleId: "purpose", kind: "TEXT", params: { value: "different" } }],
      }),
    );

    assert.notEqual(hashForCreate(destinationChanged), baseHash);
    assert.notEqual(hashForCreate(amountChanged), baseHash);
    assert.notEqual(hashForCreate(validityChanged), baseHash);
    assert.notEqual(hashForCreate(semanticChanged), baseHash);
  });

  it("does not include mutable audit fields in the policy hash", async () => {
    const { service } = await seededService();
    const body = baseCreatePolicyRequest();
    const created = (await service.createPolicy(body, await signCreate(service, body), 1000)).policy;
    const changedAuditFields = { ...created, createdAt: 2000, updatedAt: 3000, activatedAt: 4000 };

    assert.equal(computePolicyRecordHash(created), computePolicyRecordHash(changedAuditFields));
  });

  it("updates by creating a new version without mutating the previous policy", async () => {
    const { service } = await seededService();
    const created = await createAndActivate(service);
    const updateBody = {
      expectedPolicyVersion: created.policyVersion,
      rules: baseRules({ amount: { min: "1", max: "250", dailyLimit: "1000" } }),
    };

    const updated = await service.updatePolicy(created.policyId, updateBody, await signUpdate(service, created.policyId, updateBody), 1200);
    const previous = await service.getPolicy(created.policyId);

    assert.equal(updated.policy.policyVersion, 2);
    assert.equal(updated.policy.status, "DRAFT");
    assert.equal(previous.status, "ACTIVE");
    assert.equal(previous.rules.amount.max, "100");
    assert.equal(updated.policy.rules.amount.max, "250");
    assert.notEqual(updated.policy.policyHash, previous.policyHash);
  });

  it("activation supersedes the previous active version and leaves only one active policy", async () => {
    const { repository, service } = await seededService();
    const first = await createAndActivate(service);
    const updateBody = {
      expectedPolicyVersion: first.policyVersion,
      rules: baseRules({ amount: { min: "1", max: "200", dailyLimit: "1000" } }),
    };
    const second = (await service.updatePolicy(first.policyId, updateBody, await signUpdate(service, first.policyId, updateBody), 1200)).policy;
    const activatedSecond = await service.activatePolicy(
      second.policyId,
      { expectedPolicyVersion: second.policyVersion, expectedPolicyHash: second.policyHash },
      await signActivate(service, second),
      1300,
    );

    const versions = await service.listPolicyVersions(first.policyId);
    const active = await repository.getActivePolicy(AGENT_ID, WALLET_ID);

    assert.equal(activatedSecond.supersededPolicy?.policyId, first.policyId);
    assert.equal(versions.filter(policy => policy.status === "ACTIVE").length, 1);
    assert.equal(versions.find(policy => policy.policyId === first.policyId)?.status, "SUPERSEDED");
    assert.equal(active?.policyId, second.policyId);
  });

  it("rejects activation of expired policies", async () => {
    const { service } = await seededService();
    const body = baseCreatePolicyRequest({ validFrom: 100, validUntil: 150 });
    const policy = (await service.createPolicy(body, await signCreate(service, body), 100)).policy;

    await rejectsWithCode(
      async () => service.activatePolicy(policy.policyId, { expectedPolicyVersion: 1, expectedPolicyHash: policy.policyHash }, await signActivate(service, policy), 151),
      "policy_expired",
    );
  });

  it("revokes a policy without reactivating a superseded version", async () => {
    const { service } = await seededService();
    const first = await createAndActivate(service);
    const updateBody = {
      expectedPolicyVersion: first.policyVersion,
      rules: baseRules({ amount: { min: "1", max: "300", dailyLimit: "1000" } }),
    };
    const second = (await service.updatePolicy(first.policyId, updateBody, await signUpdate(service, first.policyId, updateBody), 1200)).policy;
    await service.activatePolicy(
      second.policyId,
      { expectedPolicyVersion: second.policyVersion, expectedPolicyHash: second.policyHash },
      await signActivate(service, second),
      1300,
    );

    const revokeBody = { expectedPolicyVersion: second.policyVersion, expectedPolicyHash: second.policyHash };
    const revoked = await service.revokePolicy(second.policyId, revokeBody, await signRevoke(service, second, revokeBody), 1400);
    const firstAfterRevoke = await service.getPolicy(first.policyId);
    const active = await service.getActivePolicy(AGENT_ID, WALLET_ID, 1400);

    assert.equal(revoked.policy.status, "REVOKED");
    assert.equal(firstAfterRevoke.status, "SUPERSEDED");
    assert.equal(active.policy, null);
  });

  it("does not reactivate revoked or superseded policies implicitly", async () => {
    const { service } = await seededService();
    const first = await createAndActivate(service);
    const updateBody = {
      expectedPolicyVersion: first.policyVersion,
      rules: baseRules({ amount: { min: "1", max: "400", dailyLimit: "1000" } }),
    };
    const second = (await service.updatePolicy(first.policyId, updateBody, await signUpdate(service, first.policyId, updateBody), 1200)).policy;
    await service.activatePolicy(
      second.policyId,
      { expectedPolicyVersion: second.policyVersion, expectedPolicyHash: second.policyHash },
      await signActivate(service, second),
      1300,
    );
    const revokeBody = { expectedPolicyVersion: second.policyVersion, expectedPolicyHash: second.policyHash };
    await service.revokePolicy(second.policyId, revokeBody, await signRevoke(service, second, revokeBody), 1400);

    await rejectsWithCode(
      async () =>
        service.activatePolicy(first.policyId, { expectedPolicyVersion: 1, expectedPolicyHash: first.policyHash }, await signActivate(service, first), 1500),
      "policy_not_activatable",
    );
    await rejectsWithCode(
      async () =>
        service.activatePolicy(
          second.policyId,
          { expectedPolicyVersion: second.policyVersion, expectedPolicyHash: second.policyHash },
          await signActivate(service, second),
          1500,
        ),
      "policy_not_activatable",
    );
  });

  it("calculates expiration from explicit now input", () => {
    assert.equal(getEffectivePolicyStatus({ status: "ACTIVE", validUntil: 200 }, 199), "ACTIVE");
    assert.equal(getEffectivePolicyStatus({ status: "ACTIVE", validUntil: 200 }, 201), "EXPIRED");
  });
});

async function seededService(input: { walletStatus?: "PROTECTED" | "PAUSED" | "RETIRED" | "DEAD" } = {}) {
  const repository = new InMemoryPolicyRepository();
  await repository.saveAgent({
    agentId: AGENT_ID,
    ownerAddress: owner.address.toLowerCase() as `0x${string}`,
    status: "ACTIVE",
    createdAt: 1,
    updatedAt: 1,
  });
  await repository.saveWallet({
    walletId: WALLET_ID,
    agentId: AGENT_ID,
    networkId: NETWORK_ID,
    safeAddress: SAFE_ADDRESS,
    status: input.walletStatus ?? "PROTECTED",
    createdAt: 1,
    updatedAt: 1,
  });
  return { repository, service: new PolicyLifecycleService(repository, () => 1000) };
}

function baseCreatePolicyRequest(overrides: Partial<CreatePolicyRequest & PolicyRules> = {}): CreatePolicyRequest {
  return {
    agentId: AGENT_ID,
    walletId: WALLET_ID,
    validFrom: overrides.validFrom ?? 100,
    validUntil: overrides.validUntil ?? 2000,
    rules: baseRules(overrides),
    semanticRules: overrides.semanticRules ?? [
      { ruleId: "invoice", kind: "TEXT", params: { required: true } },
      { ruleId: "purpose", kind: "TEXT", params: { value: "pay approved providers" } },
    ],
  };
}

function baseRules(overrides: Partial<PolicyRules> = {}): PolicyRules {
  return {
    allowedActionTypes: overrides.allowedActionTypes ?? ["TRANSFER", "SERVICE_PAYMENT"],
    allowedDestinations: overrides.allowedDestinations ?? [
      { kind: "EVM_ADDRESS", value: "0x00000000000000000000000000000000000000AA", chainId: 296 },
      { kind: "URL_ORIGIN", value: "https://api.example.com/v1/pay" },
    ],
    allowedAssets: overrides.allowedAssets ?? [
      { kind: "NATIVE", chainId: 296, assetId: "hbar", decimals: 8, symbol: "HBAR" },
      { kind: "HTS", chainId: 296, tokenId: "0.0.12345", decimals: 6, symbol: "DEMO" },
    ],
    amount: overrides.amount ?? { min: "1", max: "100", dailyLimit: "1000" },
    actionCount: overrides.actionCount ?? { dailyLimit: 10 },
  };
}

async function createAndActivate(service: PolicyLifecycleService) {
  const body = baseCreatePolicyRequest();
  const created = (await service.createPolicy(body, await signCreate(service, body), 1000)).policy;
  const activated = await service.activatePolicy(
    created.policyId,
    { expectedPolicyVersion: created.policyVersion, expectedPolicyHash: created.policyHash },
    await signActivate(service, created),
    1100,
  );
  return activated.policy;
}

async function signCreate(service: PolicyLifecycleService, body: unknown, account = owner) {
  return signCommitmentAuth(createCommitment(body, account.address.toLowerCase() as `0x${string}`), account);
}

async function signUpdate(service: PolicyLifecycleService, policyId: string, body: unknown, account = owner) {
  const previous = await service.getPolicy(policyId);
  const request = parseUpdatePolicyRequest(policyId, body);
  const validFrom = request.validFrom ?? previous.validFrom;
  const validUntil = request.validUntil === undefined ? previous.validUntil : request.validUntil;
  const rules = request.rules ?? previous.rules;
  const semanticRules = request.semanticRules ?? previous.semanticRules;
  const policyVersion = previous.policyVersion + 1;
  const policyHash = computePolicyHash({
    agentId: previous.agentId,
    walletId: previous.walletId,
    policyVersion,
    validFrom,
    validUntil,
    rules,
    semanticRules,
  });

  return signCommitmentAuth(
    buildPolicyCommitment({
      operation: "UPDATE_POLICY",
      operatorAddress: account.address.toLowerCase() as `0x${string}`,
      agentId: previous.agentId,
      walletId: previous.walletId,
      policyId: createPolicyIdFromHash(policyHash),
      sourcePolicyId: previous.policyId,
      policyVersion,
      policyHash,
      validFrom,
      validUntil,
    }),
    account,
  );
}

async function signActivate(service: PolicyLifecycleService, policy: { policyId: string; policyVersion: number; policyHash: string }, account = owner) {
  const stored = await service.getPolicy(policy.policyId);
  parseActivatePolicyRequest(policy.policyId, {
    expectedPolicyVersion: policy.policyVersion,
    expectedPolicyHash: policy.policyHash,
  });
  return signCommitmentAuth(policyCommitmentFromPolicy("ACTIVATE_POLICY", stored, account.address.toLowerCase() as `0x${string}`), account);
}

async function signRevoke(
  service: PolicyLifecycleService,
  policy: { policyId: string },
  body: { expectedPolicyVersion: number; expectedPolicyHash: string },
  account = owner,
) {
  const stored = await service.getPolicy(policy.policyId);
  parseRevokePolicyRequest(policy.policyId, body);
  return signCommitmentAuth(policyCommitmentFromPolicy("REVOKE_POLICY", stored, account.address.toLowerCase() as `0x${string}`), account);
}

async function signCommitmentAuth(commitment: PolicyCommitment, account = owner) {
  return {
    operatorAddress: account.address,
    signature: await signCommitment(commitment, account),
  };
}

async function signCommitment(commitment: PolicyCommitment, account = owner) {
  return account.signTypedData({
    domain: POLICY_COMMITMENT_DOMAIN,
    types: POLICY_COMMITMENT_TYPES,
    primaryType: "PolicyCommitment",
    message: commitment,
  });
}

function createCommitment(body: unknown, operatorAddress: `0x${string}`): PolicyCommitment {
  const input = parseCreatePolicyRequest(body);
  const policyVersion = 1;
  const policyHash = hashForCreate(input);
  return buildPolicyCommitment({
    operation: "CREATE_POLICY",
    operatorAddress,
    agentId: input.agentId,
    walletId: input.walletId,
    policyId: createPolicyIdFromHash(policyHash),
    policyVersion,
    policyHash,
    validFrom: input.validFrom,
    validUntil: input.validUntil,
  });
}

function policyCommitmentFromPolicy(
  operation: "ACTIVATE_POLICY" | "REVOKE_POLICY",
  policy: Policy,
  operatorAddress: `0x${string}`,
): PolicyCommitment {
  return buildPolicyCommitment({
    operation,
    operatorAddress,
    agentId: policy.agentId,
    walletId: policy.walletId,
    policyId: policy.policyId,
    policyVersion: policy.policyVersion,
    policyHash: policy.policyHash,
    validFrom: policy.validFrom,
    validUntil: policy.validUntil,
  });
}

function hashForCreate(input: CreatePolicyRequest) {
  return computePolicyHash({
    agentId: input.agentId,
    walletId: input.walletId,
    policyVersion: 1,
    validFrom: input.validFrom,
    validUntil: input.validUntil,
    rules: input.rules,
    semanticRules: input.semanticRules ?? [],
  });
}

async function rejectsWithCode(operation: () => unknown | Promise<unknown>, code: string) {
  await assert.rejects(
    async () => {
      await operation();
    },
    (error: unknown) => error instanceof PolicyEngineError && error.code === code,
  );
}
