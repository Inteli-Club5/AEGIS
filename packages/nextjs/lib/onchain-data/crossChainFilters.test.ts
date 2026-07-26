import { buildCrossChainAgentViews, hashCanonicalAgentId } from "./aggregate.ts";
import { matchesCrossChainAgentFilters, normalizeCrossChainAgentFilters } from "./crossChainFilters.ts";
import type { AgentOnchainSummary, AgenticIdentity } from "./types.ts";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

const HASH = `0x${"11".repeat(32)}` as const;
const SAFE = `0x${"22".repeat(20)}` as const;
const OWNER_A = `0x${"33".repeat(20)}` as const;
const OWNER_B = `0x${"44".repeat(20)}` as const;
const CONTRACT_A = `0x${"55".repeat(20)}` as const;
const CONTRACT_B = `0x${"66".repeat(20)}` as const;

describe("cross-chain agent filter semantics", () => {
  it("does not borrow a date from a different ambiguous owner candidate", () => {
    const hedera = [agent("100")];
    const zeroG = [identity(OWNER_A, CONTRACT_A, "100", "a"), identity(OWNER_B, CONTRACT_B, "500", "b")];
    const views = buildCrossChainAgentViews({ hedera, zeroG });
    const filters = normalizeCrossChainAgentFilters({ owner: OWNER_A, dateFrom: 400 });

    assert.equal(
      views.some(view => matchesCrossChainAgentFilters(view, hedera, zeroG, filters)),
      false,
    );
  });

  it("lets later 0G activity satisfy a Safe-filtered complete join", () => {
    const hedera = [agent("100")];
    const zeroG = [identity(OWNER_A, CONTRACT_A, "500", "a")];
    const [view] = buildCrossChainAgentViews({ hedera, zeroG });
    const filters = normalizeCrossChainAgentFilters({ safe: SAFE, dateFrom: 400 });

    assert.equal(matchesCrossChainAgentFilters(view, hedera, zeroG, filters), true);
  });

  it("lets later Hedera activity satisfy an owner-filtered complete join", () => {
    const hedera = [agent("500")];
    const zeroG = [identity(OWNER_A, CONTRACT_A, "100", "a")];
    const [view] = buildCrossChainAgentViews({ hedera, zeroG });
    const filters = normalizeCrossChainAgentFilters({ owner: OWNER_A, dateFrom: 400 });

    assert.equal(matchesCrossChainAgentFilters(view, hedera, zeroG, filters), true);
  });

  it("normalizes a browser-derived canonical agent hash and every cross-source exact filter", () => {
    const normalized = normalizeCrossChainAgentFilters({
      agentIdHash: hashCanonicalAgentId(" agent-1 "),
      safe: SAFE.toUpperCase().replace("0X", "0x"),
      owner: OWNER_A,
      status: "ACTIVE",
      tokenId: "007",
      contract: CONTRACT_A,
      dateFrom: 100,
      dateTo: 500,
    });

    assert.match(normalized.agentIdHash ?? "", /^0x[0-9a-f]{64}$/);
    assert.equal(normalized.safe, SAFE);
    assert.equal(normalized.owner, OWNER_A);
    assert.equal(normalized.status, "ACTIVE");
    assert.equal(normalized.tokenId, "7");
    assert.equal(normalized.contract, CONTRACT_A);
    assert.equal(normalized.dateFrom, "100");
    assert.equal(normalized.dateTo, "500");
  });
});

function agent(lastActivityAt: string): AgentOnchainSummary {
  return {
    id: HASH,
    agentIdHash: HASH,
    safe: SAFE,
    agenticIdTokenId: "7",
    validationCount: "1",
    allowCount: "1",
    denyCount: "0",
    executionCount: "0",
    executionSuccessCount: "0",
    executionFailureCount: "0",
    policyCount: "1",
    firstActivityAt: "100",
    lastActivityAt,
    sourceChain: "hedera-testnet",
  };
}

function identity(
  owner: typeof OWNER_A | typeof OWNER_B,
  contract: typeof CONTRACT_A | typeof CONTRACT_B,
  lastUpdatedAt: string,
  suffix: string,
): AgenticIdentity {
  return {
    id: `0x${suffix.repeat(64)}`,
    contract,
    tokenId: "7",
    owner,
    status: "ACTIVE",
    seenMint: true,
    transactionHash: HASH,
    blockNumber: "1",
    blockTimestamp: lastUpdatedAt,
    logIndex: "0",
    firstSeenAt: "100",
    lastUpdatedAt,
    currentAuthorizationCount: "0",
    totalAuthorizationEvents: "0",
    sourceChain: "0g-galileo",
  };
}
