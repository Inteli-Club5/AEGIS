/**
 * Wizard write operations (screen-specification.md §5.1):
 *   createAgent → POST /agents        (connects an already-running agent)
 *   createPolicy → POST /policies     (schema still placeholder — see PolicyRecord)
 *   activateProtection → POST /agents/:id/activate
 * TODO(backend): simulated latency + localStorage persistence below. Swapping
 * the body of these functions for real HTTP calls is the entire integration
 * the backend needs to do.
 *
 * No wallet creation here: the protected Safe is provisioned by the backend
 * after activation, not by a wizard step (decisions.md 2026-07-24).
 */
import { AGENTS } from "@/lib/fixtures/agents";
import { patchCreatedAgent, readCreatedAgents, upsertCreatedAgent } from "@/lib/fixtures/store";
import type { AgentProfile, AgentType, Capability, PolicyRecord } from "@/lib/types/aegis";
import { deterministicHash } from "@/lib/utils/hash";

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function createAgent(input: {
  name: string;
  type: AgentType;
  description?: string;
  capabilities: Capability[];
}): Promise<AgentProfile> {
  await delay(1400);

  const name = input.name.trim();
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const candidateId = `agt_${slug}`;
  const taken = [...AGENTS, ...readCreatedAgents()].some(
    a => a.id !== candidateId && a.name.toLowerCase() === name.toLowerCase(),
  );
  if (taken) {
    throw new Error(`An agent named “${name}” already exists.`);
  }

  const profile: AgentProfile = {
    id: candidateId,
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
    capabilities: profile.capabilities,
    createdAt: profile.createdAt,
    walletInfo: null,
    policy: null,
  });

  return profile;
}

export async function createPolicy(agentId: string, fields: Record<string, string>): Promise<PolicyRecord> {
  await delay(1200);

  const record: PolicyRecord = {
    fields,
    policyHash: deterministicHash(`${agentId}:${JSON.stringify(fields)}`),
  };

  const preview = Object.values(fields)
    .find(v => v.trim())
    ?.slice(0, 40);
  patchCreatedAgent(agentId, {
    policySummary: preview ? `${preview}…` : "Policy attached",
    policy: record,
  });

  return record;
}

export async function activateProtection(agentId: string): Promise<void> {
  await delay(900);
  patchCreatedAgent(agentId, { status: "protected" });
}
