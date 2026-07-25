import { conflict, notFound } from "./errors.js";
import {
  NETWORK_ID,
  type ActivatePolicyResponse,
  type AgentRecord,
  type OperatorProof,
  type Policy,
  type PolicyRecord,
  type RevokePolicyResponse,
  type WalletRecord,
} from "./types.js";

export type SupersededPolicySummary = NonNullable<ActivatePolicyResponse["supersededPolicy"]>;

export type PolicyRepository = {
  getAgent(agentId: string): Promise<AgentRecord | null>;
  getWallet(walletId: string): Promise<WalletRecord | null>;
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

  async getAgent(agentId: string): Promise<AgentRecord | null> {
    return clone(this.agents.get(agentId.toLowerCase()) ?? null);
  }

  async getWallet(walletId: string): Promise<WalletRecord | null> {
    return clone(this.wallets.get(walletId.toLowerCase()) ?? null);
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
}

function clone<T>(value: T): T {
  return value === null ? value : structuredClone(value);
}
