import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { after, before, describe, it } from "node:test";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { keccak256, stringToHex } from "viem";
import * as schema from "../policy-engine/db/schema.js";
import type { Hex32 } from "../policy-engine/types.js";
import { PostgresAgenticIdRegistrationRepository } from "./postgres-agentic-id-registration.js";

const { Pool } = pg;
const OWNER_ADDRESS =
  "0x1111111111111111111111111111111111111111" as const;
const CONTRACT_ADDRESS =
  "0x2700f6a3e505402c9dab154c5c6ab9caec98ef1f" as const;
const NOW = 1_800_000_000;
const REGISTRATION_HASH = `0x${"11".repeat(32)}` as Hex32;
const OTHER_REGISTRATION_HASH = `0x${"22".repeat(32)}` as Hex32;
const METADATA_HASH = `0x${"33".repeat(32)}` as Hex32;

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  throw new Error(
    "TEST_DATABASE_URL is required for Agentic ID PostgreSQL integration tests",
  );
}
if (process.env.DATABASE_URL && process.env.DATABASE_URL === testDatabaseUrl) {
  throw new Error("TEST_DATABASE_URL must not equal DATABASE_URL");
}

const openPools: pg.Pool[] = [];

describe("Agentic ID durable registration ledger", () => {
  before(async () => {
    await resetAndMigrate();
  });

  after(async () => {
    await Promise.all(openPools.splice(0).map(pool => pool.end()));
  });

  it("migrates a ledger with no metadata, description, or capability plaintext columns", async () => {
    const pool = trackedPool();
    const columns = (
      await pool.query<{ column_name: string }>(
        `select column_name
         from information_schema.columns
         where table_schema = 'public'
           and table_name = 'aegis_agentic_id_registrations'
         order by ordinal_position`,
      )
    ).rows.map(row => row.column_name);

    assert.deepEqual(columns, [
      "agent_id",
      "registration_hash",
      "status",
      "metadata_uri",
      "explorer_url",
      "created_at",
      "updated_at",
      "completed_at",
    ]);
  });

  it("serializes concurrent claims across independent PostgreSQL clients", async () => {
    const agentId = "agent-agentic-concurrent";
    await seedAgent(trackedPool(), agentId);
    const first = new PostgresAgenticIdRegistrationRepository(trackedPool());
    const second = new PostgresAgenticIdRegistrationRepository(trackedPool());

    const claims = await Promise.all([
      first.claim(claimInput(agentId)),
      second.claim(claimInput(agentId)),
    ]);

    assert.deepEqual(
      claims.map(claim => claim.status).sort(),
      ["CLAIMED", "IN_PROGRESS"],
    );
  });

  it("atomically completes the semantic profile and returns it without a second claim", async () => {
    const agentId = "agent-agentic-completed";
    const pool = trackedPool();
    await seedAgent(pool, agentId);
    const repository = new PostgresAgenticIdRegistrationRepository(
      trackedPool(),
    );
    assert.equal(
      (await repository.claim(claimInput(agentId))).status,
      "CLAIMED",
    );

    await repository.complete(completeInput(agentId));
    const replay = await repository.claim(claimInput(agentId));

    assert.equal(replay.status, "COMPLETED");
    if (replay.status !== "COMPLETED") assert.fail("completion was not replayed");
    assert.equal(replay.semanticProfile.agentId, agentId);
    assert.equal(replay.semanticProfile.metadataHash, METADATA_HASH);
    assert.deepEqual(replay.semanticProfile.capabilityIds, [
      "catalog.read",
      "hedera.transfer.hbar",
    ]);
    const persisted = await pool.query(
      `select r.status, p.agentic_id
       from aegis_agentic_id_registrations r
       join aegis_agent_semantic_profiles p on p.agent_id = r.agent_id
       where r.agent_id = $1`,
      [agentId],
    );
    assert.equal(persisted.rows[0]?.status, "COMPLETED");
    assert.equal(
      persisted.rows[0]?.agentic_id,
      `0g-agentic-id:${CONTRACT_ADDRESS}:42`,
    );
  });

  it("keeps PROCESSING and UNKNOWN registrations closed across repository restarts", async () => {
    const processingAgent = "agent-agentic-processing";
    const unknownAgent = "agent-agentic-unknown";
    const pool = trackedPool();
    await seedAgent(pool, processingAgent);
    await seedAgent(pool, unknownAgent);
    const firstRepository = new PostgresAgenticIdRegistrationRepository(
      trackedPool(),
    );
    await firstRepository.claim(claimInput(processingAgent));
    await firstRepository.claim(claimInput(unknownAgent));
    await firstRepository.markUnknown({
      agentId: unknownAgent,
      registrationHash: REGISTRATION_HASH,
      now: NOW + 1,
    });

    const restartedRepository = new PostgresAgenticIdRegistrationRepository(
      trackedPool(),
    );
    assert.equal(
      (await restartedRepository.claim(claimInput(processingAgent))).status,
      "IN_PROGRESS",
    );
    assert.equal(
      (await restartedRepository.claim(claimInput(unknownAgent))).status,
      "UNKNOWN",
    );
  });

  it("rejects a different registration commitment without changing the first claim", async () => {
    const agentId = "agent-agentic-conflict";
    const pool = trackedPool();
    await seedAgent(pool, agentId);
    const repository = new PostgresAgenticIdRegistrationRepository(
      trackedPool(),
    );
    await repository.claim(claimInput(agentId));

    await assert.rejects(
      repository.claim({
        ...claimInput(agentId),
        registrationHash: OTHER_REGISTRATION_HASH,
      }),
      /agentic_id_registration_conflict/,
    );
    const row = await pool.query(
      `select registration_hash, status
       from aegis_agentic_id_registrations
       where agent_id = $1`,
      [agentId],
    );
    assert.equal(row.rows[0]?.registration_hash, REGISTRATION_HASH);
    assert.equal(row.rows[0]?.status, "PROCESSING");
  });

  it("blocks a legacy semantic profile that has no registration ledger", async () => {
    const agentId = "agent-agentic-legacy";
    const pool = trackedPool();
    await seedAgent(pool, agentId);
    await pool.query(
      `insert into aegis_agent_semantic_profiles (
         agent_id, agentic_id, contract_address, token_id, metadata_hash,
         capability_ids, registered_at, updated_at
       ) values ($1, $2, $3, '43', $4, $5::jsonb, $6, $6)`,
      [
        agentId,
        `0g-agentic-id:${CONTRACT_ADDRESS}:43`,
        CONTRACT_ADDRESS,
        METADATA_HASH,
        JSON.stringify(["catalog.read"]),
        NOW,
      ],
    );
    const repository = new PostgresAgenticIdRegistrationRepository(
      trackedPool(),
    );

    assert.equal(
      (await repository.claim(claimInput(agentId))).status,
      "UNKNOWN",
    );
    const row = await pool.query(
      `select status from aegis_agentic_id_registrations where agent_id = $1`,
      [agentId],
    );
    assert.equal(row.rows[0]?.status, "UNKNOWN");
  });

  it("rolls back both profile persistence and ledger completion on an invalid profile", async () => {
    const agentId = "agent-agentic-rollback";
    const pool = trackedPool();
    await seedAgent(pool, agentId);
    const repository = new PostgresAgenticIdRegistrationRepository(
      trackedPool(),
    );
    await repository.claim(claimInput(agentId));

    await assert.rejects(
      repository.complete({
        ...completeInput(agentId),
        semanticProfile: {
          ...completeInput(agentId).semanticProfile,
          contractAddress: "0x1234",
        },
      }),
      /agentic_id_registration_store_failed/,
    );

    const registration = await pool.query(
      `select status from aegis_agentic_id_registrations where agent_id = $1`,
      [agentId],
    );
    const profile = await pool.query(
      `select 1 from aegis_agent_semantic_profiles where agent_id = $1`,
      [agentId],
    );
    assert.equal(registration.rows[0]?.status, "PROCESSING");
    assert.equal(profile.rowCount, 0);
    assert.equal(
      (await repository.claim(claimInput(agentId))).status,
      "IN_PROGRESS",
    );
  });
});

function claimInput(agentId: string) {
  return {
    agentId,
    registrationHash: REGISTRATION_HASH,
    ownerAddress: OWNER_ADDRESS,
    safeAddress: safeAddressForAgent(agentId),
    now: NOW,
  };
}

function completeInput(agentId: string) {
  return {
    agentId,
    registrationHash: REGISTRATION_HASH,
    semanticProfile: {
      agentId,
      agenticId: `0g-agentic-id:${CONTRACT_ADDRESS}:42`,
      contractAddress: CONTRACT_ADDRESS,
      tokenId: "42",
      metadataHash: METADATA_HASH,
      capabilityIds: ["catalog.read", "hedera.transfer.hbar"],
    },
    metadataURI: "0g-storage://metadata-root",
    explorerUrl: "https://chainscan-galileo.0g.ai/tx/0x1234",
    completedAt: NOW + 1,
  };
}

async function seedAgent(pool: pg.Pool, agentId: string): Promise<void> {
  await pool.query(
    `insert into aegis_agents (
       agent_id, owner_address, status, created_at, updated_at
     ) values ($1, $2, 'ACTIVE', $3, $3)`,
    [agentId, OWNER_ADDRESS, NOW],
  );
  await pool.query(
    `insert into aegis_wallets (
       wallet_id, agent_id, network_id, safe_address, status, created_at, updated_at
     ) values ($1, $2, 'hedera:testnet', $3, 'PROTECTED', $4, $4)`,
    [`wallet-${agentId}`, agentId, safeAddressForAgent(agentId), NOW],
  );
}

function safeAddressForAgent(agentId: string): `0x${string}` {
  return `0x${keccak256(stringToHex(agentId)).slice(-40)}`;
}

function trackedPool(): pg.Pool {
  const pool = new Pool({ connectionString: testDatabaseUrl });
  openPools.push(pool);
  return pool;
}

async function resetAndMigrate(): Promise<void> {
  const pool = new Pool({ connectionString: testDatabaseUrl });
  try {
    await pool.query("drop schema public cascade");
    await pool.query("drop schema if exists drizzle cascade");
    await pool.query("create schema public");
    await pool.query("grant all on schema public to public");
    const db = drizzle(pool, { schema });
    await migrate(db, {
      migrationsFolder: fileURLToPath(
        new URL("../../drizzle", import.meta.url),
      ),
    });
  } finally {
    await pool.end();
  }
}
