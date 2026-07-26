import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Request } from "express";
import { PolicyEngineError } from "./errors.js";
import { createEnvAgentActorAuthenticator } from "./agent-auth.js";

const TOKEN = "agent-auth-token-with-at-least-32-characters";

describe("environment-backed agent authentication", () => {
  it("returns no runtime adapter when credentials are absent", () => {
    assert.equal(createEnvAgentActorAuthenticator(""), undefined);
  });

  it("authenticates an opaque agent-specific bearer without retaining it as identity", async () => {
    const authenticate = createEnvAgentActorAuthenticator(
      JSON.stringify({ "Agent-1": TOKEN }),
    );
    assert.ok(authenticate);

    assert.deepEqual(
      await authenticate(requestWithAuthorization(`Bearer ${TOKEN}`)),
      {
        authenticatedAgentId: "agent-1",
        actorType: "AGENT",
      },
    );
  });

  it("rejects missing, malformed, or unknown bearer credentials", async () => {
    const authenticate = createEnvAgentActorAuthenticator(
      JSON.stringify({ "agent-1": TOKEN }),
    );
    assert.ok(authenticate);
    for (const authorization of [
      undefined,
      "Basic credentials",
      "Bearer short",
      `Bearer ${"x".repeat(40)}`,
    ]) {
      await assert.rejects(
        authenticate(requestWithAuthorization(authorization)),
        (error: unknown) =>
          error instanceof PolicyEngineError &&
          error.status === 401 &&
          error.code === "invalid_agent_auth",
      );
    }
  });

  it("rejects malformed configuration and token reuse at startup", () => {
    for (const configuration of [
      "not-json",
      "[]",
      "{}",
      JSON.stringify({ "invalid agent": TOKEN }),
      JSON.stringify({ "agent-1": "short" }),
      JSON.stringify({ "agent-1": TOKEN, "agent-2": TOKEN }),
    ]) {
      assert.throws(() => createEnvAgentActorAuthenticator(configuration));
    }
  });
});

function requestWithAuthorization(
  authorization: string | undefined,
): Request {
  return {
    headers:
      authorization === undefined ? {} : { authorization },
  } as Request;
}
