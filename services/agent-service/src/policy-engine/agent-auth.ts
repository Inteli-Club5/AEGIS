import { createHash } from "node:crypto";
import type { Request } from "express";
import { PolicyEngineError, unauthorized } from "./errors.js";
import type { AgentActorAuthenticator } from "./routes.js";

const AGENT_ID_RE = /^[a-z0-9][a-z0-9._:/-]{0,127}$/;
const MIN_TOKEN_LENGTH = 32;
const MAX_TOKEN_LENGTH = 512;
const MAX_AGENT_TOKENS = 1_000;

export function createEnvAgentActorAuthenticator(
  serializedTokens = process.env.AEGIS_AGENT_AUTH_TOKENS_JSON,
): AgentActorAuthenticator | undefined {
  if (!serializedTokens || serializedTokens.trim() === "") return undefined;

  let parsed: unknown;
  try {
    parsed = JSON.parse(serializedTokens);
  } catch {
    throw new Error("AEGIS_AGENT_AUTH_TOKENS_JSON must be valid JSON");
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    Array.isArray(parsed)
  ) {
    throw new Error(
      "AEGIS_AGENT_AUTH_TOKENS_JSON must map agent IDs to bearer tokens",
    );
  }
  const entries = Object.entries(parsed);
  if (entries.length === 0 || entries.length > MAX_AGENT_TOKENS) {
    throw new Error(
      "AEGIS_AGENT_AUTH_TOKENS_JSON must contain 1 to 1000 agents",
    );
  }

  const agentIdByTokenHash = new Map<string, string>();
  for (const [rawAgentId, rawToken] of entries) {
    const agentId = rawAgentId.trim().toLowerCase();
    if (!AGENT_ID_RE.test(agentId)) {
      throw new Error(
        "AEGIS_AGENT_AUTH_TOKENS_JSON contains an invalid agent ID",
      );
    }
    if (
      typeof rawToken !== "string" ||
      rawToken.length < MIN_TOKEN_LENGTH ||
      rawToken.length > MAX_TOKEN_LENGTH
    ) {
      throw new Error(
        "AEGIS_AGENT_AUTH_TOKENS_JSON tokens must contain 32 to 512 characters",
      );
    }
    const tokenHash = hashToken(rawToken);
    if (agentIdByTokenHash.has(tokenHash)) {
      throw new Error(
        "AEGIS_AGENT_AUTH_TOKENS_JSON bearer tokens must be unique",
      );
    }
    agentIdByTokenHash.set(tokenHash, agentId);
  }

  return async (request: Request) => {
    const token = extractBearerToken(request);
    const agentId = token ? agentIdByTokenHash.get(hashToken(token)) : undefined;
    if (!agentId) {
      unauthorized(
        "invalid_agent_auth",
        "valid agent bearer authentication is required",
      );
    }
    return {
      authenticatedAgentId: agentId,
      actorType: "AGENT" as const,
    };
  };
}

// Dynamically-created agents (e.g. registered through onboarding) get a random
// UUID unknowable in advance, so they can never be pre-provisioned into
// AEGIS_AGENT_AUTH_TOKENS_JSON. This authenticator instead trusts whatever
// per-agent token the service itself issued at agent-creation time (see
// store.ts's issueAgentAuthToken), letting a trusted internal caller (the
// dashboard's server, never the browser) fetch and use that specific agent's
// own credential.
export function createStoreAgentActorAuthenticator(
  resolveAgentIdForAuthToken: (token: string) => string | undefined,
): AgentActorAuthenticator {
  return async (request: Request) => {
    const token = extractBearerToken(request);
    const agentId = token ? resolveAgentIdForAuthToken(token) : undefined;
    if (!agentId) {
      unauthorized(
        "invalid_agent_auth",
        "valid agent bearer authentication is required",
      );
    }
    return {
      authenticatedAgentId: agentId,
      actorType: "AGENT" as const,
    };
  };
}

// Tries each configured authenticator in order and returns the first success,
// so the static env-provisioned tokens (integration/test agents) and the
// dynamic per-agent store tokens (onboarding-created agents) can be accepted
// side by side without either mechanism knowing about the other.
export function composeAgentActorAuthenticators(
  ...authenticators: (AgentActorAuthenticator | undefined)[]
): AgentActorAuthenticator | undefined {
  const configured = authenticators.filter(
    (authenticator): authenticator is AgentActorAuthenticator => authenticator !== undefined,
  );
  if (configured.length === 0) return undefined;
  if (configured.length === 1) return configured[0];

  return async (request: Request) => {
    let lastError: unknown;
    for (const authenticator of configured) {
      try {
        return await authenticator(request);
      } catch (error) {
        if (!(error instanceof PolicyEngineError)) throw error;
        lastError = error;
      }
    }
    throw lastError;
  };
}

function extractBearerToken(request: Request): string | undefined {
  const authorization = request.headers.authorization;
  if (typeof authorization !== "string" || !authorization.startsWith("Bearer ")) {
    return undefined;
  }
  const token = authorization.slice("Bearer ".length);
  if (token.length < MIN_TOKEN_LENGTH || token.length > MAX_TOKEN_LENGTH) {
    return undefined;
  }
  return token;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
