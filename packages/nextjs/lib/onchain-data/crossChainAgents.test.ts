import { listCrossChainAgents } from "./crossChainAgents.ts";
import {
  AGENTIC_IDENTITIES_QUERY,
  HEDERA_AGENTS_QUERY,
  HEDERA_AGENT_CANDIDATES_QUERY,
  ZERO_G_IDENTITY_CANDIDATES_QUERY,
} from "./queries.ts";
import type { GraphClient } from "./serverClients.ts";
import type { CrossChainAgentFilters, CrossChainAgentPage } from "./types.ts";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

const HASH_A = hex32(1);
const HASH_B = hex32(2);
const SAFE_A = hex20(1);
const SAFE_B = hex20(2);
const OWNER_A = hex20(3);
const OWNER_B = hex20(4);
const CONTRACT_A = hex20(5);
const CONTRACT_B = hex20(6);
const TX = hex32(999);

describe("paginated cross-chain agent list", () => {
  it("joins before applying combined Hedera and 0G filters", async () => {
    const fixture = graphFixture({
      hedera: [agent(HASH_A, SAFE_A, "7"), agent(HASH_B, SAFE_B, "8")],
      zeroG: [identity(hex32(101), OWNER_A, CONTRACT_A, "7"), identity(hex32(102), OWNER_B, CONTRACT_B, "8")],
    });
    const result = await listCrossChainAgents({
      ...fixture.clients,
      filters: { safe: SAFE_A, owner: OWNER_A, status: "ACTIVE", tokenId: "007", contract: CONTRACT_A },
      nowSeconds: 210,
    });

    assert.equal(result.items.length, 1);
    assert.equal(result.items[0]?.state, "complete");
    assert.equal(result.items[0]?.hedera?.safe, SAFE_A);
    assert.equal(result.items[0]?.zeroG?.owner, OWNER_A);
    assert.deepEqual(result.collection.snapshotBlocks, { hedera: 10, zeroG: 20 });
    assert.equal(fixture.hederaRequests[0]?.document, HEDERA_AGENTS_QUERY);
    assert.deepEqual(fixture.hederaRequests[0]?.variables?.where, {
      safe: SAFE_A,
      agenticIdTokenId: "7",
    });
  });

  it("reaches source records after the first 100 and pins both Subgraph blocks on page two", async () => {
    const hedera = Array.from({ length: 101 }, (_, index) => agent(hex32(index + 1), SAFE_A, String(index + 1)));
    const zeroG = Array.from({ length: 101 }, (_, index) =>
      identity(hex32(index + 1_000), OWNER_A, CONTRACT_A, String(index + 1)),
    );
    const fixture = graphFixture({ hedera, zeroG });

    const first = await listCrossChainAgents({ ...fixture.clients, limit: 100, nowSeconds: 210 });
    assert.equal(first.items.length, 100);
    assert.ok(first.nextCursor);

    const second = await listCrossChainAgents({
      ...fixture.clients,
      limit: 100,
      cursor: first.nextCursor,
      nowSeconds: 210,
    });
    assert.equal(second.items[0]?.hedera?.id, hex32(101));
    const secondHederaWindow = fixture.hederaRequests
      .filter(request => request.document === HEDERA_AGENTS_QUERY)
      .at(-1);
    const secondZeroGCandidates = fixture.zeroGRequests
      .filter(request => request.document === ZERO_G_IDENTITY_CANDIDATES_QUERY)
      .at(-1);
    assert.deepEqual(secondHederaWindow?.variables?.block, { number: 10 });
    assert.deepEqual(secondZeroGCandidates?.variables?.block, { number: 20 });
  });

  it("finds a cross-chain pair whose entities occupy different source windows", async () => {
    const hedera = Array.from({ length: 101 }, (_, index) => agent(hex32(index + 1), SAFE_A, String(index + 1)));
    const zeroG = [identity(hex32(500), OWNER_A, CONTRACT_A, "101")];
    const fixture = graphFixture({ hedera, zeroG });
    const first = await listCrossChainAgents({ ...fixture.clients, limit: 100, nowSeconds: 210 });
    const second = await listCrossChainAgents({
      ...fixture.clients,
      limit: 100,
      cursor: first.nextCursor,
      nowSeconds: 210,
    });

    assert.equal(second.items[0]?.state, "complete");
    assert.equal(second.items[0]?.hedera?.agenticIdTokenId, "101");
    assert.equal(second.items[0]?.zeroG?.owner, OWNER_A);
  });

  it("detects duplicate Hedera token claims even when they are in different source windows", async () => {
    const hedera = Array.from({ length: 101 }, (_, index) =>
      agent(hex32(index + 1), SAFE_A, index === 100 ? "7" : String(index + 7)),
    );
    hedera[0] = agent(hex32(1), SAFE_A, "7");
    const fixture = graphFixture({
      hedera,
      zeroG: [identity(hex32(800), OWNER_A, CONTRACT_A, "7")],
    });
    const pages = await readPages(fixture.clients, {}, 10);
    const tokenSeven = pages.flatMap(page => page.items).filter(item => item.hedera?.agenticIdTokenId === "7");

    assert.equal(tokenSeven.length, 2);
    assert.equal(
      tokenSeven.some(item => item.state === "complete"),
      false,
    );
    assert.equal(
      tokenSeven.every(item => item.state === "ambiguous"),
      true,
    );
  });

  it("keeps a healthy 0G source visible but ambiguous when Hedera is unavailable", async () => {
    const fixture = graphFixture({
      hedera: [],
      zeroG: [identity(hex32(500), OWNER_A, CONTRACT_A, "7")],
      failHedera: true,
    });
    const result = await listCrossChainAgents({ ...fixture.clients, nowSeconds: 210 });

    assert.equal(result.items.length, 1);
    assert.equal(result.items[0]?.state, "ambiguous");
    assert.equal(result.freshness.hedera.available, false);
    assert.equal(result.sourceErrors.hedera, "Hedera Subgraph query unavailable.");
  });

  it("keeps a correlated 0G item visible and ambiguous when only the canonical Hedera query fails", async () => {
    const fixture = graphFixture({
      hedera: [agent(HASH_A, SAFE_A, "7")],
      zeroG: [identity(hex32(500), OWNER_A, CONTRACT_A, "7")],
    });
    const hederaClient: GraphClient = {
      query: async <T>(document: string, variables?: Readonly<Record<string, any>>) => {
        if (document === HEDERA_AGENTS_QUERY) throw new Error("canonical Hedera query unavailable");
        return fixture.clients.hederaClient.query<T>(document, variables);
      },
    };

    const result = await listCrossChainAgents({
      hederaClient,
      zeroGClient: fixture.clients.zeroGClient,
      nowSeconds: 210,
    });

    assert.equal(result.items.length, 1);
    assert.equal(result.items[0]?.hedera, null);
    assert.equal(result.items[0]?.zeroG?.owner, OWNER_A);
    assert.equal(result.items[0]?.state, "ambiguous");
    assert.match(result.items[0]?.warnings.join(" ") ?? "", /matching Hedera token exists/);
    assert.equal(result.sourceErrors.hedera, "Hedera Subgraph query unavailable.");
  });

  it("advances across an empty Hedera phase before returning a definitive 0G-only item", async () => {
    const fixture = graphFixture({
      hedera: [],
      zeroG: [identity(hex32(500), OWNER_A, CONTRACT_A, "7")],
    });
    const result = await listCrossChainAgents({ ...fixture.clients, nowSeconds: 210 });

    assert.equal(result.items.length, 1);
    assert.equal(result.items[0]?.state, "zero-g-only");
    assert.equal(result.collection.phase, "zeroG");
  });

  it("does not borrow a date from a different owner candidate with the same token", async () => {
    const fixture = graphFixture({
      hedera: [agent(HASH_A, SAFE_A, "7", "100")],
      zeroG: [
        identity(hex32(500), OWNER_A, CONTRACT_A, "7", "100"),
        identity(hex32(501), OWNER_B, CONTRACT_B, "7", "500"),
      ],
    });
    const pages = await readPages(fixture.clients, { owner: OWNER_A, dateFrom: 400 }, 10);

    assert.deepEqual(
      pages.flatMap(page => page.items),
      [],
    );
  });

  it("rejects a cursor reused with different filters and marks truncated candidate lookups ambiguous", async () => {
    const duplicateIdentities = Array.from({ length: 1_000 }, (_, index) =>
      identity(hex32(index + 1_000), index === 0 ? OWNER_A : OWNER_B, CONTRACT_A, "7"),
    );
    const fixture = graphFixture({
      hedera: [agent(HASH_A, SAFE_A, "7")],
      zeroG: duplicateIdentities,
    });
    const first = await listCrossChainAgents({ ...fixture.clients, limit: 1, nowSeconds: 210 });

    assert.equal(first.collection.candidateLookupTruncated.zeroG, true);
    assert.equal(first.items[0]?.state, "ambiguous");
    await assert.rejects(
      listCrossChainAgents({
        ...fixture.clients,
        limit: 1,
        cursor: first.nextCursor,
        filters: { owner: OWNER_A },
        nowSeconds: 210,
      }),
      /Invalid cross-chain agent pagination cursor or filter scope/,
    );
  });
});

type RequestRecord = { document: string; variables?: Readonly<Record<string, any>> };
type RawAgent = ReturnType<typeof agent>;
type RawIdentity = ReturnType<typeof identity>;

function graphFixture(input: { hedera: RawAgent[]; zeroG: RawIdentity[]; failHedera?: boolean; failZeroG?: boolean }) {
  const hederaRequests: RequestRecord[] = [];
  const zeroGRequests: RequestRecord[] = [];
  return {
    hederaRequests,
    zeroGRequests,
    clients: {
      hederaClient: networkClient("hedera", input.hedera, 10, hederaRequests, input.failHedera),
      zeroGClient: networkClient("zeroG", input.zeroG, 20, zeroGRequests, input.failZeroG),
    },
  };
}

function networkClient(
  network: "hedera" | "zeroG",
  records: RawAgent[] | RawIdentity[],
  block: number,
  requests: RequestRecord[],
  fail = false,
): GraphClient {
  return {
    query: async <T>(document: string, variables: Readonly<Record<string, any>> = {}) => {
      requests.push({ document, variables });
      if (fail) throw new Error(`${network} unavailable`);
      const first = Number(variables.first ?? 100);
      const where = (variables.where ?? {}) as Record<string, any>;
      if (network === "hedera") {
        assert.ok(document === HEDERA_AGENTS_QUERY || document === HEDERA_AGENT_CANDIDATES_QUERY);
        return {
          agentOnchainSummaries: filterHedera(records as RawAgent[], where).slice(0, first),
          _meta: meta(block),
        } as T;
      }
      assert.ok(document === AGENTIC_IDENTITIES_QUERY || document === ZERO_G_IDENTITY_CANDIDATES_QUERY);
      return {
        agenticIdentities: filterZeroG(records as RawIdentity[], where).slice(0, first),
        _meta: meta(block),
      } as T;
    },
  };
}

function filterHedera(records: RawAgent[], where: Record<string, any>): RawAgent[] {
  return records
    .filter(item => !where.id_gt || item.id.toLowerCase() > String(where.id_gt).toLowerCase())
    .filter(item => !where.agentIdHash || item.agentIdHash.toLowerCase() === String(where.agentIdHash).toLowerCase())
    .filter(item => !where.safe || item.safe.toLowerCase() === String(where.safe).toLowerCase())
    .filter(item => !where.agenticIdTokenId || item.agenticIdTokenId === String(where.agenticIdTokenId))
    .filter(item => !where.agenticIdTokenId_in || where.agenticIdTokenId_in.includes(item.agenticIdTokenId))
    .sort((left, right) => left.id.localeCompare(right.id));
}

function filterZeroG(records: RawIdentity[], where: Record<string, any>): RawIdentity[] {
  return records
    .filter(item => !where.id_gt || item.id.toLowerCase() > String(where.id_gt).toLowerCase())
    .filter(item => !where.owner || item.owner.toLowerCase() === String(where.owner).toLowerCase())
    .filter(item => !where.contract || item.contract.toLowerCase() === String(where.contract).toLowerCase())
    .filter(item => !where.status || item.status === where.status)
    .filter(item => !where.tokenId || item.tokenId === String(where.tokenId))
    .filter(item => !where.tokenId_in || where.tokenId_in.includes(item.tokenId))
    .sort((left, right) => left.id.localeCompare(right.id));
}

async function readPages(
  clients: { hederaClient: GraphClient; zeroGClient: GraphClient },
  filters: CrossChainAgentFilters,
  maxPages: number,
): Promise<CrossChainAgentPage[]> {
  const pages: CrossChainAgentPage[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < maxPages; page += 1) {
    const result = await listCrossChainAgents({ ...clients, filters, cursor, limit: 100, nowSeconds: 600 });
    pages.push(result);
    if (!result.nextCursor) return pages;
    cursor = result.nextCursor;
  }
  throw new Error("Cross-chain pagination did not terminate within the test bound.");
}

function meta(block: number) {
  return { block: { number: block, hash: HASH_A, timestamp: 200 }, deployment: "test", hasIndexingErrors: false };
}

function agent(id: string, safe: string, tokenId: string, lastActivityAt = "200") {
  return {
    id,
    agentIdHash: id,
    safe,
    agenticIdTokenId: tokenId,
    validationCount: "2",
    allowCount: "1",
    denyCount: "1",
    executionCount: "1",
    executionSuccessCount: "1",
    executionFailureCount: "0",
    policyCount: "1",
    firstActivityAt: "100",
    lastActivityAt,
  };
}

function identity(id: string, owner: string, contract: string, tokenId: string, lastUpdatedAt = "200") {
  return {
    id,
    contract,
    tokenId,
    owner,
    status: "ACTIVE" as const,
    seenMint: true,
    mintTransactionHash: TX,
    mintBlockNumber: "8",
    mintBlockTimestamp: "100",
    transactionHash: TX,
    blockNumber: "10",
    blockTimestamp: lastUpdatedAt,
    logIndex: "0",
    firstSeenAt: "100",
    lastUpdatedAt,
  };
}

function hex32(value: number): `0x${string}` {
  return `0x${value.toString(16).padStart(64, "0")}`;
}

function hex20(value: number): `0x${string}` {
  return `0x${value.toString(16).padStart(40, "0")}`;
}
