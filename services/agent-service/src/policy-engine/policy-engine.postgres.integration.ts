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
import { PostgresPolicyRepository, UnconfiguredPolicyRepository } from "./db/postgres.js";
import * as schema from "./db/schema.js";
import { PolicyEngineError } from "./errors.js";
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
  return { pool, repository };
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
