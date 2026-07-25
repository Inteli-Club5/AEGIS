import { keccak256, stringToHex } from "viem";
import { getAgent, setAgentAgenticId } from "./store.js";
import type { AgentProfile } from "./types.js";

const EVM_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

export class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// TODO(policy-registry): replace with the real on-chain PolicyRegistry hash
// once that contract exists. Fixed placeholder so the 0G Agentic ID
// registration can be exercised end-to-end before PolicyRegistry lands.
const PLACEHOLDER_POLICY_HASH = keccak256(stringToHex("aegis-default-policy-v0"));

function getDashboardUrl(): string {
  return process.env.AEGIS_DASHBOARD_URL ?? "http://localhost:3000";
}

export async function registerAgenticId(agentId: string): Promise<AgentProfile> {
  const profile = getAgent(agentId);
  if (!profile) {
    throw new Error("agent_not_found");
  }
  if (!profile.safeAddress) {
    throw new Error("agent_wallet_not_created");
  }
  if (!EVM_ADDRESS_RE.test(profile.ownerWallet)) {
    throw new HttpError(400, "ownerWallet must be a valid EVM address to register an Agentic ID");
  }

  const dashboardUrl = getDashboardUrl();
  const response = await fetch(`${dashboardUrl}/api/0g/agentic-id`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      aegisAgentId: profile.agentId,
      ownerAddress: profile.ownerWallet,
      agentName: profile.name,
      agentDescription: profile.description || profile.name,
      agentType: profile.type,
      capabilities: profile.toolNames,
      agentWalletAddress: profile.safeAddress,
      policyHash: PLACEHOLDER_POLICY_HASH,
    }),
  });

  let body: {
    error?: string;
    agenticIdTokenId?: string;
    agenticIdContractAddress?: string;
    metadataURI?: string;
    explorerUrl?: string;
  };
  try {
    body = await response.json();
  } catch {
    throw new HttpError(502, `failed to parse response from AEGIS_DASHBOARD_URL (${dashboardUrl}) - is the dashboard running?`);
  }

  if (!response.ok) {
    throw new HttpError(response.status, body.error || `0G Agentic ID registration failed with status ${response.status}`);
  }

  if (!body.agenticIdTokenId || !body.agenticIdContractAddress || !body.metadataURI || !body.explorerUrl) {
    throw new HttpError(502, "0G Agentic ID registration response is missing expected fields");
  }

  const updated = setAgentAgenticId(agentId, {
    tokenId: body.agenticIdTokenId,
    contractAddress: body.agenticIdContractAddress,
    metadataURI: body.metadataURI,
    explorerUrl: body.explorerUrl,
  });

  if (!updated) {
    throw new Error("agent_not_found");
  }

  return updated;
}
