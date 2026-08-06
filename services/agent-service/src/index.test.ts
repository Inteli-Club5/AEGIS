import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { describe, it } from "node:test";
import { PolicyEngineError } from "./policy-engine/errors.js";
import { createStoreAgentActorAuthenticator } from "./policy-engine/agent-auth.js";
import { createAgentServiceApp, fixedAgentActor } from "./index.js";
import { resolveAgentIdForAuthToken } from "./store.js";
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

  it("fails startup instead of silently defaulting the expected Agentic ID contract address", () => {
    const previous = process.env.ZERO_G_AGENTIC_ID_CONTRACT_ADDRESS;
    delete process.env.ZERO_G_AGENTIC_ID_CONTRACT_ADDRESS;
    try {
      assert.throws(
        () => createAgentServiceApp(),
        /ZERO_G_AGENTIC_ID_CONTRACT_ADDRESS is required/,
      );
    } finally {
      if (previous === undefined) {
        delete process.env.ZERO_G_AGENTIC_ID_CONTRACT_ADDRESS;
      } else {
        process.env.ZERO_G_AGENTIC_ID_CONTRACT_ADDRESS = previous;
      }
    }
  });

  it("fails startup instead of silently defaulting the expected Agentic ID chain id", () => {
    const previous = process.env.ZERO_G_GALILEO_CHAIN_ID;
    delete process.env.ZERO_G_GALILEO_CHAIN_ID;
    try {
      assert.throws(
        () => createAgentServiceApp(),
        /ZERO_G_GALILEO_CHAIN_ID is required/,
      );
    } finally {
      if (previous === undefined) {
        delete process.env.ZERO_G_GALILEO_CHAIN_ID;
      } else {
        process.env.ZERO_G_GALILEO_CHAIN_ID = previous;
      }
    }
  });

  it("fails startup when AEGIS_DASHBOARD_INTERNAL_TOKEN is configured below the minimum length", () => {
    const previous = process.env.AEGIS_DASHBOARD_INTERNAL_TOKEN;
    process.env.AEGIS_DASHBOARD_INTERNAL_TOKEN = "too-short";
    try {
      assert.throws(
        () => createAgentServiceApp(),
        /AEGIS_DASHBOARD_INTERNAL_TOKEN must be at least 32 characters/,
      );
    } finally {
      if (previous === undefined) {
        delete process.env.AEGIS_DASHBOARD_INTERNAL_TOKEN;
      } else {
        process.env.AEGIS_DASHBOARD_INTERNAL_TOKEN = previous;
      }
    }
  });

  // A valid, self-contained set of the five env vars that gate real payment
  // execution (see createPaymentExecutionServiceFromEnv) - deliberately not
  // sourced from the developer's local .env, so these tests prove the
  // regex/format check itself rather than passing by accident because the
  // other four vars happen to already be valid on this machine.
  const VALID_PAYMENT_EXECUTION_ENV = {
    AGENT_VERIFIER_SIGNER_PRIVATE_KEY: `0x${"11".repeat(32)}`,
    AEGIS_FEE_RECIPIENT_ADDRESS: `0x${"11".repeat(20)}`,
    RPC_URL: "https://example-rpc.test",
    COSIGNER_BASE_URL: "http://localhost:4100",
    DATABASE_URL: "postgresql://aegis:aegis@localhost:5432/aegis_test",
  };

  it("fails startup instead of accepting a malformed fee recipient address for real payment execution", () => {
    withEnvOverrides(
      { ...VALID_PAYMENT_EXECUTION_ENV, AEGIS_FEE_RECIPIENT_ADDRESS: "not-an-address" },
      () =>
        assert.throws(
          () => createAgentServiceApp(),
          /AEGIS_FEE_RECIPIENT_ADDRESS must be a valid EVM address/,
        ),
    );
  });

  it("fails startup instead of accepting a malformed verifier signer key for real payment execution", () => {
    withEnvOverrides(
      { ...VALID_PAYMENT_EXECUTION_ENV, AGENT_VERIFIER_SIGNER_PRIVATE_KEY: "0x_demo_key" },
      () =>
        assert.throws(
          () => createAgentServiceApp(),
          /AGENT_VERIFIER_SIGNER_PRIVATE_KEY must be a 32-byte hex private key/,
        ),
    );
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
  bearerToken?: string,
): Promise<Response> {
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  try {
    return await fetch(
      `http://127.0.0.1:${port}/agents/${AGENT_ID}/register-agentic-id`,
      {
        method: "POST",
        headers: {
          ...(body === undefined ? {} : { "content-type": "application/json" }),
          ...(bearerToken === undefined ? {} : { authorization: `Bearer ${bearerToken}` }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      },
    );
  } finally {
    server.close();
    await once(server, "close");
  }
}

describe("Internal agent auth-token route", () => {
  it("fails closed when no internal secret is configured", async () => {
    const response = await withInternalTokenEnv(undefined, () =>
      getAuthToken(createAgentServiceApp({ getAgent: () => profile() }), "correct-horse-battery-staple"),
    );
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error, "internal_auth_unconfigured");
  });

  it("rejects a missing or wrong internal secret", async () => {
    const response = await withInternalTokenEnv("the-real-secret-value-32-chars-min", () =>
      getAuthToken(createAgentServiceApp({ getAgent: () => profile() }), "wrong-secret"),
    );
    assert.equal(response.status, 401);
    assert.equal((await response.json()).error, "invalid_internal_auth");
  });

  it("returns not_found for an agent the store doesn't know about", async () => {
    const secret = "the-real-secret-value-32-chars-min";
    const response = await withInternalTokenEnv(secret, () =>
      getAuthToken(createAgentServiceApp({ getAgent: () => undefined }), secret),
    );
    assert.equal(response.status, 404);
    assert.equal((await response.json()).error, "not_found");
  });

  it("returns a bearer token that then authenticates as that exact agent", async () => {
    const secret = "the-real-secret-value-32-chars-min";
    const app = createAgentServiceApp({ getAgent: () => profile() });
    const response = await withInternalTokenEnv(secret, () => getAuthToken(app, secret));
    assert.equal(response.status, 200);
    const { token } = (await response.json()) as { token: string };
    assert.ok(token.length >= 32);

    const registration = await postRegistration(
      createAgentServiceApp({
        authenticateAgentActor: createStoreAgentActorAuthenticator(resolveAgentIdForAuthToken),
        registerAgenticId: async agentId => {
          assert.equal(agentId, AGENT_ID);
          return profile();
        },
      }),
      undefined,
      token,
    );
    assert.equal(registration.status, 201);
  });
});

function withEnvOverrides<T>(overrides: Record<string, string>, run: () => T): T {
  const previous: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(overrides)) {
    previous[key] = process.env[key];
    process.env[key] = value;
  }
  try {
    return run();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

async function withInternalTokenEnv<T>(value: string | undefined, run: () => Promise<T>): Promise<T> {
  const previous = process.env.AEGIS_DASHBOARD_INTERNAL_TOKEN;
  if (value === undefined) delete process.env.AEGIS_DASHBOARD_INTERNAL_TOKEN;
  else process.env.AEGIS_DASHBOARD_INTERNAL_TOKEN = value;
  try {
    return await run();
  } finally {
    if (previous === undefined) delete process.env.AEGIS_DASHBOARD_INTERNAL_TOKEN;
    else process.env.AEGIS_DASHBOARD_INTERNAL_TOKEN = previous;
  }
}

async function getAuthToken(
  app: ReturnType<typeof createAgentServiceApp>,
  presentedToken: string,
): Promise<Response> {
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  try {
    return await fetch(`http://127.0.0.1:${port}/internal/agents/${AGENT_ID}/auth-token`, {
      headers: { "x-aegis-internal-token": presentedToken },
    });
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
