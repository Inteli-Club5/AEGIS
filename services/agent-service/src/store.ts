import type { AgentProfile } from "./types.js";

// TODO(aegis): replace with a real database.
const profiles = new Map<string, AgentProfile>();
const privateKeys = new Map<string, string>();

export function saveAgent(profile: AgentProfile, privateKey: string): void {
  profiles.set(profile.agentId, profile);
  privateKeys.set(profile.agentId, privateKey);
}

export function getAgent(agentId: string): AgentProfile | undefined {
  return profiles.get(agentId);
}

export function getAgentPrivateKey(agentId: string): string | undefined {
  return privateKeys.get(agentId);
}
