import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { describe, it } from "node:test";
import { PolicyEngineError } from "./policy-engine/errors.js";
import { createAgentServiceApp, fixedAgentActor } from "./index.js";
import type { AgentProfile } from "./types.js";

const AGENT_ID = "agent-route-auth";

describe("Agentic ID registration route authentication", () => {
  it("fails startup instead of substituting a security profile for invalid configuration", () => {
    const previous = process.env.ZG_TEEML_SECURITY_PROFILE;
    process.env.ZG_TEEML_SECURITY_PROFILE = "automatic-fallback";
    try {
      assert.throws(
        () => createAgentServiceApp(),
        /ZG_TEEML_SECURITY_PROFILE is invalid/,
      );
    } finally {
      if (previous === undefined) {
        delete process.env.ZG_TEEML_SECURITY_PROFILE;
      } else {
        process.env.ZG_TEEML_SECURITY_PROFILE = previous;
      }
    }
  });

  it("fails before registration when agent authentication is unconfigured", async () => {
    let registrationCalls = 0;
    const response = await postRegistration(
      createAgentServiceApp({
        registerAgenticId: async () => {
          registrationCalls += 1;
          return profile();
        },
      }),
    );

    assert.equal(response.status, 503);
    assert.equal((await response.json()).error, "agent_auth_unconfigured");
    assert.equal(registrationCalls, 0);
  });

  it("preserves controlled authenticator errors instead of converting them to 500", async () => {
    let registrationCalls = 0;
    const response = await postRegistration(
      createAgentServiceApp({
        authenticateAgentActor: async () => {
          throw new PolicyEngineError(
            401,
            "invalid_agent_auth",
            "agent credential is invalid",
          );
        },
        registerAgenticId: async () => {
          registrationCalls += 1;
          return profile();
        },
      }),
    );

    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), {
      error: "invalid_agent_auth",
      message: "agent credential is invalid",
    });
    assert.equal(registrationCalls, 0);
  });

  it("rejects an authenticated agent that does not own the route identifier", async () => {
    let registrationCalls = 0;
    const response = await postRegistration(
      createAgentServiceApp({
        authenticateAgentActor: async () => fixedAgentActor("another-agent"),
        registerAgenticId: async () => {
          registrationCalls += 1;
          return profile();
        },
      }),
    );

    assert.equal(response.status, 403);
    assert.equal((await response.json()).error, "agent_context_mismatch");
    assert.equal(registrationCalls, 0);
  });

  it("rejects every registration body property before calling the coordinator", async () => {
    let registrationCalls = 0;
    const response = await postRegistration(
      createAgentServiceApp({
        authenticateAgentActor: async () => fixedAgentActor(AGENT_ID),
        registerAgenticId: async () => {
          registrationCalls += 1;
          return profile();
        },
      }),
      { reason: "caller-controlled prose" },
    );

    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, "unknown_property");
    assert.equal(registrationCalls, 0);
  });

  it("allows the matching authenticated agent through the durable coordinator boundary", async () => {
    let registeredAgentId = "";
    const response = await postRegistration(
      createAgentServiceApp({
        authenticateAgentActor: async () => fixedAgentActor(AGENT_ID),
        registerAgenticId: async (agentId) => {
          registeredAgentId = agentId;
          return profile();
        },
      }),
    );

    assert.equal(response.status, 201);
    assert.equal((await response.json()).agentId, AGENT_ID);
    assert.equal(registeredAgentId, AGENT_ID);
  });
});

async function postRegistration(
  app: ReturnType<typeof createAgentServiceApp>,
  body?: unknown,
): Promise<Response> {
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  try {
    return await fetch(
      `http://127.0.0.1:${port}/agents/${AGENT_ID}/register-agentic-id`,
      {
        method: "POST",
        ...(body === undefined
          ? {}
          : {
              body: JSON.stringify(body),
              headers: { "content-type": "application/json" },
            }),
      },
    );
  } finally {
    server.close();
    await once(server, "close");
  }
}

function profile(): AgentProfile {
  return {
    agentId: AGENT_ID,
    ownerWallet: "0x1111111111111111111111111111111111111111",
    name: "Agent",
    type: "Payment",
    hederaAccountId: "0.0.123",
    evmAddress: "0x2222222222222222222222222222222222222222",
    publicKey: "public-key",
    toolNames: ["hedera.transfer.hbar"],
    status: "active",
    createdAt: "2026-07-25T12:00:00.000Z",
  };
}
