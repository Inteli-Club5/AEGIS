import { sql } from "drizzle-orm";
import { bigint, boolean, check, foreignKey, index, integer, jsonb, pgEnum, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { NETWORK_ID, type PolicyRules, type SemanticRule } from "../types.js";

export const agentStatusEnum = pgEnum("aegis_agent_status", ["ACTIVE", "PAUSED", "RETIRED"]);
export const walletStatusEnum = pgEnum("aegis_wallet_status", ["PROTECTED", "PAUSED", "RETIRED", "DEAD"]);
export const walletCreationStatusEnum = pgEnum(
  "aegis_wallet_creation_status",
  ["INITIALIZED", "PREPARED", "BROADCAST", "FAILED", "COMPLETED"],
);
export const walletGuardianSourceEnum = pgEnum(
  "aegis_wallet_guardian_source",
  ["REQUESTED", "CONFIGURED_AEGIS", "OWNER_FALLBACK"],
);
export const walletDeploymentProvenanceEnum = pgEnum(
  "aegis_wallet_deployment_provenance",
  ["BROADCAST_RECEIPT", "PREDICTED_SAFE_RECONCILIATION"],
);
export const policyStatusEnum = pgEnum("aegis_policy_status", ["DRAFT", "ACTIVE", "SUPERSEDED", "REVOKED"]);
export const assetCatalogKindEnum = pgEnum("aegis_asset_catalog_kind", ["HBAR", "HTS_FUNGIBLE"]);
export const assetCatalogStatusEnum = pgEnum("aegis_asset_catalog_status", ["ACTIVE", "DISABLED"]);
export const actionRequestStatusEnum = pgEnum("aegis_action_request_status", [
  "RECEIVED",
  "DENIED_PRECHECK",
  "PENDING_TEEML",
  "TEEML_PROCESSING",
  "TEEML_ALLOWED",
  "TEETLS_HACKATHON_ALLOWED",
  "TEEML_DENIED",
  "TEEML_FAILED",
]);
export const precheckRecordStatusEnum = pgEnum("aegis_precheck_record_status", ["PASS_TO_TEEML", "DENY_PRECHECK"]);
export const usageHoldStatusEnum = pgEnum("aegis_usage_hold_status", ["HELD", "RELEASED", "EXPIRED", "COMMITTED"]);
export const teemlVerificationStatusEnum = pgEnum("aegis_teeml_verification_status", [
  "PROCESSING",
  "ALLOWED",
  "TEETLS_HACKATHON_ALLOWED",
  "DENIED",
  "FAILED",
]);
export const agenticIdRegistrationStatusEnum = pgEnum(
  "aegis_agentic_id_registration_status",
  ["PROCESSING", "COMPLETED", "UNKNOWN"],
);

export const agents = pgTable("aegis_agents", {
  agentId: text("agent_id").primaryKey(),
  ownerAddress: text("owner_address").notNull(),
  status: agentStatusEnum("status").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const wallets = pgTable(
  "aegis_wallets",
  {
    walletId: text("wallet_id").primaryKey(),
    agentId: text("agent_id")
      .notNull()
      .references(() => agents.agentId),
    networkId: text("network_id").notNull().default(NETWORK_ID),
    safeAddress: text("safe_address").notNull(),
    status: walletStatusEnum("status").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  table => ({
    agentIdx: index("aegis_wallets_agent_idx").on(table.agentId),
    agentWalletUnique: uniqueIndex("aegis_wallets_agent_wallet_unique").on(table.agentId, table.walletId),
    agentNetworkUnique: uniqueIndex("aegis_wallets_agent_network_unique").on(table.agentId, table.networkId),
    networkSafeUnique: uniqueIndex("aegis_wallets_network_safe_unique").on(table.networkId, table.safeAddress),
    networkCheck: check("aegis_wallets_network_check", sql.raw(`"network_id" = 'hedera:testnet'`)),
  }),
);

export const walletCreationOperations = pgTable(
  "aegis_wallet_creation_operations",
  {
    operationId: text("operation_id").primaryKey(),
    agentId: text("agent_id")
      .notNull()
      .references(() => agents.agentId),
    networkId: text("network_id").notNull().default(NETWORK_ID),
    walletId: text("wallet_id").notNull(),
    recoveryGuardianAddress: text("recovery_guardian_address").notNull(),
    guardianSource: walletGuardianSourceEnum("guardian_source").notNull(),
    saltNonce: text("salt_nonce").notNull(),
    status: walletCreationStatusEnum("status").notNull(),
    predictedSafeAddress: text("predicted_safe_address"),
    transactionHash: text("transaction_hash"),
    owners: jsonb("owners").$type<`0x${string}`[]>(),
    threshold: integer("threshold"),
    deploymentProvenance: walletDeploymentProvenanceEnum(
      "deployment_provenance",
    ),
    failureCode: text("failure_code"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  table => ({
    agentNetworkUnique: uniqueIndex(
      "aegis_wallet_creation_operations_agent_network_unique",
    ).on(table.agentId, table.networkId),
    walletUnique: uniqueIndex(
      "aegis_wallet_creation_operations_wallet_unique",
    ).on(table.walletId),
    networkCheck: check(
      "aegis_wallet_creation_operations_network_check",
      sql.raw(`"network_id" = 'hedera:testnet'`),
    ),
    saltNonceCheck: check(
      "aegis_wallet_creation_operations_salt_nonce_check",
      sql.raw(`"salt_nonce" ~ '^(0|[1-9][0-9]*)$'`),
    ),
    thresholdCheck: check(
      "aegis_wallet_creation_operations_threshold_check",
      sql.raw(`"threshold" IS NULL OR "threshold" > 0`),
    ),
    failureCodeCheck: check(
      "aegis_wallet_creation_operations_failure_code_check",
      sql.raw(
        `"failure_code" IS NULL OR "failure_code" = 'TRANSACTION_REVERTED'`,
      ),
    ),
  }),
);

export const policies = pgTable(
  "aegis_policies",
  {
    policyId: text("policy_id").primaryKey(),
    policySeriesId: text("policy_series_id").notNull(),
    agentId: text("agent_id")
      .notNull()
      .references(() => agents.agentId),
    walletId: text("wallet_id")
      .notNull()
      .references(() => wallets.walletId),
    policyVersion: integer("policy_version").notNull(),
    policyHash: text("policy_hash").notNull(),
    status: policyStatusEnum("status").notNull(),
    validFrom: integer("valid_from").notNull(),
    validUntil: integer("valid_until"),
    rules: jsonb("rules").$type<PolicyRules>().notNull(),
    semanticRules: jsonb("semantic_rules").$type<SemanticRule[]>().notNull(),
    operatorAddress: text("operator_address").notNull(),
    operatorSignature: text("operator_signature").notNull(),
    operatorMessage: text("operator_message").notNull(),
    operatorCommitment: text("operator_commitment").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    activatedAt: integer("activated_at"),
    revokedAt: integer("revoked_at"),
    supersededAt: integer("superseded_at"),
    supersededByPolicyId: text("superseded_by_policy_id"),
  },
  table => ({
    activeUnique: uniqueIndex("aegis_policies_one_active_per_wallet").on(table.agentId, table.walletId).where(sql.raw(`"status" = 'ACTIVE'`)),
    agentWalletIdx: index("aegis_policies_agent_wallet_idx").on(table.agentId, table.walletId),
    agentWalletFk: foreignKey({
      name: "aegis_policies_agent_wallet_fk",
      columns: [table.agentId, table.walletId],
      foreignColumns: [wallets.agentId, wallets.walletId],
    }),
    seriesVersionUnique: uniqueIndex("aegis_policies_series_version_unique").on(table.policySeriesId, table.policyVersion),
  }),
);

export const assetCatalog = pgTable(
  "aegis_asset_catalog",
  {
    assetId: text("asset_id").primaryKey(),
    networkId: text("network_id").notNull().default(NETWORK_ID),
    kind: assetCatalogKindEnum("kind").notNull(),
    hederaTokenId: text("hedera_token_id"),
    symbol: text("symbol"),
    decimals: integer("decimals").notNull(),
    status: assetCatalogStatusEnum("status").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  table => ({
    networkCheck: check("aegis_asset_catalog_network_check", sql.raw(`"network_id" = 'hedera:testnet'`)),
    decimalsCheck: check("aegis_asset_catalog_decimals_check", sql.raw(`"decimals" >= 0 AND "decimals" <= 30`)),
    hbarCheck: check(
      "aegis_asset_catalog_hbar_check",
      sql.raw(
        `("kind" <> 'HBAR') OR ("asset_id" = 'hedera:testnet:hbar' AND "hedera_token_id" IS NULL AND "decimals" = 8)`,
      ),
    ),
    htsCheck: check(
      "aegis_asset_catalog_hts_check",
      sql.raw(`("kind" <> 'HTS_FUNGIBLE') OR ("asset_id" LIKE 'hedera:testnet:hts:%' AND "hedera_token_id" IS NOT NULL)`),
    ),
  }),
);

export const walletNonces = pgTable("aegis_wallet_nonces", {
  walletId: text("wallet_id")
    .primaryKey()
    .references(() => wallets.walletId),
  nextNonce: bigint("next_nonce", { mode: "bigint" }).notNull().default(sql`1`),
  updatedAt: integer("updated_at").notNull(),
});

export const actionRequests = pgTable(
  "aegis_action_requests",
  {
    requestId: text("request_id").primaryKey(),
    agentId: text("agent_id").notNull(),
    walletId: text("wallet_id").notNull(),
    idempotencyKeyHash: text("idempotency_key_hash").notNull(),
    requestPayloadHash: text("request_payload_hash").notNull(),
    legacySemanticContextHash: text("semantic_context_hash"),
    actionHashSchemaVersion: text("action_hash_schema_version"),
    actionType: text("action_type"),
    destinationKind: text("destination_kind"),
    destinationValue: text("destination_value"),
    destinationChainId: integer("destination_chain_id"),
    assetId: text("asset_id"),
    amount: text("amount"),
    actionDeadline: integer("action_deadline"),
    aegisNonce: bigint("aegis_nonce", { mode: "bigint" }),
    policyId: text("policy_id"),
    policyVersion: integer("policy_version"),
    policyHash: text("policy_hash"),
    actionHash: text("action_hash").notNull(),
    status: actionRequestStatusEnum("status").notNull(),
    functionalResponse: jsonb("functional_response").$type<Record<string, unknown>>().notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  table => ({
    idempotencyUnique: uniqueIndex("aegis_action_requests_idempotency_unique").on(table.agentId, table.idempotencyKeyHash),
    walletNonceUnique: uniqueIndex("aegis_action_requests_wallet_nonce_unique").on(table.walletId, table.aegisNonce),
    agentWalletIdx: index("aegis_action_requests_agent_wallet_idx").on(table.agentId, table.walletId),
    policyIdx: index("aegis_action_requests_policy_idx").on(table.policyId),
    actionCommitmentCheck: check(
      "aegis_action_requests_action_commitment_check",
      sql.raw(`(
        "action_hash_schema_version" IS NULL
        AND "action_type" IS NULL
        AND "destination_kind" IS NULL
        AND "destination_value" IS NULL
        AND "destination_chain_id" IS NULL
        AND "asset_id" IS NULL
        AND "amount" IS NULL
        AND "action_deadline" IS NULL
      ) OR (
        "action_hash_schema_version" = 'aegis.action.level1.v2'
        AND "action_type" IS NOT NULL
        AND btrim("action_type") <> ''
        AND "destination_kind" IN ('EVM_ADDRESS', 'HEDERA_ACCOUNT_ID', 'URL_ORIGIN')
        AND "destination_value" IS NOT NULL
        AND btrim("destination_value") <> ''
        AND "asset_id" IS NOT NULL
        AND btrim("asset_id") <> ''
        AND "amount" ~ '^[1-9][0-9]*$'
        AND "action_deadline" >= 0
        AND (
          ("destination_kind" = 'EVM_ADDRESS' AND "destination_chain_id" = 296)
          OR ("destination_kind" = 'HEDERA_ACCOUNT_ID' AND ("destination_chain_id" IS NULL OR "destination_chain_id" = 296))
          OR ("destination_kind" = 'URL_ORIGIN' AND "destination_chain_id" IS NULL)
        )
      )`),
    ),
  }),
);

export const precheckRecords = pgTable(
  "aegis_precheck_records",
  {
    precheckId: text("precheck_id").primaryKey(),
    requestId: text("request_id")
      .notNull()
      .references(() => actionRequests.requestId),
    agentId: text("agent_id").notNull(),
    walletId: text("wallet_id").notNull(),
    policyId: text("policy_id"),
    policyVersion: integer("policy_version"),
    policyHash: text("policy_hash"),
    actionHash: text("action_hash").notNull(),
    aegisNonce: bigint("aegis_nonce", { mode: "bigint" }),
    evaluatedAt: integer("evaluated_at").notNull(),
    status: precheckRecordStatusEnum("status").notNull(),
    reasonCode: text("reason_code"),
    usageHoldId: text("usage_hold_id"),
    evaluatorVersion: text("evaluator_version").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  table => ({
    requestUnique: uniqueIndex("aegis_precheck_records_request_unique").on(table.requestId),
    agentWalletIdx: index("aegis_precheck_records_agent_wallet_idx").on(table.agentId, table.walletId),
  }),
);

export const usageHolds = pgTable(
  "aegis_usage_holds",
  {
    usageHoldId: text("usage_hold_id").primaryKey(),
    requestId: text("request_id")
      .notNull()
      .references(() => actionRequests.requestId),
    precheckId: text("precheck_id")
      .notNull()
      .references(() => precheckRecords.precheckId),
    agentId: text("agent_id").notNull(),
    walletId: text("wallet_id").notNull(),
    policyId: text("policy_id").notNull(),
    policyVersion: integer("policy_version").notNull(),
    policyHash: text("policy_hash").notNull(),
    assetId: text("asset_id")
      .notNull()
      .references(() => assetCatalog.assetId),
    amount: text("amount").notNull(),
    actionCount: integer("action_count").notNull(),
    status: usageHoldStatusEnum("status").notNull(),
    heldAt: integer("held_at").notNull(),
    expiresAt: integer("expires_at").notNull(),
    releasedAt: integer("released_at"),
    expiredAt: integer("expired_at"),
    committedAt: integer("committed_at"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  table => ({
    requestUnique: uniqueIndex("aegis_usage_holds_request_unique").on(table.requestId),
    precheckUnique: uniqueIndex("aegis_usage_holds_precheck_unique").on(table.precheckId),
    policyWalletIdx: index("aegis_usage_holds_policy_wallet_idx").on(table.agentId, table.walletId, table.policyId),
    activeIdx: index("aegis_usage_holds_active_idx").on(table.walletId, table.policyId, table.status, table.expiresAt),
    amountCheck: check("aegis_usage_holds_amount_check", sql.raw(`"amount" ~ '^(0|[1-9][0-9]*)$' AND "amount" <> '0'`)),
    actionCountCheck: check("aegis_usage_holds_action_count_check", sql.raw(`"action_count" = 1`)),
  }),
);

export const auditEvents = pgTable(
  "aegis_audit_events",
  {
    eventId: text("event_id").primaryKey(),
    schemaVersion: text("schema_version").notNull(),
    eventType: text("event_type").notNull(),
    occurredAt: integer("occurred_at").notNull(),
    requestId: text("request_id").notNull(),
    precheckId: text("precheck_id").notNull(),
    agentId: text("agent_id").notNull(),
    walletId: text("wallet_id").notNull(),
    policyId: text("policy_id"),
    policyVersion: integer("policy_version"),
    policyHash: text("policy_hash"),
    actionHash: text("action_hash").notNull(),
    stage: text("stage").notNull(),
    outcome: text("outcome").notNull(),
    reasonCode: text("reason_code"),
    networkId: text("network_id").notNull(),
    idempotencyKeyHash: text("idempotency_key_hash").notNull(),
    requestPayloadHash: text("request_payload_hash").notNull(),
    usageHoldId: text("usage_hold_id"),
    actorType: text("actor_type").notNull(),
    retentionUntil: integer("retention_until").notNull(),
  },
  table => ({
    requestIdx: index("aegis_audit_events_request_idx").on(table.requestId),
    precheckIdx: index("aegis_audit_events_precheck_idx").on(table.precheckId),
    stageCheck: check("aegis_audit_events_stage_check", sql.raw(`"stage" = 'PRECHECK'`)),
    actorTypeCheck: check("aegis_audit_events_actor_type_check", sql.raw(`"actor_type" = 'AGENT'`)),
    networkCheck: check("aegis_audit_events_network_check", sql.raw(`"network_id" = 'hedera:testnet'`)),
  }),
);

export const agentSemanticProfiles = pgTable(
  "aegis_agent_semantic_profiles",
  {
    agentId: text("agent_id")
      .primaryKey()
      .references(() => agents.agentId),
    agenticId: text("agentic_id").notNull(),
    contractAddress: text("contract_address").notNull(),
    tokenId: text("token_id").notNull(),
    metadataHash: text("metadata_hash").notNull(),
    capabilityIds: jsonb("capability_ids").$type<string[]>().notNull(),
    registeredAt: integer("registered_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  table => ({
    agenticIdUnique: uniqueIndex("aegis_agent_semantic_profiles_agentic_id_unique").on(table.agenticId),
    identityCheck: check(
      "aegis_agent_semantic_profiles_identity_check",
      sql.raw(`(
        "contract_address" ~ '^0x[0-9a-f]{40}$'
        AND "token_id" ~ '^(0|[1-9][0-9]*)$'
        AND "metadata_hash" ~ '^0x[0-9a-f]{64}$'
        AND jsonb_typeof("capability_ids") = 'array'
        AND jsonb_array_length("capability_ids") BETWEEN 1 AND 20
      )`),
    ),
  }),
);

export const agenticIdRegistrations = pgTable(
  "aegis_agentic_id_registrations",
  {
    agentId: text("agent_id")
      .primaryKey()
      .references(() => agents.agentId),
    registrationHash: text("registration_hash").notNull(),
    status: agenticIdRegistrationStatusEnum("status").notNull(),
    metadataUri: text("metadata_uri"),
    explorerUrl: text("explorer_url"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    completedAt: integer("completed_at"),
  },
  table => ({
    registrationHashCheck: check(
      "aegis_agentic_id_registrations_hash_check",
      sql.raw(`"registration_hash" ~ '^0x[0-9a-f]{64}$'`),
    ),
    completionCheck: check(
      "aegis_agentic_id_registrations_completion_check",
      sql.raw(`(
        (
          "status" = 'COMPLETED'
          AND "metadata_uri" IS NOT NULL
          AND length("metadata_uri") BETWEEN 1 AND 2048
          AND "explorer_url" IS NOT NULL
          AND length("explorer_url") BETWEEN 1 AND 2048
          AND "completed_at" IS NOT NULL
        )
        OR
        (
          "status" IN ('PROCESSING', 'UNKNOWN')
          AND "metadata_uri" IS NULL
          AND "explorer_url" IS NULL
          AND "completed_at" IS NULL
        )
      )`),
    ),
  }),
);

export const teemlVerifications = pgTable(
  "aegis_teeml_verifications",
  {
    verificationId: text("verification_id").primaryKey(),
    requestId: text("request_id")
      .notNull()
      .references(() => actionRequests.requestId),
    precheckId: text("precheck_id")
      .notNull()
      .references(() => precheckRecords.precheckId),
    agentId: text("agent_id").notNull(),
    agenticId: text("agentic_id").notNull(),
    policyId: text("policy_id").notNull(),
    policyVersion: integer("policy_version").notNull(),
    policyHash: text("policy_hash").notNull(),
    actionHash: text("action_hash").notNull(),
    semanticContextHash: text("semantic_context_hash").notNull(),
    teemlRequestHash: text("teeml_request_hash").notNull(),
    status: teemlVerificationStatusEnum("status").notNull(),
    verdict: text("verdict"),
    reasonCode: text("reason_code"),
    technicalReasonCode: text("technical_reason_code"),
    providerAddress: text("provider_address"),
    modelId: text("model_id"),
    securityProfile: text("security_profile"),
    trustMode: text("trust_mode"),
    verificationMode: text("verification_mode"),
    sealedInference: boolean("sealed_inference"),
    teeVerified: boolean("tee_verified"),
    responseId: text("response_id"),
    responseHash: text("response_hash"),
    traceHash: text("trace_hash"),
    promptTokens: integer("prompt_tokens"),
    completionTokens: integer("completion_tokens"),
    latencyMs: integer("latency_ms"),
    evaluatedAt: integer("evaluated_at"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  table => ({
    requestUnique: uniqueIndex("aegis_teeml_verifications_request_unique").on(table.requestId),
    precheckUnique: uniqueIndex("aegis_teeml_verifications_precheck_unique").on(table.precheckId),
    contextCommitmentCheck: check(
      "aegis_teeml_verifications_context_commitment_check",
      sql.raw(`(
        "policy_hash" ~ '^0x[0-9a-f]{64}$'
        AND "action_hash" ~ '^0x[0-9a-f]{64}$'
        AND "semantic_context_hash" ~ '^0x[0-9a-f]{64}$'
        AND "teeml_request_hash" ~ '^0x[0-9a-f]{64}$'
      )`),
    ),
    resultCheck: check(
      "aegis_teeml_verifications_result_check",
      sql.raw(`(
        ("status" = 'PROCESSING'
          AND "verdict" IS NULL
          AND "reason_code" IS NULL
          AND "technical_reason_code" IS NULL
          AND "response_hash" IS NULL)
        OR
        ("status" IN ('ALLOWED', 'TEETLS_HACKATHON_ALLOWED', 'DENIED')
          AND "verdict" IS NOT NULL
          AND "verdict" = CASE WHEN "status" = 'DENIED' THEN 'DENY' ELSE 'ALLOW' END
          AND "reason_code" IS NOT NULL
          AND "technical_reason_code" IS NULL
          AND "model_id" IS NOT NULL
          AND "security_profile" IS NOT NULL
          AND "trust_mode" IS NOT NULL
          AND "verification_mode" IS NOT NULL
          AND "sealed_inference" IS NOT NULL
          AND (
            ("status" = 'ALLOWED'
              AND "security_profile" = 'production-private-teeml'
              AND "trust_mode" = 'private'
              AND "verification_mode" = 'TeeML'
              AND "sealed_inference" = true)
            OR
            ("status" = 'TEETLS_HACKATHON_ALLOWED'
              AND "security_profile" = 'hackathon-testnet-teetls'
              AND "trust_mode" = 'verified'
              AND "verification_mode" = 'TeeTLS'
              AND "sealed_inference" = false)
            OR
            ("status" = 'DENIED'
              AND (
                ("security_profile" = 'production-private-teeml'
                  AND "trust_mode" = 'private'
                  AND "verification_mode" = 'TeeML'
                  AND "sealed_inference" = true)
                OR
                ("security_profile" = 'hackathon-testnet-teetls'
                  AND "trust_mode" = 'verified'
                  AND "verification_mode" = 'TeeTLS'
                  AND "sealed_inference" = false)
              ))
          )
          AND "tee_verified" IS NOT NULL
          AND "tee_verified" = true
          AND "response_hash" IS NOT NULL
          AND "response_hash" ~ '^0x[0-9a-f]{64}$'
          AND "latency_ms" IS NOT NULL
          AND "latency_ms" >= 0
          AND "evaluated_at" IS NOT NULL)
        OR
        ("status" = 'FAILED'
          AND "verdict" IS NULL
          AND "reason_code" IS NULL
          AND "technical_reason_code" IS NOT NULL)
      )`),
    ),
  }),
);

export const teemlAuditEvents = pgTable(
  "aegis_teeml_audit_events",
  {
    eventId: text("event_id").primaryKey(),
    verificationId: text("verification_id").references(() => teemlVerifications.verificationId),
    requestId: text("request_id").notNull(),
    precheckId: text("precheck_id").notNull(),
    agentId: text("agent_id").notNull(),
    policyHash: text("policy_hash").notNull(),
    actionHash: text("action_hash").notNull(),
    semanticContextHash: text("semantic_context_hash"),
    teemlRequestHash: text("teeml_request_hash"),
    outcome: text("outcome").notNull(),
    reasonCode: text("reason_code").notNull(),
    occurredAt: integer("occurred_at").notNull(),
    retentionUntil: integer("retention_until").notNull(),
  },
  table => ({
    requestUnique: uniqueIndex("aegis_teeml_audit_events_request_unique").on(table.requestId),
    outcomeCheck: check(
      "aegis_teeml_audit_events_outcome_check",
      sql.raw(`(
        ("outcome" IN ('TEEML_ALLOWED', 'TEETLS_HACKATHON_ALLOWED', 'TEEML_DENIED')
          AND "verification_id" IS NOT NULL
          AND "semantic_context_hash" IS NOT NULL
          AND "semantic_context_hash" ~ '^0x[0-9a-f]{64}$'
          AND "teeml_request_hash" IS NOT NULL
          AND "teeml_request_hash" ~ '^0x[0-9a-f]{64}$')
        OR
        ("outcome" = 'TEEML_FAILED'
          AND (("semantic_context_hash" IS NULL AND "teeml_request_hash" IS NULL)
            OR ("semantic_context_hash" ~ '^0x[0-9a-f]{64}$'
              AND "teeml_request_hash" ~ '^0x[0-9a-f]{64}$')))
      )`),
    ),
  }),
);

export const executionStatusEnum = pgEnum("aegis_execution_status", ["EXECUTED"]);

export const executions = pgTable(
  "aegis_executions",
  {
    executionId: text("execution_id").primaryKey(),
    requestId: text("request_id")
      .notNull()
      .references(() => actionRequests.requestId),
    teemlVerificationId: text("teeml_verification_id")
      .notNull()
      .references(() => teemlVerifications.verificationId),
    agentId: text("agent_id").notNull(),
    walletId: text("wallet_id").notNull(),
    policyId: text("policy_id").notNull(),
    policyVersion: integer("policy_version").notNull(),
    policyHash: text("policy_hash").notNull(),
    actionHash: text("action_hash").notNull(),
    destinationKind: text("destination_kind").notNull(),
    destinationValue: text("destination_value").notNull(),
    assetId: text("asset_id").notNull(),
    amount: text("amount").notNull(),
    feeAmount: text("fee_amount").notNull(),
    feeRecipientAddress: text("fee_recipient_address").notNull(),
    teemlRequestHash: text("teeml_request_hash").notNull(),
    semanticContextHash: text("semantic_context_hash").notNull(),
    decisionReceiptSignature: text("decision_receipt_signature").notNull(),
    safeAddress: text("safe_address").notNull(),
    safeTxHash: text("safe_tx_hash").notNull(),
    transactionHash: text("transaction_hash").notNull(),
    status: executionStatusEnum("status").notNull(),
    decidedAt: integer("decided_at").notNull(),
    executedAt: integer("executed_at").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  table => ({
    requestUnique: uniqueIndex("aegis_executions_request_unique").on(table.requestId),
    formatCheck: check(
      "aegis_executions_format_check",
      sql.raw(`(
        "policy_hash" ~ '^0x[0-9a-f]{64}$'
        AND "action_hash" ~ '^0x[0-9a-f]{64}$'
        AND "teeml_request_hash" ~ '^0x[0-9a-f]{64}$'
        AND "semantic_context_hash" ~ '^0x[0-9a-f]{64}$'
        AND "fee_recipient_address" ~ '^0x[0-9a-fA-F]{40}$'
        AND "safe_address" ~ '^0x[0-9a-fA-F]{40}$'
        AND "amount" ~ '^[0-9]+$'
        AND "fee_amount" ~ '^[0-9]+$'
      )`),
    ),
  }),
);
