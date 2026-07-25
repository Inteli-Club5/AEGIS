import { requestJson } from "~~/lib/api/http";
import {
  getActivePolicy,
  getPolicy,
  listPolicyVersions,
  patchPolicy,
  postPolicy,
  postPolicyActivation,
} from "~~/lib/api/policies";
import {
  patchCreatedAgent,
  readCreatedAgentDetails,
  readCreatedAgents,
  upsertCreatedAgent,
} from "~~/lib/fixtures/store";
import {
  POLICY_COMMITMENT_DOMAIN,
  POLICY_COMMITMENT_TYPES,
  type PolicyCommitment,
  type PolicyRules,
  buildPolicyCommitment,
  computePolicyHash,
  createPolicyIdFromHash,
} from "~~/lib/policy/hash";
import { planPolicySave } from "~~/lib/policy/save-plan";
import type { AgentProfile, AgentType, Capability, Policy, ProtectedWalletInfo } from "~~/lib/types/aegis";
import { formatPolicyAmount } from "~~/lib/utils/format";

export type SignPolicyCommitment = (params: {
  domain: typeof POLICY_COMMITMENT_DOMAIN;
  types: typeof POLICY_COMMITMENT_TYPES;
  primaryType: "PolicyCommitment";
  message: PolicyCommitment;
}) => Promise<`0x${string}`>;

const AGENT_SERVICE_TYPE: Record<AgentType, "Payment" | "API Buyer" | "DeFi" | "Treasury" | "Other"> = {
  "Payment Agent": "Payment",
  "API Buyer": "API Buyer",
  "Treasury Agent": "Treasury",
  "DeFi Agent": "DeFi",
  Custom: "Other",
};

export type AgentServiceProfile = {
  agentId: string;
  ownerWallet?: string;
  name?: string;
  type?: "Payment" | "API Buyer" | "DeFi" | "Treasury" | "Other";
  description?: string;
  hederaAccountId: string;
  status?: "active" | "inactive";
  createdAt?: string;
  safeAddress?: string;
  wallet?: AgentServiceWallet & {
    networkId: "hedera:testnet";
    status: "PROTECTED";
  };
  agenticId?: {
    tokenId: string;
    contractAddress: string;
    metadataURI: string;
    explorerUrl: string;
  };
};

type AgentServiceWallet = {
  safeAddress: string;
  walletId: string;
  networkId?: "hedera:testnet";
  owners: string[];
  threshold: number;
  transactionHash: string;
};

export async function getAgentServiceProfile(agentId: string): Promise<AgentServiceProfile> {
  return requestJson(`/api/agent-service/agents/${encodeURIComponent(agentId)}`);
}

export async function createAgent(input: {
  name: string;
  type: AgentType;
  description?: string;
  capabilities: Capability[];
  ownerWallet: string;
}): Promise<AgentProfile> {
  const name = input.name.trim();
  const taken = readCreatedAgents().some(agent => agent.name.toLowerCase() === name.toLowerCase());
  if (taken) throw new Error(`An agent named "${name}" already exists.`);

  const created = await requestJson<AgentServiceProfile>("/api/agent-service/agents", {
    method: "POST",
    body: {
      ownerWallet: input.ownerWallet,
      name,
      type: AGENT_SERVICE_TYPE[input.type],
      description: input.description || undefined,
    },
  });

  const profile: AgentProfile = {
    id: created.agentId,
    name,
    type: input.type,
    description: input.description || undefined,
    capabilities: input.capabilities,
    createdAt: new Date().toISOString(),
  };

  upsertCreatedAgent({
    id: profile.id,
    name: profile.name,
    type: profile.type,
    status: "unprotected",
    wallet: "",
    balanceHbar: 0,
    policySummary: "—",
    lastActionAgo: "just connected",
    description: profile.description,
    agentLifecycleStatus: "ACTIVE",
    capabilities: profile.capabilities,
    createdAt: profile.createdAt,
    walletInfo: null,
    policy: null,
    policyVersions: [],
    activePolicy: null,
    effectivePolicyStatus: null,
    hederaAccountId: created.hederaAccountId,
  });

  return profile;
}

export type PolicyPhase = "wallet" | "sign-policy" | "sign-activation";

export async function savePolicyDraft(
  input: {
    agentId: string;
    ownerWallet: `0x${string}`;
    rules: PolicyRules;
    validFrom: number;
    validUntil: number | null;
    sourcePolicy?: Policy;
    recoveryGuardianAddress?: string;
  },
  signTypedDataAsync: SignPolicyCommitment,
  onPhase?: (phase: PolicyPhase) => void,
): Promise<{ policy: Policy; wallet: ProtectedWalletInfo }> {
  onPhase?.("wallet");
  const wallet = await ensureWallet(input.agentId, input.recoveryGuardianAddress);
  const semanticRules: Policy["semanticRules"] = [];

  let versions: Policy[] = [];
  if (input.sourcePolicy) {
    versions = await listPolicyVersions(input.sourcePolicy.policyId);
    if (versions.length === 0) versions = [await getPolicy(input.sourcePolicy.policyId)];
  }
  const plan = planPolicySave(versions, {
    validFrom: input.validFrom,
    validUntil: input.validUntil,
    rules: input.rules,
    semanticRules,
  });
  if (plan.kind === "REUSE") return { policy: plan.policy, wallet };

  const sourcePolicy = plan.kind === "UPDATE" ? plan.sourcePolicy : undefined;
  const policyVersion = plan.policyVersion;
  const operation: PolicyCommitment["operation"] = plan.kind === "UPDATE" ? "UPDATE_POLICY" : "CREATE_POLICY";

  const policyHash = computePolicyHash({
    agentId: input.agentId,
    walletId: wallet.walletId,
    policyVersion,
    validFrom: input.validFrom,
    validUntil: input.validUntil,
    rules: input.rules,
    semanticRules,
  });
  const policyId = createPolicyIdFromHash(policyHash);

  onPhase?.("sign-policy");
  const signature = await signPolicyOperation(
    operation,
    {
      operatorAddress: input.ownerWallet,
      agentId: input.agentId,
      walletId: wallet.walletId,
      policyId,
      sourcePolicyId: sourcePolicy?.policyId,
      policyVersion,
      policyHash,
      validFrom: input.validFrom,
      validUntil: input.validUntil,
    },
    signTypedDataAsync,
  );
  const operator = { address: input.ownerWallet, signature };

  let policy: Policy;
  try {
    policy = sourcePolicy
      ? await patchPolicy(
          sourcePolicy.policyId,
          {
            expectedPolicyVersion: sourcePolicy.policyVersion,
            validFrom: input.validFrom,
            validUntil: input.validUntil,
            rules: input.rules,
            semanticRules,
          },
          operator,
        )
      : await postPolicy(
          {
            agentId: input.agentId,
            walletId: wallet.walletId,
            validFrom: input.validFrom,
            validUntil: input.validUntil,
            rules: input.rules,
            semanticRules,
          },
          operator,
        );
  } catch (mutationError) {
    try {
      const reconciled = await getPolicy(policyId);
      if (reconciled.policyHash !== policyHash) throw mutationError;
      policy = reconciled;
    } catch {
      throw mutationError;
    }
  }

  const existingVersions = readCreatedAgentDetails().find(agent => agent.id === input.agentId)?.policyVersions ?? [];
  patchCreatedAgent(input.agentId, {
    policySummary: summarizePolicy(policy.rules),
    policy,
    policyVersions: [...existingVersions.filter(version => version.policyId !== policy.policyId), policy].sort(
      (left, right) => left.policyVersion - right.policyVersion,
    ),
  });

  return { policy, wallet };
}

/** Compatibility name used by the onboarding screen. */
export async function createPolicy(
  agentId: string,
  ownerWallet: `0x${string}`,
  rules: PolicyRules,
  signTypedDataAsync: SignPolicyCommitment,
  onPhase?: (phase: PolicyPhase) => void,
  options?: {
    validFrom?: number;
    validUntil?: number | null;
    sourcePolicy?: Policy;
    recoveryGuardianAddress?: string;
  },
): Promise<{ policy: Policy; wallet: ProtectedWalletInfo }> {
  return savePolicyDraft(
    {
      agentId,
      ownerWallet,
      rules,
      validFrom: options?.validFrom ?? Math.floor(Date.now() / 1000),
      validUntil: options?.validUntil ?? null,
      sourcePolicy: options?.sourcePolicy,
      recoveryGuardianAddress: options?.recoveryGuardianAddress,
    },
    signTypedDataAsync,
    onPhase,
  );
}

export async function activateProtection(
  agentId: string,
  selectedPolicy: Policy,
  ownerWallet: `0x${string}`,
  signTypedDataAsync: SignPolicyCommitment,
  onPhase?: (phase: PolicyPhase) => void,
): Promise<Policy> {
  let policy = await getPolicy(selectedPolicy.policyId);
  if (policy.agentId.toLowerCase() !== agentId.toLowerCase()) {
    throw new Error(`Policy ${policy.policyId} does not belong to agent ${agentId}.`);
  }

  if (policy.status === "DRAFT") {
    onPhase?.("sign-activation");
    const signature = await signPolicyOperation(
      "ACTIVATE_POLICY",
      {
        operatorAddress: ownerWallet,
        agentId: policy.agentId,
        walletId: policy.walletId,
        policyId: policy.policyId,
        policyVersion: policy.policyVersion,
        policyHash: policy.policyHash,
        validFrom: policy.validFrom,
        validUntil: policy.validUntil,
      },
      signTypedDataAsync,
    );
    try {
      policy = await postPolicyActivation(policy, { address: ownerWallet, signature });
    } catch (activationError) {
      policy = await getPolicy(policy.policyId);
      if (policy.status !== "ACTIVE") throw activationError;
    }
  }

  if (policy.status !== "ACTIVE") {
    throw new Error(`Policy ${policy.policyId} is ${policy.status} and cannot be activated.`);
  }
  const active = await getActivePolicy(policy.agentId, policy.walletId);
  if (active.effectiveStatus === "EXPIRED") {
    throw new Error(`Policy ${policy.policyId} is expired.`);
  }
  if (active.effectiveStatus !== "ACTIVE" || active.policy?.policyId !== policy.policyId) {
    throw new Error(`Policy ${policy.policyId} is not the effective active policy for this wallet.`);
  }

  const local = readCreatedAgentDetails().find(agent => agent.id === agentId);
  const versions = (local?.policyVersions ?? []).map(version =>
    version.policyId === active.policy?.policyId
      ? active.policy
      : version.status === "ACTIVE"
        ? { ...version, status: "SUPERSEDED" as const }
        : version,
  );
  patchCreatedAgent(agentId, {
    status: "protected",
    policy: active.policy,
    activePolicy: active.policy,
    effectivePolicyStatus: active.effectiveStatus,
    policyVersions: versions,
  });
  return active.policy;
}

async function ensureWallet(agentId: string, recoveryGuardianAddress?: string): Promise<ProtectedWalletInfo> {
  const existing = readCreatedAgentDetails().find(agent => agent.id === agentId);
  if (existing?.walletInfo) return existing.walletInfo;

  const wallet = await requestJson<AgentServiceWallet>(
    `/api/agent-service/agents/${encodeURIComponent(agentId)}/wallet`,
    { method: "POST", body: recoveryGuardianAddress ? { recoveryGuardianAddress } : {} },
  );
  if (!wallet.walletId) {
    throw new Error("The agent service did not persist a walletId. Configure DATABASE_URL before creating policies.");
  }
  if (wallet.owners.length !== 3 || wallet.threshold !== 2) {
    throw new Error(`Expected a 2-of-3 Safe with 3 owners, got ${wallet.threshold}-of-${wallet.owners.length}.`);
  }

  const walletInfo: ProtectedWalletInfo = {
    walletId: wallet.walletId,
    address: wallet.safeAddress,
    networkId: wallet.networkId ?? "hedera:testnet",
    status: "PROTECTED",
    agentSigner: wallet.owners[0],
    aegisCosigner: wallet.owners[1],
    guardian: wallet.owners[2],
    guardianManaged: !recoveryGuardianAddress,
    threshold: "2-of-3",
  };
  patchCreatedAgent(agentId, { wallet: wallet.safeAddress, walletInfo });
  return walletInfo;
}

async function signPolicyOperation(
  operation: PolicyCommitment["operation"],
  input: {
    operatorAddress: `0x${string}`;
    agentId: string;
    walletId: string;
    policyId: string;
    sourcePolicyId?: string;
    policyVersion: number;
    policyHash: Policy["policyHash"];
    validFrom: number;
    validUntil: number | null;
  },
  signTypedDataAsync: SignPolicyCommitment,
): Promise<`0x${string}`> {
  const commitment = buildPolicyCommitment({ operation, ...input });
  return signTypedDataAsync({
    domain: POLICY_COMMITMENT_DOMAIN,
    types: POLICY_COMMITMENT_TYPES,
    primaryType: "PolicyCommitment",
    message: commitment,
  });
}

function summarizePolicy(rules: PolicyRules): string {
  const asset = rules.allowedAssets[0];
  const max = formatPolicyAmount(rules.amount.max, asset);
  const count = rules.allowedDestinations.length;
  return `${max} max · ${count} destination${count === 1 ? "" : "s"}`;
}
