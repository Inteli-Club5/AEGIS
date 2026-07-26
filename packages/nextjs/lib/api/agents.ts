import { ApiError } from "~~/lib/api/http";
import { deleteAgentServiceProfile, getAgentServiceProfile } from "~~/lib/api/onboarding";
import { getActivePolicy, listPolicyVersions } from "~~/lib/api/policies";
import type { AgentDetail, AgentType, ProtectedWalletInfo } from "~~/lib/types/aegis";

export async function deleteAgent(id: string): Promise<void> {
  await deleteAgentServiceProfile(id);
}

export async function getAgentDetail(id: string): Promise<AgentDetail | null> {
  let profile;
  try {
    profile = await getAgentServiceProfile(id);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }

  const walletInfo: ProtectedWalletInfo | null = profile.wallet
    ? {
        walletId: profile.wallet.walletId,
        address: profile.wallet.safeAddress,
        networkId: profile.wallet.networkId,
        status: profile.wallet.status,
        agentSigner: profile.wallet.owners[0],
        aegisCosigner: profile.wallet.owners[1],
        guardian: profile.wallet.owners[2],
        guardianManaged: profile.wallet.guardianManaged ?? false,
        threshold: "2-of-3",
      }
    : null;

  const base: AgentDetail = {
    id: profile.agentId,
    name: profile.name ?? profile.agentId,
    type: toFrontendAgentType(profile.type),
    status: "unprotected",
    wallet: profile.safeAddress ?? "",
    policySummary: "—",
    agentLifecycleStatus: profile.status === "inactive" ? "PAUSED" : "ACTIVE",
    description: profile.description,
    capabilities: [],
    createdAt: profile.createdAt ?? new Date().toISOString(),
    walletInfo,
    policy: null,
    policyVersions: [],
    activePolicy: null,
    effectivePolicyStatus: null,
    hederaAccountId: profile.hederaAccountId,
    agenticId: profile.agenticId,
  };

  let policy = base.policy;
  let policyVersions = base.policyVersions;
  let activePolicy = base.activePolicy;
  let effectivePolicyStatus = base.effectivePolicyStatus;
  let policyLoadError: string | undefined;

  if (walletInfo) {
    try {
      const active = await getActivePolicy(id, walletInfo.walletId);
      activePolicy = active.policy;
      effectivePolicyStatus = active.effectiveStatus;
      const seriesAnchor = policy?.policyId ?? active.policy?.policyId;
      if (seriesAnchor) {
        policyVersions = await listPolicyVersions(seriesAnchor);
        policy = policyVersions.at(-1) ?? active.policy;
      }
    } catch (error) {
      policyLoadError = error instanceof Error ? error.message : "Policy service unavailable.";
    }
  }

  const detail: AgentDetail = {
    ...base,
    agentLifecycleStatus: profile.status === "inactive" ? "PAUSED" : "ACTIVE",
    status: effectivePolicyStatus === "ACTIVE" ? "protected" : base.status,
    wallet: walletInfo?.address ?? profile.safeAddress ?? base.wallet,
    walletInfo,
    policy,
    policyVersions,
    activePolicy,
    effectivePolicyStatus,
    policyLoadError,
    hederaAccountId: profile.hederaAccountId,
    agenticId: profile.agenticId,
  };
  return detail;
}

function toFrontendAgentType(type: string | undefined): AgentType {
  if (type === "Payment") return "Payment Agent";
  if (type === "API Buyer") return "API Buyer";
  if (type === "Treasury") return "Treasury Agent";
  if (type === "DeFi") return "DeFi Agent";
  return "Custom";
}
