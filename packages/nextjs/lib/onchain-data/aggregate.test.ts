import { agenticIdentityEntityId, buildCrossChainAgentViews, hashCanonicalAgentId } from "./aggregate.ts";
import type { AgentOnchainSummary, AgenticIdentity } from "./types.ts";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

const HASH_A = `0x${"11".repeat(32)}` as const;
const SAFE_A = `0x${"22".repeat(20)}` as const;
const CONTRACT = `0x${"33".repeat(20)}` as const;

const hederaAgent: AgentOnchainSummary = {
  id: HASH_A,
  agentIdHash: HASH_A,
  safe: SAFE_A,
  agenticIdTokenId: "7",
  validationCount: "2",
  allowCount: "1",
  denyCount: "1",
  executionCount: "0",
  executionSuccessCount: "0",
  executionFailureCount: "0",
  policyCount: "1",
  firstActivityAt: "50",
  lastActivityAt: "100",
  sourceChain: "hedera-testnet",
};

const zeroGIdentity: AgenticIdentity = {
  id: `${CONTRACT}-7`,
  contract: CONTRACT,
  tokenId: "7",
  owner: SAFE_A,
  status: "ACTIVE",
  seenMint: true,
  mintTransactionHash: `0x${"44".repeat(32)}`,
  mintBlockNumber: "9",
  mintBlockTimestamp: "90",
  transactionHash: `0x${"44".repeat(32)}`,
  blockNumber: "9",
  blockTimestamp: "90",
  logIndex: "0",
  firstSeenAt: "90",
  lastUpdatedAt: "90",
  currentAuthorizationCount: "0",
  totalAuthorizationEvents: "0",
  sourceChain: "0g-galileo",
};

describe("cross-chain agent aggregation", () => {
  it("derives the exact 0G mapping entity ID from lowercase contract and normalized decimal token", () => {
    assert.equal(
      agenticIdentityEntityId(CONTRACT.toUpperCase().replace("0X", "0x"), "0007"),
      agenticIdentityEntityId(CONTRACT, "7"),
    );
  });

  it("joins matching Hedera and 0G records without inventing a cross-chain relationship", () => {
    const canonicalHash = hashCanonicalAgentId("agent-1");
    const [view] = buildCrossChainAgentViews({
      hedera: [{ ...hederaAgent, id: canonicalHash, agentIdHash: canonicalHash }],
      zeroG: [zeroGIdentity],
      suppliedLinks: [
        {
          agentId: " agent-1 ",
          safe: SAFE_A,
          agenticIdTokenId: "7",
          agenticIdContract: CONTRACT,
          agenticIdNetwork: "0g-galileo",
        },
      ],
    });

    assert.equal(view.state, "complete");
    assert.equal(view.agentId, "agent-1");
    assert.deepEqual(view.matchedBy, ["agenticId"]);
    assert.deepEqual(view.missingSources, []);
    assert.equal(hashCanonicalAgentId(" agent-1 "), hashCanonicalAgentId("agent-1"));
  });

  it("joins the unique configured 0G token tuple without offchain hash evidence and normalizes leading zeroes", () => {
    const [view] = buildCrossChainAgentViews({
      hedera: [{ ...hederaAgent, agenticIdTokenId: "007" }],
      zeroG: [zeroGIdentity],
    });

    assert.equal(view.state, "complete");
    assert.deepEqual(view.matchedBy, ["agenticId"]);
    assert.equal(view.agentId, undefined);
  });

  it("keeps partial records visible when only one source is indexed", () => {
    const hederaOnly = buildCrossChainAgentViews({ hedera: [hederaAgent], zeroG: [] });
    const zeroGOnly = buildCrossChainAgentViews({ hedera: [], zeroG: [zeroGIdentity] });

    assert.equal(hederaOnly[0].state, "hedera-only");
    assert.deepEqual(hederaOnly[0].missingSources, ["0g-galileo"]);
    assert.equal(zeroGOnly[0].state, "zero-g-only");
    assert.deepEqual(zeroGOnly[0].missingSources, ["hedera-testnet"]);
  });

  it("uses an application-supplied agent ID only to label its canonical Hedera hash", () => {
    const canonicalHash = hashCanonicalAgentId("agent-1");
    const [view] = buildCrossChainAgentViews({
      hedera: [{ ...hederaAgent, id: canonicalHash, agentIdHash: canonicalHash }],
      zeroG: [],
      suppliedLinks: [{ agentId: "agent-1" }],
    });

    assert.equal(view.agentId, "agent-1");
    assert.equal(view.state, "hedera-only");
    assert.equal(view.zeroG, null);
  });

  it("reports a mismatch when an explicit token link conflicts with the canonical agent hash", () => {
    const canonicalHash = hashCanonicalAgentId("agent-1");
    const [view] = buildCrossChainAgentViews({
      hedera: [{ ...hederaAgent, id: canonicalHash, agentIdHash: canonicalHash }],
      zeroG: [zeroGIdentity],
      suppliedLinks: [
        {
          agentId: "agent-2",
          agenticIdTokenId: "7",
          agenticIdContract: CONTRACT,
          agenticIdNetwork: "0g-galileo",
        },
      ],
    });

    assert.equal(view.state, "mismatch");
    assert.deepEqual(view.matchedBy, ["agenticId"]);
    assert.equal(view.warnings.length, 1);
  });

  it("reports a Safe mismatch without discarding either indexed source", () => {
    const canonicalHash = hashCanonicalAgentId("agent-1");
    const conflictingSafe = `0x${"66".repeat(20)}` as const;
    const [view] = buildCrossChainAgentViews({
      hedera: [{ ...hederaAgent, id: canonicalHash, agentIdHash: canonicalHash }],
      zeroG: [zeroGIdentity],
      suppliedLinks: [{ agentId: "agent-1", safe: conflictingSafe }],
    });

    assert.equal(view.state, "mismatch");
    assert.equal(view.hedera?.safe, SAFE_A);
    assert.equal(view.zeroG?.tokenId, "7");
    assert.match(view.warnings.join(" "), /Safe address conflicts/);
  });

  it("does not choose between duplicate explicit Agentic ID candidates", () => {
    const canonicalHash = hashCanonicalAgentId("agent-1");
    const secondContract = `0x${"55".repeat(20)}` as const;
    const views = buildCrossChainAgentViews({
      hedera: [{ ...hederaAgent, id: canonicalHash, agentIdHash: canonicalHash }],
      zeroG: [zeroGIdentity, { ...zeroGIdentity, id: `${secondContract}-7`, contract: secondContract }],
      suppliedLinks: [
        {
          agentId: "agent-1",
          agenticIdTokenId: "7",
          agenticIdContract: CONTRACT,
          agenticIdNetwork: "0g-galileo",
        },
        {
          agentId: "agent-1",
          agenticIdTokenId: "7",
          agenticIdContract: secondContract,
          agenticIdNetwork: "0g-galileo",
        },
      ],
    });
    const ambiguous = views.find(view => view.hedera !== null);

    assert.equal(ambiguous?.state, "ambiguous");
    assert.equal(ambiguous?.zeroG, null);
    assert.match(ambiguous?.warnings[0] ?? "", /Multiple configured Agentic ID candidates/);
  });

  it("does not join one 0G identity claimed by conflicting application links", () => {
    const canonicalHash = hashCanonicalAgentId("agent-1");
    const views = buildCrossChainAgentViews({
      hedera: [{ ...hederaAgent, id: canonicalHash, agentIdHash: canonicalHash }],
      zeroG: [zeroGIdentity],
      suppliedLinks: [
        {
          agentId: "agent-1",
          agenticIdTokenId: "7",
          agenticIdContract: CONTRACT,
          agenticIdNetwork: "0g-galileo",
        },
        {
          agentId: "agent-conflict",
          agenticIdTokenId: "7",
          agenticIdContract: CONTRACT,
          agenticIdNetwork: "0g-galileo",
        },
      ],
    });

    assert.equal(views.find(view => view.hedera !== null)?.state, "ambiguous");
    assert.equal(views.find(view => view.zeroG !== null)?.state, "ambiguous");
  });

  it("does not join one 0G identity to multiple Hedera agents with the same token", () => {
    const secondHash = `0x${"77".repeat(32)}` as const;
    const views = buildCrossChainAgentViews({
      hedera: [hederaAgent, { ...hederaAgent, id: secondHash, agentIdHash: secondHash }],
      zeroG: [zeroGIdentity],
    });

    assert.equal(views.filter(view => view.state === "complete").length, 0);
    assert.equal(views.filter(view => view.hedera !== null && view.state === "ambiguous").length, 2);
    assert.equal(views.find(view => view.zeroG !== null)?.state, "ambiguous");
  });

  it("does not claim a globally complete join from a bounded source window", () => {
    const views = buildCrossChainAgentViews({
      hedera: [hederaAgent],
      zeroG: [zeroGIdentity],
      sourceComplete: { hedera: true, zeroG: false },
    });

    assert.equal(views.filter(view => view.state === "complete").length, 0);
    assert.equal(views.find(view => view.hedera !== null)?.state, "ambiguous");
    assert.equal(views.find(view => view.zeroG !== null)?.state, "ambiguous");
    assert.match(views.find(view => view.hedera !== null)?.warnings[0] ?? "", /bounded query window/);
  });
});
