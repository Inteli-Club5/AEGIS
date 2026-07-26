import { createHash } from "node:crypto";
import type { Request } from "express";
import { unauthorized } from "./errors.js";
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
    const authorization = request.headers.authorization;
    if (
      typeof authorization !== "string" ||
      !authorization.startsWith("Bearer ")
    ) {
      unauthorized(
        "invalid_agent_auth",
        "valid agent bearer authentication is required",
      );
    }
    const token = authorization.slice("Bearer ".length);
    if (
      token.length < MIN_TOKEN_LENGTH ||
      token.length > MAX_TOKEN_LENGTH
    ) {
      unauthorized(
        "invalid_agent_auth",
        "valid agent bearer authentication is required",
      );
    }
    const agentId = agentIdByTokenHash.get(hashToken(token));
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

function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
