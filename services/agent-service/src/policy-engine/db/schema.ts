import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, jsonb, pgEnum, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { NETWORK_ID, type PolicyRules, type SemanticRule } from "../types.js";

export const agentStatusEnum = pgEnum("aegis_agent_status", ["ACTIVE", "PAUSED", "RETIRED"]);
export const walletStatusEnum = pgEnum("aegis_wallet_status", ["PROTECTED", "PAUSED", "RETIRED", "DEAD"]);
export const policyStatusEnum = pgEnum("aegis_policy_status", ["DRAFT", "ACTIVE", "SUPERSEDED", "REVOKED"]);

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
