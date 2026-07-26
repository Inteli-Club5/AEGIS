import { validationCountLabel, validationFeedState } from "./presentation.ts";
import type { CrossChainAgentView } from "./types.ts";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

const zeroGOnlyAgent: CrossChainAgentView = {
  id: "0g:identity",
  hedera: null,
  zeroG: null,
  state: "zero-g-only",
  matchedBy: [],
  missingSources: ["hedera-testnet"],
  warnings: [],
};

describe("onchain dashboard presentation states", () => {
  it("never fabricates zero validations without Hedera evidence", () => {
    assert.equal(validationCountLabel(zeroGOnlyAgent, false), "Unavailable");
    assert.equal(validationCountLabel(zeroGOnlyAgent, true), "Not indexed");
  });

  it("distinguishes an unavailable source from an indexed empty result", () => {
    assert.equal(validationFeedState("Hedera Subgraph query unavailable.", 0), "unavailable");
    assert.equal(validationFeedState(null, 0), "empty");
    assert.equal(validationFeedState(null, 1), "ready");
  });
});
