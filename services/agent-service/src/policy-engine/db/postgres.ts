import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import { PolicyEngineError, conflict, notFound } from "../errors.js";
import {
  ACTION_HASH_SCHEMA,
  type ActionRequestRecord,
  type AssetCatalogEntry,
  type AuditEventRecord,
  type PersistedNormalizedAction,
  type PrecheckRecordRecord,
  type PrecheckRepository,
  type PrecheckTransaction,
  type UsageHoldRecord,
} from "../precheck.js";
import { type PolicyRepository, type SupersededPolicySummary } from "../repository.js";
import {
  NETWORK_ID,
  type AgentRecord,
  type CompleteWalletCreationInput,
  type OperatorProof,
  type PolicyRecord,
  type WalletCreationOperationRecord,
  type WalletCreationFailureCode,
  type WalletRecord,
} from "../types.js";
import * as schema from "./schema.js";

const { Pool } = pg;

type PolicyDb = NodePgDatabase<typeof schema>;
type PolicyRow = typeof schema.policies.$inferSelect;
type AgentRow = typeof schema.agents.$inferSelect;
type WalletRow = typeof schema.wallets.$inferSelect;
type WalletCreationOperationRow =
  typeof schema.walletCreationOperations.$inferSelect;

export function createPostgresPolicyRepository(connectionString: string): PostgresPolicyRepository {
  const pool = new Pool({ connectionString });
  const walletCreationLockPool = new Pool({ connectionString });
  const db = drizzle(pool, { schema });
  return new PostgresPolicyRepository(db, walletCreationLockPool);
}

export function createPostgresPrecheckRepository(connectionString: string, options: PostgresPrecheckRepositoryOptions = {}): PostgresPrecheckRepository {
  const pool = new Pool({ connectionString });
  return new PostgresPrecheckRepository(pool, options);
}

export class PostgresPolicyRepository implements PolicyRepository {
  constructor(
    private readonly db: PolicyDb,
    private readonly walletCreationLockPool: pg.Pool,
  ) {}

  async withWalletCreationLock<T>(
    agentId: string,
    networkId: typeof NETWORK_ID,
    operation: () => Promise<T>,
  ): Promise<T> {
    const lockKey = `wallet-creation:${agentId.toLowerCase()}:${networkId}`;
    const client = await this.walletCreationLockPool.connect();
    let locked = false;
    try {
      await client.query(
        "select pg_advisory_lock(hashtextextended($1, 0))",
        [lockKey],
      );
      locked = true;
      return await operation();
    } finally {
      try {
        if (locked) {
          const unlock = await client.query(
            "select pg_advisory_unlock(hashtextextended($1, 0)) as unlocked",
            [lockKey],
          );
          if (unlock.rows[0]?.unlocked !== true) {
            throw new Error("wallet_creation_advisory_unlock_failed");
          }
        }
      } finally {
        client.release();
      }
    }
  }

  async getAgent(agentId: string): Promise<AgentRecord | null> {
    const [row] = await this.db.select().from(schema.agents).where(eq(schema.agents.agentId, agentId.toLowerCase())).limit(1);
    return row ? mapAgent(row) : null;
  }

  async getWallet(walletId: string): Promise<WalletRecord | null> {
    const [row] = await this.db.select().from(schema.wallets).where(eq(schema.wallets.walletId, walletId.toLowerCase())).limit(1);
    return row ? mapWallet(row) : null;
  }

  async getWalletByAgentNetwork(
    agentId: string,
    networkId: typeof NETWORK_ID,
  ): Promise<WalletRecord | null> {
    const [row] = await this.db
      .select()
      .from(schema.wallets)
      .where(
        and(
          eq(schema.wallets.agentId, agentId.toLowerCase()),
          eq(schema.wallets.networkId, networkId),
        ),
      )
      .limit(1);
    return row ? mapWallet(row) : null;
  }

  async getWalletCreationOperation(
    agentId: string,
    networkId: typeof NETWORK_ID,
  ): Promise<WalletCreationOperationRecord | null> {
    const [row] = await this.db
      .select()
      .from(schema.walletCreationOperations)
      .where(
        and(
          eq(
            schema.walletCreationOperations.agentId,
            agentId.toLowerCase(),
          ),
          eq(schema.walletCreationOperations.networkId, networkId),
        ),
      )
      .limit(1);
    return row ? mapWalletCreationOperation(row) : null;
  }

  async beginWalletCreation(
    operation: WalletCreationOperationRecord,
  ): Promise<WalletCreationOperationRecord> {
    const normalized = toWalletCreationOperationRow(operation);
    const [inserted] = await this.db
      .insert(schema.walletCreationOperations)
      .values(normalized)
      .onConflictDoNothing({
        target: [
          schema.walletCreationOperations.agentId,
          schema.walletCreationOperations.networkId,
        ],
      })
      .returning();
    if (inserted) return mapWalletCreationOperation(inserted);

    const existing = await this.getWalletCreationOperation(
      operation.agentId,
      operation.networkId,
    );
    if (!existing) {
      throw new Error("wallet_creation_reservation_failed");
    }
    return existing;
  }

  async markWalletCreationPrepared(
    operationId: string,
    predictedSafeAddress: `0x${string}`,
    expectedOwners: `0x${string}`[],
    expectedThreshold: number,
    now: number,
  ): Promise<WalletCreationOperationRecord> {
    const operation = await this.requireWalletCreationOperation(operationId);
    const normalizedAddress = predictedSafeAddress.toLowerCase() as `0x${string}`;
    if (
      operation.predictedSafeAddress !== null &&
      operation.predictedSafeAddress !== normalizedAddress
    ) {
      conflict(
        "wallet_prediction_conflict",
        "the persisted Safe prediction does not match this deployment",
      );
    }
    if (operation.status === "COMPLETED" || operation.status === "BROADCAST") {
      return operation;
    }

    const [row] = await this.db
      .update(schema.walletCreationOperations)
      .set({
        status: "PREPARED",
        predictedSafeAddress: normalizedAddress,
        owners: expectedOwners.map(
          owner => owner.toLowerCase() as `0x${string}`,
        ),
        threshold: expectedThreshold,
        updatedAt: now,
      })
      .where(
        eq(schema.walletCreationOperations.operationId, operation.operationId),
      )
      .returning();
    if (!row) {
      notFound(
        "wallet_creation_operation_not_found",
        "wallet creation operation not found",
      );
    }
    return mapWalletCreationOperation(row);
  }

  async markWalletCreationBroadcast(
    operationId: string,
    transactionHash: `0x${string}`,
    now: number,
  ): Promise<WalletCreationOperationRecord> {
    const operation = await this.requireWalletCreationOperation(operationId);
    const normalizedHash = transactionHash.toLowerCase() as `0x${string}`;
    if (
      operation.transactionHash !== null &&
      operation.transactionHash !== normalizedHash
    ) {
      conflict(
        "wallet_deployment_transaction_conflict",
        "the persisted deployment transaction does not match this deployment",
      );
    }
    if (operation.status === "COMPLETED") return operation;

    const [row] = await this.db
      .update(schema.walletCreationOperations)
      .set({
        status: "BROADCAST",
        transactionHash: normalizedHash,
        failureCode: null,
        updatedAt: now,
      })
      .where(
        eq(schema.walletCreationOperations.operationId, operation.operationId),
      )
      .returning();
    if (!row) {
      notFound(
        "wallet_creation_operation_not_found",
        "wallet creation operation not found",
      );
    }
    return mapWalletCreationOperation(row);
  }

  async markWalletCreationFailed(
    operationId: string,
    transactionHash: `0x${string}`,
    failureCode: WalletCreationFailureCode,
    now: number,
  ): Promise<WalletCreationOperationRecord> {
    const operation = await this.requireWalletCreationOperation(operationId);
    const normalizedHash = transactionHash.toLowerCase() as `0x${string}`;
    if (
      operation.status !== "BROADCAST" ||
      operation.transactionHash !== normalizedHash
    ) {
      conflict(
        "wallet_creation_failure_checkpoint_conflict",
        "only the persisted broadcast transaction can be marked failed",
      );
    }
    const [row] = await this.db
      .update(schema.walletCreationOperations)
      .set({ status: "FAILED", failureCode, updatedAt: now })
      .where(
        eq(schema.walletCreationOperations.operationId, operation.operationId),
      )
      .returning();
    if (!row) {
      notFound(
        "wallet_creation_operation_not_found",
        "wallet creation operation not found",
      );
    }
    return mapWalletCreationOperation(row);
  }

  async resetFailedWalletCreation(
    operationId: string,
    now: number,
  ): Promise<WalletCreationOperationRecord> {
    const operation = await this.requireWalletCreationOperation(operationId);
    if (
      operation.status !== "FAILED" ||
      operation.failureCode !== "TRANSACTION_REVERTED"
    ) {
      conflict(
        "wallet_creation_not_retryable",
        "only a conclusively reverted deployment can be explicitly retried",
      );
    }
    const [row] = await this.db
      .update(schema.walletCreationOperations)
      .set({
        status: "PREPARED",
        transactionHash: null,
        failureCode: null,
        updatedAt: now,
      })
      .where(
        eq(schema.walletCreationOperations.operationId, operation.operationId),
      )
      .returning();
    if (!row) {
      notFound(
        "wallet_creation_operation_not_found",
        "wallet creation operation not found",
      );
    }
    return mapWalletCreationOperation(row);
  }

  async completeWalletCreation(
    input: CompleteWalletCreationInput,
  ): Promise<WalletCreationOperationRecord> {
    try {
      return await this.db.transaction(async tx => {
        const [operationRow] = await tx
          .select()
          .from(schema.walletCreationOperations)
          .where(
            eq(
              schema.walletCreationOperations.operationId,
              input.operationId.toLowerCase(),
            ),
          )
          .limit(1);
        if (!operationRow) {
          notFound(
            "wallet_creation_operation_not_found",
            "wallet creation operation not found",
          );
        }
        const operation = mapWalletCreationOperation(operationRow);
        const safeAddress = input.safeAddress.toLowerCase() as `0x${string}`;
        const transactionHash = input.transactionHash
          ? (input.transactionHash.toLowerCase() as `0x${string}`)
          : null;
        assertWalletCompletionMatchesOperation(
          operation,
          safeAddress,
          transactionHash,
        );
        if (operation.status === "COMPLETED") return operation;

        const [insertedWallet] = await tx
          .insert(schema.wallets)
          .values({
            walletId: operation.walletId,
            agentId: operation.agentId,
            networkId: operation.networkId,
            safeAddress,
            status: "PROTECTED",
            createdAt: operation.createdAt,
            updatedAt: input.now,
          })
          .onConflictDoNothing({
            target: [schema.wallets.agentId, schema.wallets.networkId],
          })
          .returning();

        let wallet: WalletRecord;
        if (insertedWallet) {
          wallet = mapWallet(insertedWallet);
        } else {
          const [existingWallet] = await tx
            .select()
            .from(schema.wallets)
            .where(
              and(
                eq(schema.wallets.agentId, operation.agentId),
                eq(schema.wallets.networkId, operation.networkId),
              ),
            )
            .limit(1);
          if (!existingWallet) {
            throw new Error("wallet_creation_completion_failed");
          }
          wallet = mapWallet(existingWallet);
        }
        if (
          wallet.walletId !== operation.walletId ||
          wallet.safeAddress !== safeAddress
        ) {
          conflict(
            "wallet_agent_network_conflict",
            "the agent already has a different wallet on this network",
          );
        }

        const [completed] = await tx
          .update(schema.walletCreationOperations)
          .set({
            status: "COMPLETED",
            predictedSafeAddress: safeAddress,
            transactionHash,
            owners: input.owners.map(
              owner => owner.toLowerCase() as `0x${string}`,
            ),
            threshold: input.threshold,
            deploymentProvenance: input.deploymentProvenance,
            failureCode: null,
            updatedAt: input.now,
          })
          .where(
            eq(
              schema.walletCreationOperations.operationId,
              operation.operationId,
            ),
          )
          .returning();
        if (!completed) {
          notFound(
            "wallet_creation_operation_not_found",
            "wallet creation operation not found",
          );
        }
        return mapWalletCreationOperation(completed);
      });
    } catch (error) {
      throw mapPgConflict(error);
    }
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

  async deleteAgent(agentId: string): Promise<void> {
    const normalized = agentId.toLowerCase();
    await this.db.transaction(async tx => {
      const agentWallets = await tx.select({ walletId: schema.wallets.walletId }).from(schema.wallets).where(eq(schema.wallets.agentId, normalized));
      const walletIds = agentWallets.map(row => row.walletId);
      if (walletIds.length > 0) {
        await tx.delete(schema.walletNonces).where(inArray(schema.walletNonces.walletId, walletIds));
      }
      await tx.delete(schema.policies).where(eq(schema.policies.agentId, normalized));
      await tx
        .delete(schema.walletCreationOperations)
        .where(eq(schema.walletCreationOperations.agentId, normalized));
      await tx.delete(schema.agentSemanticProfiles).where(eq(schema.agentSemanticProfiles.agentId, normalized));
      await tx
        .delete(schema.agenticIdRegistrations)
        .where(eq(schema.agenticIdRegistrations.agentId, normalized));
      await tx.delete(schema.wallets).where(eq(schema.wallets.agentId, normalized));
      await tx.delete(schema.agents).where(eq(schema.agents.agentId, normalized));
    });
  }

  private async requireWalletCreationOperation(
    operationId: string,
  ): Promise<WalletCreationOperationRecord> {
    const [row] = await this.db
      .select()
      .from(schema.walletCreationOperations)
      .where(
        eq(
          schema.walletCreationOperations.operationId,
          operationId.toLowerCase(),
        ),
      )
      .limit(1);
    if (!row) {
      notFound(
        "wallet_creation_operation_not_found",
        "wallet creation operation not found",
      );
    }
    return mapWalletCreationOperation(row);
  }
}

export class UnconfiguredPolicyRepository implements PolicyRepository {
  async withWalletCreationLock(): Promise<never> {
    this.throwUnconfigured();
  }
  async getAgent(): Promise<never> {
    this.throwUnconfigured();
  }
  async getWallet(): Promise<never> {
    this.throwUnconfigured();
  }
  async getWalletByAgentNetwork(): Promise<never> {
    this.throwUnconfigured();
  }
  async getWalletCreationOperation(): Promise<never> {
    this.throwUnconfigured();
  }
  async beginWalletCreation(): Promise<never> {
    this.throwUnconfigured();
  }
  async markWalletCreationPrepared(): Promise<never> {
    this.throwUnconfigured();
  }
  async markWalletCreationBroadcast(): Promise<never> {
    this.throwUnconfigured();
  }
  async markWalletCreationFailed(): Promise<never> {
    this.throwUnconfigured();
  }
  async resetFailedWalletCreation(): Promise<never> {
    this.throwUnconfigured();
  }
  async completeWalletCreation(): Promise<never> {
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
  async deleteAgent(): Promise<never> {
    this.throwUnconfigured();
  }

  private throwUnconfigured(): never {
    throw new PolicyEngineError(503, "policy_database_unconfigured", "DATABASE_URL is required for Policy Engine persistence");
  }
}

export type PostgresPrecheckRepositoryOptions = {
  failOn?: "action_request" | "precheck_record" | "usage_hold" | "audit_event";
};

export class PostgresPrecheckRepository implements PrecheckRepository {
  constructor(
    private readonly pool: pg.Pool,
    private readonly options: PostgresPrecheckRepositoryOptions = {},
  ) {}

  async runInTransaction<T>(run: (tx: PrecheckTransaction) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const result = await run(new PostgresPrecheckTransaction(client, this.options));
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback");
      throw mapPgConflict(error);
    } finally {
      client.release();
    }
  }
}

export class UnconfiguredPrecheckRepository implements PrecheckRepository {
  async runInTransaction(): Promise<never> {
    throw new PolicyEngineError(503, "policy_database_unconfigured", "DATABASE_URL is required for Policy Engine precheck persistence");
  }
}

class PostgresPrecheckTransaction implements PrecheckTransaction {
  constructor(
    private readonly client: pg.PoolClient,
    private readonly options: PostgresPrecheckRepositoryOptions,
  ) {}

  async lockIdempotencyKey(agentId: string, idempotencyKeyHash: string): Promise<void> {
    await this.client.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [`precheck-idempotency:${agentId}:${idempotencyKeyHash}`]);
  }

  async lockWalletPolicyScope(agentId: string, walletId: string, policyId: string | null): Promise<void> {
    await this.client.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [`precheck-wallet-policy:${agentId}:${walletId}:${policyId ?? "none"}`]);
  }

  async getActionRequestByIdempotency(agentId: string, idempotencyKeyHash: string): Promise<ActionRequestRecord | null> {
    const result = await this.client.query(`select * from aegis_action_requests where agent_id = $1 and idempotency_key_hash = $2 limit 1`, [
      agentId,
      idempotencyKeyHash,
    ]);
    return result.rows[0] ? mapActionRequest(result.rows[0]) : null;
  }

  async getAgent(agentId: string): Promise<AgentRecord | null> {
    const result = await this.client.query(`select * from aegis_agents where agent_id = $1 limit 1`, [agentId]);
    return result.rows[0] ? mapAgentDbRow(result.rows[0]) : null;
  }

  async getWallet(walletId: string): Promise<WalletRecord | null> {
    const result = await this.client.query(`select * from aegis_wallets where wallet_id = $1 limit 1`, [walletId]);
    return result.rows[0] ? mapWalletDbRow(result.rows[0]) : null;
  }

  async getActivePolicy(agentId: string, walletId: string): Promise<PolicyRecord | null> {
    const result = await this.client.query(
      `select * from aegis_policies where agent_id = $1 and wallet_id = $2 and status = 'ACTIVE' limit 1`,
      [agentId, walletId],
    );
    return result.rows[0] ? mapPolicyDbRow(result.rows[0]) : null;
  }

  async getAssetCatalogEntry(assetId: string): Promise<AssetCatalogEntry | null> {
    const result = await this.client.query(`select * from aegis_asset_catalog where asset_id = $1 limit 1`, [assetId]);
    const row = result.rows[0];
    if (!row) return null;
    return {
      canonicalAssetId: row.asset_id,
      networkId: row.network_id,
      kind: row.kind,
      active: row.status === "ACTIVE",
      decimals: row.decimals,
      tokenId: row.hedera_token_id ?? undefined,
      symbol: row.symbol ?? undefined,
    };
  }

  async expireUsageHolds(now: number): Promise<void> {
    await this.client.query(
      `update aegis_usage_holds
       set status = 'EXPIRED', expired_at = $1, updated_at = $1
       where status = 'HELD' and expires_at <= $1`,
      [now],
    );
  }

  async getUsageSnapshot(input: { agentId: string; walletId: string; policyId: string | null; windowStart: number; windowEnd: number; now: number }) {
    if (input.policyId === null) {
      return {
        periodAmountUsed: "0",
        periodAmountHeld: "0",
        periodActionCountUsed: "0",
        periodActionCountHeld: "0",
      };
    }

    const result = await this.client.query(
      `select
         coalesce(sum(case when status = 'COMMITTED' and held_at >= $4 and held_at < $5 then amount::numeric else 0 end), 0)::text as used_amount,
         coalesce(sum(case when status = 'COMMITTED' and held_at >= $4 and held_at < $5 then action_count else 0 end), 0)::text as used_count,
         coalesce(sum(case when status = 'HELD' and expires_at > $6 then amount::numeric else 0 end), 0)::text as held_amount,
         coalesce(sum(case when status = 'HELD' and expires_at > $6 then action_count else 0 end), 0)::text as held_count
       from aegis_usage_holds
       where agent_id = $1 and wallet_id = $2 and policy_id = $3`,
      [input.agentId, input.walletId, input.policyId, input.windowStart, input.windowEnd, input.now],
    );
    const row = result.rows[0];
    return {
      periodAmountUsed: row.used_amount,
      periodAmountHeld: row.held_amount,
      periodActionCountUsed: row.used_count,
      periodActionCountHeld: row.held_count,
    };
  }

  async allocateNonce(walletId: string, now: number): Promise<bigint> {
    const result = await this.client.query(
      `insert into aegis_wallet_nonces (wallet_id, next_nonce, updated_at)
       values ($1, 2, $2)
       on conflict (wallet_id) do update
       set next_nonce = aegis_wallet_nonces.next_nonce + 1,
           updated_at = $2
       returning (next_nonce - 1)::text as nonce`,
      [walletId, now],
    );
    return BigInt(result.rows[0].nonce);
  }

  async insertActionRequest(record: ActionRequestRecord): Promise<void> {
    this.failIf("action_request");
    await this.client.query(
      `insert into aegis_action_requests (
         request_id, agent_id, wallet_id, idempotency_key_hash, request_payload_hash,
         action_hash_schema_version, action_type, destination_kind, destination_value,
         destination_chain_id, asset_id, amount, action_deadline, aegis_nonce,
         policy_id, policy_version, policy_hash, action_hash, status,
         functional_response, created_at, updated_at
       ) values (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
         $12, $13, $14, $15, $16, $17, $18, $19, $20::jsonb, $21, $22
       )`,
      [
        record.requestId,
        record.agentId,
        record.walletId,
        record.idempotencyKeyHash,
        record.requestPayloadHash,
        record.actionHashSchemaVersion,
        record.action?.actionType ?? null,
        record.action?.destination.kind ?? null,
        record.action?.destination.value ?? null,
        record.action?.destination.chainId ?? null,
        record.action?.assetId ?? null,
        record.action?.amount ?? null,
        record.action?.actionDeadline ?? null,
        record.aegisNonce,
        record.policyId,
        record.policyVersion,
        record.policyHash,
        record.actionHash,
        record.status,
        JSON.stringify(record.functionalResponse),
        record.createdAt,
        record.updatedAt,
      ],
    );
  }

  async insertPrecheckRecord(record: PrecheckRecordRecord): Promise<void> {
    this.failIf("precheck_record");
    await this.client.query(
      `insert into aegis_precheck_records (
         precheck_id, request_id, agent_id, wallet_id, policy_id, policy_version, policy_hash,
         action_hash, aegis_nonce, evaluated_at, status, reason_code, usage_hold_id,
         evaluator_version, created_at
       ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [
        record.precheckId,
        record.requestId,
        record.agentId,
        record.walletId,
        record.policyId,
        record.policyVersion,
        record.policyHash,
        record.actionHash,
        record.aegisNonce,
        record.evaluatedAt,
        record.status,
        record.reasonCode,
        record.usageHoldId,
        record.evaluatorVersion,
        record.createdAt,
      ],
    );
  }

  async insertUsageHold(record: UsageHoldRecord): Promise<void> {
    this.failIf("usage_hold");
    await this.client.query(
      `insert into aegis_usage_holds (
         usage_hold_id, request_id, precheck_id, agent_id, wallet_id, policy_id, policy_version,
         policy_hash, asset_id, amount, action_count, status, held_at, expires_at,
         released_at, expired_at, committed_at, created_at, updated_at
       ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)`,
      [
        record.usageHoldId,
        record.requestId,
        record.precheckId,
        record.agentId,
        record.walletId,
        record.policyId,
        record.policyVersion,
        record.policyHash,
        record.assetId,
        record.amount,
        record.actionCount,
        record.status,
        record.heldAt,
        record.expiresAt,
        record.releasedAt,
        record.expiredAt,
        record.committedAt,
        record.createdAt,
        record.updatedAt,
      ],
    );
  }

  async insertAuditEvent(record: AuditEventRecord): Promise<void> {
    this.failIf("audit_event");
    await this.client.query(
      `insert into aegis_audit_events (
         event_id, schema_version, event_type, occurred_at, request_id, precheck_id,
         agent_id, wallet_id, policy_id, policy_version, policy_hash, action_hash,
         stage, outcome, reason_code, network_id, idempotency_key_hash,
         request_payload_hash, usage_hold_id, actor_type, retention_until
       ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)`,
      [
        record.eventId,
        record.schemaVersion,
        record.eventType,
        record.occurredAt,
        record.requestId,
        record.precheckId,
        record.agentId,
        record.walletId,
        record.policyId,
        record.policyVersion,
        record.policyHash,
        record.actionHash,
        record.stage,
        record.outcome,
        record.reasonCode,
        record.networkId,
        record.idempotencyKeyHash,
        record.requestPayloadHash,
        record.usageHoldId,
        record.actorType,
        record.retentionUntil,
      ],
    );
  }

  private failIf(point: NonNullable<PostgresPrecheckRepositoryOptions["failOn"]>): void {
    if (this.options.failOn === point) {
      throw new PolicyEngineError(500, `forced_${point}_failure`, `forced ${point} failure`);
    }
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

function toWalletCreationOperationRow(
  operation: WalletCreationOperationRecord,
): typeof schema.walletCreationOperations.$inferInsert {
  return {
    operationId: operation.operationId.toLowerCase(),
    agentId: operation.agentId.toLowerCase(),
    networkId: NETWORK_ID,
    walletId: operation.walletId.toLowerCase(),
    recoveryGuardianAddress:
      operation.recoveryGuardianAddress.toLowerCase(),
    guardianSource: operation.guardianSource,
    saltNonce: operation.saltNonce,
    status: operation.status,
    predictedSafeAddress: operation.predictedSafeAddress?.toLowerCase() ?? null,
    transactionHash: operation.transactionHash?.toLowerCase() ?? null,
    owners:
      operation.owners?.map(
        owner => owner.toLowerCase() as `0x${string}`,
      ) ?? null,
    threshold: operation.threshold,
    deploymentProvenance: operation.deploymentProvenance,
    failureCode: operation.failureCode,
    createdAt: operation.createdAt,
    updatedAt: operation.updatedAt,
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

function mapWalletCreationOperation(
  row: WalletCreationOperationRow,
): WalletCreationOperationRecord {
  return {
    operationId: row.operationId,
    agentId: row.agentId,
    networkId: NETWORK_ID,
    walletId: row.walletId,
    recoveryGuardianAddress:
      row.recoveryGuardianAddress as `0x${string}`,
    guardianSource: row.guardianSource,
    saltNonce: row.saltNonce,
    status: row.status,
    predictedSafeAddress: row.predictedSafeAddress as `0x${string}` | null,
    transactionHash: row.transactionHash as `0x${string}` | null,
    owners: row.owners,
    threshold: row.threshold,
    deploymentProvenance: row.deploymentProvenance,
    failureCode: row.failureCode as WalletCreationFailureCode | null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function assertWalletCompletionMatchesOperation(
  operation: WalletCreationOperationRecord,
  safeAddress: `0x${string}`,
  transactionHash: `0x${string}` | null,
): void {
  if (
    operation.predictedSafeAddress !== null &&
    operation.predictedSafeAddress !== safeAddress
  ) {
    conflict(
      "wallet_prediction_conflict",
      "the deployed Safe does not match the persisted prediction",
    );
  }
  if (
    operation.transactionHash !== null &&
    operation.transactionHash !== transactionHash
  ) {
    conflict(
      "wallet_deployment_transaction_conflict",
      "the completed deployment transaction does not match the persisted transaction",
    );
  }
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

function mapAgentDbRow(row: Record<string, any>): AgentRecord {
  return {
    agentId: row.agent_id,
    ownerAddress: row.owner_address as `0x${string}`,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapWalletDbRow(row: Record<string, any>): WalletRecord {
  return {
    walletId: row.wallet_id,
    agentId: row.agent_id,
    networkId: NETWORK_ID,
    safeAddress: row.safe_address as `0x${string}`,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapPolicyDbRow(row: Record<string, any>): PolicyRecord {
  return {
    policyId: row.policy_id,
    policySeriesId: row.policy_series_id,
    agentId: row.agent_id,
    walletId: row.wallet_id,
    policyVersion: row.policy_version,
    policyHash: row.policy_hash as `0x${string}`,
    status: row.status,
    validFrom: row.valid_from,
    validUntil: row.valid_until,
    rules: row.rules,
    semanticRules: row.semantic_rules,
    operatorAddress: row.operator_address as `0x${string}`,
    operatorSignature: row.operator_signature as `0x${string}`,
    operatorMessage: row.operator_message,
    operatorCommitment: row.operator_commitment as `0x${string}`,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    activatedAt: row.activated_at,
    revokedAt: row.revoked_at,
    supersededAt: row.superseded_at,
    supersededByPolicyId: row.superseded_by_policy_id,
  };
}

function mapActionRequest(row: Record<string, any>): ActionRequestRecord {
  const actionHashSchemaVersion = mapActionHashSchemaVersion(row.action_hash_schema_version);
  return {
    requestId: row.request_id,
    agentId: row.agent_id,
    walletId: row.wallet_id,
    idempotencyKeyHash: row.idempotency_key_hash,
    requestPayloadHash: row.request_payload_hash,
    actionHashSchemaVersion,
    action: actionHashSchemaVersion === null ? null : mapPersistedAction(row),
    aegisNonce: row.aegis_nonce?.toString() ?? null,
    policyId: row.policy_id,
    policyVersion: row.policy_version,
    policyHash: row.policy_hash,
    actionHash: row.action_hash,
    status: row.status,
    functionalResponse: row.functional_response,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapActionHashSchemaVersion(value: unknown): typeof ACTION_HASH_SCHEMA | null {
  if (value === null || value === undefined) return null;
  if (value !== ACTION_HASH_SCHEMA) {
    throw new PolicyEngineError(500, "unsupported_action_hash_schema", "persisted action hash schema is not supported");
  }
  return ACTION_HASH_SCHEMA;
}

function mapPersistedAction(row: Record<string, any>): PersistedNormalizedAction {
  if (
    typeof row.action_type !== "string" ||
    typeof row.destination_kind !== "string" ||
    typeof row.destination_value !== "string" ||
    typeof row.asset_id !== "string" ||
    typeof row.amount !== "string" ||
    !Number.isInteger(row.action_deadline)
  ) {
    throw new PolicyEngineError(500, "invalid_persisted_action", "persisted action commitment fields are incomplete");
  }

  const destination = {
    kind: row.destination_kind,
    value: row.destination_value,
    ...(row.destination_chain_id === null ? {} : { chainId: Number(row.destination_chain_id) }),
  } as PersistedNormalizedAction["destination"];

  return {
    actionType: row.action_type,
    destination,
    assetId: row.asset_id,
    amount: row.amount,
    actionDeadline: row.action_deadline,
  };
}

function mapPgConflict(error: unknown): never {
  if (error instanceof PolicyEngineError) throw error;
  if (getPgErrorCode(error) === "23505") {
    conflict("database_unique_constraint", "database unique constraint rejected the write");
  }
  throw error;
}

function getPgErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const code = (error as { code?: unknown }).code;
  if (typeof code === "string") return code;
  return getPgErrorCode((error as { cause?: unknown }).cause);
}
