import assert from "node:assert/strict";
import { once } from "node:events";
import type { Server } from "node:http";
import { describe, it } from "node:test";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createAgentServiceApp } from "./index.js";
import { AGENT_COMMITMENT_DOMAIN, AGENT_COMMITMENT_TYPES, buildAgentCommitment } from "./policy-engine/auth.js";
import { InMemoryPolicyRepository } from "./policy-engine/repository.js";
import type { AgentCommitment, AgentCommitmentOperation } from "./policy-engine/types.js";
import type { AgentProfile } from "./types.js";

const AGENT_ID = "018f0000-0000-7000-8000-0000000000bb";
const owner = privateKeyToAccount(generatePrivateKey());
const attacker = privateKeyToAccount(generatePrivateKey());

describe("Agent lifecycle authentication (create-agents, create-wallets, delete)", () => {
  it("rejects an unsigned create-agents call and accepts the owner's signature", async () => {
    let created = 0;
    const app = createAgentServiceApp({
      policyRepository: new InMemoryPolicyRepository(),
      createAgent: async input => {
        created += 1;
        return fakeProfile(input.ownerWallet as `0x${string}`);
      },
    });

    await withServer(app, async baseUrl => {
      const unsigned = await fetch(`${baseUrl}/create-agents`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(createAgentBody(owner.address)),
      });
      assert.equal(unsigned.status, 401);
      assert.equal(created, 0);

      const wrongSigner = await fetch(`${baseUrl}/create-agents`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(await signCreateAgent(owner.address, attacker)) },
        body: JSON.stringify(createAgentBody(owner.address)),
      });
      assert.equal(wrongSigner.status, 403);
      assert.equal(created, 0);

      const authorized = await fetch(`${baseUrl}/create-agents`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(await signCreateAgent(owner.address, owner)) },
        body: JSON.stringify(createAgentBody(owner.address)),
      });
      assert.equal(authorized.status, 201);
      assert.equal(created, 1);
    });
  });

  it("rejects a stale create-agents signature", async () => {
    const app = createAgentServiceApp({
      policyRepository: new InMemoryPolicyRepository(),
      createAgent: async input => fakeProfile(input.ownerWallet as `0x${string}`),
    });

    await withServer(app, async baseUrl => {
      const staleIssuedAt = String(Math.floor(Date.now() / 1000) - 3600);
      const headers = await signCommitment(
        "CREATE_AGENT",
        { ownerWallet: owner.address, name: "Test agent", agentType: "Payment" },
        owner,
        staleIssuedAt,
      );
      const response = await fetch(`${baseUrl}/create-agents`, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify(createAgentBody(owner.address)),
      });
      assert.equal(response.status, 401);
      const body = await response.json();
      assert.equal(body.error, "operator_authorization_expired");
    });
  });

  it("rejects a create-agents request whose body was tampered after signing", async () => {
    let created = 0;
    const app = createAgentServiceApp({
      policyRepository: new InMemoryPolicyRepository(),
      createAgent: async input => {
        created += 1;
        return fakeProfile(input.ownerWallet as `0x${string}`);
      },
    });

    await withServer(app, async baseUrl => {
      const headers = await signCreateAgent(owner.address, owner);
      const tamperedBody = { ...createAgentBody(owner.address), name: "Tampered name" };
      const response = await fetch(`${baseUrl}/create-agents`, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify(tamperedBody),
      });
      assert.equal(response.status, 401);
      const body = await response.json();
      assert.equal(body.error, "invalid_operator_signature");
      assert.equal(created, 0);
    });
  });

  it("rejects a replayed create-agents signature", async () => {
    let created = 0;
    const app = createAgentServiceApp({
      policyRepository: new InMemoryPolicyRepository(),
      createAgent: async input => {
        created += 1;
        return fakeProfile(input.ownerWallet as `0x${string}`);
      },
    });

    await withServer(app, async baseUrl => {
      const headers = await signCreateAgent(owner.address, owner);
      const body = JSON.stringify(createAgentBody(owner.address));
      const first = await fetch(`${baseUrl}/create-agents`, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body,
      });
      assert.equal(first.status, 201);
      assert.equal(created, 1);

      const replayed = await fetch(`${baseUrl}/create-agents`, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body,
      });
      assert.equal(replayed.status, 409);
      assert.equal((await replayed.json()).error, "replayed_operator_signature");
      assert.equal(created, 1);
    });
  });

  it("requires the existing owner's signature before deploying a wallet", async () => {
    let deployed = 0;
    const repository = new InMemoryPolicyRepository();
    const app = createAgentServiceApp({
      policyRepository: repository,
      getAgent: agentId => (agentId === AGENT_ID ? fakeProfile(owner.address) : undefined),
      createWallet: async () => {
        deployed += 1;
        return {
          safeAddress: `0x${"c0".repeat(20)}` as `0x${string}`,
          owners: [`0x${"c1".repeat(20)}`, `0x${"c2".repeat(20)}`, `0x${"c3".repeat(20)}`] as `0x${string}`[],
          threshold: 2,
          transactionHash: `0x${"11".repeat(32)}` as `0x${string}`,
        };
      },
    });

    await withServer(app, async baseUrl => {
      const unsigned = await fetch(`${baseUrl}/agents/${AGENT_ID}/create-wallets`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      assert.equal(unsigned.status, 401);
      assert.equal(deployed, 0);

      const wrongSigner = await fetch(`${baseUrl}/agents/${AGENT_ID}/create-wallets`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(await signCommitment("CREATE_WALLET", { agentId: AGENT_ID }, attacker)),
        },
        body: "{}",
      });
      assert.equal(wrongSigner.status, 403);
      assert.equal(deployed, 0);

      const authorized = await fetch(`${baseUrl}/agents/${AGENT_ID}/create-wallets`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(await signCommitment("CREATE_WALLET", { agentId: AGENT_ID }, owner)),
        },
        body: "{}",
      });
      assert.equal(authorized.status, 201);
      assert.equal(deployed, 1);
    });
  });

  it("rejects a create-wallets request whose recoveryGuardianAddress was tampered after signing", async () => {
    let deployed = 0;
    const signedGuardian = `0x${"a1".repeat(20)}` as `0x${string}`;
    const tamperedGuardian = `0x${"b2".repeat(20)}` as `0x${string}`;
    const app = createAgentServiceApp({
      policyRepository: new InMemoryPolicyRepository(),
      getAgent: agentId => (agentId === AGENT_ID ? fakeProfile(owner.address) : undefined),
      createWallet: async () => {
        deployed += 1;
        throw new Error("must_not_deploy");
      },
    });

    await withServer(app, async baseUrl => {
      const headers = await signCommitment("CREATE_WALLET", { agentId: AGENT_ID, recoveryGuardianAddress: signedGuardian }, owner);
      const response = await fetch(`${baseUrl}/agents/${AGENT_ID}/create-wallets`, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify({ recoveryGuardianAddress: tamperedGuardian }),
      });
      assert.equal(response.status, 401);
      assert.equal((await response.json()).error, "invalid_operator_signature");
      assert.equal(deployed, 0);
    });
  });

  it("lets anyone no-op delete a nonexistent agent, but requires the owner's signature for a real one", async () => {
    const profiles = new Map<string, AgentProfile>([[AGENT_ID, fakeProfile(owner.address)]]);
    const app = createAgentServiceApp({
      policyRepository: new InMemoryPolicyRepository(),
      getAgent: agentId => profiles.get(agentId),
    });

    await withServer(app, async baseUrl => {
      const noopDelete = await fetch(`${baseUrl}/agents/does-not-exist`, { method: "DELETE" });
      assert.equal(noopDelete.status, 204);

      const unsigned = await fetch(`${baseUrl}/agents/${AGENT_ID}`, { method: "DELETE" });
      assert.equal(unsigned.status, 401);
      assert.ok(profiles.has(AGENT_ID));

      const wrongSigner = await fetch(`${baseUrl}/agents/${AGENT_ID}`, {
        method: "DELETE",
        headers: await signCommitment("DELETE_AGENT", { agentId: AGENT_ID }, attacker),
      });
      assert.equal(wrongSigner.status, 403);
      assert.ok(profiles.has(AGENT_ID));

      const authorized = await fetch(`${baseUrl}/agents/${AGENT_ID}`, {
        method: "DELETE",
        headers: await signCommitment("DELETE_AGENT", { agentId: AGENT_ID }, owner),
      });
      assert.equal(authorized.status, 204);
    });
  });
});

function createAgentBody(ownerWallet: `0x${string}`) {
  return { ownerWallet, name: "Test agent", type: "Payment" };
}

async function signCreateAgent(
  ownerWallet: `0x${string}`,
  account: ReturnType<typeof privateKeyToAccount>,
): Promise<Record<string, string>> {
  return signCommitment("CREATE_AGENT", { ownerWallet, name: "Test agent", agentType: "Payment" }, account);
}

async function signCommitment(
  operation: AgentCommitmentOperation,
  fields: Partial<Omit<Parameters<typeof buildAgentCommitment>[0], "operation" | "operatorAddress" | "issuedAt">>,
  account: ReturnType<typeof privateKeyToAccount>,
  issuedAt: string = String(Math.floor(Date.now() / 1000)),
): Promise<Record<string, string>> {
  const commitment: AgentCommitment = buildAgentCommitment({
    operation,
    operatorAddress: account.address.toLowerCase() as `0x${string}`,
    issuedAt,
    ...fields,
  });
  const signature = await account.signTypedData({
    domain: AGENT_COMMITMENT_DOMAIN,
    types: AGENT_COMMITMENT_TYPES,
    primaryType: "AgentCommitment",
    message: commitment,
  });
  return {
    "x-aegis-operator-address": account.address,
    "x-aegis-operator-signature": signature,
    "x-aegis-operator-issued-at": issuedAt,
  };
}

function fakeProfile(ownerWallet: `0x${string}`): AgentProfile {
  return {
    agentId: AGENT_ID,
    ownerWallet,
    name: "Test agent",
    type: "Payment",
    hederaAccountId: "0.0.999",
    evmAddress: ownerWallet,
    publicKey: "test-public-key",
    toolNames: [],
    status: "active",
    createdAt: "2026-08-05T00:00:00.000Z",
  };
}

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
