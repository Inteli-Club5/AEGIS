/**
 * Wizard write operations (screen-specification.md §5.1):
 *   createAgent → POST /api/agent-service/agents (services/agent-service:
 *     creates a real Hedera account for the agent - AEGIS creates the agent,
 *     per decisions.md; this is not "bring your own agent")
 *   createPolicy → POST /policies (TODO(backend): no PolicyRegistry contract
 *     exists yet - stays local/fixture until it does)
 *   activateProtection → deploys the real Safe 2-of-3 wallet, then registers
 *     the real 0G Agentic ID (both via services/agent-service)
 */
import { AGENTS } from "@/lib/fixtures/agents";
import {
  patchCreatedAgent,
  readCreatedAgentDetails,
  readCreatedAgents,
  upsertCreatedAgent,
} from "@/lib/fixtures/store";
import type { AgentProfile, AgentType, Capability, PolicyRecord } from "@/lib/types/aegis";
import { deterministicHash } from "@/lib/utils/hash";

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function postJson<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      typeof data === "object" && data && "error" in data ? String((data as { error: unknown }).error) : null;
    throw new Error(message || `Request to ${path} failed (${res.status}).`);
  }
  return data as T;
}

const AGENT_SERVICE_TYPE: Record<AgentType, "Payment" | "API Buyer" | "DeFi" | "Treasury" | "Other"> = {
  "Payment Agent": "Payment",
  "API Buyer": "API Buyer",
  "Treasury Agent": "Treasury",
  "DeFi Agent": "DeFi",
  Custom: "Other",
};

type AgentServiceProfile = {
  agentId: string;
  hederaAccountId: string;
  safeAddress?: string;
  agenticId?: {
    tokenId: string;
    contractAddress: string;
    metadataURI: string;
    explorerUrl: string;
  };
};

type AgentServiceWallet = {
  safeAddress: string;
  owners: string[];
  threshold: number;
  transactionHash: string;
};

export async function createAgent(input: {
  name: string;
  type: AgentType;
  description?: string;
  capabilities: Capability[];
  ownerWallet: string;
}): Promise<AgentProfile> {
  const name = input.name.trim();
  // UX nicety only, not a uniqueness guarantee: agent-service has no name-collision check of
  // its own, so this only prevents confusing this one browser's own dashboard with two
  // same-named cards -- a different tab or a cleared localStorage can still create a real
  // duplicate.
  const taken = [...AGENTS, ...readCreatedAgents()].some(a => a.name.toLowerCase() === name.toLowerCase());
  if (taken) {
    throw new Error(`An agent named "${name}" already exists.`);
  }

  const created = await postJson<AgentServiceProfile>("/api/agent-service/agents", {
    ownerWallet: input.ownerWallet,
    name,
    type: AGENT_SERVICE_TYPE[input.type],
    description: input.description || undefined,
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
    capabilities: profile.capabilities,
    createdAt: profile.createdAt,
    walletInfo: null,
    policy: null,
    hederaAccountId: created.hederaAccountId,
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

export type ActivationPhase = "wallet" | "agentic-id";

export async function activateProtection(agentId: string, onPhase?: (phase: ActivationPhase) => void): Promise<void> {
  const existing = readCreatedAgentDetails().find(a => a.id === agentId);

  if (!existing?.walletInfo) {
    onPhase?.("wallet");
    const wallet = await postJson<AgentServiceWallet>(`/api/agent-service/agents/${agentId}/wallet`, {});
    if (wallet.owners.length !== 3) {
      throw new Error(`Expected a 2-of-3 Safe with 3 owners, got ${wallet.owners.length}.`);
    }

    patchCreatedAgent(agentId, {
      wallet: wallet.safeAddress,
      walletInfo: {
        address: wallet.safeAddress,
        agentSigner: wallet.owners[0],
        aegisCosigner: wallet.owners[1],
        guardian: wallet.owners[2],
        guardianManaged: false,
        threshold: "2-of-3",
      },
    });
  }

  onPhase?.("agentic-id");
  const profile = await postJson<AgentServiceProfile>(`/api/agent-service/agents/${agentId}/agentic-id`);

  patchCreatedAgent(agentId, {
    status: "protected",
    agenticId: profile.agenticId,
  });
}
