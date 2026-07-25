import { buildPolicyCommitment, verifyOperatorProof } from "./auth.js";
import { computePolicyHash } from "./canonicalize.js";
import { badRequest, conflict, forbidden, notFound } from "./errors.js";
import { type PolicyRepository, toPolicy } from "./repository.js";
import {
  type ActivatePolicyRequest,
  type ActivatePolicyResponse,
  type ActivePolicyResponse,
  type CreatePolicyRequest,
  type CreatePolicyResponse,
  type OperatorAuth,
  type OperatorProof,
  type Policy,
  type PolicyRecord,
  type PolicyRules,
  type RevokePolicyRequest,
  type RevokePolicyResponse,
  type SemanticRule,
  type UpdatePolicyRequest,
  type UpdatePolicyResponse,
} from "./types.js";
import {
  getEffectivePolicyStatus,
  parseActivatePolicyRequest,
  parseCreatePolicyRequest,
  parseRevokePolicyRequest,
  parseUpdatePolicyRequest,
} from "./validation.js";

export type PolicyClock = () => number;

export class PolicyLifecycleService {
  constructor(
    private readonly repository: PolicyRepository,
    private readonly clock: PolicyClock = () => Math.floor(Date.now() / 1000),
  ) {}

  async createPolicy(body: unknown, auth: OperatorAuth, now = this.clock()): Promise<CreatePolicyResponse> {
    const request = parseCreatePolicyRequest(body);
    assertValidityWindow(request.validFrom, request.validUntil);

    const policyVersion = 1;
    const policyHash = computePolicyHash({
      agentId: request.agentId,
      walletId: request.walletId,
      policyVersion,
      validFrom: request.validFrom,
      validUntil: request.validUntil,
      rules: request.rules,
      semanticRules: request.semanticRules ?? [],
    });
    const finalPolicyId = createPolicyIdFromHash(policyHash);
    const proof = await this.authorizePolicyOperation(
      buildPolicyCommitment({
        operation: "CREATE_POLICY",
        operatorAddress: auth.operatorAddress.toLowerCase() as `0x${string}`,
        agentId: request.agentId,
        walletId: request.walletId,
        policyId: finalPolicyId,
        policyVersion,
        policyHash,
        validFrom: request.validFrom,
        validUntil: request.validUntil,
      }),
      request.agentId,
      request.walletId,
      auth,
    );

    const record: PolicyRecord = {
      policyId: finalPolicyId,
      policySeriesId: finalPolicyId,
      agentId: request.agentId,
      walletId: request.walletId,
      policyVersion,
      policyHash,
      status: "DRAFT",
      validFrom: request.validFrom,
      validUntil: request.validUntil,
      rules: request.rules,
      semanticRules: request.semanticRules ?? [],
      createdAt: now,
      updatedAt: now,
      activatedAt: null,
      revokedAt: null,
      supersededAt: null,
      supersededByPolicyId: null,
      ...proof,
    };

    return { policy: toPolicy(await this.repository.insertPolicy(record)) };
  }

  async getPolicy(policyId: string): Promise<Policy> {
    const policy = await this.repository.getPolicy(policyId);
    if (!policy) notFound("policy_not_found", "policy not found");
    return toPolicy(policy);
  }

  async listPolicyVersions(policyId: string): Promise<Policy[]> {
    return (await this.repository.listPolicyVersions(policyId)).map(toPolicy);
  }

  async getActivePolicy(agentId: string, walletId: string, now = this.clock()): Promise<ActivePolicyResponse> {
    const active = await this.repository.getActivePolicy(agentId.toLowerCase(), walletId.toLowerCase());
    if (!active) return { policy: null, effectiveStatus: null };
    return {
      policy: toPolicy(active),
      effectiveStatus: getEffectivePolicyStatus(active, now) as ActivePolicyResponse["effectiveStatus"],
    };
  }

  async updatePolicy(policyId: string, body: unknown, auth: OperatorAuth, now = this.clock()): Promise<UpdatePolicyResponse> {
    const request = parseUpdatePolicyRequest(policyId, body);
    const previous = await this.requirePolicy(request.policyId);
    assertExpectedVersion(previous, request.expectedPolicyVersion);

    const nextPolicy = this.mergePolicyUpdate(previous, request);
    assertValidityWindow(nextPolicy.validFrom, nextPolicy.validUntil);

    const latest = await this.repository.getLatestPolicyVersion(previous.policySeriesId);
    const nextVersion = (latest?.policyVersion ?? previous.policyVersion) + 1;
    const policyHash = computePolicyHash({
      agentId: previous.agentId,
      walletId: previous.walletId,
      policyVersion: nextVersion,
      validFrom: nextPolicy.validFrom,
      validUntil: nextPolicy.validUntil,
      rules: nextPolicy.rules,
      semanticRules: nextPolicy.semanticRules,
    });
    const nextPolicyId = createPolicyIdFromHash(policyHash);
    const proof = await this.authorizePolicyOperation(
      buildPolicyCommitment({
        operation: "UPDATE_POLICY",
        operatorAddress: auth.operatorAddress.toLowerCase() as `0x${string}`,
        agentId: previous.agentId,
        walletId: previous.walletId,
        policyId: nextPolicyId,
        sourcePolicyId: previous.policyId,
        policyVersion: nextVersion,
        policyHash,
        validFrom: nextPolicy.validFrom,
        validUntil: nextPolicy.validUntil,
      }),
      previous.agentId,
      previous.walletId,
      auth,
    );

    const record: PolicyRecord = {
      policyId: nextPolicyId,
      policySeriesId: previous.policySeriesId,
      agentId: previous.agentId,
      walletId: previous.walletId,
      policyVersion: nextVersion,
      policyHash,
      status: "DRAFT",
      validFrom: nextPolicy.validFrom,
      validUntil: nextPolicy.validUntil,
      rules: nextPolicy.rules,
      semanticRules: nextPolicy.semanticRules,
      createdAt: now,
      updatedAt: now,
      activatedAt: null,
      revokedAt: null,
      supersededAt: null,
      supersededByPolicyId: null,
      ...proof,
    };

    return {
      policy: toPolicy(await this.repository.insertPolicy(record)),
      previousPolicyId: previous.policyId,
      previousPolicyVersion: previous.policyVersion,
      previousPolicyHash: previous.policyHash,
    };
  }

  async activatePolicy(policyId: string, body: unknown, auth: OperatorAuth, now = this.clock()): Promise<ActivatePolicyResponse> {
    const request = parseActivatePolicyRequest(policyId, body);
    const policy = await this.requirePolicy(request.policyId);
    assertExpectedVersion(policy, request.expectedPolicyVersion);
    assertExpectedHash(policy, request.expectedPolicyHash);

    if (policy.status !== "DRAFT") {
      conflict("policy_not_activatable", "only DRAFT policies can be activated");
    }
    if (getEffectivePolicyStatus({ status: "ACTIVE", validUntil: policy.validUntil }, now) === "EXPIRED") {
      conflict("policy_expired", "expired policies cannot be activated");
    }

    const proof = await this.authorizePolicyOperation(
      buildPolicyCommitment({
        operation: "ACTIVATE_POLICY",
        operatorAddress: auth.operatorAddress.toLowerCase() as `0x${string}`,
        agentId: policy.agentId,
        walletId: policy.walletId,
        policyId: policy.policyId,
        policyVersion: policy.policyVersion,
        policyHash: policy.policyHash,
        validFrom: policy.validFrom,
        validUntil: policy.validUntil,
      }),
      policy.agentId,
      policy.walletId,
      auth,
    );
    const result = await this.repository.activatePolicy(policy.policyId, proof, now);
    return {
      policy: toPolicy(result.policy),
      supersededPolicy: result.supersededPolicy,
    };
  }

  async revokePolicy(policyId: string, body: unknown, auth: OperatorAuth, now = this.clock()): Promise<RevokePolicyResponse> {
    const request = parseRevokePolicyRequest(policyId, body);
    const policy = await this.requirePolicy(request.policyId);
    assertExpectedVersion(policy, request.expectedPolicyVersion);
    assertExpectedHash(policy, request.expectedPolicyHash);

    if (policy.status === "REVOKED") {
      conflict("policy_already_revoked", "policy is already revoked");
    }

    const proof = await this.authorizePolicyOperation(
      buildPolicyCommitment({
        operation: "REVOKE_POLICY",
        operatorAddress: auth.operatorAddress.toLowerCase() as `0x${string}`,
        agentId: policy.agentId,
        walletId: policy.walletId,
        policyId: policy.policyId,
        policyVersion: policy.policyVersion,
        policyHash: policy.policyHash,
        validFrom: policy.validFrom,
        validUntil: policy.validUntil,
      }),
      policy.agentId,
      policy.walletId,
      auth,
    );
    return { policy: toPolicy(await this.repository.revokePolicy(policy.policyId, proof, now)) };
  }

  private async requirePolicy(policyId: string): Promise<PolicyRecord> {
    const policy = await this.repository.getPolicy(policyId.toLowerCase());
    if (!policy) notFound("policy_not_found", "policy not found");
    return policy;
  }

  private mergePolicyUpdate(previous: PolicyRecord, request: UpdatePolicyRequest): {
    validFrom: number;
    validUntil: number | null;
    rules: PolicyRules;
    semanticRules: SemanticRule[];
  } {
    return {
      validFrom: request.validFrom ?? previous.validFrom,
      validUntil: request.validUntil === undefined ? previous.validUntil : request.validUntil,
      rules: request.rules ?? previous.rules,
      semanticRules: request.semanticRules ?? previous.semanticRules,
    };
  }

  private async authorizePolicyOperation(
    commitment: Parameters<typeof verifyOperatorProof>[0]["commitment"],
    agentId: string,
    walletId: string,
    auth: OperatorAuth,
  ): Promise<OperatorProof> {
    const agent = await this.repository.getAgent(agentId);
    if (!agent || agent.status !== "ACTIVE") {
      forbidden("agent_not_active", "agent must be ACTIVE");
    }

    const wallet = await this.repository.getWallet(walletId);
    if (!wallet || wallet.agentId !== agent.agentId || wallet.status !== "PROTECTED") {
      forbidden("wallet_not_protected", "wallet must belong to the agent and be PROTECTED");
    }

    return verifyOperatorProof({
      commitment,
      auth,
      ownerAddress: agent.ownerAddress,
    });
  }
}

export function createPolicyIdFromHash(policyHash: string): string {
  return `pol_${policyHash.slice(2, 34)}`.toLowerCase();
}

function assertValidityWindow(validFrom: number, validUntil: number | null): void {
  if (validUntil !== null && validUntil <= validFrom) {
    badRequest("invalid_validity_window", "validUntil must be greater than validFrom when supplied");
  }
}

function assertExpectedVersion(policy: PolicyRecord, expectedPolicyVersion: number): void {
  if (policy.policyVersion !== expectedPolicyVersion) {
    conflict("policy_version_stale", "expectedPolicyVersion does not match the selected policy");
  }
}

function assertExpectedHash(policy: PolicyRecord, expectedPolicyHash: string): void {
  if (policy.policyHash !== expectedPolicyHash) {
    conflict("policy_hash_stale", "expectedPolicyHash does not match the selected policy");
  }
}
