import assert from "node:assert/strict";
import { once } from "node:events";
import type { Server } from "node:http";
import { describe, it } from "node:test";
import { createAgentServiceApp } from "./index.js";
import { InMemoryPolicyRepository } from "./policy-engine/repository.js";
import { UnconfiguredPolicyRepository } from "./policy-engine/db/postgres.js";

const OWNER = "0x1111111111111111111111111111111111111111" as const;
const OTHER_OWNER = "0x2222222222222222222222222222222222222222" as const;
const AGENT_ID = "018f0000-0000-7000-8000-0000000000aa";
const OTHER_AGENT_ID = "018f0000-0000-7000-8000-0000000000bb";

describe("GET /agents?owner= (dashboard's owner-scoped agent list)", () => {
  it("returns only the requested owner's agentIds, not another owner's", async () => {
    const policyRepository = new InMemoryPolicyRepository();
    await policyRepository.saveAgent({
      agentId: AGENT_ID,
      ownerAddress: OWNER,
      status: "ACTIVE",
      createdAt: 1000,
      updatedAt: 1000,
    });
    await policyRepository.saveAgent({
      agentId: OTHER_AGENT_ID,
      ownerAddress: OTHER_OWNER,
      status: "ACTIVE",
      createdAt: 1000,
      updatedAt: 1000,
    });

    const app = createAgentServiceApp({ policyRepository });

    await withServer(app, async baseUrl => {
      const response = await fetch(`${baseUrl}/agents?owner=${OWNER}`);
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.deepEqual(body.agentIds, [AGENT_ID]);
    });
  });

  it("does not leak the full in-memory profile (Safe address, owners, description, ...) in bulk -- only agentIds", async () => {
    const policyRepository = new InMemoryPolicyRepository();
    await policyRepository.saveAgent({
      agentId: AGENT_ID,
      ownerAddress: OWNER,
      status: "ACTIVE",
      createdAt: 1000,
      updatedAt: 1000,
    });
    const app = createAgentServiceApp({ policyRepository });

    await withServer(app, async baseUrl => {
      const response = await fetch(`${baseUrl}/agents?owner=${OWNER}`);
      const body = await response.json();
      assert.deepEqual(Object.keys(body), ["agentIds"]);
    });
  });

  it("still lists an agent whose in-memory profile store is empty (e.g. after a service restart) -- the durable Postgres index is the source of truth, not the in-memory map", async () => {
    const policyRepository = new InMemoryPolicyRepository();
    await policyRepository.saveAgent({
      agentId: AGENT_ID,
      ownerAddress: OWNER,
      status: "ACTIVE",
      createdAt: 1000,
      updatedAt: 1000,
    });

    // Simulates a restarted process: the in-memory profile map is empty, but
    // the durable repository (a real DB in production) still has the row.
    const app = createAgentServiceApp({ policyRepository, getAgent: () => undefined });

    await withServer(app, async baseUrl => {
      const response = await fetch(`${baseUrl}/agents?owner=${OWNER}`);
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.deepEqual(body.agentIds, [AGENT_ID]);
    });
  });

  it("rejects a missing or malformed owner query parameter", async () => {
    const app = createAgentServiceApp({ policyRepository: new InMemoryPolicyRepository() });

    await withServer(app, async baseUrl => {
      const missing = await fetch(`${baseUrl}/agents`);
      assert.equal(missing.status, 400);

      const malformed = await fetch(`${baseUrl}/agents?owner=not-an-address`);
      assert.equal(malformed.status, 400);
    });
  });

  it("fails closed with 503 when the policy database is not configured", async () => {
    const app = createAgentServiceApp({ policyRepository: new UnconfiguredPolicyRepository() });

    await withServer(app, async baseUrl => {
      const response = await fetch(`${baseUrl}/agents?owner=${OWNER}`);
      assert.equal(response.status, 503);
    });
  });
});

async function withServer(
  app: ReturnType<typeof createAgentServiceApp>,
  operation: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  try {
    await operation(`http://127.0.0.1:${address.port}`);
  } finally {
    await closeServer(server);
  }
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close(error => (error ? reject(error) : resolve()));
  });
}
