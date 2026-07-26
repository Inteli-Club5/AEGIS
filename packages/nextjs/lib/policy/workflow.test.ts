import type { Policy } from "../types/aegis.ts";
import { completeProtection } from "./workflow.ts";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

const draftPolicy: Policy = {
  policyId: "pol_123",
  agentId: "agent-1",
  walletId: "wallet-1",
  policyVersion: 1,
  policyHash: `0x${"12".repeat(32)}`,
  status: "DRAFT",
  validFrom: 100,
  validUntil: null,
  rules: {
    allowedActionTypes: ["HEDERA_HBAR_TRANSFER"],
    allowedDestinations: [{ kind: "HEDERA_ACCOUNT_ID", value: "0.0.123" }],
    allowedAssets: [{ kind: "NATIVE", chainId: 296, assetId: "hbar", decimals: 8 }],
    amount: { min: null, max: null, dailyLimit: null },
    actionCount: { dailyLimit: null },
  },
  semanticRules: [],
  createdAt: 100,
  updatedAt: 100,
  activatedAt: null,
  revokedAt: null,
  supersededAt: null,
  supersededByPolicyId: null,
};

const agenticId = {
  tokenId: "1",
  contractAddress: "0x0000000000000000000000000000000000000123",
  metadataURI: "ipfs://agent",
  explorerUrl: "https://chainscan.0g.ai/token/1",
};

describe("Protection activation workflow", () => {
  it("resumes Agentic ID registration without reactivating an already ACTIVE Policy", async () => {
    let activationCalls = 0;
    let registrationCalls = 0;

    const result = await completeProtection(
      { agentId: draftPolicy.agentId, policyId: draftPolicy.policyId },
      {
        getPolicy: async () => ({ ...draftPolicy, status: "ACTIVE" as const, activatedAt: 110 }),
        activatePolicy: async policy => {
          activationCalls += 1;
          return { ...policy, status: "ACTIVE" as const, activatedAt: 110 };
        },
        getActivePolicy: async () => ({
          policy: { ...draftPolicy, status: "ACTIVE" as const, activatedAt: 110 },
          effectiveStatus: "ACTIVE" as const,
        }),
        getAgenticId: async () => null,
        registerAgenticId: async () => {
          registrationCalls += 1;
          return agenticId;
        },
      },
    );

    assert.equal(result.policy.status, "ACTIVE");
    assert.deepEqual(result.agenticId, agenticId);
    assert.equal(activationCalls, 0);
    assert.equal(registrationCalls, 1);
  });

  it("recovers after activation succeeds and Agentic ID registration fails", async () => {
    let backendPolicy = { ...draftPolicy };
    let activationCalls = 0;
    let registrationCalls = 0;

    const gateway = {
      getPolicy: async () => backendPolicy,
      activatePolicy: async () => {
        activationCalls += 1;
        backendPolicy = { ...backendPolicy, status: "ACTIVE" as const, activatedAt: 110 };
        return backendPolicy;
      },
      getActivePolicy: async () => ({
        policy: backendPolicy.status === "ACTIVE" ? backendPolicy : null,
        effectiveStatus: backendPolicy.status === "ACTIVE" ? ("ACTIVE" as const) : null,
      }),
      getAgenticId: async () => null,
      registerAgenticId: async () => {
        registrationCalls += 1;
        if (registrationCalls === 1) throw new Error("0G unavailable");
        return agenticId;
      },
    };

    await assert.rejects(
      () => completeProtection({ agentId: draftPolicy.agentId, policyId: draftPolicy.policyId }, gateway),
      /0G unavailable/,
    );

    const recovered = await completeProtection(
      { agentId: draftPolicy.agentId, policyId: draftPolicy.policyId },
      gateway,
    );

    assert.equal(recovered.policy.status, "ACTIVE");
    assert.equal(activationCalls, 1);
    assert.equal(registrationCalls, 2);
  });

  it("does not register a second Agentic ID when one already exists", async () => {
    let registrationCalls = 0;
    const result = await completeProtection(
      { agentId: draftPolicy.agentId, policyId: draftPolicy.policyId },
      {
        getPolicy: async () => ({ ...draftPolicy, status: "ACTIVE" as const, activatedAt: 110 }),
        activatePolicy: async policy => policy,
        getActivePolicy: async () => ({
          policy: { ...draftPolicy, status: "ACTIVE" as const, activatedAt: 110 },
          effectiveStatus: "ACTIVE" as const,
        }),
        getAgenticId: async () => agenticId,
        registerAgenticId: async () => {
          registrationCalls += 1;
          return agenticId;
        },
      },
    );

    assert.deepEqual(result.agenticId, agenticId);
    assert.equal(registrationCalls, 0);
  });

  it("reconciles a lost activation response before continuing", async () => {
    let backendPolicy = { ...draftPolicy };
    let activationCalls = 0;

    const result = await completeProtection(
      { agentId: draftPolicy.agentId, policyId: draftPolicy.policyId },
      {
        getPolicy: async () => backendPolicy,
        activatePolicy: async () => {
          activationCalls += 1;
          backendPolicy = { ...backendPolicy, status: "ACTIVE" as const, activatedAt: 110 };
          throw new Error("response lost");
        },
        getActivePolicy: async () => ({
          policy: backendPolicy.status === "ACTIVE" ? backendPolicy : null,
          effectiveStatus: backendPolicy.status === "ACTIVE" ? ("ACTIVE" as const) : null,
        }),
        getAgenticId: async () => agenticId,
        registerAgenticId: async () => agenticId,
      },
    );

    assert.equal(result.policy.status, "ACTIVE");
    assert.equal(activationCalls, 1);
  });

  it("reconciles a lost Agentic ID response and rejects expired ACTIVE policies", async () => {
    let identity = null as typeof agenticId | null;
    const activePolicy = { ...draftPolicy, status: "ACTIVE" as const, activatedAt: 110 };
    const gateway = {
      getPolicy: async () => activePolicy,
      activatePolicy: async () => activePolicy,
      getActivePolicy: async () => ({ policy: activePolicy, effectiveStatus: "ACTIVE" as const }),
      getAgenticId: async () => identity,
      registerAgenticId: async (_agentId: string, policyHash: string) => {
        assert.equal(policyHash, draftPolicy.policyHash);
        identity = agenticId;
        throw new Error("response lost");
      },
    };

    const reconciled = await completeProtection(
      { agentId: draftPolicy.agentId, policyId: draftPolicy.policyId },
      gateway,
    );
    assert.deepEqual(reconciled.agenticId, agenticId);

    await assert.rejects(
      () =>
        completeProtection(
          { agentId: draftPolicy.agentId, policyId: draftPolicy.policyId },
          {
            ...gateway,
            getActivePolicy: async () => ({ policy: activePolicy, effectiveStatus: "EXPIRED" as const }),
          },
        ),
      /expired/i,
    );
  });

  it("rejects a policy that belongs to a different agent", async () => {
    await assert.rejects(
      () =>
        completeProtection(
          { agentId: "agent-2", policyId: draftPolicy.policyId },
          {
            getPolicy: async () => draftPolicy,
            activatePolicy: async () => draftPolicy,
            getActivePolicy: async () => ({ policy: null, effectiveStatus: null }),
            getAgenticId: async () => null,
            registerAgenticId: async () => agenticId,
          },
        ),
      /does not belong/i,
    );
  });
});
