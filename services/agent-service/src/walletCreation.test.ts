import assert from "node:assert/strict";
import { once } from "node:events";
import type { Server } from "node:http";
import { describe, it } from "node:test";
import type { CreateWalletDeploymentContext } from "./createWallet.js";
import { createAgentServiceApp } from "./index.js";
import { InMemoryPolicyRepository } from "./policy-engine/repository.js";
import type { CompleteWalletCreationInput } from "./policy-engine/types.js";
import type { AgentProfile } from "./types.js";

const AGENT_ID = "018f0000-0000-7000-8000-0000000000aa";
const OWNER = "0x00000000000000000000000000000000000000A1";
const SAFE = "0x00000000000000000000000000000000000000B2" as `0x${string}`;
const TRANSACTION_HASH = `0x${"ab".repeat(32)}` as `0x${string}`;
const OWNERS: `0x${string}`[] = [
  "0x00000000000000000000000000000000000000C3",
  "0x00000000000000000000000000000000000000D4",
  "0x00000000000000000000000000000000000000E5",
];

describe("Safe wallet creation serialization", () => {
  it("serializes concurrent first requests and returns one persisted Safe", async () => {
    let profile = baseProfile();
    let deploymentCount = 0;
    const repository = new InMemoryPolicyRepository();
    const options = {
      policyRepository: repository,
      getAgent: agentId => (agentId === AGENT_ID ? profile : undefined),
      createWallet: async () => {
        deploymentCount += 1;
        await delay(40);
        return {
          safeAddress: SAFE,
          owners: OWNERS,
          threshold: 2,
          transactionHash: TRANSACTION_HASH,
        };
      },
      setAgentWallet: (agentId, wallet) => {
        if (agentId !== AGENT_ID) return undefined;
        profile = { ...profile, safeAddress: wallet.safeAddress, wallet };
        return profile;
      },
    } satisfies Parameters<typeof createAgentServiceApp>[0];
    const firstReplica = createAgentServiceApp(options);
    const secondReplica = createAgentServiceApp(options);

    await withServers([firstReplica, secondReplica], async ([firstUrl, secondUrl]) => {
      const requests = [firstUrl, secondUrl].map(baseUrl =>
        fetch(`${baseUrl}/agents/${AGENT_ID}/create-wallets`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ recoveryGuardianAddress: OWNERS[2] }),
        }),
      );
      const responses = await Promise.all(requests);
      const bodies = await Promise.all(responses.map(response => response.json()));

      assert.deepEqual(
        responses.map(response => response.status).sort(),
        [200, 201],
      );
      assert.equal(deploymentCount, 1);
      assert.deepEqual(bodies[0], bodies[1]);
      assert.equal(bodies[0].safeAddress, SAFE.toLowerCase());
      assert.equal(bodies[0].guardianManaged, false);
      assert.equal(profile.wallet?.walletId, bodies[0].walletId);
    });
  });

  it("fails before external Safe deployment when durable wallet persistence is unavailable", async () => {
    let deploymentCount = 0;
    const app = createAgentServiceApp({
      getAgent: agentId => (agentId === AGENT_ID ? baseProfile() : undefined),
      createWallet: async () => {
        deploymentCount += 1;
        throw new Error("must_not_run");
      },
    });

    await withServer(app, async baseUrl => {
      const response = await fetch(`${baseUrl}/agents/${AGENT_ID}/create-wallets`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      assert.equal(response.status, 503);
      assert.equal(deploymentCount, 0);
      assert.match(JSON.stringify(await response.json()), /DATABASE_URL/);
    });
  });

  it("resumes a broadcast operation after final persistence fails without deploying another Safe", async () => {
    const repository = new FailOnceOnCompletionRepository();
    let deploymentCount = 0;
    const createWallet = async (
      _agentId: string,
      _guardian: string,
      context: CreateWalletDeploymentContext,
    ) => {
      if (context.transactionHash === null) {
        deploymentCount += 1;
        await context.onPrepared(SAFE, OWNERS, 2);
        await context.onBroadcast(TRANSACTION_HASH);
      } else {
        assert.equal(context.expectedSafeAddress, SAFE.toLowerCase());
        assert.deepEqual(context.expectedOwners, OWNERS.map(owner => owner.toLowerCase()));
        assert.equal(context.expectedThreshold, 2);
        assert.equal(context.transactionHash, TRANSACTION_HASH);
      }
      return {
        safeAddress: SAFE,
        owners: OWNERS,
        threshold: 2,
        transactionHash: TRANSACTION_HASH,
        deploymentProvenance: "BROADCAST_RECEIPT" as const,
      };
    };

    const firstReplica = createAgentServiceApp({
      policyRepository: repository,
      getAgent: agentId => (agentId === AGENT_ID ? baseProfile() : undefined),
      createWallet,
    });
    await withServer(firstReplica, async baseUrl => {
      const response = await createWalletRequest(baseUrl, {});
      assert.equal(response.status, 500);
      assert.match(JSON.stringify(await response.json()), /forced_completion_failure/);
    });

    const restartedReplica = createAgentServiceApp({
      policyRepository: repository,
      getAgent: () => undefined,
      createWallet,
    });
    await withServer(restartedReplica, async baseUrl => {
      const response = await createWalletRequest(baseUrl, {});
      assert.equal(response.status, 201);
      const wallet = await response.json();
      assert.equal(wallet.safeAddress, SAFE.toLowerCase());
      assert.equal(wallet.transactionHash, TRANSACTION_HASH);
      assert.equal(wallet.deploymentProvenance, "BROADCAST_RECEIPT");
    });
    assert.equal(deploymentCount, 1);
  });

  it("returns a completed durable wallet after restart without an in-memory agent or external deployment", async () => {
    const repository = new InMemoryPolicyRepository();
    const firstReplica = createAgentServiceApp({
      policyRepository: repository,
      getAgent: agentId => (agentId === AGENT_ID ? baseProfile() : undefined),
      createWallet: async () => ({
        safeAddress: SAFE,
        owners: OWNERS,
        threshold: 2,
        transactionHash: TRANSACTION_HASH,
      }),
    });
    await withServer(firstReplica, async baseUrl => {
      assert.equal((await createWalletRequest(baseUrl, {})).status, 201);
    });

    let deploymentCount = 0;
    const restartedReplica = createAgentServiceApp({
      policyRepository: repository,
      getAgent: () => undefined,
      createWallet: async () => {
        deploymentCount += 1;
        throw new Error("must_not_deploy");
      },
    });
    await withServer(restartedReplica, async baseUrl => {
      const response = await createWalletRequest(baseUrl, {});
      assert.equal(response.status, 200);
      const wallet = await response.json();
      assert.equal(wallet.safeAddress, SAFE.toLowerCase());
      assert.equal(wallet.transactionHash, TRANSACTION_HASH);
    });
    assert.equal(deploymentCount, 0);
  });

  it("reconciles a legacy durable wallet before any reservation or external deployment", async () => {
    const repository = new InMemoryPolicyRepository();
    await repository.saveWallet({
      walletId: "018f0000-0000-7000-8000-0000000000cc",
      agentId: AGENT_ID,
      networkId: "hedera:testnet",
      safeAddress: SAFE.toLowerCase() as `0x${string}`,
      status: "PROTECTED",
      createdAt: 1,
      updatedAt: 1,
    });
    let deploymentCount = 0;
    let inspectionCount = 0;
    const app = createAgentServiceApp({
      policyRepository: repository,
      getAgent: () => undefined,
      inspectExistingWallet: async safeAddress => {
        inspectionCount += 1;
        assert.equal(safeAddress, SAFE.toLowerCase());
        return {
          safeAddress: SAFE.toLowerCase() as `0x${string}`,
          owners: OWNERS.map(owner =>
            owner.toLowerCase() as `0x${string}`,
          ),
          threshold: 2,
        };
      },
      createWallet: async () => {
        deploymentCount += 1;
        throw new Error("must_not_deploy");
      },
    });

    await withServer(app, async baseUrl => {
      const response = await createWalletRequest(baseUrl, {});
      assert.equal(response.status, 200);
      const wallet = await response.json();
      assert.equal(wallet.safeAddress, SAFE.toLowerCase());
      assert.equal(wallet.transactionHash, null);
      assert.equal(
        wallet.deploymentProvenance,
        "LEGACY_WALLET_RECONCILIATION",
      );
      assert.equal(wallet.guardianManaged, false);
    });
    assert.equal(inspectionCount, 1);
    assert.equal(deploymentCount, 0);
    assert.equal(
      await repository.getWalletCreationOperation(AGENT_ID, "hedera:testnet"),
      null,
    );

    await repository.saveWallet({
      walletId: "018f0000-0000-7000-8000-0000000000cc",
      agentId: AGENT_ID,
      networkId: "hedera:testnet",
      safeAddress: SAFE.toLowerCase() as `0x${string}`,
      status: "PAUSED",
      createdAt: 1,
      updatedAt: 2,
    });
    await withServer(app, async baseUrl => {
      assert.equal((await createWalletRequest(baseUrl, {})).status, 409);
    });
    assert.equal(inspectionCount, 1);
    assert.equal(deploymentCount, 0);
  });

  it("reconciles a deployed PREPARED Safe after restart without inventing a transaction hash", async () => {
    const repository = new FailOnceOnCompletionRepository();
    let deploymentCount = 0;
    const createWallet = async (
      _agentId: string,
      _guardian: string,
      context: CreateWalletDeploymentContext,
    ) => {
      if (context.expectedSafeAddress === null) {
        deploymentCount += 1;
        await context.onPrepared(SAFE, OWNERS, 2);
      } else {
        assert.equal(context.expectedSafeAddress, SAFE.toLowerCase());
        assert.equal(context.transactionHash, null);
      }
      return {
        safeAddress: SAFE,
        owners: OWNERS,
        threshold: 2,
        transactionHash: null,
        deploymentProvenance: "PREDICTED_SAFE_RECONCILIATION" as const,
      };
    };

    await withServer(
      createAgentServiceApp({
        policyRepository: repository,
        getAgent: agentId => (agentId === AGENT_ID ? baseProfile() : undefined),
        createWallet,
      }),
      async baseUrl => {
        assert.equal((await createWalletRequest(baseUrl, {})).status, 500);
      },
    );

    await withServer(
      createAgentServiceApp({
        policyRepository: repository,
        getAgent: () => undefined,
        createWallet,
      }),
      async baseUrl => {
        const response = await createWalletRequest(baseUrl, {});
        assert.equal(response.status, 201);
        const wallet = await response.json();
        assert.equal(wallet.safeAddress, SAFE.toLowerCase());
        assert.equal(wallet.transactionHash, null);
        assert.equal(
          wallet.deploymentProvenance,
          "PREDICTED_SAFE_RECONCILIATION",
        );
      },
    );
    assert.equal(deploymentCount, 1);
  });

  it("requires an explicit retry after a conclusively reverted deployment", async () => {
    const repository = new InMemoryPolicyRepository();
    let deploymentCount = 0;
    const secondTransactionHash = `0x${"cd".repeat(32)}` as `0x${string}`;
    const app = createAgentServiceApp({
      policyRepository: repository,
      getAgent: agentId => (agentId === AGENT_ID ? baseProfile() : undefined),
      createWallet: async (_agentId, _guardian, context) => {
        assert.equal(context.transactionHash, null);
        deploymentCount += 1;
        await context.onPrepared(SAFE, OWNERS, 2);
        const transactionHash =
          deploymentCount === 1 ? TRANSACTION_HASH : secondTransactionHash;
        await context.onBroadcast(transactionHash);
        if (deploymentCount === 1) {
          await context.onFailed(transactionHash, "TRANSACTION_REVERTED");
          throw new Error("safe_deployment_transaction_reverted");
        }
        return {
          safeAddress: SAFE,
          owners: OWNERS,
          threshold: 2,
          transactionHash,
          deploymentProvenance: "BROADCAST_RECEIPT" as const,
        };
      },
    });

    await withServer(app, async baseUrl => {
      assert.equal((await createWalletRequest(baseUrl, {})).status, 500);
      const failed = await repository.getWalletCreationOperation(
        AGENT_ID,
        "hedera:testnet",
      );
      assert.equal(failed?.status, "FAILED");
      assert.equal(failed?.failureCode, "TRANSACTION_REVERTED");

      assert.equal((await createWalletRequest(baseUrl, {})).status, 409);
      assert.equal(deploymentCount, 1);

      assert.equal(
        (
          await createWalletRequest(baseUrl, {
            retryFailedDeployment: true,
            recoveryGuardianAddress: OWNERS[2],
          })
        ).status,
        409,
      );
      const stillFailed = await repository.getWalletCreationOperation(
        AGENT_ID,
        "hedera:testnet",
      );
      assert.equal(stillFailed?.status, "FAILED");
      assert.equal(stillFailed?.transactionHash, TRANSACTION_HASH);
      assert.equal(stillFailed?.failureCode, "TRANSACTION_REVERTED");
      assert.equal((await createWalletRequest(baseUrl, {})).status, 409);
      assert.equal(deploymentCount, 1);

      const retried = await createWalletRequest(baseUrl, {
        retryFailedDeployment: true,
      });
      assert.equal(retried.status, 201);
      const wallet = await retried.json();
      assert.equal(wallet.transactionHash, secondTransactionHash);
      assert.equal(deploymentCount, 2);
    });
  });

  it("keeps an ambiguous persisted broadcast fail-closed without rebroadcast", async () => {
    const repository = new InMemoryPolicyRepository();
    let deploymentCount = 0;
    let receiptCheckCount = 0;
    const app = createAgentServiceApp({
      policyRepository: repository,
      getAgent: agentId => (agentId === AGENT_ID ? baseProfile() : undefined),
      createWallet: async (_agentId, _guardian, context) => {
        if (context.transactionHash === null) {
          deploymentCount += 1;
          await context.onPrepared(SAFE, OWNERS, 2);
          await context.onBroadcast(TRANSACTION_HASH);
        } else {
          assert.equal(context.transactionHash, TRANSACTION_HASH);
        }
        receiptCheckCount += 1;
        throw new Error("deployment_receipt_status_unknown");
      },
    });

    await withServer(app, async baseUrl => {
      assert.equal((await createWalletRequest(baseUrl, {})).status, 500);
      assert.equal((await createWalletRequest(baseUrl, {})).status, 500);
      assert.equal(deploymentCount, 1);
      assert.equal(receiptCheckCount, 2);
      const broadcast = await repository.getWalletCreationOperation(
        AGENT_ID,
        "hedera:testnet",
      );
      assert.equal(broadcast?.status, "BROADCAST");
      assert.equal(broadcast?.failureCode, null);

      assert.equal(
        (
          await createWalletRequest(baseUrl, {
            retryFailedDeployment: true,
          })
        ).status,
        409,
      );
      assert.equal(deploymentCount, 1);
      assert.equal(receiptCheckCount, 2);
    });
  });

  it("marks a guardian as AEGIS-managed only when its source is configured AEGIS custody", async () => {
    const previousGuardian = process.env.AEGIS_RECOVERY_GUARDIAN_ADDRESS;
    const configuredGuardian = OWNERS[2];
    try {
      delete process.env.AEGIS_RECOVERY_GUARDIAN_ADDRESS;
      const ownerFallback = await createWalletWithGuardianBody({});
      assert.equal(ownerFallback.guardian, OWNER.toLowerCase());
      assert.equal(ownerFallback.wallet.guardianManaged, false);

      process.env.AEGIS_RECOVERY_GUARDIAN_ADDRESS = configuredGuardian;
      const configured = await createWalletWithGuardianBody({});
      assert.equal(configured.guardian, configuredGuardian.toLowerCase());
      assert.equal(configured.wallet.guardianManaged, true);

      const explicitlyRequested = await createWalletWithGuardianBody({
        recoveryGuardianAddress: configuredGuardian,
      });
      assert.equal(explicitlyRequested.guardian, configuredGuardian.toLowerCase());
      assert.equal(explicitlyRequested.wallet.guardianManaged, false);
    } finally {
      if (previousGuardian === undefined) {
        delete process.env.AEGIS_RECOVERY_GUARDIAN_ADDRESS;
      } else {
        process.env.AEGIS_RECOVERY_GUARDIAN_ADDRESS = previousGuardian;
      }
    }
  });
});

class FailOnceOnCompletionRepository extends InMemoryPolicyRepository {
  private failNextCompletion = true;

  override async completeWalletCreation(input: CompleteWalletCreationInput) {
    if (this.failNextCompletion) {
      this.failNextCompletion = false;
      throw new Error("forced_completion_failure");
    }
    return super.completeWalletCreation(input);
  }
}

async function createWalletWithGuardianBody(body: Record<string, string>) {
  let guardian = "";
  const app = createAgentServiceApp({
    policyRepository: new InMemoryPolicyRepository(),
    getAgent: agentId => (agentId === AGENT_ID ? baseProfile() : undefined),
    createWallet: async (_agentId, recoveryGuardian) => {
      guardian = recoveryGuardian;
      return {
        safeAddress: SAFE,
        owners: OWNERS,
        threshold: 2,
        transactionHash: TRANSACTION_HASH,
      };
    },
  });
  let wallet: Record<string, unknown> = {};
  await withServer(app, async baseUrl => {
    const response = await createWalletRequest(baseUrl, body);
    assert.equal(response.status, 201);
    wallet = await response.json();
  });
  return { guardian, wallet };
}

function createWalletRequest(
  baseUrl: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return fetch(`${baseUrl}/agents/${AGENT_ID}/create-wallets`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function baseProfile(): AgentProfile {
  return {
    agentId: AGENT_ID,
    ownerWallet: OWNER,
    name: "Concurrency test agent",
    type: "Treasury",
    hederaAccountId: "0.0.1234",
    evmAddress: OWNERS[0],
    publicKey: "test-public-key",
    toolNames: [],
    status: "active",
    createdAt: "2026-07-25T12:00:00.000Z",
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

async function withServers(
  apps: ReturnType<typeof createAgentServiceApp>[],
  operation: (baseUrls: string[]) => Promise<void>,
): Promise<void> {
  const servers = apps.map(app => app.listen(0, "127.0.0.1"));
  await Promise.all(servers.map(server => once(server, "listening")));
  const baseUrls = servers.map(server => {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    return `http://127.0.0.1:${address.port}`;
  });
  try {
    await operation(baseUrls);
  } finally {
    await Promise.all(servers.map(closeServer));
  }
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close(error => (error ? reject(error) : resolve()));
  });
}

function delay(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}
