import { extractChainHead } from "./indexingStatusParser.ts";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

describe("Graph Node indexing status", () => {
  it("extracts the expected network chain head", () => {
    const chainHead = extractChainHead(
      {
        indexingStatusForCurrentVersion: {
          chains: [
            { network: "0g-galileo", chainHeadBlock: { number: "222" } },
            { network: "hedera-testnet", chainHeadBlock: { number: "123" } },
          ],
        },
      },
      "hedera-testnet",
    );

    assert.equal(chainHead, 123);
  });

  it("returns null when the local status endpoint has no usable chain head", () => {
    assert.equal(
      extractChainHead(
        { indexingStatusForCurrentVersion: { chains: [{ network: "hedera-testnet", chainHeadBlock: null }] } },
        "hedera-testnet",
      ),
      null,
    );
    assert.equal(extractChainHead({ indexingStatusForCurrentVersion: null }, "hedera-testnet"), null);
  });
});
