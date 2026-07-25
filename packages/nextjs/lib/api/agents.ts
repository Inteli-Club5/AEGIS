/**
 * TODO(backend): swappable data layer (screen-specification.md §4). Once the
 * backend exists, only the body of these functions needs to change — the
 * signatures and shapes are the real contract.
 */
import { ACTIVITY } from "@/lib/fixtures/activity";
import { AGENTS } from "@/lib/fixtures/agents";
import { readCreatedAgentDetails, readCreatedAgents } from "@/lib/fixtures/store";
import type { ActivityEntry, Agent, AgentDetail, DashboardStats, StatsPeriod } from "@/lib/types/aegis";

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

  const inWindow =
    period === "all"
      ? ACTIVITY
      : ACTIVITY.filter(e => {
          const ageMs = Date.now() - new Date(e.timestamp).getTime();
          return ageMs <= period * 24 * 60 * 60 * 1000;
        });

  const approved = inWindow.filter(e => e.verdict === "ALLOW");
  const denied = inWindow.filter(e => e.verdict === "DENY");
  return {
    totalTrades: inWindow.length,
    approved: approved.length,
    denied: denied.length,
    hbarTransacted: approved.reduce((sum, e) => sum + e.amountHbar, 0),
  };
}
