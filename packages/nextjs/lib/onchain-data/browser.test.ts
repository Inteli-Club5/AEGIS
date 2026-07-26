import { hashCanonicalAgentId } from "./aggregate.ts";
import {
  fetchAgenticIdentities,
  fetchAgenticIdentity,
  fetchCrossChainAgents,
  fetchHederaAgentSummary,
} from "./browser.ts";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

describe("onchain browser API", () => {
  it("sends only the canonical agent hash and combined filters to the same-origin route", async () => {
    const agentIdHash = hashCanonicalAgentId("agent-1");
    const paths = await captureFetchPaths(async () => {
      await fetchCrossChainAgents({
        limit: 25,
        cursor: "cursor",
        filters: { agentIdHash, safe: "0xsafe", owner: "0xowner", status: "ACTIVE", tokenId: "7", dateFrom: 100 },
      });
      await fetchHederaAgentSummary(`0x${"11".repeat(32)}`);
    });

    assert.equal(
      paths[0],
      `/api/onchain/agents?limit=25&cursor=cursor&agentIdHash=${agentIdHash}&safe=0xsafe&owner=0xowner&status=ACTIVE&tokenId=7&dateFrom=100`,
    );
    assert.equal(paths[0]?.includes("agentId="), false);
    assert.equal(paths[1], `/api/onchain/agents/0x${"11".repeat(32)}`);
  });

  it("sends 0G identity filters and owner-change cursors only to same-origin routes", async () => {
    const paths = await captureFetchPaths(async () => {
      await fetchAgenticIdentities({ filters: { owner: "0xowner", status: "ACTIVE", tokenId: "9" } });
      await fetchAgenticIdentity(`0x${"22".repeat(32)}`, { ownerChangeLimit: 10, ownerChangeCursor: "next" });
    });

    assert.equal(paths[0], "/api/onchain/identities?owner=0xowner&status=ACTIVE&tokenId=9");
    assert.equal(paths[1], `/api/onchain/identities/0x${"22".repeat(32)}?ownerChangeLimit=10&ownerChangeCursor=next`);
  });
});

async function captureFetchPaths(run: () => Promise<void>): Promise<string[]> {
  const originalFetch = globalThis.fetch;
  const paths: string[] = [];
  globalThis.fetch = async input => {
    paths.push(String(input));
    return new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    await run();
    return paths;
  } finally {
    globalThis.fetch = originalFetch;
  }
}
