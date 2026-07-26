import pg from "pg";
import { ACTION_HASH_SCHEMA, type PersistedNormalizedAction } from "../policy-engine/precheck.js";
import type {
  Hex32,
  PolicyRules,
  SemanticRule,
} from "../policy-engine/types.js";
import { TeeMlError } from "./errors.js";
import type {
  AgentSemanticProfileRecord,
  CompleteTeeMlVerificationInput,
  FailTeeMlBeforeContextInput,
  FailTeeMlVerificationInput,
  StartTeeMlVerificationInput,
  TeeMlActionStatus,
  TeeMlRepository,
  TeeMlTransaction,
  TeeMlTrustedSources,
  TeeMlVerificationRecord,
} from "./repository.js";
import {
  getAllowedActionStatus,
  getAllowedVerificationStatus,
  HACKATHON_TEETLS_ALLOWED_STATUS,
  PRODUCTION_TEEML_ALLOWED_STATUS,
} from "./security-profile.js";
import {
  TEEML_SEMANTIC_REASON_CODES,
  TEEML_TECHNICAL_REASON_CODES,
  type TeeMlSemanticReasonCode,
  type TeeMlTechnicalReasonCode,
} from "./types.js";

const ACTION_STATUSES = new Set<TeeMlActionStatus>([
  "PENDING_TEEML",
  "TEEML_PROCESSING",
  PRODUCTION_TEEML_ALLOWED_STATUS,
  HACKATHON_TEETLS_ALLOWED_STATUS,
  "TEEML_DENIED",
  "TEEML_FAILED",
]);
const SEMANTIC_REASON_CODES = new Set<string>(TEEML_SEMANTIC_REASON_CODES);
const TECHNICAL_REASON_CODES = new Set<string>(TEEML_TECHNICAL_REASON_CODES);

export function createPostgresTeeMlRepository(
  connectionString: string,
): PostgresTeeMlRepository {
  return new PostgresTeeMlRepository(new pg.Pool({ connectionString }));
}

export class PostgresTeeMlRepository implements TeeMlRepository {
  constructor(private readonly pool: pg.Pool) {}

  async runLocked<T>(
    requestId: string,
    run: (transaction: TeeMlTransaction) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query(
        "select pg_advisory_xact_lock(hashtextextended($1, 0))",
        [`teeml-request:${requestId}`],
      );
      const result = await run(new PostgresTeeMlTransaction(client));
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback");
      throw mapPostgresError(error);
    } finally {
      client.release();
    }
  }

  async saveAgentSemanticProfile(
    profile: AgentSemanticProfileRecord,
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query(
        "select pg_advisory_xact_lock(hashtextextended($1, 0))",
        [`teeml-agent-profile:${profile.agentId}`],
      );
      const existing = await client.query(
        `select agentic_id, contract_address, token_id, metadata_hash, capability_ids
         from aegis_agent_semantic_profiles
         where agent_id = $1`,
        [profile.agentId],
      );
      if (existing.rows[0]) {
        const row = existing.rows[0];
        const unchanged =
          row.agentic_id === profile.agenticId &&
          row.contract_address === profile.contractAddress &&
          row.token_id === profile.tokenId &&
          row.metadata_hash === profile.metadataHash &&
          equalStringArrays(row.capability_ids, profile.capabilityIds);
        if (!unchanged) {
          throw new TeeMlError(
            "TEEML_CONFLICT",
            "registered Agentic ID semantic profile conflicts with the durable profile",
          );
        }
        await client.query(
          `update aegis_agent_semantic_profiles
           set updated_at = $2
           where agent_id = $1`,
          [profile.agentId, profile.updatedAt],
        );
      } else {
        await client.query(
          `insert into aegis_agent_semantic_profiles (
             agent_id, agentic_id, contract_address, token_id, metadata_hash,
             capability_ids, registered_at, updated_at
           ) values ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)`,
          [
            profile.agentId,
            profile.agenticId,
            profile.contractAddress,
            profile.tokenId,
            profile.metadataHash,
            JSON.stringify(profile.capabilityIds),
            profile.registeredAt,
            profile.updatedAt,
          ],
        );
      }
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw mapPostgresError(error);
    } finally {
      client.release();
    }
  }
}

class PostgresTeeMlTransaction implements TeeMlTransaction {
  constructor(private readonly client: pg.PoolClient) {}

  async getTrustedSources(requestId: string): Promise<TeeMlTrustedSources | null> {
    const result = await this.client.query(
      `select
         ar.request_id, ar.agent_id, ar.wallet_id, ar.policy_id,
         ar.policy_version, ar.policy_hash, ar.action_hash, ar.aegis_nonce,
         ar.status as action_status,
         ar.action_hash_schema_version, ar.action_type, ar.destination_kind,
         ar.destination_value, ar.destination_chain_id, ar.asset_id, ar.amount,
         ar.action_deadline,
         pr.precheck_id, pr.status as precheck_status,
         p.policy_id as durable_policy_id,
         p.agent_id as durable_policy_agent_id,
         p.wallet_id as durable_policy_wallet_id,
         p.policy_version as durable_policy_version,
         p.policy_hash as durable_policy_hash,
         p.valid_from as durable_policy_valid_from,
         p.valid_until as durable_policy_valid_until,
         p.rules as durable_policy_rules,
         p.semantic_rules as durable_policy_semantic_rules,
         asp.agentic_id, asp.contract_address, asp.token_id, asp.metadata_hash,
         asp.capability_ids, asp.registered_at, asp.updated_at as profile_updated_at,
         uh.usage_hold_id, uh.status as usage_hold_status,
         uh.expires_at as usage_hold_expires_at
       from aegis_action_requests ar
       join aegis_precheck_records pr on pr.request_id = ar.request_id
       join aegis_policies p on p.policy_id = ar.policy_id
       join aegis_usage_holds uh on uh.request_id = ar.request_id
       left join aegis_agentic_id_registrations air
         on air.agent_id = ar.agent_id and air.status = 'COMPLETED'
       left join aegis_agent_semantic_profiles asp
         on asp.agent_id = ar.agent_id and air.agent_id is not null
       where ar.request_id = $1
       limit 1`,
      [requestId],
    );
    const row = result.rows[0];
    if (!row) return null;
    return mapTrustedSources(row);
  }

  async getVerification(requestId: string): Promise<TeeMlVerificationRecord | null> {
    const result = await this.client.query(
      `select * from aegis_teeml_verifications where request_id = $1 limit 1`,
      [requestId],
    );
    return result.rows[0] ? mapVerification(result.rows[0]) : null;
  }

  async startVerification(input: StartTeeMlVerificationInput): Promise<void> {
    await this.client.query(
      `insert into aegis_teeml_verifications (
         verification_id, request_id, precheck_id, agent_id, agentic_id,
         policy_id, policy_version, policy_hash, action_hash,
         semantic_context_hash, teeml_request_hash, status, created_at, updated_at
       ) values (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'PROCESSING', $12, $12
       )`,
      [
        input.verificationId,
        input.requestId,
        input.precheckId,
        input.agentId,
        input.agenticId,
        input.policyId,
        input.policyVersion,
        input.policyHash,
        input.actionHash,
        input.semanticContextHash,
        input.teemlRequestHash,
        input.now,
      ],
    );
    const action = await this.client.query(
      `update aegis_action_requests
       set status = 'TEEML_PROCESSING', updated_at = $2
       where request_id = $1 and status = 'PENDING_TEEML'`,
      [input.requestId, input.now],
    );
    if (action.rowCount !== 1) {
      throw new TeeMlError(
        "TEEML_CONFLICT",
        "action request is not available for TeeML processing",
      );
    }
  }

  async completeVerification(
    input: CompleteTeeMlVerificationInput,
  ): Promise<void> {
    const artifact = input.artifact;
    const verificationStatus =
      artifact.verdict === "ALLOW"
        ? getAllowedVerificationStatus(artifact.securityProfile)
        : "DENIED";
    const actionStatus =
      artifact.verdict === "ALLOW"
        ? getAllowedActionStatus(artifact.securityProfile)
        : "TEEML_DENIED";

    if (artifact.verdict === "ALLOW") {
      const liveHold = await this.client.query(
        `select usage_hold_id
         from aegis_usage_holds
         where request_id = $1
           and status = 'HELD'
           and expires_at > floor(extract(epoch from clock_timestamp()))::integer
         for update`,
        [artifact.requestId],
      );
      if (liveHold.rowCount !== 1) {
        throw new TeeMlError(
          "TEEML_CONFLICT",
          "UsageHold is no longer live for TeeML finalization",
        );
      }
    }

    const verification = await this.client.query(
      `update aegis_teeml_verifications
       set status = $2, verdict = $3, reason_code = $4,
           provider_address = $5, model_id = $6, security_profile = $7,
           trust_mode = $8, verification_mode = $9, sealed_inference = $10,
           tee_verified = true, response_id = $11, response_hash = $12,
           trace_hash = $13, prompt_tokens = $14, completion_tokens = $15,
           latency_ms = $16, evaluated_at = $17, updated_at = $17
       where verification_id = $1 and request_id = $18 and status = 'PROCESSING'`,
      [
        artifact.verificationId,
        verificationStatus,
        artifact.verdict,
        artifact.reasonCode,
        artifact.providerAddress ?? null,
        artifact.modelId,
        artifact.securityProfile,
        artifact.trustMode,
        artifact.verificationMode,
        artifact.sealedInference,
        artifact.responseId ?? null,
        artifact.responseHash,
        artifact.traceHash ?? null,
        artifact.promptTokens ?? null,
        artifact.completionTokens ?? null,
        artifact.latencyMs,
        artifact.evaluatedAt,
        artifact.requestId,
      ],
    );
    if (verification.rowCount !== 1) {
      throw new TeeMlError(
        "TEEML_CONFLICT",
        "TeeML verification is already finalized",
      );
    }

    await this.updateActionStatus(
      artifact.requestId,
      actionStatus,
      artifact.evaluatedAt,
    );
    if (
      artifact.verdict === "DENY" ||
      actionStatus === HACKATHON_TEETLS_ALLOWED_STATUS
    ) {
      await this.releaseUsageHold(artifact.requestId, artifact.evaluatedAt);
    }
    await this.insertAuditEvent({
      eventId: input.eventId,
      verificationId: artifact.verificationId,
      requestId: artifact.requestId,
      precheckId: artifact.precheckId,
      agentId: artifact.agentId,
      policyHash: artifact.policyHash,
      actionHash: artifact.actionHash,
      semanticContextHash: artifact.semanticContextHash,
      teemlRequestHash: artifact.teemlRequestHash,
      outcome: actionStatus,
      reasonCode: artifact.reasonCode,
      occurredAt: artifact.evaluatedAt,
      retentionUntil: input.retentionUntil,
    });
  }

  async failVerification(input: FailTeeMlVerificationInput): Promise<void> {
    const verification = await this.client.query(
      `update aegis_teeml_verifications
       set status = 'FAILED', technical_reason_code = $2,
           evaluated_at = $3, updated_at = $3
       where verification_id = $1 and request_id = $4 and status = 'PROCESSING'`,
      [
        input.verificationId,
        input.reasonCode,
        input.occurredAt,
        input.requestId,
      ],
    );
    if (verification.rowCount !== 1) {
      throw new TeeMlError(
        "TEEML_CONFLICT",
        "TeeML verification is already finalized",
      );
    }
    await this.updateActionStatus(
      input.requestId,
      "TEEML_FAILED",
      input.occurredAt,
    );
    await this.releaseUsageHold(input.requestId, input.occurredAt);
    await this.insertAuditEvent({
      ...input,
      outcome: "TEEML_FAILED",
    });
  }

  async failBeforeContext(input: FailTeeMlBeforeContextInput): Promise<void> {
    await this.updateActionStatus(
      input.requestId,
      "TEEML_FAILED",
      input.occurredAt,
      "PENDING_TEEML",
    );
    await this.releaseUsageHold(input.requestId, input.occurredAt);
    await this.insertAuditEvent({
      ...input,
      verificationId: null,
      semanticContextHash: null,
      teemlRequestHash: null,
      outcome: "TEEML_FAILED",
    });
  }

  private async updateActionStatus(
    requestId: string,
    status: Exclude<TeeMlActionStatus, "PENDING_TEEML" | "TEEML_PROCESSING">,
    now: number,
    expectedStatus: TeeMlActionStatus = "TEEML_PROCESSING",
  ): Promise<void> {
    const result = await this.client.query(
      `update aegis_action_requests
       set status = $2, updated_at = $3
       where request_id = $1 and status = $4`,
      [requestId, status, now, expectedStatus],
    );
    if (result.rowCount !== 1) {
      throw new TeeMlError(
        "TEEML_CONFLICT",
        "action request TeeML state changed concurrently",
      );
    }
  }

  private async releaseUsageHold(
    requestId: string,
    now: number,
  ): Promise<void> {
    await this.client.query(
      `update aegis_usage_holds
       set status = 'RELEASED', released_at = $2, updated_at = $2
       where request_id = $1 and status in ('HELD', 'EXPIRED')`,
      [requestId, now],
    );
  }

  private async insertAuditEvent(input: {
    eventId: string;
    verificationId: string | null;
    requestId: string;
    precheckId: string;
    agentId: string;
    policyHash: Hex32;
    actionHash: Hex32;
    semanticContextHash: Hex32 | null;
    teemlRequestHash: Hex32 | null;
    outcome:
      | "TEEML_ALLOWED"
      | "TEETLS_HACKATHON_ALLOWED"
      | "TEEML_DENIED"
      | "TEEML_FAILED";
    reasonCode: string;
    occurredAt: number;
    retentionUntil: number;
  }): Promise<void> {
    await this.client.query(
      `insert into aegis_teeml_audit_events (
         event_id, verification_id, request_id, precheck_id, agent_id,
         policy_hash, action_hash, semantic_context_hash, teeml_request_hash,
         outcome, reason_code, occurred_at, retention_until
       ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        input.eventId,
        input.verificationId,
        input.requestId,
        input.precheckId,
        input.agentId,
        input.policyHash,
        input.actionHash,
        input.semanticContextHash,
        input.teemlRequestHash,
        input.outcome,
        input.reasonCode,
        input.occurredAt,
        input.retentionUntil,
      ],
    );
  }
}

function mapTrustedSources(row: Record<string, unknown>): TeeMlTrustedSources {
  const base = {
    requestId: requiredString(row.request_id),
    actionStatus: requiredActionStatus(row.action_status),
    precheckId: requiredString(row.precheck_id),
    agentId: requiredString(row.agent_id),
    walletId: requiredString(row.wallet_id),
    policyId: requiredString(row.policy_id),
    policyVersion: requiredNonNegativeInteger(row.policy_version),
    policyHash: requiredHex32(row.policy_hash),
    actionHash: requiredHex32(row.action_hash),
    usageHoldId: requiredString(row.usage_hold_id),
    usageHoldStatus: requiredUsageHoldStatus(row.usage_hold_status),
    usageHoldExpiresAt: requiredNonNegativeInteger(row.usage_hold_expires_at),
  } as const;
  if (
    row.precheck_status !== "PASS_TO_TEEML" ||
    row.action_hash_schema_version !== ACTION_HASH_SCHEMA
  ) {
    return { ...base, commitmentStatus: "UNAVAILABLE" };
  }

  try {
    return {
      ...base,
      commitmentStatus: "AVAILABLE",
      aegisNonce: requiredUnsignedIntegerString(row.aegis_nonce),
      action: mapPersistedAction(row),
      durablePolicy: {
        policyId: requiredString(row.durable_policy_id),
        agentId: requiredString(row.durable_policy_agent_id),
        walletId: requiredString(row.durable_policy_wallet_id),
        policyVersion: requiredNonNegativeInteger(
          row.durable_policy_version,
        ),
        policyHash: requiredHex32(row.durable_policy_hash),
        validFrom: requiredNonNegativeInteger(
          row.durable_policy_valid_from,
        ),
        validUntil:
          row.durable_policy_valid_until === null
            ? null
            : requiredNonNegativeInteger(row.durable_policy_valid_until),
        rules: requiredPolicyRules(row.durable_policy_rules),
        semanticRules: requiredSemanticRules(
          row.durable_policy_semantic_rules,
        ),
      },
      agentProfile:
        row.agentic_id === null
          ? null
          : {
              agentId: requiredString(row.agent_id),
              agenticId: requiredString(row.agentic_id),
              contractAddress: requiredAddress(row.contract_address),
              tokenId: requiredUnsignedIntegerString(row.token_id),
              metadataHash: requiredHex32(row.metadata_hash),
              capabilityIds: requiredStringArray(row.capability_ids),
              registeredAt: requiredNonNegativeInteger(row.registered_at),
              updatedAt: requiredNonNegativeInteger(
                row.profile_updated_at,
              ),
            },
    };
  } catch {
    return { ...base, commitmentStatus: "UNAVAILABLE" };
  }
}

function mapPersistedAction(
  row: Record<string, unknown>,
): PersistedNormalizedAction {
  const destinationKind = row.destination_kind;
  if (
    destinationKind !== "EVM_ADDRESS" &&
    destinationKind !== "HEDERA_ACCOUNT_ID" &&
    destinationKind !== "URL_ORIGIN"
  ) {
    throw new TeeMlError(
      "TEEML_TRUSTED_CONTEXT_MISSING",
      "persisted Level 1 destination is invalid",
    );
  }
  const chainId =
    row.destination_chain_id === null
      ? undefined
      : requiredNonNegativeInteger(row.destination_chain_id);
  return {
    actionType: requiredString(row.action_type),
    destination: {
      kind: destinationKind,
      value: requiredString(row.destination_value),
      ...(chainId === undefined ? {} : { chainId }),
    },
    assetId: requiredString(row.asset_id),
    amount: requiredUnsignedIntegerString(row.amount),
    actionDeadline: requiredNonNegativeInteger(row.action_deadline),
  };
}

function mapVerification(row: Record<string, unknown>): TeeMlVerificationRecord {
  const status = row.status;
  if (
    status !== "PROCESSING" &&
    status !== "ALLOWED" &&
    status !== "TEETLS_HACKATHON_ALLOWED" &&
    status !== "DENIED" &&
    status !== "FAILED"
  ) {
    throw new TeeMlError("TEEML_CONFLICT", "persisted TeeML status is invalid");
  }
  const semanticReasonCode =
    row.reason_code === null
      ? null
      : requiredSemanticReasonCode(row.reason_code);
  const technicalReasonCode =
    row.technical_reason_code === null
      ? null
      : requiredTechnicalReasonCode(row.technical_reason_code);
  const securityProfile =
    row.security_profile === null
      ? null
      : row.security_profile === "production-private-teeml" ||
          row.security_profile === "hackathon-testnet-teetls"
        ? row.security_profile
        : invalidPersistedVerification();
  const trustMode =
    row.trust_mode === null
      ? null
      : row.trust_mode === "private" || row.trust_mode === "verified"
        ? row.trust_mode
        : invalidPersistedVerification();
  const verificationMode =
    row.verification_mode === null
      ? null
      : row.verification_mode === "TeeML" ||
          row.verification_mode === "TeeTLS"
        ? row.verification_mode
        : invalidPersistedVerification();
  const sealedInference =
    row.sealed_inference === null
      ? null
      : typeof row.sealed_inference === "boolean"
        ? row.sealed_inference
        : invalidPersistedVerification();
  const teeVerified =
    row.tee_verified === null
      ? null
      : row.tee_verified === true
        ? true
        : invalidPersistedVerification();

  return {
    verificationId: requiredString(row.verification_id),
    requestId: requiredString(row.request_id),
    precheckId: requiredString(row.precheck_id),
    agentId: requiredString(row.agent_id),
    agenticId: requiredString(row.agentic_id),
    policyId: requiredString(row.policy_id),
    policyVersion: requiredNonNegativeInteger(row.policy_version),
    policyHash: requiredHex32(row.policy_hash),
    actionHash: requiredHex32(row.action_hash),
    semanticContextHash: requiredHex32(row.semantic_context_hash),
    teemlRequestHash: requiredHex32(row.teeml_request_hash),
    status,
    verdict:
      row.verdict === null
        ? null
        : row.verdict === "ALLOW" || row.verdict === "DENY"
          ? row.verdict
          : invalidPersistedVerification(),
    reasonCode: semanticReasonCode,
    technicalReasonCode,
    providerAddress:
      row.provider_address === null ? null : requiredString(row.provider_address),
    modelId: row.model_id === null ? null : requiredString(row.model_id),
    securityProfile,
    trustMode,
    verificationMode,
    sealedInference,
    teeVerified,
    responseId: row.response_id === null ? null : requiredString(row.response_id),
    responseHash:
      row.response_hash === null ? null : requiredHex32(row.response_hash),
    traceHash: row.trace_hash === null ? null : requiredHex32(row.trace_hash),
    promptTokens:
      row.prompt_tokens === null
        ? null
        : requiredNonNegativeInteger(row.prompt_tokens),
    completionTokens:
      row.completion_tokens === null
        ? null
        : requiredNonNegativeInteger(row.completion_tokens),
    latencyMs:
      row.latency_ms === null
        ? null
        : requiredNonNegativeInteger(row.latency_ms),
    evaluatedAt:
      row.evaluated_at === null
        ? null
        : requiredNonNegativeInteger(row.evaluated_at),
    createdAt: requiredNonNegativeInteger(row.created_at),
    updatedAt: requiredNonNegativeInteger(row.updated_at),
  };
}

function requiredActionStatus(value: unknown): TeeMlActionStatus {
  if (typeof value !== "string" || !ACTION_STATUSES.has(value as TeeMlActionStatus)) {
    throw new TeeMlError(
      "TEEML_CONFLICT",
      "action request is not eligible for TeeML",
    );
  }
  return value as TeeMlActionStatus;
}

function requiredUsageHoldStatus(value: unknown) {
  if (
    value !== "HELD" &&
    value !== "RELEASED" &&
    value !== "EXPIRED" &&
    value !== "COMMITTED"
  ) {
    throw new TeeMlError(
      "TEEML_CONFLICT",
      "persisted UsageHold status is invalid",
    );
  }
  return value;
}

function requiredSemanticRules(value: unknown): SemanticRule[] {
  if (!Array.isArray(value)) {
    throw new TeeMlError(
      "TEEML_TRUSTED_CONTEXT_MISSING",
      "operator semantic rules are unavailable",
    );
  }
  return structuredClone(value) as SemanticRule[];
}

function requiredPolicyRules(value: unknown): PolicyRules {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TeeMlError(
      "TEEML_TRUSTED_CONTEXT_MISSING",
      "operator policy rules are unavailable",
    );
  }
  return structuredClone(value) as PolicyRules;
}

function requiredStringArray(value: unknown): string[] {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.some(item => typeof item !== "string")
  ) {
    throw new TeeMlError(
      "TEEML_TRUSTED_CONTEXT_MISSING",
      "registered capability identifiers are unavailable",
    );
  }
  return [...new Set(value)].sort();
}

function equalStringArrays(left: unknown, right: readonly string[]): boolean {
  if (!Array.isArray(left) || left.some(value => typeof value !== "string")) {
    return false;
  }
  return JSON.stringify([...new Set(left)].sort()) === JSON.stringify([...right].sort());
}

function requiredString(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new TeeMlError(
      "TEEML_TRUSTED_CONTEXT_MISSING",
      "required durable TeeML source is unavailable",
    );
  }
  return value;
}

function requiredHex32(value: unknown): Hex32 {
  if (typeof value !== "string" || !/^0x[0-9a-f]{64}$/.test(value)) {
    throw new TeeMlError(
      "TEEML_TRUSTED_CONTEXT_MISSING",
      "required durable hash is unavailable",
    );
  }
  return value as Hex32;
}

function requiredAddress(value: unknown): `0x${string}` {
  if (typeof value !== "string" || !/^0x[0-9a-f]{40}$/.test(value)) {
    throw new TeeMlError(
      "TEEML_TRUSTED_CONTEXT_MISSING",
      "registered Agentic ID address is unavailable",
    );
  }
  return value as `0x${string}`;
}

function requiredUnsignedIntegerString(value: unknown): string {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new TeeMlError(
      "TEEML_TRUSTED_CONTEXT_MISSING",
      "required durable numeric identifier is unavailable",
    );
  }
  return value;
}

function requiredNonNegativeInteger(value: unknown): number {
  const number = typeof value === "string" ? Number(value) : value;
  if (
    typeof number !== "number" ||
    !Number.isSafeInteger(number) ||
    number < 0
  ) {
    throw new TeeMlError(
      "TEEML_TRUSTED_CONTEXT_MISSING",
      "required durable timestamp or version is unavailable",
    );
  }
  return number;
}

function requiredSemanticReasonCode(
  value: unknown,
): TeeMlSemanticReasonCode {
  if (typeof value !== "string" || !SEMANTIC_REASON_CODES.has(value)) {
    return invalidPersistedVerification();
  }
  return value as TeeMlSemanticReasonCode;
}

function requiredTechnicalReasonCode(
  value: unknown,
): TeeMlTechnicalReasonCode {
  if (typeof value !== "string" || !TECHNICAL_REASON_CODES.has(value)) {
    return invalidPersistedVerification();
  }
  return value as TeeMlTechnicalReasonCode;
}

function invalidPersistedVerification(): never {
  throw new TeeMlError(
    "TEEML_CONFLICT",
    "persisted TeeML verification is invalid",
  );
}

function mapPostgresError(error: unknown): never {
  if (error instanceof TeeMlError) throw error;
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  ) {
    throw new TeeMlError(
      "TEEML_CONFLICT",
      "TeeML request already has a verification result",
    );
  }
  throw error;
}
