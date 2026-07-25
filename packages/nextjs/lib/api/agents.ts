/**
 * TODO(backend): swappable data layer (screen-specification.md §4). Once the
 * backend exists, only the body of these functions needs to change — the
 * signatures and shapes are the real contract.
 */
import { ACTIVITY } from "@/lib/fixtures/activity";
import { AGENTS } from "@/lib/fixtures/agents";
import { readCreatedAgentDetails, readCreatedAgents } from "@/lib/fixtures/store";
import type {
  ActivityEntry,
  Agent,
  AgentDetail,
  DashboardStats,
  KeyExportResult,
  StatsPeriod,
} from "@/lib/types/aegis";
import { filterByPeriod, summarizeActivity } from "@/lib/utils/stats";

const SIMULATED_LATENCY_MS = 600;

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function listAgents(): Promise<Agent[]> {
  await delay(SIMULATED_LATENCY_MS);
  return [...readCreatedAgents(), ...AGENTS];
}

export async function listActivity(agentId?: string): Promise<ActivityEntry[]> {
  await delay(SIMULATED_LATENCY_MS);
  return agentId ? ACTIVITY.filter(e => e.agentId === agentId) : ACTIVITY;
}

export async function getAgentDetail(id: string): Promise<AgentDetail | null> {
  await delay(SIMULATED_LATENCY_MS);
  return readCreatedAgentDetails().find(a => a.id === id) ?? AGENTS.find(a => a.id === id) ?? null;
}

export async function getDashboardStats(period: StatsPeriod = 30): Promise<DashboardStats> {
  await delay(SIMULATED_LATENCY_MS);
  return summarizeActivity(filterByPeriod(ACTIVITY, period));
}

/**
 * TODO(backend): irreversible key export. The real flow verifies the operator's
 * 2FA challenge, revokes the AEGIS co-signer on the agent's Safe, marks the
 * agent unusable on AEGIS, and only then returns the key — once. Until that
 * endpoint exists this always answers "unavailable": never fabricate a key here.
 */
export async function revealAgentPrivateKey(agentId: string, twoFactorCode: string): Promise<KeyExportResult> {
  await delay(SIMULATED_LATENCY_MS);
  if (!agentId || !/^\d{6}$/.test(twoFactorCode)) {
    return { status: "rejected", message: "That verification code isn't valid. Enter the 6 digits from your app." };
  }
  return {
    status: "unavailable",
    message:
      "Key export is not wired yet. It unlocks once the backend exposes the export endpoint and the 2FA challenge is live.",
  };
}
