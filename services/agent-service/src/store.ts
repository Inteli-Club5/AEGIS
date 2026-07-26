import { createHash, randomBytes } from "node:crypto";
import type { AgentProfile } from "./types.js";

// TODO(aegis): replace with a real database.
const profiles = new Map<string, AgentProfile>();
const privateKeys = new Map<string, string>();
const agentAuthTokens = new Map<string, string>();
const agentIdByAuthTokenHash = new Map<string, string>();

export function saveAgent(profile: AgentProfile, privateKey: string): void {
  profiles.set(profile.agentId, profile);
  privateKeys.set(profile.agentId, privateKey);
  issueAgentAuthToken(profile.agentId);
}

export function getAgent(agentId: string): AgentProfile | undefined {
  return profiles.get(agentId);
}

export function getAgentPrivateKey(agentId: string): string | undefined {
  return privateKeys.get(agentId);
}

export function deleteAgent(agentId: string): void {
  profiles.delete(agentId);
  privateKeys.delete(agentId);
  const token = agentAuthTokens.get(agentId);
  if (token) agentIdByAuthTokenHash.delete(hashAuthToken(token));
  agentAuthTokens.delete(agentId);
}

// Every agent gets its own bearer credential the moment it's created, so the
// dashboard (a trusted internal caller, see resolveAgentIdForAuthToken) can act
// on its behalf without waiting on out-of-band env provisioning. Re-issuing is
// idempotent per agent: saveAgent may be called more than once for the same
// agentId (e.g. reconciliation paths), and callers must not silently rotate an
// already-issued token out from under a caller still holding it.
export function issueAgentAuthToken(agentId: string): string {
  const existing = agentAuthTokens.get(agentId);
  if (existing) return existing;
  const token = randomBytes(32).toString("hex");
  agentAuthTokens.set(agentId, token);
  agentIdByAuthTokenHash.set(hashAuthToken(token), agentId);
  return token;
}

export function getAgentAuthToken(agentId: string): string | undefined {
  return agentAuthTokens.get(agentId);
}

export function resolveAgentIdForAuthToken(token: string): string | undefined {
  return agentIdByAuthTokenHash.get(hashAuthToken(token));
}

function hashAuthToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function setAgentSafeAddress(
  agentId: string,
  safeAddress: string,
): AgentProfile | undefined {
  const profile = profiles.get(agentId);
  if (!profile) return undefined;
  const updated = { ...profile, safeAddress };
  profiles.set(agentId, updated);
  return updated;
}

export function setAgentWallet(
  agentId: string,
  wallet: NonNullable<AgentProfile["wallet"]>,
): AgentProfile | undefined {
  const profile = profiles.get(agentId);
  if (!profile) return undefined;
  const updated = { ...profile, safeAddress: wallet.safeAddress, wallet };
  profiles.set(agentId, updated);
  return updated;
}

export function setAgentAgenticId(
  agentId: string,
  agenticId: NonNullable<AgentProfile["agenticId"]>,
): AgentProfile | undefined {
  const profile = profiles.get(agentId);
  if (!profile) return undefined;
  const updated = { ...profile, agenticId };
  profiles.set(agentId, updated);
  return updated;
}
