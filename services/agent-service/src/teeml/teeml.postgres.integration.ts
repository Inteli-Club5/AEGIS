import "dotenv/config";
import assert from "node:assert/strict";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import express from "express";
import pg from "pg";
import { computePolicyHash } from "../policy-engine/canonicalize.js";
import { PostgresPrecheckRepository } from "../policy-engine/db/postgres.js";
import * as schema from "../policy-engine/db/schema.js";
import {
  PrecheckService,
  type AgentActorContext,
  type PendingTeemlResponse,
} from "../policy-engine/precheck.js";
import {
  NETWORK_ID,
  TRUSTED_SERVICE_DESCRIPTOR_RULE_KIND,
  type Hex32,
  type PolicyRules,
  type SemanticRule,
} from "../policy-engine/types.js";
import { buildTrustedSemanticContext } from "./context-builder.js";
import { TeeMlError } from "./errors.js";
import {
  computeSemanticContextHash,
  computeTeeMlRequestHash,
} from "./hashing.js";
import type {
  TeeMlInferenceGateway,
  TeeMlInferenceResult,
} from "./inference-gateway.js";
import { PostgresTeeMlRepository } from "./postgres-repository.js";
import { createTeeMlRouter } from "./routes.js";
import { TeeMlService } from "./service.js";
import {
  HACKATHON_TEETLS_ALLOWED_STATUS,
  HACKATHON_TESTNET_TEETLS_PROFILE,
  PRODUCTION_PRIVATE_TEEML_PROFILE,
  type ZeroGSecurityProfile,
} from "./security-profile.js";

const { Pool } = pg;

const AGENT_ID = "018f0000-0000-7000-8000-000000000401";
const WALLET_ID = "018f0000-0000-7000-8000-000000000402";
const POLICY_ID = "policy-teeml-postgres-1";
const METADATA_HASH = `0x${"22".repeat(32)}` as Hex32;
const SAFE_ADDRESS = "0x0000000000000000000000000000000000000def";
const AGENTIC_CONTRACT = "0x1111111111111111111111111111111111111111";
const AGENTIC_ID = `0g-agentic-id:${AGENTIC_CONTRACT}:1`;
const PROVIDER_ADDRESS = "0x4870cbc4d07d6ac2ee5aa865588e5985fe77a4e9";
const MODEL_ID = "0gm-1.0-35b-a3b";
const DESTINATION = "0.0.123456";
const SERVICE_ID = "storage-api";
const PRODUCT_ID = "archive-pro";
const NOW = 1_800_000_000;
const SEMANTIC_PLAINTEXT_MARKER = "approved archival storage marker 731";
const POLICY_HASH = computePolicyHash({
  agentId: AGENT_ID,
  walletId: WALLET_ID,
  policyVersion: 1,
  validFrom: NOW - 1_000,
  validUntil: null,
  rules: policyRules(),
  semanticRules: semanticRules(),
});
const FORBIDDEN_PERSISTENCE_COLUMNS = new Set([
  "reason",
  "reason_hash",
  "detailed_reason",
  "agent_reason",
  "raw_prompt",
  "raw_output",
  "raw_response",
  "raw_trace",
  "messages",
  "private_payload",
  "semantic_context",
  "task_summary",
]);

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  throw new Error(
    "TEST_DATABASE_URL is required for TeeML PostgreSQL integration tests",
  );
}
if (process.env.DATABASE_URL && process.env.DATABASE_URL === testDatabaseUrl) {
  throw new Error("TEST_DATABASE_URL must not equal DATABASE_URL");
}

const openPools: pg.Pool[] = [];

describe("TeeML PostgreSQL integration", () => {
  beforeEach(async () => {
    await resetAndMigrate();
  });

  afterEach(async () => {
    await Promise.all(openPools.splice(0).map(pool => pool.end()));
  });

  it("applies the complete migration chain to an empty database without private payload columns", async () => {
    const pool = trackedPool();
    const tables = (
      await pool.query<{ table_name: string }>(
        `select table_name
         from information_schema.tables
         where table_schema = 'public'
         order by table_name`,
      )
    ).rows.map(row => row.table_name);

    for (const table of [
      "aegis_agent_semantic_profiles",
      "aegis_agentic_id_registrations",
      "aegis_teeml_audit_events",
      "aegis_teeml_verifications",
    ]) {
      assert.equal(tables.includes(table), true, `${table} was not migrated`);
    }

    const columns = (
      await pool.query<{ table_name: string; column_name: string }>(
        `select table_name, column_name
         from information_schema.columns
         where table_schema = 'public'
           and table_name in (
             'aegis_action_requests',
             'aegis_precheck_records',
             'aegis_audit_events',
             'aegis_teeml_verifications',
             'aegis_teeml_audit_events'
           )
         order by table_name, ordinal_position`,
      )
    ).rows;

    assert.deepEqual(
      columns.filter(column =>
        FORBIDDEN_PERSISTENCE_COLUMNS.has(column.column_name),
      ),
      [],
    );
    assert.equal(
      columns.some(
        column =>
          column.table_name === "aegis_teeml_verifications" &&
          column.column_name === "reason_code",
      ),
      true,
      "controlled enum reasonCode must remain persisted",
    );
  });

  it("backfills existing Private/TeeML artifacts when applying the new profile migration", async () => {
    const pool = trackedPool();
    await resetSchema(pool);
    for (const migration of [
      "0000_lethal_blue_shield.sql",
      "0001_level1_precheck_orchestration.sql",
      "0002_precheck_semantic_context_privacy.sql",
      "0003_action_commitment_v2.sql",
      "0004_teeml_semantic_verifier.sql",
      "0005_agentic_id_registration_ledger.sql",
    ]) {
      await applyMigrationFile(pool, migration);
    }

    const fixture = await seededFixture("profile-backfill");
    const pending = await fixture.createPendingAction("profile-backfill");
    await fixture.pool.query(
      `insert into aegis_teeml_verifications (
         verification_id, request_id, precheck_id, agent_id, agentic_id,
         policy_id, policy_version, policy_hash, action_hash,
         semantic_context_hash, teeml_request_hash, status, verdict,
         reason_code, provider_address, model_id, trust_mode, tee_verified,
         response_id, response_hash, latency_ms, evaluated_at, created_at,
         updated_at
       ) values (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'ALLOWED',
         'ALLOW', 'SEMANTIC_POLICY_MATCH', $12, $13, 'private', true,
         $14, $15, 125, $16, $16, $16
       )`,
      [
        "legacy-private-verification",
        pending.requestId,
        pending.precheckId,
        AGENT_ID,
        AGENTIC_ID,
        pending.policyId,
        pending.policyVersion,
        pending.policyHash,
        pending.actionHash,
        `0x${"77".repeat(32)}`,
        `0x${"88".repeat(32)}`,
        PROVIDER_ADDRESS,
        MODEL_ID,
        "legacy-response-id",
        `0x${"99".repeat(32)}`,
        NOW,
      ],
    );

    await applyMigrationFile(
      fixture.pool,
      "0006_teetls_hackathon_profile.sql",
    );
    await applyMigrationFile(
      fixture.pool,
      "0007_teeml_profile_not_null_guard.sql",
    );

    const artifact = await singleRow(
      fixture.pool,
      "select security_profile, verification_mode, sealed_inference from aegis_teeml_verifications where request_id = $1",
      [pending.requestId],
    );
    assert.deepEqual(artifact, {
      security_profile: PRODUCTION_PRIVATE_TEEML_PROFILE,
      verification_mode: "TeeML",
      sealed_inference: true,
    });
  });

  it("reconciles legacy final rows with nullable proof fields before enforcing strict constraints", async () => {
    const pool = trackedPool();
    await resetSchema(pool);
    for (const migration of [
      "0000_lethal_blue_shield.sql",
      "0001_level1_precheck_orchestration.sql",
      "0002_precheck_semantic_context_privacy.sql",
      "0003_action_commitment_v2.sql",
      "0004_teeml_semantic_verifier.sql",
      "0005_agentic_id_registration_ledger.sql",
    ]) {
      await applyMigrationFile(pool, migration);
    }

    const fixture = await seededFixture("nullable-legacy-proof");
    const pending = await fixture.createPendingAction("nullable-legacy-proof");
    const commitments = await trustedSemanticCommitments(
      fixture,
      pending.requestId,
    );
    await fixture.pool.query(
      `update aegis_action_requests
       set status = 'TEEML_ALLOWED'
       where request_id = $1`,
      [pending.requestId],
    );
    await fixture.pool.query(
      `insert into aegis_teeml_verifications (
         verification_id, request_id, precheck_id, agent_id, agentic_id,
         policy_id, policy_version, policy_hash, action_hash,
         semantic_context_hash, teeml_request_hash, status, verdict,
         reason_code, provider_address, model_id, trust_mode, tee_verified,
         response_id, response_hash, latency_ms, evaluated_at, created_at,
         updated_at
       ) values (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'ALLOWED',
         'ALLOW', 'SEMANTIC_POLICY_MATCH', $12, $13, 'private', true,
         $14, null, 125, $15, $15, $15
       )`,
      [
        "nullable-legacy-verification",
        pending.requestId,
        pending.precheckId,
        AGENT_ID,
        AGENTIC_ID,
        pending.policyId,
        pending.policyVersion,
        pending.policyHash,
        pending.actionHash,
        commitments.semanticContextHash,
        commitments.teemlRequestHash,
        PROVIDER_ADDRESS,
        MODEL_ID,
        "nullable-legacy-response-id",
        NOW,
      ],
    );
    await fixture.pool.query(
      `insert into aegis_teeml_audit_events (
         event_id, verification_id, request_id, precheck_id, agent_id,
         policy_hash, action_hash, semantic_context_hash, teeml_request_hash,
         outcome, reason_code, occurred_at, retention_until
       ) values (
         $1, $2, $3, $4, $5, $6, $7, $8, $9,
         'TEEML_ALLOWED', 'SEMANTIC_POLICY_MATCH', $10, $11
       )`,
      [
        "nullable-legacy-audit",
        "nullable-legacy-verification",
        pending.requestId,
        pending.precheckId,
        AGENT_ID,
        pending.policyHash,
        pending.actionHash,
        commitments.semanticContextHash,
        commitments.teemlRequestHash,
        NOW,
        NOW + 86_400,
      ],
    );

    for (const migration of [
      "0006_teetls_hackathon_profile.sql",
      "0007_teeml_profile_not_null_guard.sql",
      "0008_loving_starbolt.sql",
      "0009_windy_rictor.sql",
      "0010_teeml_final_tuple_guard.sql",
      "0011_famous_nightshade.sql",
    ]) {
      await applyMigrationFile(fixture.pool, migration);
    }

    const verification = await singleRow(
      fixture.pool,
      "select * from aegis_teeml_verifications where request_id = $1",
      [pending.requestId],
    );
    assert.equal(verification.status, "FAILED");
    assert.equal(verification.verdict, null);
    assert.equal(verification.reason_code, null);
    assert.equal(verification.technical_reason_code, "TEEML_UNKNOWN_RESULT");
    assert.equal(verification.response_id, "nullable-legacy-response-id");
    assert.equal(verification.model_id, MODEL_ID);
    assert.equal(verification.provider_address, PROVIDER_ADDRESS);

    const action = await singleRow(
      fixture.pool,
      "select status from aegis_action_requests where request_id = $1",
      [pending.requestId],
    );
    const hold = await singleRow(
      fixture.pool,
      "select status, released_at from aegis_usage_holds where request_id = $1",
      [pending.requestId],
    );
    const audit = await singleRow(
      fixture.pool,
      "select outcome, reason_code from aegis_teeml_audit_events where request_id = $1",
      [pending.requestId],
    );
    assert.equal(action.status, "TEEML_FAILED");
    assert.equal(hold.status, "RELEASED");
    assert.equal(typeof hold.released_at, "number");
    assert.deepEqual(audit, {
      outcome: "TEEML_FAILED",
      reason_code: "TEEML_UNKNOWN_RESULT",
    });

    const gateway = new VerdictGateway("ALLOW");
    await assert.rejects(
      () =>
        fixture
          .createTeeMlService(gateway, "nullable-legacy-restart")
          .verify(verifyInput(pending.requestId)),
      (error: unknown) =>
        error instanceof TeeMlError &&
        error.code === "TEEML_UNKNOWN_RESULT",
    );
    assert.equal(gateway.calls, 0);
  });

  it("applies the handoff-status migrations in one transaction over a database at migration 0007", async () => {
    const pool = trackedPool();
    await resetSchema(pool);
    for (const migration of [
      "0000_lethal_blue_shield.sql",
      "0001_level1_precheck_orchestration.sql",
      "0002_precheck_semantic_context_privacy.sql",
      "0003_action_commitment_v2.sql",
      "0004_teeml_semantic_verifier.sql",
      "0005_agentic_id_registration_ledger.sql",
      "0006_teetls_hackathon_profile.sql",
      "0007_teeml_profile_not_null_guard.sql",
    ]) {
      await applyMigrationFile(pool, migration);
    }

    const client = await pool.connect();
    try {
      await client.query("begin");
      for (const migration of [
        "0008_loving_starbolt.sql",
        "0009_windy_rictor.sql",
        "0010_teeml_final_tuple_guard.sql",
        "0011_famous_nightshade.sql",
      ]) {
        await applyMigrationFile(client, migration);
      }
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }

    const actionStatuses = (
      await pool.query<{ status: string }>(
        `select enumlabel as status
         from pg_enum
         join pg_type on pg_type.oid = pg_enum.enumtypid
         where pg_type.typname = 'aegis_action_request_status'`,
      )
    ).rows.map(row => row.status);
    const verificationStatuses = (
      await pool.query<{ status: string }>(
        `select enumlabel as status
         from pg_enum
         join pg_type on pg_type.oid = pg_enum.enumtypid
         where pg_type.typname = 'aegis_teeml_verification_status'`,
      )
    ).rows.map(row => row.status);
    assert.equal(
      actionStatuses.includes(HACKATHON_TEETLS_ALLOWED_STATUS),
      true,
    );
    assert.equal(
      verificationStatuses.includes(HACKATHON_TEETLS_ALLOWED_STATUS),
      true,
    );
    const trigger = await singleRow(
      pool,
      `select tgname
       from pg_trigger
       where tgname = 'aegis_action_requests_teeml_handoff_profile_trigger'
         and not tgisinternal`,
    );
    assert.equal(
      trigger.tgname,
      "aegis_action_requests_teeml_handoff_profile_trigger",
    );
  });

  it("persists a sanitized ALLOW artifact, keeps the UsageHold HELD, and stores no transient plaintext", async () => {
    const fixture = await seededFixture("allow");
    const pending = await fixture.createPendingAction("allow");
    const gateway = new VerdictGateway("ALLOW");
    const service = fixture.createTeeMlService(gateway, "allow");

    const result = await service.verify(verifyInput(pending.requestId));

    assert.equal(result.httpStatus, 200);
    assert.equal(result.response.status, "TEEML_ALLOWED");
    assert.equal(result.response.verdict, "ALLOW");
    assert.equal(result.response.teeVerified, true);
    assert.equal(
      result.response.securityProfile,
      PRODUCTION_PRIVATE_TEEML_PROFILE,
    );
    assert.equal(result.response.trustMode, "private");
    assert.equal(result.response.verificationMode, "TeeML");
    assert.equal(result.response.sealedInference, true);
    assert.equal(gateway.calls, 1);

    const verification = await singleRow(
      fixture.pool,
      "select * from aegis_teeml_verifications where request_id = $1",
      [pending.requestId],
    );
    assert.equal(verification.status, "ALLOWED");
    assert.equal(verification.verdict, "ALLOW");
    assert.equal(verification.reason_code, "SEMANTIC_POLICY_MATCH");
    assert.equal(verification.model_id, MODEL_ID);
    assert.equal(verification.provider_address, PROVIDER_ADDRESS);
    assert.equal(
      verification.security_profile,
      PRODUCTION_PRIVATE_TEEML_PROFILE,
    );
    assert.equal(verification.trust_mode, "private");
    assert.equal(verification.verification_mode, "TeeML");
    assert.equal(verification.sealed_inference, true);
    assert.equal(verification.tee_verified, true);
    assert.equal(verification.prompt_tokens, 71);
    assert.equal(verification.completion_tokens, 19);
    assert.equal(verification.latency_ms, 125);
    assert.match(String(verification.response_hash), /^0x[0-9a-f]{64}$/);
    assert.match(String(verification.trace_hash), /^0x[0-9a-f]{64}$/);

    const action = await singleRow(
      fixture.pool,
      "select status from aegis_action_requests where request_id = $1",
      [pending.requestId],
    );
    const hold = await singleRow(
      fixture.pool,
      "select status, released_at from aegis_usage_holds where request_id = $1",
      [pending.requestId],
    );
    const audit = await singleRow(
      fixture.pool,
      "select outcome, reason_code from aegis_teeml_audit_events where request_id = $1",
      [pending.requestId],
    );
    assert.equal(action.status, "TEEML_ALLOWED");
    assert.deepEqual(hold, { status: "HELD", released_at: null });
    assert.deepEqual(audit, {
      outcome: "TEEML_ALLOWED",
      reason_code: "SEMANTIC_POLICY_MATCH",
    });

    const transientPersistence = {
      actionRequests: (
        await fixture.pool.query(
          "select * from aegis_action_requests where request_id = $1",
          [pending.requestId],
        )
      ).rows,
      prechecks: (
        await fixture.pool.query(
          "select * from aegis_precheck_records where request_id = $1",
          [pending.requestId],
        )
      ).rows,
      holds: (
        await fixture.pool.query(
          "select * from aegis_usage_holds where request_id = $1",
          [pending.requestId],
        )
      ).rows,
      teemlVerifications: [verification],
      teemlAudit: (
        await fixture.pool.query(
          "select * from aegis_teeml_audit_events where request_id = $1",
          [pending.requestId],
        )
      ).rows,
    };
    const serialized = JSON.stringify(transientPersistence);
    assert.equal(serialized.includes(SEMANTIC_PLAINTEXT_MARKER), false);
    assert.equal(serialized.includes("BEGIN_AEGIS_TRUSTED_SEMANTIC_CONTEXT_JSON"), false);
    assert.equal(serialized.includes('"semanticContext"'), false);
    assert.equal(serialized.includes('"content"'), false);
    assert.equal(serialized.includes('"messages"'), false);
  });

  it("persists an honestly labeled TeeTLS hackathon artifact and enforces its exact security tuple", async () => {
    const fixture = await seededFixture("hackathon-teetls");
    const pending = await fixture.createPendingAction("hackathon-teetls");
    const gateway = new VerdictGateway(
      "ALLOW",
      "SEMANTIC_POLICY_MATCH",
      HACKATHON_TESTNET_TEETLS_PROFILE,
    );
    const service = fixture.createTeeMlService(
      gateway,
      "hackathon-teetls",
      HACKATHON_TESTNET_TEETLS_PROFILE,
    );

    const result = await service.verify(verifyInput(pending.requestId));

    assert.equal(result.response.status, HACKATHON_TEETLS_ALLOWED_STATUS);
    if (result.response.status !== HACKATHON_TEETLS_ALLOWED_STATUS) assert.fail();
    assert.equal(result.response.securityProfile, HACKATHON_TESTNET_TEETLS_PROFILE);
    assert.equal(result.response.trustMode, "verified");
    assert.equal(result.response.verificationMode, "TeeTLS");
    assert.equal(result.response.sealedInference, false);
    assert.equal(result.response.teeVerified, true);

    const action = await singleRow(
      fixture.pool,
      "select status from aegis_action_requests where request_id = $1",
      [pending.requestId],
    );
    assert.equal(action.status, HACKATHON_TEETLS_ALLOWED_STATUS);
    const hold = await singleRow(
      fixture.pool,
      "select status, released_at from aegis_usage_holds where request_id = $1",
      [pending.requestId],
    );
    const audit = await singleRow(
      fixture.pool,
      "select outcome, reason_code from aegis_teeml_audit_events where request_id = $1",
      [pending.requestId],
    );
    assert.equal(hold.status, "RELEASED");
    assert.equal(typeof hold.released_at, "number");
    assert.deepEqual(audit, {
      outcome: HACKATHON_TEETLS_ALLOWED_STATUS,
      reason_code: "SEMANTIC_POLICY_MATCH",
    });

    const verification = await singleRow(
      fixture.pool,
      "select * from aegis_teeml_verifications where request_id = $1",
      [pending.requestId],
    );
    assert.equal(
      verification.security_profile,
      HACKATHON_TESTNET_TEETLS_PROFILE,
    );
    assert.equal(verification.status, HACKATHON_TEETLS_ALLOWED_STATUS);
    assert.equal(verification.trust_mode, "verified");
    assert.equal(verification.verification_mode, "TeeTLS");
    assert.equal(verification.sealed_inference, false);
    assert.equal(verification.tee_verified, true);
    assert.equal(
      JSON.stringify(verification).includes(SEMANTIC_PLAINTEXT_MARKER),
      false,
    );

    await assert.rejects(
      fixture.pool.query(
        `update aegis_teeml_verifications
         set status = 'ALLOWED'
         where request_id = $1`,
        [pending.requestId],
      ),
      (error: unknown) =>
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "23514",
    );
    await assert.rejects(
      fixture.pool.query(
        `update aegis_teeml_verifications
         set status = 'ALLOWED',
             security_profile = 'production-private-teeml',
             trust_mode = 'private',
             verification_mode = 'TeeML',
             sealed_inference = true
         where request_id = $1`,
        [pending.requestId],
      ),
      (error: unknown) =>
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "23514" &&
        "constraint" in error &&
        error.constraint === "aegis_teeml_verifications_final_immutable",
    );
    await assert.rejects(
      fixture.pool.query(
        `update aegis_action_requests
         set status = 'TEEML_ALLOWED'
         where request_id = $1`,
        [pending.requestId],
      ),
      (error: unknown) =>
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "P0001",
    );

    await assert.rejects(
      fixture.pool.query(
        `update aegis_teeml_verifications
         set sealed_inference = true
         where request_id = $1`,
        [pending.requestId],
      ),
      (error: unknown) =>
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "23514",
    );

    for (const column of [
      "verdict",
      "security_profile",
      "trust_mode",
      "verification_mode",
      "sealed_inference",
      "tee_verified",
      "response_hash",
      "latency_ms",
    ]) {
      await assert.rejects(
        fixture.pool.query(
          `update aegis_teeml_verifications
           set ${column} = null
           where request_id = $1`,
          [pending.requestId],
        ),
        (error: unknown) =>
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "23514",
      );
    }

    await assert.rejects(
      fixture.pool.query(
        `update aegis_teeml_audit_events
         set outcome = 'TEEML_ALLOWED'
         where request_id = $1`,
        [pending.requestId],
      ),
      (error: unknown) =>
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "23514" &&
        "constraint" in error &&
        error.constraint === "aegis_teeml_audit_events_binding_check",
    );
    await assert.rejects(
      fixture.pool.query(
        `update aegis_teeml_audit_events
         set semantic_context_hash = null,
             teeml_request_hash = null
         where request_id = $1`,
        [pending.requestId],
      ),
      (error: unknown) =>
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "23514" &&
        "constraint" in error &&
        error.constraint === "aegis_teeml_audit_events_outcome_check",
    );
    await assert.rejects(
      fixture.pool.query(
        `delete from aegis_teeml_verifications
         where request_id = $1`,
        [pending.requestId],
      ),
      (error: unknown) =>
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "23514" &&
        "constraint" in error &&
        error.constraint === "aegis_teeml_verifications_final_immutable",
    );

    const replayGateway = new VerdictGateway(
      "ALLOW",
      "SEMANTIC_POLICY_MATCH",
      HACKATHON_TESTNET_TEETLS_PROFILE,
    );
    const replay = await fixture
      .createTeeMlService(
        replayGateway,
        "hackathon-teetls-restart",
        HACKATHON_TESTNET_TEETLS_PROFILE,
      )
      .verify(verifyInput(pending.requestId));
    assert.equal(replay.response.status, HACKATHON_TEETLS_ALLOWED_STATUS);
    assert.equal(replayGateway.calls, 0);
  });

  it("persists a valid hackathon TeeTLS DENY and releases its UsageHold", async () => {
    const fixture = await seededFixture("hackathon-teetls-deny");
    const pending = await fixture.createPendingAction("hackathon-teetls-deny");
    const result = await fixture
      .createTeeMlService(
        new VerdictGateway(
          "DENY",
          "SERVICE_PURPOSE_MISMATCH",
          HACKATHON_TESTNET_TEETLS_PROFILE,
        ),
        "hackathon-teetls-deny",
        HACKATHON_TESTNET_TEETLS_PROFILE,
      )
      .verify(verifyInput(pending.requestId));

    assert.equal(result.response.status, "TEEML_DENIED");
    assert.equal(result.response.securityProfile, HACKATHON_TESTNET_TEETLS_PROFILE);
    const verification = await singleRow(
      fixture.pool,
      "select status, security_profile from aegis_teeml_verifications where request_id = $1",
      [pending.requestId],
    );
    const hold = await singleRow(
      fixture.pool,
      "select status from aegis_usage_holds where request_id = $1",
      [pending.requestId],
    );
    assert.deepEqual(verification, {
      status: "DENIED",
      security_profile: HACKATHON_TESTNET_TEETLS_PROFILE,
    });
    assert.equal(hold.status, "RELEASED");
  });

  it("persists DENY and technical failure atomically and releases both UsageHolds", async () => {
    const fixture = await seededFixture("deny-failure");
    const deniedPending = await fixture.createPendingAction("deny");
    const denied = await fixture
      .createTeeMlService(
        new VerdictGateway("DENY", "SERVICE_PURPOSE_MISMATCH"),
        "deny",
      )
      .verify(verifyInput(deniedPending.requestId));
    assert.equal(denied.response.status, "TEEML_DENIED");

    const failedPending = await fixture.createPendingAction("failure");
    const failureGateway = new ThrowingGateway(
      new TeeMlError(
        "TEEML_TIMEOUT",
        "sanitized deterministic timeout",
        true,
      ),
    );
    await assert.rejects(
      () =>
        fixture
          .createTeeMlService(failureGateway, "failure")
          .verify(verifyInput(failedPending.requestId)),
      (error: unknown) =>
        error instanceof TeeMlError && error.code === "TEEML_TIMEOUT",
    );

    const actions = (
      await fixture.pool.query<{
        request_id: string;
        status: string;
      }>(
        `select request_id, status
         from aegis_action_requests
         where request_id = any($1::text[])
         order by request_id`,
        [[deniedPending.requestId, failedPending.requestId]],
      )
    ).rows;
    assert.equal(
      actions.find(row => row.request_id === deniedPending.requestId)?.status,
      "TEEML_DENIED",
    );
    assert.equal(
      actions.find(row => row.request_id === failedPending.requestId)?.status,
      "TEEML_FAILED",
    );

    const holds = (
      await fixture.pool.query<{
        request_id: string;
        status: string;
        released_at: number | null;
      }>(
        `select request_id, status, released_at
         from aegis_usage_holds
         where request_id = any($1::text[])
         order by request_id`,
        [[deniedPending.requestId, failedPending.requestId]],
      )
    ).rows;
    assert.equal(holds.length, 2);
    assert.equal(holds.every(hold => hold.status === "RELEASED"), true);
    assert.equal(holds.every(hold => hold.released_at === NOW), true);

    const verifications = (
      await fixture.pool.query<{
        request_id: string;
        status: string;
        verdict: string | null;
        reason_code: string | null;
        technical_reason_code: string | null;
      }>(
        `select request_id, status, verdict, reason_code, technical_reason_code
         from aegis_teeml_verifications
         where request_id = any($1::text[])
         order by request_id`,
        [[deniedPending.requestId, failedPending.requestId]],
      )
    ).rows;
    assert.deepEqual(
      verifications.find(
        verification =>
          verification.request_id === deniedPending.requestId,
      ),
      {
        request_id: deniedPending.requestId,
        status: "DENIED",
        verdict: "DENY",
        reason_code: "SERVICE_PURPOSE_MISMATCH",
        technical_reason_code: null,
      },
    );
    assert.deepEqual(
      verifications.find(
        verification =>
          verification.request_id === failedPending.requestId,
      ),
      {
        request_id: failedPending.requestId,
        status: "FAILED",
        verdict: null,
        reason_code: null,
        technical_reason_code: "TEEML_TIMEOUT",
      },
    );
  });

  it("replays a final verdict through a reconstructed repository without a second inference", async () => {
    const fixture = await seededFixture("restart");
    const pending = await fixture.createPendingAction("restart");
    const firstGateway = new VerdictGateway("ALLOW");
    const first = await fixture
      .createTeeMlService(firstGateway, "restart-first")
      .verify(verifyInput(pending.requestId));
    assert.equal(first.response.status, "TEEML_ALLOWED");
    assert.equal(firstGateway.calls, 1);

    const restartedPool = trackedPool();
    const restartedRepository = new PostgresTeeMlRepository(restartedPool);
    const secondGateway = new VerdictGateway("DENY");
    const restartedService = new TeeMlService(
      restartedRepository,
      secondGateway,
      {
        clock: () => NOW,
        idGenerator: sequentialIds("restart-second"),
      },
    );
    const replay = await restartedService.verify(
      verifyInput(pending.requestId),
    );

    assert.deepEqual(replay, first);
    assert.equal(secondGateway.calls, 0);
    assert.equal(
      Number(
        (
          await restartedPool.query(
            "select count(*)::int as count from aegis_teeml_verifications where request_id = $1",
            [pending.requestId],
          )
        ).rows[0].count,
      ),
      1,
    );
  });

  it("serializes concurrent verification claims and creates one verification row and one paid inference", async () => {
    const fixture = await seededFixture("concurrent");
    const pending = await fixture.createPendingAction("concurrent");
    const gateway = new DeferredVerdictGateway();
    const service = fixture.createTeeMlService(gateway, "concurrent");

    const first = service.verify(verifyInput(pending.requestId));
    await gateway.started;
    const concurrent = await service.verify(verifyInput(pending.requestId));

    assert.equal(concurrent.httpStatus, 202);
    assert.equal(concurrent.response.status, "TEEML_PROCESSING");
    assert.equal(gateway.calls, 1);
    assert.equal(
      Number(
        (
          await fixture.pool.query(
            "select count(*)::int as count from aegis_teeml_verifications where request_id = $1",
            [pending.requestId],
          )
        ).rows[0].count,
      ),
      1,
    );

    gateway.release();
    const completed = await first;
    assert.equal(completed.response.status, "TEEML_ALLOWED");
    assert.equal(gateway.calls, 1);

    const indexes = (
      await fixture.pool.query<{ indexname: string }>(
        `select indexname
         from pg_indexes
         where schemaname = 'public'
           and tablename = 'aegis_teeml_verifications'`,
      )
    ).rows.map(row => row.indexname);
    assert.equal(
      indexes.includes("aegis_teeml_verifications_request_unique"),
      true,
    );
  });

  it("rechecks the durable semantic context after inference and rejects profile drift", async () => {
    const fixture = await seededFixture("context-drift");
    const pending = await fixture.createPendingAction("context-drift");
    const gateway = new DeferredVerdictGateway();
    const service = fixture.createTeeMlService(gateway, "context-drift");

    const verification = service.verify(verifyInput(pending.requestId));
    await gateway.started;
    await fixture.pool.query(
      `update aegis_agent_semantic_profiles
       set capability_ids = $2::jsonb, updated_at = $3
       where agent_id = $1`,
      [
        AGENT_ID,
        JSON.stringify(["archive.read", "archive.write", "payments.admin"]),
        NOW,
      ],
    );
    gateway.release();

    await assert.rejects(
      verification,
      (error: unknown) =>
        error instanceof TeeMlError && error.code === "TEEML_CONFLICT",
    );
    assert.equal(gateway.calls, 1);
    assert.equal(
      (
        await singleRow(
          fixture.pool,
          "select status from aegis_action_requests where request_id = $1",
          [pending.requestId],
        )
      ).status,
      "TEEML_FAILED",
    );
    assert.equal(
      (
        await singleRow(
          fixture.pool,
          "select status from aegis_usage_holds where request_id = $1",
          [pending.requestId],
        )
      ).status,
      "RELEASED",
    );
  });

  it("uses the PostgreSQL clock to reject an ALLOW whose hold expired after inference started", async () => {
    const fixture = await seededFixture("database-hold-clock");
    const pending = await fixture.createPendingAction("database-hold-clock");
    const gateway = new DeferredVerdictGateway();
    const service = new TeeMlService(fixture.teemlRepository, gateway, {
      clock: () => 1,
      idGenerator: sequentialIds("database-hold-clock-teeml"),
    });

    const verification = service.verify(verifyInput(pending.requestId));
    await gateway.started;
    await fixture.pool.query(
      `update aegis_usage_holds
       set expires_at =
         floor(extract(epoch from clock_timestamp()))::integer - 1
       where request_id = $1`,
      [pending.requestId],
    );
    gateway.release();

    await assert.rejects(
      verification,
      (error: unknown) =>
        error instanceof TeeMlError && error.code === "TEEML_CONFLICT",
    );
    assert.equal(
      (
        await singleRow(
          fixture.pool,
          "select status from aegis_action_requests where request_id = $1",
          [pending.requestId],
        )
      ).status,
      "TEEML_FAILED",
    );
    assert.equal(
      (
        await singleRow(
          fixture.pool,
          "select status from aegis_usage_holds where request_id = $1",
          [pending.requestId],
        )
      ).status,
      "RELEASED",
    );
  });

  it("reconciles stale PROCESSING before an unavailable Level 1 commitment", async () => {
    const fixture = await seededFixture("stale-unavailable");
    const pending = await fixture.createPendingAction("stale-unavailable");
    const gateway = new DeferredVerdictGateway();
    let now = NOW;
    const service = new TeeMlService(fixture.teemlRepository, gateway, {
      clock: () => now,
      idGenerator: sequentialIds("stale-unavailable-teeml"),
      processingLeaseSeconds: 120,
    });

    const first = service.verify(verifyInput(pending.requestId));
    await gateway.started;
    await fixture.pool.query(
      `update aegis_action_requests
       set action_hash_schema_version = null, action_type = null,
           destination_kind = null, destination_value = null,
           destination_chain_id = null, asset_id = null, amount = null,
           action_deadline = null
       where request_id = $1`,
      [pending.requestId],
    );
    now += 121;

    await assert.rejects(
      service.verify(verifyInput(pending.requestId)),
      (error: unknown) =>
        error instanceof TeeMlError &&
        error.code === "TEEML_UNKNOWN_RESULT",
    );
    assert.equal(gateway.calls, 1);
    assert.equal(
      (
        await singleRow(
          fixture.pool,
          "select status from aegis_action_requests where request_id = $1",
          [pending.requestId],
        )
      ).status,
      "TEEML_FAILED",
    );
    assert.equal(
      (
        await singleRow(
          fixture.pool,
          "select status from aegis_usage_holds where request_id = $1",
          [pending.requestId],
        )
      ).status,
      "RELEASED",
    );

    gateway.release();
    await assert.rejects(first);
  });

  for (const registrationStatus of ["PROCESSING", "UNKNOWN"] as const) {
    it(`rejects an Agentic ID profile whose durable registration is ${registrationStatus}`, async () => {
      const fixture = await seededFixture(
        `agentic-registration-${registrationStatus.toLowerCase()}`,
      );
      const pending = await fixture.createPendingAction(
        `agentic-registration-${registrationStatus.toLowerCase()}`,
      );
      await fixture.pool.query(
        `update aegis_agentic_id_registrations
         set status = $2, metadata_uri = null, explorer_url = null,
             completed_at = null, updated_at = $3
         where agent_id = $1`,
        [AGENT_ID, registrationStatus, NOW],
      );
      const gateway = new VerdictGateway("ALLOW");

      await assert.rejects(
        fixture
          .createTeeMlService(
            gateway,
            `agentic-registration-${registrationStatus.toLowerCase()}`,
          )
          .verify(verifyInput(pending.requestId)),
        (error: unknown) =>
          error instanceof TeeMlError &&
          error.code === "TEEML_TRUSTED_CONTEXT_MISSING",
      );

      assert.equal(gateway.calls, 0);
      assert.equal(
        (
          await singleRow(
            fixture.pool,
            "select status from aegis_action_requests where request_id = $1",
            [pending.requestId],
          )
        ).status,
        "TEEML_FAILED",
      );
      assert.equal(
        (
          await singleRow(
            fixture.pool,
            "select status from aegis_usage_holds where request_id = $1",
            [pending.requestId],
          )
        ).status,
        "RELEASED",
      );
    });
  }

  it("rejects tampered durable action and Policy commitments before inference", async () => {
    const fixture = await seededFixture("tampered-commitments");
    for (const tampering of ["action", "policy"] as const) {
      const pending = await fixture.createPendingAction(`tampered-${tampering}`);
      if (tampering === "action") {
        await fixture.pool.query(
          `update aegis_action_requests
           set amount = '2'
           where request_id = $1`,
          [pending.requestId],
        );
      } else {
        await fixture.pool.query(
          `update aegis_policies
           set semantic_rules = $2::jsonb
           where policy_id = $1`,
          [
            POLICY_ID,
            JSON.stringify([
              ...semanticRules(),
              {
                ruleId: "tampered-rule",
                kind: "TEXT",
                params: { purpose: "uncommitted policy mutation" },
              },
            ]),
          ],
        );
      }

      const gateway = new VerdictGateway("ALLOW");
      await assert.rejects(
        () =>
          fixture
            .createTeeMlService(gateway, `tampered-${tampering}`)
            .verify(verifyInput(pending.requestId)),
        (error: unknown) =>
          error instanceof TeeMlError && error.code === "TEEML_CONFLICT",
      );
      assert.equal(gateway.calls, 0);

      const action = await singleRow(
        fixture.pool,
        "select status from aegis_action_requests where request_id = $1",
        [pending.requestId],
      );
      const hold = await singleRow(
        fixture.pool,
        "select status, released_at from aegis_usage_holds where request_id = $1",
        [pending.requestId],
      );
      const audit = await singleRow(
        fixture.pool,
        `select outcome, reason_code, semantic_context_hash, teeml_request_hash
         from aegis_teeml_audit_events
         where request_id = $1`,
        [pending.requestId],
      );
      assert.deepEqual(action, { status: "TEEML_FAILED" });
      assert.deepEqual(hold, { status: "RELEASED", released_at: NOW });
      assert.deepEqual(audit, {
        outcome: "TEEML_FAILED",
        reason_code: "TEEML_CONFLICT",
        semantic_context_hash: null,
        teeml_request_hash: null,
      });
      assert.equal(
        Number(
          (
            await fixture.pool.query(
              "select count(*)::int as count from aegis_teeml_verifications where request_id = $1",
              [pending.requestId],
            )
          ).rows[0].count,
        ),
        0,
      );
    }
  });

  it("reconciles a migrated legacy action without a v2 commitment and releases its hold", async () => {
    const fixture = await seededFixture("legacy-action");
    const pending = await fixture.createPendingAction("legacy-action");
    await fixture.pool.query(
      `update aegis_action_requests
       set action_hash_schema_version = null,
           action_type = null,
           destination_kind = null,
           destination_value = null,
           destination_chain_id = null,
           asset_id = null,
           amount = null,
           action_deadline = null
       where request_id = $1`,
      [pending.requestId],
    );

    const gateway = new VerdictGateway("ALLOW");
    await assert.rejects(
      () =>
        fixture
          .createTeeMlService(gateway, "legacy-action")
          .verify(verifyInput(pending.requestId)),
      (error: unknown) =>
        error instanceof TeeMlError &&
        error.code === "TEEML_TRUSTED_CONTEXT_MISSING",
    );
    assert.equal(gateway.calls, 0);

    const action = await singleRow(
      fixture.pool,
      "select status from aegis_action_requests where request_id = $1",
      [pending.requestId],
    );
    const hold = await singleRow(
      fixture.pool,
      "select status, released_at from aegis_usage_holds where request_id = $1",
      [pending.requestId],
    );
    const audit = await singleRow(
      fixture.pool,
      `select outcome, reason_code, semantic_context_hash, teeml_request_hash
       from aegis_teeml_audit_events
       where request_id = $1`,
      [pending.requestId],
    );
    assert.deepEqual(action, { status: "TEEML_FAILED" });
    assert.deepEqual(hold, { status: "RELEASED", released_at: NOW });
    assert.deepEqual(audit, {
      outcome: "TEEML_FAILED",
      reason_code: "TEEML_TRUSTED_CONTEXT_MISSING",
      semantic_context_hash: null,
      teeml_request_hash: null,
    });
    assert.equal(
      Number(
        (
          await fixture.pool.query(
            "select count(*)::int as count from aegis_teeml_verifications where request_id = $1",
            [pending.requestId],
          )
        ).rows[0].count,
      ),
      0,
    );
  });

  it("fails an ALLOW atomically when the UsageHold expires during inference", async () => {
    const fixture = await seededFixture("hold-expiry");
    const pending = await fixture.createPendingAction("hold-expiry");
    const gateway = new DeferredVerdictGateway();
    const service = fixture.createTeeMlService(gateway, "hold-expiry");

    const verification = service.verify(verifyInput(pending.requestId));
    await gateway.started;
    await fixture.pool.query(
      `update aegis_usage_holds
       set status = 'EXPIRED', expires_at = $2, updated_at = $2
       where request_id = $1`,
      [pending.requestId, NOW],
    );
    gateway.release();

    await assert.rejects(
      () => verification,
      (error: unknown) =>
        error instanceof TeeMlError && error.code === "TEEML_CONFLICT",
    );
    assert.equal(gateway.calls, 1);

    const persisted = await singleRow(
      fixture.pool,
      `select status, verdict, technical_reason_code
       from aegis_teeml_verifications
       where request_id = $1`,
      [pending.requestId],
    );
    const action = await singleRow(
      fixture.pool,
      "select status from aegis_action_requests where request_id = $1",
      [pending.requestId],
    );
    const hold = await singleRow(
      fixture.pool,
      "select status, released_at from aegis_usage_holds where request_id = $1",
      [pending.requestId],
    );
    assert.deepEqual(persisted, {
      status: "FAILED",
      verdict: null,
      technical_reason_code: "TEEML_CONFLICT",
    });
    assert.deepEqual(action, { status: "TEEML_FAILED" });
    assert.deepEqual(hold, { status: "RELEASED", released_at: NOW });
  });

  it("reconciles a stale PROCESSING claim as an unknown result without retrying inference", async () => {
    const fixture = await seededFixture("stale-processing");
    const pending = await fixture.createPendingAction("stale-processing");
    await fixture.teemlRepository.runLocked(
      pending.requestId,
      async transaction => {
        const sources = await transaction.getTrustedSources(pending.requestId);
        if (
          !sources ||
          sources.commitmentStatus !== "AVAILABLE" ||
          !sources.agentProfile
        ) {
          throw new Error("available trusted sources fixture is required");
        }
        await transaction.startVerification({
          verificationId: "stale-processing-verification",
          requestId: pending.requestId,
          precheckId: pending.precheckId,
          agentId: AGENT_ID,
          agenticId: sources.agentProfile.agenticId,
          policyId: POLICY_ID,
          policyVersion: 1,
          policyHash: POLICY_HASH,
          actionHash: pending.actionHash,
          semanticContextHash: `0x${"33".repeat(32)}`,
          teemlRequestHash: `0x${"44".repeat(32)}`,
          now: NOW,
        });
      },
    );

    const gateway = new VerdictGateway("ALLOW");
    const reconciler = new TeeMlService(fixture.teemlRepository, gateway, {
      clock: () => NOW + 121,
      idGenerator: sequentialIds("stale-processing-reconcile"),
      processingLeaseSeconds: 120,
    });
    await assert.rejects(
      () => reconciler.verify(verifyInput(pending.requestId)),
      (error: unknown) =>
        error instanceof TeeMlError &&
        error.code === "TEEML_UNKNOWN_RESULT" &&
        error.requestDispatched,
    );
    assert.equal(gateway.calls, 0);

    const persisted = await singleRow(
      fixture.pool,
      `select status, technical_reason_code
       from aegis_teeml_verifications
       where request_id = $1`,
      [pending.requestId],
    );
    const action = await singleRow(
      fixture.pool,
      "select status from aegis_action_requests where request_id = $1",
      [pending.requestId],
    );
    const hold = await singleRow(
      fixture.pool,
      "select status, released_at from aegis_usage_holds where request_id = $1",
      [pending.requestId],
    );
    assert.deepEqual(persisted, {
      status: "FAILED",
      technical_reason_code: "TEEML_UNKNOWN_RESULT",
    });
    assert.deepEqual(action, { status: "TEEML_FAILED" });
    assert.deepEqual(hold, {
      status: "RELEASED",
      released_at: NOW + 121,
    });
  });

  it("rejects a retry when a durable trusted source changes the semantic context", async () => {
    const fixture = await seededFixture("conflict");
    const pending = await fixture.createPendingAction("conflict");
    const firstGateway = new VerdictGateway("ALLOW");
    await fixture
      .createTeeMlService(firstGateway, "conflict-first")
      .verify(verifyInput(pending.requestId));

    await fixture.pool.query(
      `update aegis_agent_semantic_profiles
       set capability_ids = $2::jsonb, updated_at = $3
       where agent_id = $1`,
      [AGENT_ID, JSON.stringify(["archive.read"]), NOW + 1],
    );

    const retryGateway = new VerdictGateway("ALLOW");
    await assert.rejects(
      () =>
        fixture
          .createTeeMlService(retryGateway, "conflict-retry")
          .verify(verifyInput(pending.requestId)),
      (error: unknown) =>
        error instanceof TeeMlError && error.code === "TEEML_CONFLICT",
    );
    assert.equal(retryGateway.calls, 0);

    const persisted = await singleRow(
      fixture.pool,
      `select status, verdict, reason_code
       from aegis_teeml_verifications
       where request_id = $1`,
      [pending.requestId],
    );
    assert.deepEqual(persisted, {
      status: "ALLOWED",
      verdict: "ALLOW",
      reason_code: "SEMANTIC_POLICY_MATCH",
    });
  });

  it("rolls back a claimed verification atomically and permits a clean retry", async () => {
    const fixture = await seededFixture("rollback");
    const pending = await fixture.createPendingAction("rollback");

    await assert.rejects(
      () =>
        fixture.teemlRepository.runLocked(
          pending.requestId,
          async transaction => {
            const sources = await transaction.getTrustedSources(
              pending.requestId,
            );
            if (
              !sources ||
              sources.commitmentStatus !== "AVAILABLE" ||
              !sources.agentProfile
            ) {
              throw new Error("available trusted sources fixture is required");
            }
            await transaction.startVerification({
              verificationId: "rollback-verification",
              requestId: pending.requestId,
              precheckId: pending.precheckId,
              agentId: AGENT_ID,
              agenticId: sources.agentProfile.agenticId,
              policyId: POLICY_ID,
              policyVersion: 1,
              policyHash: POLICY_HASH,
              actionHash: pending.actionHash,
              semanticContextHash: `0x${"33".repeat(32)}`,
              teemlRequestHash: `0x${"44".repeat(32)}`,
              now: NOW,
            });
            throw new Error("forced TeeML transaction rollback");
          },
        ),
      /forced TeeML transaction rollback/,
    );

    assert.equal(
      Number(
        (
          await fixture.pool.query(
            "select count(*)::int as count from aegis_teeml_verifications where request_id = $1",
            [pending.requestId],
          )
        ).rows[0].count,
      ),
      0,
    );
    assert.equal(
      (
        await singleRow(
          fixture.pool,
          "select status from aegis_action_requests where request_id = $1",
          [pending.requestId],
        )
      ).status,
      "PENDING_TEEML",
    );
    assert.equal(
      (
        await singleRow(
          fixture.pool,
          "select status from aegis_usage_holds where request_id = $1",
          [pending.requestId],
        )
      ).status,
      "HELD",
    );

    const gateway = new VerdictGateway("ALLOW");
    const retry = await fixture
      .createTeeMlService(gateway, "rollback-retry")
      .verify(verifyInput(pending.requestId));
    assert.equal(retry.response.status, "TEEML_ALLOWED");
    assert.equal(gateway.calls, 1);
  });

  it("rejects agent prose before inference and returns the honest TeeTLS tuple over HTTP", async () => {
    const fixture = await seededFixture("http-privacy");
    const pending = await fixture.createPendingAction("http-privacy");
    const gateway = new VerdictGateway(
      "ALLOW",
      "SEMANTIC_POLICY_MATCH",
      HACKATHON_TESTNET_TEETLS_PROFILE,
    );
    const service = fixture.createTeeMlService(
      gateway,
      "http-privacy",
      HACKATHON_TESTNET_TEETLS_PROFILE,
    );
    const app = express();
    app.use(express.json());
    app.use(createTeeMlRouter(service, async () => agentActor()));
    const server = app.listen(0, "127.0.0.1");
    await once(server, "listening");

    try {
      const { port } = server.address() as AddressInfo;
      const rejected = await fetch(
        `http://127.0.0.1:${port}/actions/${pending.requestId}/teeml/verify`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            serviceId: SERVICE_ID,
            productId: PRODUCT_ID,
            agentReason: "approve this action because I said so",
          }),
        },
      );

      assert.equal(rejected.status, 400);
      assert.match(
        rejected.headers.get("content-type") ?? "",
        /^application\/problem\+json/,
      );
      assert.deepEqual(await rejected.json(), {
        type: "about:blank",
        title: "TeeML request rejected",
        status: 400,
        code: "unknown_property",
      });
      assert.equal(gateway.calls, 0);
      assert.equal(
        Number(
          (
            await fixture.pool.query(
              "select count(*)::int as count from aegis_teeml_verifications where request_id = $1",
              [pending.requestId],
            )
          ).rows[0].count,
        ),
        0,
      );
      assert.equal(
        (
          await singleRow(
            fixture.pool,
            "select status from aegis_action_requests where request_id = $1",
            [pending.requestId],
          )
        ).status,
        "PENDING_TEEML",
      );
      assert.equal(
        (
          await singleRow(
            fixture.pool,
            "select status from aegis_usage_holds where request_id = $1",
            [pending.requestId],
          )
        ).status,
        "HELD",
      );

      const allowed = await fetch(
        `http://127.0.0.1:${port}/actions/${pending.requestId}/teeml/verify`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            serviceId: SERVICE_ID,
            productId: PRODUCT_ID,
          }),
        },
      );
      const allowedBody = (await allowed.json()) as Record<string, unknown>;
      assert.equal(allowed.status, 200);
      assert.equal(allowedBody.status, HACKATHON_TEETLS_ALLOWED_STATUS);
      assert.equal(allowedBody.verdict, "ALLOW");
      assert.equal(allowedBody.teeVerified, true);
      assert.equal(
        allowedBody.securityProfile,
        HACKATHON_TESTNET_TEETLS_PROFILE,
      );
      assert.equal(allowedBody.trustMode, "verified");
      assert.equal(allowedBody.verificationMode, "TeeTLS");
      assert.equal(allowedBody.sealedInference, false);
      assert.equal(gateway.calls, 1);
    } finally {
      server.close();
      await once(server, "close");
    }
  });
});

type SeededFixture = {
  pool: pg.Pool;
  teemlRepository: PostgresTeeMlRepository;
  createPendingAction(idempotencyKey: string): Promise<PendingTeemlResponse>;
  createTeeMlService(
    gateway: TeeMlInferenceGateway,
    idPrefix: string,
    securityProfile?: ZeroGSecurityProfile,
  ): TeeMlService;
};

async function seededFixture(idPrefix: string): Promise<SeededFixture> {
  const pool = trackedPool();
  await seedTrustedSources(pool);

  const precheckService = new PrecheckService(
    new PostgresPrecheckRepository(pool),
    {
      clock: () => NOW,
      idGenerator: sequentialIds(`${idPrefix}-precheck`),
      usageHoldTtlSeconds: 3_600,
    },
  );
  const teemlRepository = new PostgresTeeMlRepository(pool);
  await teemlRepository.saveAgentSemanticProfile({
    agentId: AGENT_ID,
    agenticId: AGENTIC_ID,
    contractAddress: AGENTIC_CONTRACT,
    tokenId: "1",
    metadataHash: `0x${"55".repeat(32)}`,
    capabilityIds: ["archive.read", "archive.write"],
    registeredAt: NOW - 100,
    updatedAt: NOW - 100,
  });
  await pool.query(
    `insert into aegis_agentic_id_registrations (
       agent_id, registration_hash, status, metadata_uri, explorer_url,
       created_at, updated_at, completed_at
     ) values ($1, $2, 'COMPLETED', $3, $4, $5, $5, $5)`,
    [
      AGENT_ID,
      `0x${"66".repeat(32)}`,
      "0g-storage://teeml-agent-profile",
      "https://chainscan-galileo.0g.ai/tx/0x1234",
      NOW - 100,
    ],
  );

  return {
    pool,
    teemlRepository,
    async createPendingAction(
      idempotencyKey: string,
    ): Promise<PendingTeemlResponse> {
      const result = await precheckService.precheck({
        params: { agentId: AGENT_ID, walletId: WALLET_ID },
        body: {
          actionType: "HEDERA_HBAR_TRANSFER",
          destination: {
            kind: "HEDERA_ACCOUNT_ID",
            value: DESTINATION,
          },
          assetId: "hedera:testnet:hbar",
          amount: "1",
          actionDeadline: NOW + 10_000,
        },
        idempotencyKey,
        actor: agentActor(),
      });
      assert.equal(result.httpStatus, 202);
      assert.equal(result.response.status, "PENDING_TEEML");
      return result.response as PendingTeemlResponse;
    },
    createTeeMlService(
      gateway: TeeMlInferenceGateway,
      serviceIdPrefix: string,
      securityProfile: ZeroGSecurityProfile = PRODUCTION_PRIVATE_TEEML_PROFILE,
    ): TeeMlService {
      return new TeeMlService(teemlRepository, gateway, {
        clock: () => NOW,
        idGenerator: sequentialIds(`${idPrefix}-${serviceIdPrefix}-teeml`),
        securityProfile,
      });
    },
  };
}

async function trustedSemanticCommitments(
  fixture: SeededFixture,
  requestId: string,
): Promise<{
  semanticContextHash: Hex32;
  teemlRequestHash: Hex32;
}> {
  const sources = await fixture.teemlRepository.runLocked(
    requestId,
    transaction => transaction.getTrustedSources(requestId),
  );
  assert.ok(sources);
  assert.equal(sources.commitmentStatus, "AVAILABLE");
  if (sources.commitmentStatus !== "AVAILABLE") assert.fail();
  assert.ok(sources.agentProfile);
  if (!sources.agentProfile) assert.fail();
  const context = buildTrustedSemanticContext(
    {
      requestId,
      action: {
        requestId,
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
    },
    { serviceId: SERVICE_ID, productId: PRODUCT_ID },
  );
  const semanticContextHash = computeSemanticContextHash(context);
  return {
    semanticContextHash,
    teemlRequestHash: computeTeeMlRequestHash(
      context,
      semanticContextHash,
    ),
  };
}

async function seedTrustedSources(pool: pg.Pool): Promise<void> {
  await pool.query(
    `insert into aegis_agents (
       agent_id, owner_address, status, created_at, updated_at
     ) values ($1, $2, 'ACTIVE', $3, $3)`,
    [
      AGENT_ID,
      "0x2222222222222222222222222222222222222222",
      NOW - 1_000,
    ],
  );
  await pool.query(
    `insert into aegis_wallets (
       wallet_id, agent_id, network_id, safe_address, status, created_at, updated_at
     ) values ($1, $2, $3, $4, 'PROTECTED', $5, $5)`,
    [WALLET_ID, AGENT_ID, NETWORK_ID, SAFE_ADDRESS, NOW - 1_000],
  );
  await pool.query(
    `insert into aegis_policies (
       policy_id, policy_series_id, agent_id, wallet_id, policy_version,
       policy_hash, status, valid_from, valid_until, rules, semantic_rules,
       operator_address, operator_signature, operator_message,
       operator_commitment, created_at, updated_at, activated_at,
       revoked_at, superseded_at, superseded_by_policy_id
     ) values (
       $1, $2, $3, $4, 1, $5, 'ACTIVE', $6, null, $7::jsonb, $8::jsonb,
       $9, $10, $11, $12, $6, $6, $6, null, null, null
     )`,
    [
      POLICY_ID,
      "policy-series-teeml-postgres-1",
      AGENT_ID,
      WALLET_ID,
      POLICY_HASH,
      NOW - 1_000,
      JSON.stringify(policyRules()),
      JSON.stringify(semanticRules()),
      "0x2222222222222222222222222222222222222222",
      "0x01",
      "fixture-operator-policy-commitment",
      `0x${"66".repeat(32)}`,
    ],
  );
}

function policyRules(): PolicyRules {
  return {
    allowedActionTypes: [
      "HEDERA_HBAR_TRANSFER",
      "HEDERA_HTS_FUNGIBLE_TRANSFER",
    ],
    allowedDestinations: [
      { kind: "HEDERA_ACCOUNT_ID", value: DESTINATION },
    ],
    allowedAssets: [
      {
        kind: "NATIVE",
        chainId: 296,
        assetId: "hbar",
        decimals: 8,
        symbol: "HBAR",
      },
    ],
    amount: { min: "1", max: "100", dailyLimit: "1000" },
    actionCount: { dailyLimit: 100 },
  };
}

function semanticRules(): SemanticRule[] {
  return [
    {
      ruleId: "purpose",
      kind: "TEXT",
      params: { purpose: "archive approved audit records" },
    },
    {
      ruleId: "trusted-storage-service",
      kind: TRUSTED_SERVICE_DESCRIPTOR_RULE_KIND,
      params: {
        schemaVersion: "1.0",
        providerId: "provider-a",
        serviceId: SERVICE_ID,
        productId: PRODUCT_ID,
        networkId: NETWORK_ID,
        destinationIds: [DESTINATION],
        categoryIds: ["archive", "storage"],
        capabilityIds: ["archive.write"],
        metadataHash: METADATA_HASH,
        shortDescription: SEMANTIC_PLAINTEXT_MARKER,
      },
    },
  ];
}

function verifyInput(requestId: string) {
  return {
    requestId,
    body: { serviceId: SERVICE_ID, productId: PRODUCT_ID },
    actor: agentActor(),
  };
}

function agentActor(): AgentActorContext {
  return {
    authenticatedAgentId: AGENT_ID,
    actorType: "AGENT",
  };
}

class VerdictGateway implements TeeMlInferenceGateway {
  calls = 0;

  constructor(
    private readonly verdict: "ALLOW" | "DENY",
    private readonly reasonCode =
      verdict === "ALLOW"
        ? "SEMANTIC_POLICY_MATCH"
        : "SERVICE_PURPOSE_MISMATCH",
    private readonly securityProfile: ZeroGSecurityProfile =
      PRODUCTION_PRIVATE_TEEML_PROFILE,
  ) {}

  async complete(
    messages: Parameters<TeeMlInferenceGateway["complete"]>[0],
  ): Promise<TeeMlInferenceResult> {
    this.calls += 1;
    return verdictResult(
      messages,
      this.verdict,
      this.reasonCode,
      this.calls,
      this.securityProfile,
    );
  }
}

class DeferredVerdictGateway implements TeeMlInferenceGateway {
  calls = 0;
  readonly started: Promise<void>;
  private signalStarted!: () => void;
  private signalRelease!: () => void;
  private readonly waitForRelease: Promise<void>;

  constructor() {
    this.started = new Promise(resolve => {
      this.signalStarted = resolve;
    });
    this.waitForRelease = new Promise(resolve => {
      this.signalRelease = resolve;
    });
  }

  release(): void {
    this.signalRelease();
  }

  async complete(
    messages: Parameters<TeeMlInferenceGateway["complete"]>[0],
  ): Promise<TeeMlInferenceResult> {
    this.calls += 1;
    this.signalStarted();
    await this.waitForRelease;
    return verdictResult(
      messages,
      "ALLOW",
      "SEMANTIC_POLICY_MATCH",
      this.calls,
    );
  }
}

class ThrowingGateway implements TeeMlInferenceGateway {
  calls = 0;

  constructor(private readonly error: TeeMlError) {}

  async complete(): Promise<TeeMlInferenceResult> {
    this.calls += 1;
    throw this.error;
  }
}

function verdictResult(
  messages: Parameters<TeeMlInferenceGateway["complete"]>[0],
  verdict: "ALLOW" | "DENY",
  reasonCode: string,
  call: number,
  securityProfile: ZeroGSecurityProfile = PRODUCTION_PRIVATE_TEEML_PROFILE,
): TeeMlInferenceResult {
  const payload = extractPromptPayload(messages[1]?.content ?? "");
  return {
    responseId: `chatcmpl-postgres-${call}`,
    routerRequestId: `router-postgres-${call}`,
    providerAddress: PROVIDER_ADDRESS,
    modelId: MODEL_ID,
    content: JSON.stringify({
      schemaVersion: "1.0",
      verdict,
      reasonCode,
      requestId: payload.semanticContext.requestId,
      policyHash: payload.semanticContext.policy.policyHash,
      actionHash: payload.semanticContext.action.actionHash,
      semanticContextHash: payload.semanticContextHash,
      teemlRequestHash: payload.teemlRequestHash,
    }),
    promptTokens: 71,
    completionTokens: 19,
    latencyMs: 125,
    securityProfile,
    trustMode:
      securityProfile === PRODUCTION_PRIVATE_TEEML_PROFILE
        ? "private"
        : "verified",
    verificationMode:
      securityProfile === PRODUCTION_PRIVATE_TEEML_PROFILE
        ? "TeeML"
        : "TeeTLS",
    sealedInference: securityProfile === PRODUCTION_PRIVATE_TEEML_PROFILE,
    teeVerified: true,
  };
}

function extractPromptPayload(content: string): {
  semanticContext: {
    requestId: string;
    policy: { policyHash: Hex32 };
    action: { actionHash: Hex32 };
  };
  semanticContextHash: Hex32;
  teemlRequestHash: Hex32;
} {
  const [, json] = content.split("\n");
  assert.ok(json, "transient TeeML JSON payload is missing");
  return JSON.parse(json);
}

function sequentialIds(prefix: string): () => string {
  let sequence = 0;
  return () => `${prefix}-${++sequence}`;
}

function trackedPool(): pg.Pool {
  const pool = new Pool({ connectionString: testDatabaseUrl });
  openPools.push(pool);
  return pool;
}

async function singleRow(
  pool: pg.Pool,
  sql: string,
  values: unknown[] = [],
): Promise<Record<string, unknown>> {
  const result = await pool.query(sql, values);
  assert.equal(result.rows.length, 1);
  return result.rows[0];
}

async function resetAndMigrate(): Promise<void> {
  const pool = new Pool({ connectionString: testDatabaseUrl });
  try {
    await resetSchema(pool);
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

async function resetSchema(pool: pg.Pool): Promise<void> {
  await pool.query("drop schema public cascade");
  await pool.query("drop schema if exists drizzle cascade");
  await pool.query("create schema public");
  await pool.query("grant all on schema public to public");
}

async function applyMigrationFile(
  pool: pg.Pool | pg.PoolClient,
  fileName: string,
): Promise<void> {
  const migration = readFileSync(
    fileURLToPath(new URL(`../../drizzle/${fileName}`, import.meta.url)),
    "utf8",
  );
  for (const statement of migration
    .split("--> statement-breakpoint")
    .map(part => part.trim())
    .filter(Boolean)) {
    await pool.query(statement);
  }
}
