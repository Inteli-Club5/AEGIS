import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createAgentServiceApp } from "../index.js";
import type { AgentProfile } from "../types.js";
import { buildPolicyCommitment, POLICY_COMMITMENT_DOMAIN, POLICY_COMMITMENT_TYPES } from "./auth.js";
import { computePolicyHash } from "./canonicalize.js";
import {
  PostgresPolicyRepository,
  PostgresPrecheckRepository,
  UnconfiguredPolicyRepository,
  UnconfiguredPrecheckRepository,
} from "./db/postgres.js";
import * as schema from "./db/schema.js";
import { PolicyEngineError } from "./errors.js";
import { createUuidV7 } from "./ids.js";
import { PrecheckService, type AgentActorContext } from "./precheck.js";
import { createPolicyIdFromHash, PolicyLifecycleService } from "./service.js";
import { NETWORK_ID, type CreatePolicyRequest, type Hex32, type Policy, type PolicyCommitment, type PolicyRules } from "./types.js";
import { parseCreatePolicyRequest, parseUpdatePolicyRequest } from "./validation.js";

const { Pool } = pg;

const owner = privateKeyToAccount(generatePrivateKey());
const other = privateKeyToAccount(generatePrivateKey());
const AGENT_ID = "018f0000-0000-7000-8000-000000000101";
const WALLET_ID = "018f0000-0000-7000-8000-000000000102";
const SAFE_ADDRESS = "0x0000000000000000000000000000000000000def";
const openPools: pg.Pool[] = [];

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  throw new Error("TEST_DATABASE_URL is required for PostgreSQL integration tests");
}
if (process.env.DATABASE_URL && process.env.DATABASE_URL === testDatabaseUrl) {
  throw new Error("TEST_DATABASE_URL must not equal DATABASE_URL");
}

describe("Policy Engine PostgreSQL integration", () => {
  beforeEach(async () => {
    await resetAndMigrate();
  });

  afterEach(async () => {
    await Promise.all(openPools.splice(0).map(pool => pool.end()));
  });

  it("runs the persisted policy lifecycle against PostgreSQL", async () => {
    const { repository, service } = await seededPostgresService();
    const createBody = baseCreatePolicyRequest();
    const created = (await service.createPolicy(createBody, await signCreate(createBody), 1000)).policy;
    assert.equal(created.status, "DRAFT");

    const read = await service.getPolicy(created.policyId);
    assert.equal(read.policyHash, created.policyHash);
    assert.equal((await service.listPolicyVersions(created.policyId)).length, 1);

    const activated = (
      await service.activatePolicy(
        created.policyId,
        { expectedPolicyVersion: created.policyVersion, expectedPolicyHash: created.policyHash },
        await signExisting("ACTIVATE_POLICY", created),
        1100,
      )
    ).policy;
    assert.equal(activated.status, "ACTIVE");

    const activeBeforeExpiry = await service.getActivePolicy(AGENT_ID, WALLET_ID, 1500);
    assert.equal(activeBeforeExpiry.effectiveStatus, "ACTIVE");
    const activeAfterExpiry = await service.getActivePolicy(AGENT_ID, WALLET_ID, 2500);
    assert.equal(activeAfterExpiry.effectiveStatus, "EXPIRED");

    const updateBody = {
      expectedPolicyVersion: activated.policyVersion,
      rules: baseRules({ amount: { min: "1", max: "250", dailyLimit: "1000" } }),
    };
    const updated = (await service.updatePolicy(activated.policyId, updateBody, await signUpdate(service, activated.policyId, updateBody), 1200)).policy;
    assert.equal(updated.status, "DRAFT");
    assert.equal(updated.policyVersion, 2);

    const activatedSecond = await service.activatePolicy(
      updated.policyId,
      { expectedPolicyVersion: updated.policyVersion, expectedPolicyHash: updated.policyHash },
      await signExisting("ACTIVATE_POLICY", updated),
      1300,
    );
    assert.equal(activatedSecond.supersededPolicy?.policyId, activated.policyId);

    const versions = await service.listPolicyVersions(activated.policyId);
    assert.equal(versions.filter(policy => policy.status === "ACTIVE").length, 1);
    assert.equal(versions.find(policy => policy.policyId === activated.policyId)?.status, "SUPERSEDED");

    const active = await repository.getActivePolicy(AGENT_ID, WALLET_ID);
    assert.equal(active?.policyId, updated.policyId);

    const revoked = await service.revokePolicy(
      updated.policyId,
      { expectedPolicyVersion: updated.policyVersion, expectedPolicyHash: updated.policyHash },
      await signExisting("REVOKE_POLICY", updated),
      1400,
    );
    assert.equal(revoked.policy.status, "REVOKED");
    assert.equal((await service.getActivePolicy(AGENT_ID, WALLET_ID, 1400)).policy, null);
  });

  it("rejects incorrect ownership, unprotected wallets, invalid signatures, and rolls back failed activation", async () => {
    const { repository, service } = await seededPostgresService();
    const body = baseCreatePolicyRequest();

    await rejectsWithCode(async () => service.createPolicy(body, await signCreate(body, other)), "operator_not_owner");

    await repository.saveWallet({
      walletId: "018f0000-0000-7000-8000-000000000199",
      agentId: AGENT_ID,
      networkId: NETWORK_ID,
      safeAddress: "0x0000000000000000000000000000000000000aaa",
      status: "PAUSED",
      createdAt: 1,
      updatedAt: 1,
    });
    const pausedWalletBody = { ...body, walletId: "018f0000-0000-7000-8000-000000000199" };
    await rejectsWithCode(async () => service.createPolicy(pausedWalletBody, await signCreate(pausedWalletBody)), "wallet_not_protected");

    const commitment = createCommitment(body, owner.address.toLowerCase() as `0x${string}`);
    const badSignature = await signCommitment({ ...commitment, policyHash: ("0x" + "22".repeat(32)) as Hex32 }, owner);
    await rejectsWithCode(() => service.createPolicy(body, { operatorAddress: owner.address, signature: badSignature }), "invalid_operator_signature");

    const expiredBody = { ...body, validFrom: 100, validUntil: 150 };
    const expired = (await service.createPolicy(expiredBody, await signCreate(expiredBody), 100)).policy;
    await rejectsWithCode(
      async () =>
        service.activatePolicy(
          expired.policyId,
          { expectedPolicyVersion: expired.policyVersion, expectedPolicyHash: expired.policyHash },
          await signExisting("ACTIVATE_POLICY", expired),
          151,
        ),
      "policy_expired",
    );
    assert.equal((await service.getPolicy(expired.policyId)).status, "DRAFT");
  });

  it("serializes concurrent activation of the same policy with the PostgreSQL advisory transaction lock", async () => {
    const { service } = await seededPostgresService();
    const body = baseCreatePolicyRequest();
    const policy = (await service.createPolicy(body, await signCreate(body), 1000)).policy;
    const auth = await signExisting("ACTIVATE_POLICY", policy);
    const activateBody = { expectedPolicyVersion: policy.policyVersion, expectedPolicyHash: policy.policyHash };

    const [left, right] = await Promise.allSettled([
      service.activatePolicy(policy.policyId, activateBody, auth, 1100),
      service.activatePolicy(policy.policyId, activateBody, auth, 1100),
    ]);

    assert.equal([left.status, right.status].filter(status => status === "fulfilled").length, 1);
    assert.equal([left.status, right.status].filter(status => status === "rejected").length, 1);
    assert.equal((await service.getPolicy(policy.policyId)).status, "ACTIVE");
  });

  it("enforces PostgreSQL unique, check, and active-policy constraints", async () => {
    const { pool, repository, service } = await seededPostgresService();
    await assert.rejects(
      repository.saveWallet({
        walletId: "018f0000-0000-7000-8000-000000000103",
        agentId: AGENT_ID,
        networkId: NETWORK_ID,
        safeAddress: SAFE_ADDRESS,
        status: "PROTECTED",
        createdAt: 1,
        updatedAt: 1,
      }),
    );

    await assert.rejects(
      pool.query(
        `insert into aegis_wallets (wallet_id, agent_id, network_id, safe_address, status, created_at, updated_at)
         values ($1, $2, $3, $4, 'PROTECTED', 1, 1)`,
        ["018f0000-0000-7000-8000-000000000104", AGENT_ID, "hedera:mainnet", "0x0000000000000000000000000000000000000bbb"],
      ),
    );

    const first = (await service.createPolicy(baseCreatePolicyRequest(), await signCreate(baseCreatePolicyRequest()), 1000)).policy;
    await service.activatePolicy(
      first.policyId,
      { expectedPolicyVersion: first.policyVersion, expectedPolicyHash: first.policyHash },
      await signExisting("ACTIVATE_POLICY", first),
      1100,
    );
    const secondBody = baseCreatePolicyRequest({ semanticRules: [{ ruleId: "purpose", kind: "TEXT", params: { value: "second" } }] });
    const second = (await service.createPolicy(secondBody, await signCreate(secondBody), 1000)).policy;

    await assert.rejects(
      pool.query(
        `update aegis_policies set status = 'ACTIVE', activated_at = 1200, updated_at = 1200 where policy_id = $1`,
        [second.policyId],
      ),
    );
  });

  it("serves real HTTP policy routes for agents and wallets persisted by existing routes", async () => {
    const { repository } = await postgresRepository();
    const profiles = new Map<string, AgentProfile>();
    const app = createAgentServiceApp({
      policyRepository: repository,
      createAgent: async input => {
        const profile = {
          agentId: AGENT_ID,
          ownerWallet: input.ownerWallet,
          name: input.name,
          type: input.type,
          endpoint: input.endpoint,
          description: input.description,
          hederaAccountId: "0.0.1001",
          evmAddress: "0x0000000000000000000000000000000000000abc",
          publicKey: "302a300506032b65700321000000000000000000000000000000000000000000000000000000000000000000",
          toolNames: [],
          status: "active" as const,
          createdAt: "2026-07-25T05:00:00.000Z",
        };
        profiles.set(profile.agentId, profile);
        return profile;
      },
      createWallet: async agentId => {
        assert.equal(agentId, AGENT_ID);
        return {
          safeAddress: SAFE_ADDRESS,
          owners: ["0x0000000000000000000000000000000000000abc", owner.address, owner.address],
          threshold: 2,
          transactionHash: "0x" + "11".repeat(32),
        };
      },
      getAgent: agentId => profiles.get(agentId),
    });

    await withHttpApp(app, async baseUrl => {
      const createdAgent = await httpJson(baseUrl, "/create-agents", {
        method: "POST",
        body: { ownerWallet: owner.address, name: "Agent", type: "Payment" },
      });
      assert.equal(createdAgent.status, 201);
      assert.equal(createdAgent.data.agentId, AGENT_ID);

      const createdWallet = await httpJson(baseUrl, `/agents/${AGENT_ID}/create-wallets`, { method: "POST", body: {} });
      assert.equal(createdWallet.status, 201);
      assert.equal(createdWallet.data.networkId, NETWORK_ID);
      const walletId = createdWallet.data.walletId as string;

      const createBody = baseCreatePolicyRequest({ agentId: AGENT_ID, walletId, validUntil: null });
      const createdPolicy = await httpJson(baseUrl, "/policies", {
        method: "POST",
        headers: authHeaders(await signCreate(createBody)),
        body: createBody,
      });
      assert.equal(createdPolicy.status, 201, JSON.stringify(createdPolicy.data));
      assert.equal(createdPolicy.data.policy.status, "DRAFT");

      const policy = createdPolicy.data.policy as Policy;
      const readPolicy = await httpJson(baseUrl, `/policies/${policy.policyId}`);
      assert.equal(readPolicy.status, 200);
      assert.equal(readPolicy.data.policy.policyHash, policy.policyHash);

      const versions = await httpJson(baseUrl, `/policies/${policy.policyId}/versions`);
      assert.equal(versions.status, 200);
      assert.equal(versions.data.policies.length, 1);

      const activated = await httpJson(baseUrl, `/policies/${policy.policyId}/activate`, {
        method: "POST",
        headers: authHeaders(await signExisting("ACTIVATE_POLICY", policy)),
        body: { expectedPolicyVersion: policy.policyVersion, expectedPolicyHash: policy.policyHash },
      });
      assert.equal(activated.status, 200, JSON.stringify(activated.data));
      assert.equal(activated.data.policy.status, "ACTIVE");

      const active = await httpJson(baseUrl, `/agents/${AGENT_ID}/wallets/${walletId}/policies/active?now=1500`);
      assert.equal(active.status, 200);
      assert.equal(active.data.policy.policyId, policy.policyId);

      const updateBody = { expectedPolicyVersion: policy.policyVersion, rules: baseRules({ amount: { min: "1", max: "500", dailyLimit: "1000" } }) };
      const updatedPolicy = await httpJson(baseUrl, `/policies/${policy.policyId}`, {
        method: "PATCH",
        headers: authHeaders(await signUpdateFromPolicy(policy, updateBody)),
        body: updateBody,
      });
      assert.equal(updatedPolicy.status, 201);
      assert.equal(updatedPolicy.data.policy.policyVersion, 2);
    });
  });

  it("returns an explicit HTTP error when the Policy database is not configured", async () => {
    const app = createAgentServiceApp({ policyRepository: new UnconfiguredPolicyRepository() });
    await withHttpApp(app, async baseUrl => {
      const body = baseCreatePolicyRequest();
      const response = await httpJson(baseUrl, "/policies", {
        method: "POST",
        headers: {
          "x-aegis-operator-address": owner.address,
          "x-aegis-operator-signature": "0x00",
        },
        body,
      });
      assert.equal(response.status, 503);
      assert.equal(response.data.error, "policy_database_unconfigured");
    });
  });

  it("persists Level 1 precheck PASS and DENY flows against PostgreSQL", async () => {
    const { pool, policyService, precheckService } = await seededPostgresPrecheckService();
    await seedHtsAsset(pool);
    const policy = await createAndActivatePrecheckPolicy(policyService);

    const hbar = await precheckService.precheck(precheckInput("precheck-hbar", { amount: "4" }));
    assert.equal(hbar.httpStatus, 202);
    assert.equal(hbar.response.status, "PENDING_TEEML");
    assert.equal(hbar.response.status === "PENDING_TEEML" ? hbar.response.policyId : null, policy.policyId);
    assert.equal(hbar.response.status === "PENDING_TEEML" ? hbar.response.usageHoldExpiresAt : null, 1300);

    const hts = await precheckService.precheck(
      precheckInput("precheck-hts", {
        actionType: "HEDERA_HTS_FUNGIBLE_TRANSFER",
        assetId: "hedera:testnet:hts:0.0.12345",
        amount: "2",
      }),
    );
    assert.equal(hts.httpStatus, 202);
    assert.equal(hts.response.status, "PENDING_TEEML");

    const destinationDenied = await precheckService.precheck(
      precheckInput("precheck-destination-denied", {
        destination: { kind: "HEDERA_ACCOUNT_ID", value: "0.0.999999" },
      }),
    );
    assert.equal(destinationDenied.httpStatus, 200);
    assert.equal(destinationDenied.response.status === "DENY_PRECHECK" ? destinationDenied.response.code : null, "DESTINATION_NOT_ALLOWED");

    const assetDenied = await precheckService.precheck(precheckInput("precheck-asset-denied", { assetId: "hedera:testnet:hts:0.0.99999" }));
    assert.equal(assetDenied.response.status === "DENY_PRECHECK" ? assetDenied.response.code : null, "ASSET_NOT_FOUND");

    const amountDenied = await precheckService.precheck(precheckInput("precheck-amount-denied", { amount: "11" }));
    assert.equal(amountDenied.response.status === "DENY_PRECHECK" ? amountDenied.response.code : null, "AMOUNT_ABOVE_MAX");

    const counts = await tableCounts(pool);
    assert.equal(counts.actionRequests, 5);
    assert.equal(counts.precheckRecords, 5);
    assert.equal(counts.usageHolds, 2);
    assert.equal(counts.auditEvents, 5);
  });

  it("returns DENY_PRECHECK for missing active policy, retired wallet, and paused agent", async () => {
    const { repository, policyService, precheckService } = await seededPostgresPrecheckService();

    const noPolicy = await precheckService.precheck(precheckInput("precheck-no-policy"));
    assert.equal(noPolicy.response.status === "DENY_PRECHECK" ? noPolicy.response.code : null, "POLICY_NOT_FOUND");

    const policy = await createAndActivatePrecheckPolicy(policyService);
    await repository.saveWallet({
      walletId: WALLET_ID,
      agentId: AGENT_ID,
      networkId: NETWORK_ID,
      safeAddress: SAFE_ADDRESS,
      status: "RETIRED",
      createdAt: 1,
      updatedAt: 1,
    });
    const retiredWallet = await precheckService.precheck(precheckInput("precheck-retired-wallet"));
    assert.equal(retiredWallet.response.status === "DENY_PRECHECK" ? retiredWallet.response.code : null, "WALLET_NOT_PROTECTED");

    await repository.saveWallet({
      walletId: WALLET_ID,
      agentId: AGENT_ID,
      networkId: NETWORK_ID,
      safeAddress: SAFE_ADDRESS,
      status: "PROTECTED",
      createdAt: 1,
      updatedAt: 1,
    });
    await repository.saveAgent({
      agentId: AGENT_ID,
      ownerAddress: owner.address.toLowerCase() as `0x${string}`,
      status: "PAUSED",
      createdAt: 1,
      updatedAt: 1,
    });
    const pausedAgent = await precheckService.precheck(precheckInput("precheck-paused-agent"));
    assert.equal(pausedAgent.response.status === "DENY_PRECHECK" ? pausedAgent.response.code : null, "AGENT_NOT_ACTIVE");
    assert.equal(policy.status, "ACTIVE");
  });

  it("preserves idempotent precheck responses and rejects payload conflicts", async () => {
    const { pool, policyService, precheckService } = await seededPostgresPrecheckService();
    await createAndActivatePrecheckPolicy(policyService, { amount: { min: "1", max: "10", dailyLimit: "20" } });

    const first = await precheckService.precheck(precheckInput("precheck-idempotent", { reason: "private reason" }));
    const second = await precheckService.precheck(precheckInput("precheck-idempotent", { reason: "private reason" }));

    assert.deepEqual(second.response, first.response);
    assert.equal(second.idempotentReplay, true);
    assert.equal((await tableCounts(pool)).actionRequests, 1);
    assert.equal((await tableCounts(pool)).precheckRecords, 1);
    assert.equal((await tableCounts(pool)).usageHolds, 1);
    assert.equal((await tableCounts(pool)).auditEvents, 1);

    await rejectsWithCode(() => precheckService.precheck(precheckInput("precheck-idempotent", { amount: "2" })), "IDEMPOTENCY_CONFLICT");

    const [requestRow] = (await pool.query("select * from aegis_action_requests")).rows;
    const [auditRow] = (await pool.query("select * from aegis_audit_events")).rows;
    assert.equal(JSON.stringify(auditRow).includes("private reason"), false);
    assert.equal(JSON.stringify(auditRow).includes("precheck-idempotent"), false);
    assert.equal(JSON.stringify(requestRow.private_payload).includes("private reason"), true);
  });

  it("counts active, expired, released, and committed UsageHolds in snapshots", async () => {
    const { pool, policyService, precheckService } = await seededPostgresPrecheckService();
    await createAndActivatePrecheckPolicy(policyService, { amount: { min: "1", max: "10", dailyLimit: "5" } });

    const first = await precheckService.precheck(precheckInput("precheck-hold-active", { amount: "4" }));
    assert.equal(first.response.status, "PENDING_TEEML");

    const deniedByActiveHold = await precheckService.precheck(precheckInput("precheck-hold-active-deny", { amount: "2" }));
    assert.equal(deniedByActiveHold.response.status === "DENY_PRECHECK" ? deniedByActiveHold.response.code : null, "DAILY_LIMIT_EXCEEDED");

    await pool.query("update aegis_usage_holds set status = 'RELEASED', released_at = 1001, updated_at = 1001 where usage_hold_id = $1", [
      first.response.status === "PENDING_TEEML" ? first.response.usageHoldId : "",
    ]);
    const passAfterRelease = await precheckService.precheck(precheckInput("precheck-hold-released", { amount: "2" }));
    assert.equal(passAfterRelease.response.status, "PENDING_TEEML");

    await pool.query("update aegis_usage_holds set status = 'HELD', expires_at = 999, updated_at = 999 where usage_hold_id = $1", [
      passAfterRelease.response.status === "PENDING_TEEML" ? passAfterRelease.response.usageHoldId : "",
    ]);
    const passAfterExpiry = await precheckService.precheck(precheckInput("precheck-hold-expired", { amount: "4" }));
    assert.equal(passAfterExpiry.response.status, "PENDING_TEEML");

    await pool.query("update aegis_usage_holds set status = 'COMMITTED', committed_at = 1002, updated_at = 1002 where usage_hold_id = $1", [
      passAfterExpiry.response.status === "PENDING_TEEML" ? passAfterExpiry.response.usageHoldId : "",
    ]);
    const deniedByCommitted = await precheckService.precheck(precheckInput("precheck-hold-committed", { amount: "2" }));
    assert.equal(deniedByCommitted.response.status === "DENY_PRECHECK" ? deniedByCommitted.response.code : null, "DAILY_LIMIT_EXCEEDED");
  });

  it("serializes concurrent prechecks so quota is not overspent", async () => {
    const { pool, policyService, precheckService } = await seededPostgresPrecheckService();
    await createAndActivatePrecheckPolicy(policyService, { amount: { min: "1", max: "4", dailyLimit: "5" } });

    const [left, right] = await Promise.allSettled([
      precheckService.precheck(precheckInput("precheck-concurrent-left", { amount: "4" })),
      precheckService.precheck(precheckInput("precheck-concurrent-right", { amount: "4" })),
    ]);
    assert.equal(left.status, "fulfilled");
    assert.equal(right.status, "fulfilled");

    const responses = [left.value.response, right.value.response];
    assert.equal(responses.filter(response => response.status === "PENDING_TEEML").length, 1);
    assert.equal(
      responses.filter(response => response.status === "DENY_PRECHECK" && response.code === "DAILY_LIMIT_EXCEEDED").length,
      1,
    );
    assert.equal((await pool.query("select coalesce(sum(amount::numeric), 0)::text as held from aegis_usage_holds where status = 'HELD'")).rows[0].held, "4");
  });

  it("rolls back PostgreSQL writes on controlled precheck persistence failures", async () => {
    const { pool, policyService } = await seededPostgresPrecheckService();
    await createAndActivatePrecheckPolicy(policyService);

    for (const failOn of ["precheck_record", "usage_hold", "audit_event"] as const) {
      const failingService = new PrecheckService(new PostgresPrecheckRepository(pool, { failOn }), {
        clock: () => 1000,
        idGenerator: createUuidV7,
      });
      await assert.rejects(() => failingService.precheck(precheckInput(`precheck-rollback-${failOn}`)));
      const counts = await tableCounts(pool);
      assert.equal(counts.actionRequests, 0);
      assert.equal(counts.precheckRecords, 0);
      assert.equal(counts.usageHolds, 0);
      assert.equal(counts.auditEvents, 0);
      assert.equal(counts.walletNonces, 0);
    }
  });

  it("serves real HTTP precheck route with idempotency, auth adapter, and technical errors", async () => {
    const { repository, policyService, precheckRepository } = await seededPostgresPrecheckService();
    const policy = await createAndActivatePrecheckPolicy(policyService);
    const app = createAgentServiceApp({
      policyRepository: repository,
      precheckRepository,
      authenticateAgentActor: testAgentAuthenticator(),
    });

    await withHttpApp(app, async baseUrl => {
      const pass = await httpJson(baseUrl, `/agents/${AGENT_ID}/wallets/${WALLET_ID}/actions/precheck`, {
        method: "POST",
        headers: { "Idempotency-Key": "http-pass", Authorization: "Bearer valid-agent" },
        body: precheckBody({ amount: "4" }),
      });
      assert.equal(pass.status, 202, JSON.stringify(pass.data));
      assert.equal(pass.data.status, "PENDING_TEEML");
      assert.equal(pass.data.policyId, policy.policyId);

      const replay = await httpJson(baseUrl, `/agents/${AGENT_ID}/wallets/${WALLET_ID}/actions/precheck`, {
        method: "POST",
        headers: { "Idempotency-Key": "http-pass", Authorization: "Bearer valid-agent" },
        body: precheckBody({ amount: "4" }),
      });
      assert.equal(replay.status, 202);
      assert.equal(replay.data.requestId, pass.data.requestId);
      assert.equal(replay.data.precheckId, pass.data.precheckId);
      assert.equal(replay.data.aegisNonce, pass.data.aegisNonce);

      const denied = await httpJson(baseUrl, `/agents/${AGENT_ID}/wallets/${WALLET_ID}/actions/precheck`, {
        method: "POST",
        headers: { "Idempotency-Key": "http-deny", Authorization: "Bearer valid-agent" },
        body: precheckBody({ destination: { kind: "HEDERA_ACCOUNT_ID", value: "0.0.999999" } }),
      });
      assert.equal(denied.status, 200);
      assert.equal(denied.data.status, "DENY_PRECHECK");

      const unknownField = await httpJson(baseUrl, `/agents/${AGENT_ID}/wallets/${WALLET_ID}/actions/precheck`, {
        method: "POST",
        headers: { "Idempotency-Key": "http-unknown", Authorization: "Bearer valid-agent" },
        body: { ...precheckBody(), policyHash: "0xdead" },
      });
      assert.equal(unknownField.status, 400);
      assert.equal(unknownField.data.error, "unknown_property");

      const invalidAmount = await httpJson(baseUrl, `/agents/${AGENT_ID}/wallets/${WALLET_ID}/actions/precheck`, {
        method: "POST",
        headers: { "Idempotency-Key": "http-invalid-amount", Authorization: "Bearer valid-agent" },
        body: precheckBody({ amount: "1.5" }),
      });
      assert.equal(invalidAmount.status, 400);
      assert.equal(invalidAmount.data.error, "invalid_base_unit_amount");

      const missingIdempotency = await httpJson(baseUrl, `/agents/${AGENT_ID}/wallets/${WALLET_ID}/actions/precheck`, {
        method: "POST",
        headers: { Authorization: "Bearer valid-agent" },
        body: precheckBody(),
      });
      assert.equal(missingIdempotency.status, 400);
      assert.equal(missingIdempotency.data.error, "missing_idempotency_key");

      const conflictResponse = await httpJson(baseUrl, `/agents/${AGENT_ID}/wallets/${WALLET_ID}/actions/precheck`, {
        method: "POST",
        headers: { "Idempotency-Key": "http-pass", Authorization: "Bearer valid-agent" },
        body: precheckBody({ amount: "2" }),
      });
      assert.equal(conflictResponse.status, 409);
      assert.equal(conflictResponse.data.error, "IDEMPOTENCY_CONFLICT");

      const invalidAuth = await httpJson(baseUrl, `/agents/${AGENT_ID}/wallets/${WALLET_ID}/actions/precheck`, {
        method: "POST",
        headers: { "Idempotency-Key": "http-invalid-auth", Authorization: "Bearer invalid" },
        body: precheckBody(),
      });
      assert.equal(invalidAuth.status, 401);

      const divergentAgent = await httpJson(baseUrl, `/agents/${AGENT_ID}/wallets/${WALLET_ID}/actions/precheck`, {
        method: "POST",
        headers: { "Idempotency-Key": "http-divergent", Authorization: "Bearer other-agent" },
        body: precheckBody(),
      });
      assert.equal(divergentAgent.status, 403);
    });

    const unconfiguredApp = createAgentServiceApp({
      policyRepository: new UnconfiguredPolicyRepository(),
      precheckRepository: new UnconfiguredPrecheckRepository(),
      authenticateAgentActor: testAgentAuthenticator(),
    });
    await withHttpApp(unconfiguredApp, async baseUrl => {
      const response = await httpJson(baseUrl, `/agents/${AGENT_ID}/wallets/${WALLET_ID}/actions/precheck`, {
        method: "POST",
        headers: { "Idempotency-Key": "http-no-db", Authorization: "Bearer valid-agent" },
        body: precheckBody(),
      });
      assert.equal(response.status, 503);
      assert.equal(response.data.error, "policy_database_unconfigured");
    });
  });
});

async function resetAndMigrate() {
  const pool = new Pool({ connectionString: testDatabaseUrl });
  try {
    await pool.query("drop schema public cascade");
    await pool.query("drop schema if exists drizzle cascade");
    await pool.query("create schema public");
    await pool.query("grant all on schema public to public");
    const db = drizzle(pool, { schema });
    await migrate(db, { migrationsFolder: fileURLToPath(new URL("../../drizzle", import.meta.url)) });
  } finally {
    await pool.end();
  }
}

async function seededPostgresService() {
  const { pool, repository } = await postgresRepository();
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
    status: "PROTECTED",
    createdAt: 1,
    updatedAt: 1,
  });
  return { pool, repository, service: new PolicyLifecycleService(repository, () => 1000) };
}

async function postgresRepository() {
  const pool = new Pool({ connectionString: testDatabaseUrl });
  openPools.push(pool);
  const db = drizzle(pool, { schema });
  const repository = new PostgresPolicyRepository(db);
  const precheckRepository = new PostgresPrecheckRepository(pool);
  return { pool, repository, precheckRepository };
}

async function seededPostgresPrecheckService() {
  const { pool, repository, precheckRepository } = await postgresRepository();
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
    status: "PROTECTED",
    createdAt: 1,
    updatedAt: 1,
  });
  const policyService = new PolicyLifecycleService(repository, () => 1000);
  const precheckService = new PrecheckService(precheckRepository, {
    clock: () => 1000,
    idGenerator: createUuidV7,
  });
  return { pool, repository, policyService, precheckRepository, precheckService };
}

async function seedHtsAsset(pool: pg.Pool) {
  await pool.query(
    `insert into aegis_asset_catalog (asset_id, network_id, kind, hedera_token_id, symbol, decimals, status, created_at, updated_at)
     values ('hedera:testnet:hts:0.0.12345', 'hedera:testnet', 'HTS_FUNGIBLE', '0.0.12345', 'DEMO', 6, 'ACTIVE', 1, 1)
     on conflict (asset_id) do update set status = 'ACTIVE', updated_at = 1`,
  );
}

async function createAndActivatePrecheckPolicy(service: PolicyLifecycleService, overrides: Partial<PolicyRules> = {}) {
  const body: CreatePolicyRequest = {
    agentId: AGENT_ID,
    walletId: WALLET_ID,
    validFrom: 1,
    validUntil: null,
    rules: precheckRules(overrides),
    semanticRules: [],
  };
  const created = (await service.createPolicy(body, await signCreate(body), 1000)).policy;
  return (
    await service.activatePolicy(
      created.policyId,
      { expectedPolicyVersion: created.policyVersion, expectedPolicyHash: created.policyHash },
      await signExisting("ACTIVATE_POLICY", created),
      1000,
    )
  ).policy;
}

function precheckRules(overrides: Partial<PolicyRules> = {}): PolicyRules {
  return {
    allowedActionTypes: overrides.allowedActionTypes ?? ["HEDERA_HBAR_TRANSFER", "HEDERA_HTS_FUNGIBLE_TRANSFER"],
    allowedDestinations: overrides.allowedDestinations ?? [{ kind: "HEDERA_ACCOUNT_ID", value: "0.0.123456" }],
    allowedAssets: overrides.allowedAssets ?? [
      { kind: "NATIVE", chainId: 296, assetId: "hbar", decimals: 8, symbol: "HBAR" },
      { kind: "HTS", chainId: 296, tokenId: "0.0.12345", decimals: 6, symbol: "DEMO" },
    ],
    amount: overrides.amount ?? { min: "1", max: "10", dailyLimit: "20" },
    actionCount: overrides.actionCount ?? { dailyLimit: 20 },
  };
}

function precheckInput(idempotencyKey: string, bodyOverrides: Record<string, unknown> = {}) {
  return {
    params: { agentId: AGENT_ID, walletId: WALLET_ID },
    body: precheckBody(bodyOverrides),
    idempotencyKey,
    actor: { authenticatedAgentId: AGENT_ID, actorType: "AGENT" } satisfies AgentActorContext,
  };
}

function precheckBody(overrides: Record<string, unknown> = {}) {
  return {
    actionType: "HEDERA_HBAR_TRANSFER",
    destination: { kind: "HEDERA_ACCOUNT_ID", value: "0.0.123456" },
    assetId: "hedera:testnet:hbar",
    amount: "1",
    actionDeadline: 2_000_000_000,
    ...overrides,
  };
}

async function tableCounts(pool: pg.Pool) {
  const count = async (table: string) => Number((await pool.query(`select count(*)::int as count from ${table}`)).rows[0].count);
  return {
    actionRequests: await count("aegis_action_requests"),
    precheckRecords: await count("aegis_precheck_records"),
    usageHolds: await count("aegis_usage_holds"),
    auditEvents: await count("aegis_audit_events"),
    walletNonces: await count("aegis_wallet_nonces"),
  };
}

function testAgentAuthenticator() {
  return async (req: any): Promise<AgentActorContext> => {
    const authorization = req.headers.authorization;
    if (authorization === "Bearer valid-agent") return { authenticatedAgentId: AGENT_ID, actorType: "AGENT" };
    if (authorization === "Bearer other-agent") return { authenticatedAgentId: "018f0000-0000-7000-8000-000000000299", actorType: "AGENT" };
    throw new PolicyEngineError(401, "invalid_agent_auth", "invalid agent authentication");
  };
}

function baseCreatePolicyRequest(overrides: Partial<CreatePolicyRequest & PolicyRules> = {}): CreatePolicyRequest {
  return {
    agentId: overrides.agentId ?? AGENT_ID,
    walletId: overrides.walletId ?? WALLET_ID,
    validFrom: overrides.validFrom ?? 100,
    validUntil: "validUntil" in overrides ? (overrides.validUntil ?? null) : 2000,
    rules: baseRules(overrides),
    semanticRules: overrides.semanticRules ?? [{ ruleId: "purpose", kind: "TEXT", params: { value: "pay approved providers" } }],
  };
}

function baseRules(overrides: Partial<PolicyRules> = {}): PolicyRules {
  return {
    allowedActionTypes: overrides.allowedActionTypes ?? ["TRANSFER", "SERVICE_PAYMENT"],
    allowedDestinations: overrides.allowedDestinations ?? [{ kind: "EVM_ADDRESS", value: "0x00000000000000000000000000000000000000AA", chainId: 296 }],
    allowedAssets: overrides.allowedAssets ?? [{ kind: "NATIVE", chainId: 296, assetId: "hbar", decimals: 8, symbol: "HBAR" }],
    amount: overrides.amount ?? { min: "1", max: "100", dailyLimit: "1000" },
    actionCount: overrides.actionCount ?? { dailyLimit: 10 },
  };
}

async function signCreate(body: unknown, account = owner) {
  return signCommitmentAuth(createCommitment(body, account.address.toLowerCase() as `0x${string}`), account);
}

async function signUpdate(service: PolicyLifecycleService, policyId: string, body: unknown, account = owner) {
  const previous = await service.getPolicy(policyId);
  return signUpdateFromPolicy(previous, body, account);
}

async function signUpdateFromPolicy(previous: Policy, body: unknown, account = owner) {
  const request = parseUpdatePolicyRequest(previous.policyId, body);
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

async function signExisting(operation: "ACTIVATE_POLICY" | "REVOKE_POLICY", policy: Policy, account = owner) {
  return signCommitmentAuth(
    buildPolicyCommitment({
      operation,
      operatorAddress: account.address.toLowerCase() as `0x${string}`,
      agentId: policy.agentId,
      walletId: policy.walletId,
      policyId: policy.policyId,
      policyVersion: policy.policyVersion,
      policyHash: policy.policyHash,
      validFrom: policy.validFrom,
      validUntil: policy.validUntil,
    }),
    account,
  );
}

function createCommitment(body: unknown, operatorAddress: `0x${string}`): PolicyCommitment {
  const input = parseCreatePolicyRequest(body);
  const policyVersion = 1;
  const policyHash = computePolicyHash({
    agentId: input.agentId,
    walletId: input.walletId,
    policyVersion,
    validFrom: input.validFrom,
    validUntil: input.validUntil,
    rules: input.rules,
    semanticRules: input.semanticRules ?? [],
  });
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

function authHeaders(auth: { operatorAddress: string; signature: string }) {
  return {
    "x-aegis-operator-address": auth.operatorAddress,
    "x-aegis-operator-signature": auth.signature,
  };
}

async function withHttpApp(app: ReturnType<typeof createAgentServiceApp>, run: (baseUrl: string) => Promise<void>) {
  const server = app.listen(0);
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close(error => (error ? reject(error) : resolve()));
    });
  }
}

async function httpJson(
  baseUrl: string,
  path: string,
  options: { method?: string; headers?: Record<string, string>; body?: unknown } = {},
) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? "GET",
    headers: { "content-type": "application/json", ...options.headers },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  return {
    status: response.status,
    data: (await response.json()) as any,
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
