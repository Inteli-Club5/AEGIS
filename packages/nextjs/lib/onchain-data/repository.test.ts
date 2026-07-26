import { getOnchainOverview } from "./repository.ts";
import type { GraphClient } from "./serverClients.ts";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

const HASH = `0x${"11".repeat(32)}`;
const ADDRESS = `0x${"22".repeat(20)}`;
const TX = `0x${"33".repeat(32)}`;

describe("onchain overview repository", () => {
  it("uses protocol singleton totals instead of presenting a bounded entity window as global totals", async () => {
    const overview = await getOnchainOverview({
      hederaClient: staticClient({
        agentOnchainSummaries: [hederaAgent()],
        teeMLValidations: [validation()],
        hederaProtocolSummary: {
          id: "global",
          totalAgents: "500",
          totalValidations: "900",
          totalAllow: "700",
          totalDeny: "200",
          totalExecutions: "450",
          totalExecutionSuccess: "440",
          totalExecutionFailure: "10",
          totalPolicies: "80",
          firstActivityAt: "100",
          lastActivityAt: "200",
        },
        _meta: meta(),
      }),
      zeroGClient: staticClient({
        agenticIdentities: [identity()],
        zeroGProtocolSummary: {
          id: "global",
          distinctIdentityCount: "300",
          mintEventCount: "300",
          transferEventCount: "20",
          burnEventCount: "2",
          currentIdentityCount: "298",
          totalOwnerChanges: "322",
          firstActivityAt: "100",
          lastActivityAt: "200",
        },
        _meta: meta(),
      }),
      nowSeconds: 210,
    });

    assert.equal(overview.metrics.scope, "complete");
    assert.equal(overview.metrics.totalAgents, 500);
    assert.equal(overview.metrics.agenticIds, 300);
    assert.equal(overview.metrics.teeMLValidations, 900);
    assert.notEqual(overview.metrics.totalAgents, overview.agents.length);
  });

  it("marks unavailable source summaries without fabricating zero totals", async () => {
    const overview = await getOnchainOverview({
      hederaClient: staticClient({
        agentOnchainSummaries: [],
        teeMLValidations: [],
        hederaProtocolSummary: null,
        _meta: meta(),
      }),
      zeroGClient: staticClient({
        agenticIdentities: [],
        zeroGProtocolSummary: {
          id: "global",
          distinctIdentityCount: "0",
          mintEventCount: "0",
          transferEventCount: "0",
          burnEventCount: "0",
          currentIdentityCount: "0",
          totalOwnerChanges: "0",
        },
        _meta: meta(),
      }),
      nowSeconds: 210,
    });

    assert.equal(overview.metrics.scope, "partial");
    assert.equal(overview.metrics.totalAgents, null);
    assert.equal(overview.metrics.agenticIds, 0);
    assert.equal(overview.metrics.teeMLValidations, null);
  });

  it("preserves one source as partial state when the other GraphQL endpoint fails", async () => {
    const overview = await getOnchainOverview({
      hederaClient: { query: async () => Promise.reject(new Error("hedera unavailable")) },
      zeroGClient: staticClient({
        agenticIdentities: [identity()],
        zeroGProtocolSummary: {
          id: "global",
          distinctIdentityCount: "1",
          mintEventCount: "1",
          transferEventCount: "0",
          burnEventCount: "0",
          currentIdentityCount: "1",
          totalOwnerChanges: "1",
        },
        _meta: meta(),
      }),
      nowSeconds: 210,
    });

    assert.equal(overview.agents[0].state, "ambiguous");
    assert.match(overview.agents[0].warnings[0] ?? "", /Hedera counterpart query is incomplete or unavailable/);
    assert.equal(overview.metrics.totalAgents, null);
    assert.equal(overview.metrics.agenticIds, 1);
    assert.equal(overview.sourceErrors.hedera, "Hedera Subgraph query unavailable.");
    assert.equal(overview.sourceErrors.zeroG, null);
    assert.equal(overview.support.executions, "blocked");
    assert.equal(overview.support.policies, "blocked");
  });

  it("retains indexed entities and metrics while exposing stale/indexing-error provenance", async () => {
    const overview = await getOnchainOverview({
      hederaClient: staticClient({
        agentOnchainSummaries: [hederaAgent()],
        teeMLValidations: [],
        hederaProtocolSummary: {
          id: "global",
          totalAgents: "1",
          totalValidations: "2",
          totalAllow: "1",
          totalDeny: "1",
          totalExecutions: "1",
          totalExecutionSuccess: "1",
          totalExecutionFailure: "0",
          totalPolicies: "1",
        },
        _meta: { ...meta(), block: { number: 10, hash: HASH, timestamp: 1 }, hasIndexingErrors: true },
      }),
      zeroGClient: staticClient({
        agenticIdentities: [identity()],
        zeroGProtocolSummary: {
          id: "global",
          distinctIdentityCount: "1",
          mintEventCount: "1",
          transferEventCount: "0",
          burnEventCount: "0",
          currentIdentityCount: "1",
          totalOwnerChanges: "1",
        },
        _meta: meta(),
      }),
      nowSeconds: 1_000,
    });

    assert.equal(overview.agents.length, 1);
    assert.equal(overview.metrics.totalAgents, 1);
    assert.equal(overview.freshness.hedera.available, true);
    assert.equal(overview.freshness.hedera.hasIndexingErrors, true);
    assert.equal(overview.freshness.hedera.stale, true);
    assert.equal(overview.support.executions, "blocked");
    assert.equal(overview.support.policies, "blocked");
  });

  it("reports Graph Node chain head and lag when the optional server status client is available", async () => {
    const overview = await getOnchainOverview({
      hederaClient: staticClient({
        agentOnchainSummaries: [],
        teeMLValidations: [],
        hederaProtocolSummary: null,
        _meta: meta(),
      }),
      zeroGClient: staticClient({
        agenticIdentities: [],
        zeroGProtocolSummary: null,
        _meta: meta(),
      }),
      indexingStatusClient: {
        getChainHead: async source => (source === "hedera-testnet" ? 14 : 12),
      },
      nowSeconds: 210,
    });

    assert.equal(overview.freshness.hedera.chainHeadBlock, 14);
    assert.equal(overview.freshness.hedera.lagBlocks, 4);
    assert.equal(overview.freshness.zeroG.chainHeadBlock, 12);
    assert.equal(overview.freshness.zeroG.lagBlocks, 2);
  });
});

function staticClient(payload: unknown): GraphClient {
  return { query: async <T>() => payload as T };
}

function meta() {
  return {
    block: { number: 10, hash: HASH, timestamp: 200 },
    deployment: "test",
    hasIndexingErrors: false,
  };
}

function hederaAgent() {
  return {
    id: HASH,
    agentIdHash: HASH,
    safe: ADDRESS,
    agenticIdTokenId: "7",
    validationCount: "2",
    allowCount: "1",
    denyCount: "1",
    executionCount: "1",
    executionSuccessCount: "1",
    executionFailureCount: "0",
    policyCount: "1",
    firstActivityAt: "100",
    lastActivityAt: "200",
  };
}

function identity() {
  return {
    id: `${ADDRESS}07`,
    contract: ADDRESS,
    tokenId: "7",
    owner: ADDRESS,
    status: "ACTIVE",
    seenMint: true,
    mintTransactionHash: TX,
    mintBlockNumber: "8",
    mintBlockTimestamp: "100",
    transactionHash: TX,
    blockNumber: "10",
    blockTimestamp: "200",
    logIndex: "0",
    firstSeenAt: "100",
    lastUpdatedAt: "200",
  };
}

function validation() {
  return {
    id: `${TX}00000000`,
    requestId: HASH,
    agentIdHash: HASH,
    agenticIdTokenId: "7",
    safe: ADDRESS,
    policyHash: HASH,
    actionHash: HASH,
    semanticContextHash: HASH,
    teemlRequestHash: HASH,
    artifactHash: HASH,
    modelIdHash: HASH,
    verdict: "ALLOW",
    reasonCodeHash: HASH,
    recorder: ADDRESS,
    schemaVersion: 1,
    transactionHash: TX,
    blockNumber: "10",
    blockTimestamp: "200",
    logIndex: "0",
  };
}
