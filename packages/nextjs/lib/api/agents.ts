import { ApiError } from "~~/lib/api/http";
import { getAgentServiceProfile } from "~~/lib/api/onboarding";
import { getActivePolicy, listPolicyVersions } from "~~/lib/api/policies";
import { ACTIVITY } from "~~/lib/fixtures/activity";
import { readCreatedAgentDetails, readCreatedAgents, upsertCreatedAgent } from "~~/lib/fixtures/store";
import type {
  ActivityEntry,
  Agent,
  AgentDetail,
  AgentType,
  DashboardStats,
  ProtectedWalletInfo,
  StatsPeriod,
} from "~~/lib/types/aegis";

const SIMULATED_LATENCY_MS = 300;

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function listAgents(): Promise<Agent[]> {
  await delay(SIMULATED_LATENCY_MS);
  return readCreatedAgents();
}

export async function listActivity(agentId?: string): Promise<ActivityEntry[]> {
  await delay(SIMULATED_LATENCY_MS);
  return agentId ? ACTIVITY.filter(entry => entry.agentId === agentId) : ACTIVITY;
}

export async function getAgentDetail(id: string): Promise<AgentDetail | null> {
  const local = readCreatedAgentDetails().find(agent => agent.id === id);

  let profile;
  try {
    profile = await getAgentServiceProfile(id);
  } catch (error) {
    if (local) {
      return { ...local, policyLoadError: error instanceof Error ? error.message : "Agent service unavailable." };
    }
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
        guardianManaged: false,
        threshold: "2-of-3",
      }
    : (local?.walletInfo ?? null);

  const base: AgentDetail = local ?? {
    id: profile.agentId,
    name: profile.name ?? profile.agentId,
    type: toFrontendAgentType(profile.type),
    status: "unprotected",
    wallet: profile.safeAddress ?? "",
    balanceHbar: 0,
    policySummary: "—",
    lastActionAgo: "no local activity",
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
  upsertCreatedAgent(detail);
  return detail;
}

export async function getDashboardStats(period: StatsPeriod = 30): Promise<DashboardStats> {
  await delay(SIMULATED_LATENCY_MS);

  const inWindow =
    period === "all"
      ? ACTIVITY
      : ACTIVITY.filter(entry => {
          const ageMs = Date.now() - new Date(entry.timestamp).getTime();
          return ageMs <= period * 24 * 60 * 60 * 1000;
        });

  const approved = inWindow.filter(entry => entry.verdict === "ALLOW");
  const denied = inWindow.filter(entry => entry.verdict === "DENY");
  return {
    totalTrades: inWindow.length,
    approved: approved.length,
    denied: denied.length,
    hbarTransacted: approved.reduce((sum, entry) => sum + entry.amountHbar, 0),
  };
}

function toFrontendAgentType(type: string | undefined): AgentType {
  if (type === "Payment") return "Payment Agent";
  if (type === "API Buyer") return "API Buyer";
  if (type === "Treasury") return "Treasury Agent";
  if (type === "DeFi") return "DeFi Agent";
  return "Custom";
}
