import { conflict, notFound } from "./errors.js";
import {
  NETWORK_ID,
  type ActivatePolicyResponse,
  type AgentRecord,
  type CompleteWalletCreationInput,
  type OperatorProof,
  type Policy,
  type PolicyRecord,
  type RevokePolicyResponse,
  type WalletCreationOperationRecord,
  type WalletCreationFailureCode,
  type WalletRecord,
} from "./types.js";

export type SupersededPolicySummary = NonNullable<ActivatePolicyResponse["supersededPolicy"]>;

export type PolicyRepository = {
  withWalletCreationLock<T>(
    agentId: string,
    networkId: typeof NETWORK_ID,
    operation: () => Promise<T>,
  ): Promise<T>;
  getAgent(agentId: string): Promise<AgentRecord | null>;
  listAgentsByOwner(ownerAddress: string): Promise<AgentRecord[]>;
  getWallet(walletId: string): Promise<WalletRecord | null>;
  getWalletByAgentNetwork(
    agentId: string,
    networkId: typeof NETWORK_ID,
  ): Promise<WalletRecord | null>;
  getWalletCreationOperation(
    agentId: string,
    networkId: typeof NETWORK_ID,
  ): Promise<WalletCreationOperationRecord | null>;
  beginWalletCreation(
    operation: WalletCreationOperationRecord,
  ): Promise<WalletCreationOperationRecord>;
  markWalletCreationPrepared(
    operationId: string,
    predictedSafeAddress: `0x${string}`,
    expectedOwners: `0x${string}`[],
    expectedThreshold: number,
    now: number,
  ): Promise<WalletCreationOperationRecord>;
  markWalletCreationBroadcast(
    operationId: string,
    transactionHash: `0x${string}`,
    now: number,
  ): Promise<WalletCreationOperationRecord>;
  markWalletCreationFailed(
    operationId: string,
    transactionHash: `0x${string}`,
    failureCode: WalletCreationFailureCode,
    now: number,
  ): Promise<WalletCreationOperationRecord>;
  resetFailedWalletCreation(
    operationId: string,
    now: number,
  ): Promise<WalletCreationOperationRecord>;
  completeWalletCreation(
    input: CompleteWalletCreationInput,
  ): Promise<WalletCreationOperationRecord>;
  saveAgent(agent: AgentRecord): Promise<AgentRecord>;
  saveWallet(wallet: WalletRecord): Promise<WalletRecord>;
  insertPolicy(policy: PolicyRecord): Promise<PolicyRecord>;
  getPolicy(policyId: string): Promise<PolicyRecord | null>;
  listPolicyVersions(policyId: string): Promise<PolicyRecord[]>;
  getActivePolicy(agentId: string, walletId: string): Promise<PolicyRecord | null>;
  getLatestPolicyVersion(policySeriesId: string): Promise<PolicyRecord | null>;
  activatePolicy(policyId: string, proof: OperatorProof, now: number): Promise<{
    policy: PolicyRecord;
    supersededPolicy: SupersededPolicySummary | null;
  }>;
  revokePolicy(policyId: string, proof: OperatorProof, now: number): Promise<PolicyRecord>;
  deleteAgent(agentId: string): Promise<void>;
};

export function toPolicy(record: PolicyRecord): Policy {
  return {
    policyId: record.policyId,
    agentId: record.agentId,
    walletId: record.walletId,
    policyVersion: record.policyVersion,
    policyHash: record.policyHash,
    status: record.status,
    validFrom: record.validFrom,
    validUntil: record.validUntil,
    rules: structuredClone(record.rules),
    semanticRules: structuredClone(record.semanticRules),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    activatedAt: record.activatedAt,
    revokedAt: record.revokedAt,
    supersededAt: record.supersededAt,
    supersededByPolicyId: record.supersededByPolicyId,
  };
}

export class InMemoryPolicyRepository implements PolicyRepository {
  private readonly agents = new Map<string, AgentRecord>();
  private readonly wallets = new Map<string, WalletRecord>();
  private readonly policies = new Map<string, PolicyRecord>();
  private readonly walletCreationOperations = new Map<
    string,
    WalletCreationOperationRecord
  >();
  private readonly walletCreationTails = new Map<string, Promise<void>>();

  async withWalletCreationLock<T>(
    agentId: string,
    networkId: typeof NETWORK_ID,
    operation: () => Promise<T>,
  ): Promise<T> {
    const key = walletCreationKey(agentId, networkId);
    const previous = this.walletCreationTails.get(key) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>(resolve => {
      release = resolve;
    });
    const tail = previous.then(() => current);
    this.walletCreationTails.set(key, tail);

    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (this.walletCreationTails.get(key) === tail) {
        this.walletCreationTails.delete(key);
      }
    }
  }

  async getAgent(agentId: string): Promise<AgentRecord | null> {
    return clone(this.agents.get(agentId.toLowerCase()) ?? null);
  }

  async listAgentsByOwner(ownerAddress: string): Promise<AgentRecord[]> {
    const normalizedOwner = ownerAddress.toLowerCase();
    return [...this.agents.values()]
      .filter(agent => agent.ownerAddress === normalizedOwner)
      .sort((left, right) => right.createdAt - left.createdAt)
      .map(clone);
  }

  async getWallet(walletId: string): Promise<WalletRecord | null> {
    return clone(this.wallets.get(walletId.toLowerCase()) ?? null);
  }

  async getWalletByAgentNetwork(
    agentId: string,
    networkId: typeof NETWORK_ID,
  ): Promise<WalletRecord | null> {
    const normalizedAgentId = agentId.toLowerCase();
    const wallet = [...this.wallets.values()].find(
      candidate =>
        candidate.agentId === normalizedAgentId &&
        candidate.networkId === networkId,
    );
    return clone(wallet ?? null);
  }

  async getWalletCreationOperation(
    agentId: string,
    networkId: typeof NETWORK_ID,
  ): Promise<WalletCreationOperationRecord | null> {
    return clone(
      this.walletCreationOperations.get(walletCreationKey(agentId, networkId)) ??
        null,
    );
  }

  async beginWalletCreation(
    operation: WalletCreationOperationRecord,
  ): Promise<WalletCreationOperationRecord> {
    const normalized = normalizeWalletCreationOperation(operation);
    const key = walletCreationKey(normalized.agentId, normalized.networkId);
    const existing = this.walletCreationOperations.get(key);
    if (existing) return clone(existing);
    this.walletCreationOperations.set(key, clone(normalized));
    return clone(normalized);
  }

  async markWalletCreationPrepared(
    operationId: string,
    predictedSafeAddress: `0x${string}`,
    expectedOwners: `0x${string}`[],
    expectedThreshold: number,
    now: number,
  ): Promise<WalletCreationOperationRecord> {
    const operation = this.requireWalletCreationOperation(operationId);
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
      return clone(operation);
    }
    return this.storeWalletCreationOperation({
      ...operation,
      status: "PREPARED",
      predictedSafeAddress: normalizedAddress,
      owners: expectedOwners.map(
        owner => owner.toLowerCase() as `0x${string}`,
      ),
      threshold: expectedThreshold,
      updatedAt: now,
    });
  }

  async markWalletCreationBroadcast(
    operationId: string,
    transactionHash: `0x${string}`,
    now: number,
  ): Promise<WalletCreationOperationRecord> {
    const operation = this.requireWalletCreationOperation(operationId);
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
    if (operation.status === "COMPLETED") return clone(operation);
    return this.storeWalletCreationOperation({
      ...operation,
      status: "BROADCAST",
      transactionHash: normalizedHash,
      failureCode: null,
      updatedAt: now,
    });
  }

  async markWalletCreationFailed(
    operationId: string,
    transactionHash: `0x${string}`,
    failureCode: WalletCreationFailureCode,
    now: number,
  ): Promise<WalletCreationOperationRecord> {
    const operation = this.requireWalletCreationOperation(operationId);
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
    return this.storeWalletCreationOperation({
      ...operation,
      status: "FAILED",
      failureCode,
      updatedAt: now,
    });
  }

  async resetFailedWalletCreation(
    operationId: string,
    now: number,
  ): Promise<WalletCreationOperationRecord> {
    const operation = this.requireWalletCreationOperation(operationId);
    if (
      operation.status !== "FAILED" ||
      operation.failureCode !== "TRANSACTION_REVERTED"
    ) {
      conflict(
        "wallet_creation_not_retryable",
        "only a conclusively reverted deployment can be explicitly retried",
      );
    }
    return this.storeWalletCreationOperation({
      ...operation,
      status: "PREPARED",
      transactionHash: null,
      failureCode: null,
      updatedAt: now,
    });
  }

  async completeWalletCreation(
    input: CompleteWalletCreationInput,
  ): Promise<WalletCreationOperationRecord> {
    const operation = this.requireWalletCreationOperation(input.operationId);
    const safeAddress = input.safeAddress.toLowerCase() as `0x${string}`;
    const transactionHash = input.transactionHash
      ? (input.transactionHash.toLowerCase() as `0x${string}`)
      : null;
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

    await this.saveWallet({
      walletId: operation.walletId,
      agentId: operation.agentId,
      networkId: operation.networkId,
      safeAddress,
      status: "PROTECTED",
      createdAt: operation.createdAt,
      updatedAt: input.now,
    });

    return this.storeWalletCreationOperation({
      ...operation,
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
    });
  }

  async saveAgent(agent: AgentRecord): Promise<AgentRecord> {
    const normalized = { ...agent, agentId: agent.agentId.toLowerCase(), ownerAddress: agent.ownerAddress.toLowerCase() as `0x${string}` };
    this.agents.set(normalized.agentId, clone(normalized));
    return clone(normalized);
  }

  async saveWallet(wallet: WalletRecord): Promise<WalletRecord> {
    const normalized: WalletRecord = {
      ...wallet,
      walletId: wallet.walletId.toLowerCase(),
      agentId: wallet.agentId.toLowerCase(),
      safeAddress: wallet.safeAddress.toLowerCase() as `0x${string}`,
      networkId: NETWORK_ID,
    };

    for (const existing of this.wallets.values()) {
      if (existing.walletId !== normalized.walletId && existing.networkId === normalized.networkId && existing.safeAddress === normalized.safeAddress) {
        conflict("wallet_safe_address_conflict", "networkId and safeAddress must be unique");
      }
      if (
        existing.walletId !== normalized.walletId &&
        existing.agentId === normalized.agentId &&
        existing.networkId === normalized.networkId
      ) {
        conflict(
          "wallet_agent_network_conflict",
          "agentId and networkId must be unique",
        );
      }
    }

    this.wallets.set(normalized.walletId, clone(normalized));
    return clone(normalized);
  }

  async insertPolicy(policy: PolicyRecord): Promise<PolicyRecord> {
    if (this.policies.has(policy.policyId)) {
      conflict("policy_id_conflict", "policyId must be unique");
    }

    for (const existing of this.policies.values()) {
      if (existing.policySeriesId === policy.policySeriesId && existing.policyVersion === policy.policyVersion) {
        conflict("policy_version_conflict", "policySeriesId and policyVersion must be unique");
      }
      if (policy.status === "ACTIVE" && existing.status === "ACTIVE" && existing.agentId === policy.agentId && existing.walletId === policy.walletId) {
        conflict("active_policy_conflict", "only one ACTIVE policy is allowed per agentId and walletId");
      }
    }

    this.policies.set(policy.policyId, clone(policy));
    return clone(policy);
  }

  async getPolicy(policyId: string): Promise<PolicyRecord | null> {
    return clone(this.policies.get(policyId.toLowerCase()) ?? null);
  }

  async listPolicyVersions(policyId: string): Promise<PolicyRecord[]> {
    const policy = this.policies.get(policyId.toLowerCase());
    if (!policy) notFound("policy_not_found", "policy not found");
    return [...this.policies.values()]
      .filter(candidate => candidate.policySeriesId === policy.policySeriesId)
      .sort((left, right) => left.policyVersion - right.policyVersion)
      .map(clone);
  }

  async getActivePolicy(agentId: string, walletId: string): Promise<PolicyRecord | null> {
    const active = [...this.policies.values()].find(
      policy => policy.agentId === agentId.toLowerCase() && policy.walletId === walletId.toLowerCase() && policy.status === "ACTIVE",
    );
    return clone(active ?? null);
  }

  async getLatestPolicyVersion(policySeriesId: string): Promise<PolicyRecord | null> {
    const versions = [...this.policies.values()]
      .filter(policy => policy.policySeriesId === policySeriesId)
      .sort((left, right) => right.policyVersion - left.policyVersion);
    return clone(versions[0] ?? null);
  }

  async activatePolicy(policyId: string, proof: OperatorProof, now: number): Promise<{
    policy: PolicyRecord;
    supersededPolicy: SupersededPolicySummary | null;
  }> {
    const target = this.policies.get(policyId.toLowerCase());
    if (!target) notFound("policy_not_found", "policy not found");

    let supersededPolicy: SupersededPolicySummary | null = null;
    const previousActive = [...this.policies.values()].find(
      policy => policy.agentId === target.agentId && policy.walletId === target.walletId && policy.status === "ACTIVE",
    );

    if (previousActive) {
      const superseded: PolicyRecord = {
        ...previousActive,
        status: "SUPERSEDED",
        updatedAt: now,
        supersededAt: now,
        supersededByPolicyId: target.policyId,
      };
      this.policies.set(previousActive.policyId, clone(superseded));
      supersededPolicy = {
        policyId: superseded.policyId,
        policyVersion: superseded.policyVersion,
        policyHash: superseded.policyHash,
        status: "SUPERSEDED",
      };
    }

    const activated: PolicyRecord = {
      ...target,
      status: "ACTIVE",
      updatedAt: now,
      activatedAt: now,
      revokedAt: null,
      supersededAt: null,
      supersededByPolicyId: null,
      ...proof,
    };
    this.policies.set(target.policyId, clone(activated));

    return { policy: clone(activated), supersededPolicy };
  }

  async revokePolicy(policyId: string, proof: OperatorProof, now: number): Promise<PolicyRecord> {
    const policy = this.policies.get(policyId.toLowerCase());
    if (!policy) notFound("policy_not_found", "policy not found");

    const revoked: PolicyRecord = {
      ...policy,
      status: "REVOKED",
      updatedAt: now,
      revokedAt: now,
      ...proof,
    };
    this.policies.set(policy.policyId, clone(revoked));
    return clone(revoked);
  }

  async deleteAgent(agentId: string): Promise<void> {
    const normalized = agentId.toLowerCase();
    this.agents.delete(normalized);
    for (const [key, operation] of this.walletCreationOperations) {
      if (operation.agentId === normalized) {
        this.walletCreationOperations.delete(key);
      }
    }
    for (const [walletId, wallet] of this.wallets) {
      if (wallet.agentId === normalized) this.wallets.delete(walletId);
    }
    for (const [policyId, policy] of this.policies) {
      if (policy.agentId === normalized) this.policies.delete(policyId);
    }
  }

  private requireWalletCreationOperation(
    operationId: string,
  ): WalletCreationOperationRecord {
    const operation = [...this.walletCreationOperations.values()].find(
      candidate => candidate.operationId === operationId.toLowerCase(),
    );
    if (!operation) {
      notFound(
        "wallet_creation_operation_not_found",
        "wallet creation operation not found",
      );
    }
    return operation;
  }

  private storeWalletCreationOperation(
    operation: WalletCreationOperationRecord,
  ): WalletCreationOperationRecord {
    this.walletCreationOperations.set(
      walletCreationKey(operation.agentId, operation.networkId),
      clone(operation),
    );
    return clone(operation);
  }
}

function walletCreationKey(
  agentId: string,
  networkId: typeof NETWORK_ID,
): string {
  return `${agentId.toLowerCase()}:${networkId}`;
}

function normalizeWalletCreationOperation(
  operation: WalletCreationOperationRecord,
): WalletCreationOperationRecord {
  return {
    ...operation,
    operationId: operation.operationId.toLowerCase(),
    agentId: operation.agentId.toLowerCase(),
    networkId: NETWORK_ID,
    walletId: operation.walletId.toLowerCase(),
    recoveryGuardianAddress:
      operation.recoveryGuardianAddress.toLowerCase() as `0x${string}`,
    predictedSafeAddress: operation.predictedSafeAddress
      ? (operation.predictedSafeAddress.toLowerCase() as `0x${string}`)
      : null,
    transactionHash: operation.transactionHash
      ? (operation.transactionHash.toLowerCase() as `0x${string}`)
      : null,
    owners:
      operation.owners?.map(owner =>
        owner.toLowerCase() as `0x${string}`,
      ) ?? null,
  };
}

function clone<T>(value: T): T {
  return value === null ? value : structuredClone(value);
}
