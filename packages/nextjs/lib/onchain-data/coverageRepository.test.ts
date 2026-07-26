import {
  getPolicyReference,
  getSafeExecution,
  listPolicyReferences,
  listSafeExecutions,
} from "./coverageRepository.ts";
import type { GraphClient } from "./serverClients.ts";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

const HASH = `0x${"11".repeat(32)}`;
const ADDRESS = `0x${"22".repeat(20)}`;

describe("execution and policy repository", () => {
  it("uses an over-fetched row to return an honest Safe execution cursor", async () => {
    const result = await listSafeExecutions({
      client: staticClient({
        safeExecutions: [execution(1), execution(2), execution(3)],
        _meta: meta(),
      }),
      limit: 2,
      nowSeconds: 210,
    });

    assert.equal(result.items.length, 2);
    assert.ok(result.nextCursor);
    assert.equal(result.items[0].sourceChain, "hedera-testnet");
    assert.equal(result.freshness.indexedBlock, 10);
  });

  it("returns policy pages and both detail entity types without alternate reads", async () => {
    const policies = await listPolicyReferences({
      client: staticClient({ policyReferences: [policy(1)], _meta: meta() }),
      limit: 2,
      nowSeconds: 210,
    });
    const executionDetail = await getSafeExecution({
      client: staticClient({ safeExecution: execution(1), _meta: meta() }),
      id: execution(1).id,
      nowSeconds: 210,
    });
    const policyDetail = await getPolicyReference({
      client: staticClient({ policyReference: policy(1), _meta: meta() }),
      id: policy(1).id,
      nowSeconds: 210,
    });

    assert.equal(policies.nextCursor, null);
    assert.equal(policies.items[0].sourceChain, "hedera-testnet");
    assert.equal(executionDetail.item?.success, true);
    assert.equal(policyDetail.item?.denyCount, "1");
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

function execution(index: number) {
  const transactionHash = `0x${index.toString(16).padStart(64, "0")}`;
  return {
    id: `${transactionHash}${index.toString(16).padStart(8, "0")}`,
    safe: ADDRESS,
    agentIdHash: HASH,
    safeTxHash: HASH,
    success: true,
    refundPayment: "0",
    transactionHash,
    blockNumber: String(index),
    blockTimestamp: String(100 + index),
    logIndex: String(index),
  };
}

function policy(index: number) {
  const policyHash = `0x${index.toString(16).padStart(64, "0")}`;
  return {
    id: policyHash,
    policyHash,
    validationCount: "2",
    allowCount: "1",
    denyCount: "1",
    firstReferencedAt: "100",
    lastReferencedAt: "200",
  };
}
