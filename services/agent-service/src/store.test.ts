import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  deleteAgent,
  issueAgentAuthToken,
  resolveAgentIdForAuthToken,
} from "./store.js";

describe("dynamic per-agent bearer tokens", () => {
  it("issues a token that resolves back to the same agent", () => {
    const agentId = "store-test-agent-1";
    const token = issueAgentAuthToken(agentId);

    assert.ok(token.length >= 32);
    assert.equal(resolveAgentIdForAuthToken(token), agentId);
  });

  it("is idempotent: re-issuing returns the same token", () => {
    const agentId = "store-test-agent-2";
    const first = issueAgentAuthToken(agentId);
    const second = issueAgentAuthToken(agentId);

    assert.equal(first, second);
  });

  it("issues distinct tokens for distinct agents", () => {
    const tokenA = issueAgentAuthToken("store-test-agent-3");
    const tokenB = issueAgentAuthToken("store-test-agent-4");

    assert.notEqual(tokenA, tokenB);
  });

  it("does not resolve an unknown token", () => {
    assert.equal(resolveAgentIdForAuthToken("not-a-real-token"), undefined);
  });

  it("stops resolving a token once its agent is deleted", () => {
    const agentId = "store-test-agent-5";
    const token = issueAgentAuthToken(agentId);
    assert.equal(resolveAgentIdForAuthToken(token), agentId);

    deleteAgent(agentId);

    assert.equal(resolveAgentIdForAuthToken(token), undefined);
  });
});
