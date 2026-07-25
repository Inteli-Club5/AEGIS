import { and, desc, eq, sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import { PolicyEngineError, conflict, notFound } from "../errors.js";
import { type PolicyRepository, type SupersededPolicySummary } from "../repository.js";
import {
  NETWORK_ID,
  type AgentRecord,
  type OperatorProof,
  type PolicyRecord,
  type WalletRecord,
} from "../types.js";
import * as schema from "./schema.js";

const { Pool } = pg;

type PolicyDb = NodePgDatabase<typeof schema>;
type PolicyRow = typeof schema.policies.$inferSelect;
type AgentRow = typeof schema.agents.$inferSelect;
type WalletRow = typeof schema.wallets.$inferSelect;

export function createPostgresPolicyRepository(connectionString: string): PostgresPolicyRepository {
  const pool = new Pool({ connectionString });
  const db = drizzle(pool, { schema });
  return new PostgresPolicyRepository(db);
}

export class PostgresPolicyRepository implements PolicyRepository {
  constructor(private readonly db: PolicyDb) {}

  async getAgent(agentId: string): Promise<AgentRecord | null> {
    const [row] = await this.db.select().from(schema.agents).where(eq(schema.agents.agentId, agentId.toLowerCase())).limit(1);
    return row ? mapAgent(row) : null;
  }

  async getWallet(walletId: string): Promise<WalletRecord | null> {
    const [row] = await this.db.select().from(schema.wallets).where(eq(schema.wallets.walletId, walletId.toLowerCase())).limit(1);
    return row ? mapWallet(row) : null;
  }

  async saveAgent(agent: AgentRecord): Promise<AgentRecord> {
    const [row] = await this.db
      .insert(schema.agents)
      .values({
        ...agent,
        agentId: agent.agentId.toLowerCase(),
        ownerAddress: agent.ownerAddress.toLowerCase(),
      })
      .onConflictDoUpdate({
        target: schema.agents.agentId,
        set: {
          ownerAddress: agent.ownerAddress.toLowerCase(),
          status: agent.status,
          updatedAt: agent.updatedAt,
        },
      })
      .returning();
    return mapAgent(row);
  }

  async saveWallet(wallet: WalletRecord): Promise<WalletRecord> {
    const [row] = await this.db
      .insert(schema.wallets)
      .values({
        ...wallet,
        walletId: wallet.walletId.toLowerCase(),
        agentId: wallet.agentId.toLowerCase(),
        networkId: NETWORK_ID,
        safeAddress: wallet.safeAddress.toLowerCase(),
      })
      .onConflictDoUpdate({
        target: schema.wallets.walletId,
        set: {
          agentId: wallet.agentId.toLowerCase(),
          networkId: NETWORK_ID,
          safeAddress: wallet.safeAddress.toLowerCase(),
          status: wallet.status,
          updatedAt: wallet.updatedAt,
        },
      })
      .returning();
    return mapWallet(row);
  }

  async insertPolicy(policy: PolicyRecord): Promise<PolicyRecord> {
    try {
      const [row] = await this.db.insert(schema.policies).values(toPolicyRow(policy)).returning();
      return mapPolicy(row);
    } catch (error) {
      throw mapPgConflict(error);
    }
  }

  async getPolicy(policyId: string): Promise<PolicyRecord | null> {
    const [row] = await this.db.select().from(schema.policies).where(eq(schema.policies.policyId, policyId.toLowerCase())).limit(1);
    return row ? mapPolicy(row) : null;
  }

  async listPolicyVersions(policyId: string): Promise<PolicyRecord[]> {
    const policy = await this.getPolicy(policyId);
    if (!policy) notFound("policy_not_found", "policy not found");

    const rows = await this.db
      .select()
      .from(schema.policies)
      .where(eq(schema.policies.policySeriesId, policy.policySeriesId))
      .orderBy(schema.policies.policyVersion);
    return rows.map(mapPolicy);
  }

  async getActivePolicy(agentId: string, walletId: string): Promise<PolicyRecord | null> {
    const [row] = await this.db
      .select()
      .from(schema.policies)
      .where(
        and(
          eq(schema.policies.agentId, agentId.toLowerCase()),
          eq(schema.policies.walletId, walletId.toLowerCase()),
          eq(schema.policies.status, "ACTIVE"),
        ),
      )
      .limit(1);
    return row ? mapPolicy(row) : null;
  }

  async getLatestPolicyVersion(policySeriesId: string): Promise<PolicyRecord | null> {
    const [row] = await this.db
      .select()
      .from(schema.policies)
      .where(eq(schema.policies.policySeriesId, policySeriesId))
      .orderBy(desc(schema.policies.policyVersion))
      .limit(1);
    return row ? mapPolicy(row) : null;
  }

  async activatePolicy(policyId: string, proof: OperatorProof, now: number): Promise<{
    policy: PolicyRecord;
    supersededPolicy: SupersededPolicySummary | null;
  }> {
    try {
      return await this.db.transaction(async tx => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`policy:${policyId.toLowerCase()}`}, 0))`);
        const [targetRow] = await tx.select().from(schema.policies).where(eq(schema.policies.policyId, policyId.toLowerCase())).limit(1);
        if (!targetRow) notFound("policy_not_found", "policy not found");
        const target = mapPolicy(targetRow);

        await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`agent-wallet:${target.agentId}:${target.walletId}`}, 0))`);

        if (target.status !== "DRAFT") {
          conflict("policy_not_activatable", "only DRAFT policies can be activated");
        }
        if (target.validUntil !== null && now > target.validUntil) {
          conflict("policy_expired", "expired policies cannot be activated");
        }

        const [previousActiveRow] = await tx
          .select()
          .from(schema.policies)
          .where(and(eq(schema.policies.agentId, target.agentId), eq(schema.policies.walletId, target.walletId), eq(schema.policies.status, "ACTIVE")))
          .limit(1);

        let supersededPolicy: SupersededPolicySummary | null = null;
        if (previousActiveRow) {
          const [supersededRow] = await tx
            .update(schema.policies)
            .set({
              status: "SUPERSEDED",
              updatedAt: now,
              supersededAt: now,
              supersededByPolicyId: target.policyId,
            })
            .where(eq(schema.policies.policyId, previousActiveRow.policyId))
            .returning();
          const superseded = mapPolicy(supersededRow);
          supersededPolicy = {
            policyId: superseded.policyId,
            policyVersion: superseded.policyVersion,
            policyHash: superseded.policyHash,
            status: "SUPERSEDED",
          };
        }

        const [activatedRow] = await tx
          .update(schema.policies)
          .set({
            status: "ACTIVE",
            updatedAt: now,
            activatedAt: now,
            revokedAt: null,
            supersededAt: null,
            supersededByPolicyId: null,
            operatorAddress: proof.operatorAddress,
            operatorSignature: proof.operatorSignature,
            operatorMessage: proof.operatorMessage,
            operatorCommitment: proof.operatorCommitment,
          })
          .where(and(eq(schema.policies.policyId, target.policyId), eq(schema.policies.status, "DRAFT")))
          .returning();

        if (!activatedRow) {
          conflict("policy_not_activatable", "only DRAFT policies can be activated");
        }

        return { policy: mapPolicy(activatedRow), supersededPolicy };
      });
    } catch (error) {
      throw mapPgConflict(error);
    }
  }

  async revokePolicy(policyId: string, proof: OperatorProof, now: number): Promise<PolicyRecord> {
    return this.db.transaction(async tx => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`policy:${policyId.toLowerCase()}`}, 0))`);
      const [currentRow] = await tx.select().from(schema.policies).where(eq(schema.policies.policyId, policyId.toLowerCase())).limit(1);
      if (!currentRow) notFound("policy_not_found", "policy not found");
      if (currentRow.status === "REVOKED") {
        conflict("policy_already_revoked", "policy is already revoked");
      }

      const [row] = await tx
        .update(schema.policies)
        .set({
          status: "REVOKED",
          updatedAt: now,
          revokedAt: now,
          operatorAddress: proof.operatorAddress,
          operatorSignature: proof.operatorSignature,
          operatorMessage: proof.operatorMessage,
          operatorCommitment: proof.operatorCommitment,
        })
        .where(eq(schema.policies.policyId, policyId.toLowerCase()))
        .returning();

      if (!row) notFound("policy_not_found", "policy not found");
      return mapPolicy(row);
    });
  }
}

export class UnconfiguredPolicyRepository implements PolicyRepository {
  async getAgent(): Promise<never> {
    this.throwUnconfigured();
  }
  async getWallet(): Promise<never> {
    this.throwUnconfigured();
  }
  async saveAgent(): Promise<never> {
    this.throwUnconfigured();
  }
  async saveWallet(): Promise<never> {
    this.throwUnconfigured();
  }
  async insertPolicy(): Promise<never> {
    this.throwUnconfigured();
  }
  async getPolicy(): Promise<never> {
    this.throwUnconfigured();
  }
  async listPolicyVersions(): Promise<never> {
    this.throwUnconfigured();
  }
  async getActivePolicy(): Promise<never> {
    this.throwUnconfigured();
  }
  async getLatestPolicyVersion(): Promise<never> {
    this.throwUnconfigured();
  }
  async activatePolicy(): Promise<never> {
    this.throwUnconfigured();
  }
  async revokePolicy(): Promise<never> {
    this.throwUnconfigured();
  }

  private throwUnconfigured(): never {
    throw new PolicyEngineError(503, "policy_database_unconfigured", "DATABASE_URL is required for Policy Engine persistence");
  }
}

function toPolicyRow(policy: PolicyRecord): typeof schema.policies.$inferInsert {
  return {
    policyId: policy.policyId,
    policySeriesId: policy.policySeriesId,
    agentId: policy.agentId,
    walletId: policy.walletId,
    policyVersion: policy.policyVersion,
    policyHash: policy.policyHash,
    status: policy.status,
    validFrom: policy.validFrom,
    validUntil: policy.validUntil,
    rules: policy.rules,
    semanticRules: policy.semanticRules,
    operatorAddress: policy.operatorAddress,
    operatorSignature: policy.operatorSignature,
    operatorMessage: policy.operatorMessage,
    operatorCommitment: policy.operatorCommitment,
    createdAt: policy.createdAt,
    updatedAt: policy.updatedAt,
    activatedAt: policy.activatedAt,
    revokedAt: policy.revokedAt,
    supersededAt: policy.supersededAt,
    supersededByPolicyId: policy.supersededByPolicyId,
  };
}

function mapAgent(row: AgentRow): AgentRecord {
  return {
    agentId: row.agentId,
    ownerAddress: row.ownerAddress as `0x${string}`,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapWallet(row: WalletRow): WalletRecord {
  return {
    walletId: row.walletId,
    agentId: row.agentId,
    networkId: NETWORK_ID,
    safeAddress: row.safeAddress as `0x${string}`,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapPolicy(row: PolicyRow): PolicyRecord {
  return {
    policyId: row.policyId,
    policySeriesId: row.policySeriesId,
    agentId: row.agentId,
    walletId: row.walletId,
    policyVersion: row.policyVersion,
    policyHash: row.policyHash as `0x${string}`,
    status: row.status,
    validFrom: row.validFrom,
    validUntil: row.validUntil,
    rules: row.rules,
    semanticRules: row.semanticRules,
    operatorAddress: row.operatorAddress as `0x${string}`,
    operatorSignature: row.operatorSignature as `0x${string}`,
    operatorMessage: row.operatorMessage,
    operatorCommitment: row.operatorCommitment as `0x${string}`,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    activatedAt: row.activatedAt,
    revokedAt: row.revokedAt,
    supersededAt: row.supersededAt,
    supersededByPolicyId: row.supersededByPolicyId,
  };
}

function mapPgConflict(error: unknown): never {
  if (error instanceof PolicyEngineError) throw error;
  if (typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "23505") {
    conflict("database_unique_constraint", "database unique constraint rejected the write");
  }
  throw error;
}
