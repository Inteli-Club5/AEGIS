/**
 * Local-only mutable state: agents created by the wizard live in
 * localStorage so the dashboard and the detail view (S10) can see them
 * (screen-specification.md §4). TODO: remove this file entirely once the
 * backend owns these mutations — `AgentDetail` is already the same shape
 * `GET /agents/:id` will return.
 */
import type { Agent, AgentDetail } from "~~/lib/types/aegis";

const KEY = "aegis.local-agents";

function normalize(raw: Partial<AgentDetail> & Agent): AgentDetail {
  const walletInfo = raw.walletInfo
    ? {
        ...raw.walletInfo,
        networkId: raw.walletInfo.networkId ?? ("hedera:testnet" as const),
        status: raw.walletInfo.status ?? ("PROTECTED" as const),
      }
    : null;
  return {
    ...raw,
    agentLifecycleStatus:
      raw.agentLifecycleStatus ?? (raw.status === "paused" || raw.status === "compromised" ? "PAUSED" : "ACTIVE"),
    capabilities: raw.capabilities ?? [],
    createdAt: raw.createdAt ?? new Date().toISOString(),
    walletInfo,
    policy: raw.policy ?? null,
    policyVersions: raw.policyVersions ?? (raw.policy ? [raw.policy] : []),
    activePolicy: raw.activePolicy ?? (raw.policy?.status === "ACTIVE" ? raw.policy : null),
    effectivePolicyStatus: raw.effectivePolicyStatus ?? (raw.policy?.status === "ACTIVE" ? "ACTIVE" : null),
  };
}

export function readCreatedAgentDetails(): AgentDetail[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(raw) ? raw.map(normalize) : [];
  } catch {
    return [];
  }
}

/** Dashboard summary — AgentDetail already satisfies Agent. */
export function readCreatedAgents(): Agent[] {
  return readCreatedAgentDetails();
}

export function upsertCreatedAgent(agent: AgentDetail) {
  const rest = readCreatedAgentDetails().filter(a => a.id !== agent.id);
  localStorage.setItem(KEY, JSON.stringify([agent, ...rest]));
}

export function patchCreatedAgent(id: string, patch: Partial<AgentDetail>) {
  const target = readCreatedAgentDetails().find(a => a.id === id);
  if (!target) return;
  upsertCreatedAgent({ ...target, ...patch });
}

export function deleteCreatedAgent(id: string) {
  localStorage.setItem(KEY, JSON.stringify(readCreatedAgentDetails().filter(a => a.id !== id)));
}
