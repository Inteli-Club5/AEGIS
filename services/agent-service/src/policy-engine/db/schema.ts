import { sql } from "drizzle-orm";
import { bigint, check, foreignKey, index, integer, jsonb, pgEnum, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { NETWORK_ID, type PolicyRules, type SemanticRule } from "../types.js";

export const agentStatusEnum = pgEnum("aegis_agent_status", ["ACTIVE", "PAUSED", "RETIRED"]);
export const walletStatusEnum = pgEnum("aegis_wallet_status", ["PROTECTED", "PAUSED", "RETIRED", "DEAD"]);
export const policyStatusEnum = pgEnum("aegis_policy_status", ["DRAFT", "ACTIVE", "SUPERSEDED", "REVOKED"]);
export const assetCatalogKindEnum = pgEnum("aegis_asset_catalog_kind", ["HBAR", "HTS_FUNGIBLE"]);
export const assetCatalogStatusEnum = pgEnum("aegis_asset_catalog_status", ["ACTIVE", "DISABLED"]);
export const actionRequestStatusEnum = pgEnum("aegis_action_request_status", ["RECEIVED", "DENIED_PRECHECK", "PENDING_TEEML"]);
export const precheckRecordStatusEnum = pgEnum("aegis_precheck_record_status", ["PASS_TO_TEEML", "DENY_PRECHECK"]);
export const usageHoldStatusEnum = pgEnum("aegis_usage_hold_status", ["HELD", "RELEASED", "EXPIRED", "COMMITTED"]);

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
    networkSafeUnique: uniqueIndex("aegis_wallets_network_safe_unique").on(table.networkId, table.safeAddress),
    networkCheck: check("aegis_wallets_network_check", sql.raw(`"network_id" = 'hedera:testnet'`)),
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
  nextNonce: bigint("next_nonce", { mode: "bigint" }).notNull().default(1n),
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
    privatePayload: jsonb("private_payload").$type<Record<string, unknown>>().notNull(),
    reasonHash: text("reason_hash"),
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
