import { buildIndexerFreshness } from "./freshness.ts";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

describe("indexer freshness", () => {
  it("marks an indexer stale when its indexed block timestamp is outside the allowed age", () => {
    const freshness = buildIndexerFreshness({
      source: "hedera-testnet",
      meta: {
        block: { number: 123, timestamp: 1_000 },
        deployment: "QmDeployment",
        hasIndexingErrors: false,
      },
      nowSeconds: 1_301,
      staleAfterSeconds: 300,
    });

    assert.equal(freshness.ageSeconds, 301);
    assert.equal(freshness.stale, true);
    assert.equal(freshness.indexedBlock, 123);
    assert.equal(freshness.lagBlocks, null);
  });

  it("treats missing _meta as unavailable instead of assuming a fresh zero block", () => {
    const freshness = buildIndexerFreshness({
      source: "0g-galileo",
      meta: null,
      nowSeconds: 1_301,
    });

    assert.equal(freshness.indexedBlock, null);
    assert.equal(freshness.available, false);
    assert.equal(freshness.hasIndexingErrors, null);
    assert.equal(freshness.stale, true);
  });
});
