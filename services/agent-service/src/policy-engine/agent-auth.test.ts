import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Request } from "express";
import { PolicyEngineError } from "./errors.js";
import {
  composeAgentActorAuthenticators,
  createEnvAgentActorAuthenticator,
  createStoreAgentActorAuthenticator,
} from "./agent-auth.js";

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

describe("store-backed agent authentication", () => {
  it("authenticates via a resolver function, not a static map", async () => {
    const authenticate = createStoreAgentActorAuthenticator(token =>
      token === TOKEN ? "dynamic-agent-1" : undefined,
    );

    assert.deepEqual(
      await authenticate(requestWithAuthorization(`Bearer ${TOKEN}`)),
      { authenticatedAgentId: "dynamic-agent-1", actorType: "AGENT" },
    );
  });

  it("rejects a token the resolver doesn't recognize", async () => {
    const authenticate = createStoreAgentActorAuthenticator(() => undefined);

    await assert.rejects(
      authenticate(requestWithAuthorization(`Bearer ${TOKEN}`)),
      (error: unknown) =>
        error instanceof PolicyEngineError &&
        error.status === 401 &&
        error.code === "invalid_agent_auth",
    );
  });
});

describe("composeAgentActorAuthenticators", () => {
  it("returns undefined when nothing is configured", () => {
    assert.equal(composeAgentActorAuthenticators(undefined, undefined), undefined);
  });

  it("passes through a single configured authenticator unchanged", () => {
    const only = createStoreAgentActorAuthenticator(() => "solo-agent");
    assert.equal(composeAgentActorAuthenticators(only, undefined), only);
  });

  it("falls through to the next authenticator on rejection, in order", async () => {
    const storeAuth = createStoreAgentActorAuthenticator(token =>
      token === "store-token-with-at-least-32-characters" ? "store-agent" : undefined,
    );
    const envAuth = createEnvAgentActorAuthenticator(
      JSON.stringify({ "env-agent": TOKEN }),
    );
    const composed = composeAgentActorAuthenticators(storeAuth, envAuth);
    assert.ok(composed);

    assert.deepEqual(
      await composed(requestWithAuthorization(`Bearer ${TOKEN}`)),
      { authenticatedAgentId: "env-agent", actorType: "AGENT" },
    );
    assert.deepEqual(
      await composed(
        requestWithAuthorization(
          "Bearer store-token-with-at-least-32-characters",
        ),
      ),
      { authenticatedAgentId: "store-agent", actorType: "AGENT" },
    );
  });

  it("rejects when no configured authenticator recognizes the token", async () => {
    const composed = composeAgentActorAuthenticators(
      createStoreAgentActorAuthenticator(() => undefined),
      createEnvAgentActorAuthenticator(JSON.stringify({ "env-agent": TOKEN })),
    );
    assert.ok(composed);

    await assert.rejects(
      composed(requestWithAuthorization("Bearer " + "z".repeat(40))),
      (error: unknown) =>
        error instanceof PolicyEngineError && error.status === 401,
    );
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
