import {
  AGENTIC_IDENTITIES_QUERY,
  AGENTIC_IDENTITY_DETAIL_QUERY,
  HEDERA_AGENTS_QUERY,
  HEDERA_AGENT_DETAIL_QUERY,
  buildAgentQueryVariables,
  buildIdentityDetailQueryVariables,
  buildIdentityQueryVariables,
} from "./queries.ts";
import {
  getAgenticIdentity,
  getHederaAgentSummary,
  listAgenticIdentities,
  listHederaAgentSummaries,
} from "./repository.ts";
import type { GraphClient } from "./serverClients.ts";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

const HASH = `0x${"11".repeat(32)}`;
const SECOND_HASH = `0x${"12".repeat(32)}`;
const ADDRESS = `0x${"22".repeat(20)}`;
const CONTRACT = `0x${"23".repeat(20)}`;
const TX = `0x${"33".repeat(32)}`;
const EVENT_ID = `${TX}00000000`;

describe("Hedera agent summary reads", () => {
  it("keeps exact agent, Safe, token, and date filters in GraphQL variables", () => {
    const variables = buildAgentQueryVariables({
      limit: 10,
      safe: ADDRESS.toUpperCase().replace("0X", "0x"),
      agentIdHash: HASH.toUpperCase().replace("0X", "0x"),
      agenticIdTokenId: "007",
      dateFrom: 100,
      dateTo: 200,
    });

    assert.deepEqual(variables, {
      first: 11,
      where: {
        safe: ADDRESS,
        agentIdHash: HASH,
        agenticIdTokenId: "7",
        lastActivityAt_gte: "100",
        lastActivityAt_lte: "200",
      },
    });
    assert.equal(HEDERA_AGENTS_QUERY.includes(ADDRESS), false);
  });

  it("returns a stable cursor page and freshness without a fallback read", async () => {
    const requests: Array<{ document: string; variables?: Readonly<Record<string, unknown>> }> = [];
    const client = recordingClient(
      {
        agentOnchainSummaries: [hederaAgent(HASH), hederaAgent(SECOND_HASH)],
        _meta: meta(),
      },
      requests,
    );
    const result = await listHederaAgentSummaries({
      client,
      limit: 1,
      nowSeconds: 210,
    });

    assert.equal(requests[0]?.document, HEDERA_AGENTS_QUERY);
    assert.deepEqual(requests[0]?.variables, { first: 2, where: {} });
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0]?.sourceChain, "hedera-testnet");
    assert.ok(result.nextCursor);
    assert.equal(result.freshness.indexedBlock, 10);

    await listHederaAgentSummaries({
      client,
      limit: 1,
      cursor: result.nextCursor,
      blockNumber: 10,
      nowSeconds: 210,
    });

    assert.deepEqual(requests[1]?.variables, {
      first: 2,
      where: { id_gt: HASH },
      block: { number: 10 },
    });
    assert.match(HEDERA_AGENTS_QUERY, /agentOnchainSummaries\([^)]*block: \$block/s);
    assert.match(HEDERA_AGENTS_QUERY, /_meta\(block: \$block\)/);
  });

  it("returns an agent and recent immutable registry evidence with chain provenance", async () => {
    const requests: Array<{ document: string; variables?: Readonly<Record<string, unknown>> }> = [];
    const result = await getHederaAgentSummary({
      client: recordingClient(
        {
          agentOnchainSummary: hederaAgent(HASH),
          teeMLValidations: [validation()],
          _meta: meta(),
        },
        requests,
      ),
      id: HASH,
      nowSeconds: 210,
    });

    assert.equal(requests[0]?.document, HEDERA_AGENT_DETAIL_QUERY);
    assert.deepEqual(requests[0]?.variables, { id: HASH, validationFirst: 10 });
    assert.equal(result.item?.agentIdHash, HASH);
    assert.equal(result.recentValidations[0]?.transactionHash, TX);
    assert.equal(result.recentValidations[0]?.sourceChain, "hedera-testnet");
    assert.equal(result.freshness.available, true);
  });
});

describe("0G Agentic Identity reads", () => {
  it("keeps owner, contract, token, status, and date filters in GraphQL variables", () => {
    const variables = buildIdentityQueryVariables({
      limit: 20,
      owner: ADDRESS,
      contract: CONTRACT,
      tokenId: "00042",
      status: "ACTIVE",
      dateFrom: 100,
      dateTo: 200,
    });

    assert.deepEqual(variables, {
      first: 21,
      where: {
        owner: ADDRESS,
        contract: CONTRACT,
        tokenId: "42",
        status: "ACTIVE",
        lastUpdatedAt_gte: "100",
        lastUpdatedAt_lte: "200",
      },
    });
    assert.equal(AGENTIC_IDENTITIES_QUERY.includes(ADDRESS), false);
  });

  it("returns a stable cursor page and 0G freshness", async () => {
    const requests: Array<{ document: string; variables?: Readonly<Record<string, unknown>> }> = [];
    const client = recordingClient(
      {
        agenticIdentities: [identity(HASH), identity(SECOND_HASH)],
        _meta: meta(),
      },
      requests,
    );
    const result = await listAgenticIdentities({
      client,
      limit: 1,
      nowSeconds: 210,
    });

    assert.equal(requests[0]?.document, AGENTIC_IDENTITIES_QUERY);
    assert.deepEqual(requests[0]?.variables, { first: 2, where: {} });
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0]?.sourceChain, "0g-galileo");
    assert.ok(result.nextCursor);
    assert.equal(result.freshness.source, "0g-galileo");

    await listAgenticIdentities({
      client,
      limit: 1,
      cursor: result.nextCursor,
      blockNumber: 10,
      nowSeconds: 210,
    });

    assert.deepEqual(requests[1]?.variables, {
      first: 2,
      where: { id_gt: HASH },
      block: { number: 10 },
    });
    assert.match(AGENTIC_IDENTITIES_QUERY, /agenticIdentities\([^)]*block: \$block/s);
    assert.match(AGENTIC_IDENTITIES_QUERY, /_meta\(block: \$block\)/);
  });

  it("paginates owner changes independently on the identity detail", async () => {
    const requests: Array<{ document: string; variables?: Readonly<Record<string, unknown>> }> = [];
    const result = await getAgenticIdentity({
      client: recordingClient(
        {
          agenticIdentity: identity(HASH),
          agenticIdentityOwnerChanges: [ownerChange(EVENT_ID), ownerChange(`${TX}00000001`)],
          _meta: meta(),
        },
        requests,
      ),
      id: HASH,
      ownerChangeLimit: 1,
      nowSeconds: 210,
    });

    assert.equal(requests[0]?.document, AGENTIC_IDENTITY_DETAIL_QUERY);
    assert.deepEqual(requests[0]?.variables, {
      id: HASH,
      ownerChangeFirst: 2,
      ownerChangeWhere: { identity: HASH },
    });
    assert.equal(result.item?.tokenId, "7");
    assert.equal(result.ownerChanges.items.length, 1);
    assert.equal(result.ownerChanges.items[0]?.sourceChain, "0g-galileo");
    assert.ok(result.ownerChanges.nextCursor);
  });

  it("builds owner-change cursors as variables instead of dynamic GraphQL", () => {
    const cursor = Buffer.from(
      JSON.stringify({ version: 1, afterId: EVENT_ID, orderBy: "id", orderDirection: "asc" }),
    ).toString("base64url");

    assert.deepEqual(buildIdentityDetailQueryVariables({ id: HASH, ownerChangeLimit: 25, ownerChangeCursor: cursor }), {
      id: HASH,
      ownerChangeFirst: 26,
      ownerChangeWhere: { identity: HASH, id_gt: EVENT_ID },
    });
  });
});

function recordingClient(
  payload: unknown,
  requests: Array<{ document: string; variables?: Readonly<Record<string, unknown>> }>,
): GraphClient {
  return {
    query: async <T>(document: string, variables?: Readonly<Record<string, unknown>>) => {
      requests.push({ document, variables });
      return payload as T;
    },
  };
}

function meta() {
  return {
    block: { number: 10, hash: HASH, timestamp: 200 },
    deployment: "test",
    hasIndexingErrors: false,
  };
}

function hederaAgent(id: string) {
  return {
    id,
    agentIdHash: id,
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

function identity(id: string) {
  return {
    id,
    contract: CONTRACT,
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
    id: EVENT_ID,
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

function ownerChange(id: string) {
  return {
    id,
    identity: { id: HASH },
    contract: CONTRACT,
    tokenId: "7",
    previousOwner: `0x${"00".repeat(20)}`,
    newOwner: ADDRESS,
    changeType: "MINT",
    transactionHash: TX,
    blockNumber: "10",
    blockTimestamp: "200",
    logIndex: "0",
  };
}
