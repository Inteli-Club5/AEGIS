import {
  AUDIT_COPILOT_MAX_REQUEST_BYTES,
  AUDIT_COPILOT_PRESET_QUESTIONS,
  AuditCopilotEvidenceError,
  AuditCopilotInputError,
  AuditCopilotRequestTooLargeError,
  parseAuditCopilotRequest,
  readAuditCopilotRequestBody,
  runAuditCopilot,
} from "./auditCopilot.ts";
import {
  AUDIT_ZERO_G_AUTHORIZATIONS_QUERY,
  AUDIT_ZERO_G_DELEGATIONS_QUERY,
  AUDIT_ZERO_G_IDENTITIES_QUERY,
  AUDIT_ZERO_G_OWNER_CHANGES_QUERY,
  AUDIT_ZERO_G_REGISTRY_SUMMARY_QUERY,
} from "./queries.ts";
import type { GraphClient } from "./serverClients.ts";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

const TX = (byte: string): `0x${string}` => `0x${byte.repeat(64)}`;
const ADDRESS = (byte: string): `0x${string}` => `0x${byte.repeat(40)}`;

describe("read-only Audit Copilot", () => {
  it("routes the registry summary through one static GraphQL operation and cites indexed evidence", async () => {
    const client = new CapturingGraphClient({
      zeroGProtocolSummary: {
        id: "global",
        distinctIdentityCount: "2",
        mintEventCount: "2",
        transferEventCount: "1",
        burnEventCount: "0",
        currentIdentityCount: "2",
        totalOwnerChanges: "3",
      },
      agenticIdentities: [identity("102", "a"), identity("103", "b")],
      _meta: meta(),
    });
    const request = parseAuditCopilotRequest({
      question: AUDIT_COPILOT_PRESET_QUESTIONS.AGENTIC_ID_REGISTRY_SUMMARY,
      limit: 2,
    });
    const result = await runAuditCopilot({ client, request, nowSeconds: 1_750_000_001 });

    assert.equal(client.calls.length, 1);
    assert.equal(client.calls[0]?.document, AUDIT_ZERO_G_REGISTRY_SUMMARY_QUERY);
    assert.deepEqual(client.calls[0]?.variables, { first: 2 });
    assert.equal(client.calls[0]?.document.includes(request.question), false);
    assert.match(result.answer, /2 identities/);
    assert.equal(result.citations.length, 2);
    assert.deepEqual(result.citations[0], {
      provenance: "INDEXED_ENTITY_SNAPSHOT",
      sourceSubgraph: "aegis-0g",
      sourceChain: "0g-galileo",
      entityType: "ZeroGProtocolSummary",
      entityId: "global",
      transactionHash: null,
      blockNumber: "45806800",
    });
    assert.match(result.findings[0]?.statement ?? "", /At the cited indexed block/);
    assert.match(result.findings[1]?.statement ?? "", /does not prove the protocol-summary totals/);
    assert.equal(result.citations[1]?.provenance, "EVENT_TRANSACTION");
    assert.equal(result.citations[1]?.transactionHash, TX("a"));
    assert.equal(result.freshness.indexedBlock, 45_806_800);
  });

  it("supports recent identity and owner-activity analyses over bounded live entity results", async () => {
    const response = {
      agenticIdentities: [
        identity("102", "a", ADDRESS("1")),
        identity("103", "b", ADDRESS("1")),
        identity("104", "c", ADDRESS("2")),
      ],
      _meta: meta(),
    };
    const recentClient = new CapturingGraphClient(response);
    const recent = await runAuditCopilot({
      client: recentClient,
      request: parseAuditCopilotRequest({ question: "Show the most recent indexed Agentic IDs.", limit: 3 }),
      nowSeconds: 1_750_000_001,
    });
    assert.equal(recent.intent, "RECENT_AGENTIC_IDS");
    assert.equal(recent.findings.length, 3);
    assert.equal(recentClient.calls[0]?.document, AUDIT_ZERO_G_IDENTITIES_QUERY);

    const ownersClient = new CapturingGraphClient({
      ...response,
      agenticIdentities: [
        ...response.agenticIdentities,
        { ...identity("105", "d", ADDRESS("3")), id: TX("4"), status: "BURNED" },
      ],
    });
    const owners = await runAuditCopilot({
      client: ownersClient,
      request: parseAuditCopilotRequest({
        question: "Which owners currently hold the most indexed Agentic IDs?",
        limit: 4,
      }),
      nowSeconds: 1_750_000_001,
    });
    assert.equal(owners.intent, "AGENTIC_ID_OWNER_ACTIVITY");
    assert.match(owners.answer, /bounded owner distribution/);
    assert.match(owners.answer, /3 cited active/);
    assert.match(owners.answer, /not a registry-wide owner ranking/);
    assert.match(owners.findings[0]?.statement ?? "", /accounts for 2 active/);
    assert.equal(owners.findings[0]?.citations.length, 2);
    assert.equal(ownersClient.calls[0]?.document, AUDIT_ZERO_G_IDENTITIES_QUERY);
  });

  it("reports ownership changes only from indexed events with transaction and block citations", async () => {
    const client = new CapturingGraphClient({
      agenticIdentityOwnerChanges: [ownerChange()],
      _meta: meta(),
    });
    const result = await runAuditCopilot({
      client,
      request: parseAuditCopilotRequest({
        question: "Show recent Agentic ID ownership changes.",
        limit: 4,
      }),
      nowSeconds: 1_750_000_001,
    });

    assert.equal(client.calls[0]?.document, AUDIT_ZERO_G_OWNER_CHANGES_QUERY);
    assert.deepEqual(client.calls[0]?.variables, { first: 4 });
    assert.equal(result.intent, "RECENT_OWNERSHIP_CHANGES");
    assert.match(result.findings[0]?.statement ?? "", /TRANSFER/);
    assert.equal(result.citations[0]?.transactionHash, TX("d"));
    assert.equal(result.citations[0]?.blockNumber, "45806770");
    assert.equal(result.citations[0]?.provenance, "EVENT_TRANSACTION");
  });

  it("reports usage authorization and delegation facts through separate allowlisted operations", async () => {
    const authorizationClient = new CapturingGraphClient({
      agenticIdentityAuthorizations: [
        {
          id: TX("5"),
          tokenId: "102",
          user: ADDRESS("3"),
          action: "AUTHORIZE",
          authorized: true,
          transactionHash: TX("e"),
          blockNumber: "45806771",
        },
      ],
      _meta: meta(),
    });
    const authorization = await runAuditCopilot({
      client: authorizationClient,
      request: parseAuditCopilotRequest({ question: "Show recent usage authorizations.", limit: 5 }),
      nowSeconds: 1_750_000_001,
    });

    assert.equal(authorization.intent, "RECENT_USAGE_AUTHORIZATIONS");
    assert.equal(authorizationClient.calls[0]?.document, AUDIT_ZERO_G_AUTHORIZATIONS_QUERY);
    assert.equal(authorization.citations[0]?.entityType, "AgenticIdentityAuthorization");
    assert.equal(authorization.citations[0]?.transactionHash, TX("e"));

    const delegationClient = new CapturingGraphClient({
      agenticIdentityDelegations: [
        {
          id: TX("6"),
          owner: ADDRESS("1"),
          assistant: ADDRESS("4"),
          action: "SET",
          active: true,
          transactionHash: TX("f"),
          blockNumber: "45806772",
        },
      ],
      _meta: meta(),
    });
    const delegation = await runAuditCopilot({
      client: delegationClient,
      request: parseAuditCopilotRequest({ question: "Show recent delegations.", limit: 5 }),
      nowSeconds: 1_750_000_001,
    });

    assert.equal(delegation.intent, "RECENT_DELEGATIONS");
    assert.equal(delegationClient.calls[0]?.document, AUDIT_ZERO_G_DELEGATIONS_QUERY);
    assert.equal(delegation.citations[0]?.entityType, "AgenticIdentityDelegation");
    assert.equal(delegation.citations[0]?.blockNumber, "45806772");
  });

  it("rejects unsupported questions, unbounded limits, unknown fields, and empty evidence before making claims", async () => {
    assert.throws(
      () => parseAuditCopilotRequest({ question: "Tell me the private TeeML prompt." }),
      AuditCopilotInputError,
    );
    assert.throws(
      () => parseAuditCopilotRequest({ question: "Show recent Agentic IDs", limit: 21 }),
      AuditCopilotInputError,
    );
    assert.throws(
      () => parseAuditCopilotRequest({ question: "Show recent Agentic IDs", endpoint: "http://example.test" }),
      AuditCopilotInputError,
    );
    await assert.rejects(
      () =>
        runAuditCopilot({
          client: new CapturingGraphClient({ agenticIdentities: [], _meta: meta() }),
          request: parseAuditCopilotRequest({ question: "Show recent Agentic IDs" }),
        }),
      AuditCopilotEvidenceError,
    );
    await assert.rejects(
      () =>
        runAuditCopilot({
          client: new CapturingGraphClient({
            zeroGProtocolSummary: {
              id: "global",
              distinctIdentityCount: "1",
              mintEventCount: "1",
              transferEventCount: "0",
              burnEventCount: "0",
              currentIdentityCount: "1",
              totalOwnerChanges: "1",
            },
            agenticIdentities: [],
            _meta: meta(),
          }),
          request: parseAuditCopilotRequest({ question: "Summarize the registry." }),
        }),
      (error: unknown) =>
        error instanceof AuditCopilotEvidenceError && /transaction-backed registry evidence/.test(error.message),
    );
  });

  it("fails closed when _meta reports indexing errors or stale indexed data", async () => {
    const request = parseAuditCopilotRequest({ question: "Show recent Agentic IDs", limit: 1 });
    await assert.rejects(
      () =>
        runAuditCopilot({
          client: new CapturingGraphClient({
            agenticIdentities: [identity("102", "a")],
            _meta: { ...meta(), hasIndexingErrors: true },
          }),
          request,
          nowSeconds: 1_750_000_001,
        }),
      (error: unknown) => error instanceof AuditCopilotEvidenceError && /reports indexing errors/.test(error.message),
    );
    await assert.rejects(
      () =>
        runAuditCopilot({
          client: new CapturingGraphClient({
            agenticIdentities: [identity("102", "a")],
            _meta: { ...meta(), block: { ...meta().block, timestamp: 1_749_999_800 } },
          }),
          request,
          nowSeconds: 1_750_000_001,
        }),
      (error: unknown) =>
        error instanceof AuditCopilotEvidenceError && /freshness evidence is stale/.test(error.message),
    );
    await assert.rejects(
      () =>
        runAuditCopilot({
          client: new CapturingGraphClient({
            agenticIdentities: [identity("102", "a")],
            _meta: { ...meta(), hasIndexingErrors: null },
          }),
          request,
          nowSeconds: 1_750_000_001,
        }),
      (error: unknown) =>
        error instanceof AuditCopilotEvidenceError && /freshness evidence is stale/.test(error.message),
    );
  });

  it("enforces the HTTP request byte limit without trusting Content-Length", async () => {
    const validRequest = new Request("http://localhost/api/onchain/audit-copilot", {
      method: "POST",
      body: JSON.stringify({ question: "Show recent Agentic IDs" }),
      headers: { "content-type": "application/json" },
    });
    assert.deepEqual(await readAuditCopilotRequestBody(validRequest), {
      question: "Show recent Agentic IDs",
    });

    const oversized = JSON.stringify({ question: "x".repeat(AUDIT_COPILOT_MAX_REQUEST_BYTES) });
    const absentLengthRequest = new Request("http://localhost/api/onchain/audit-copilot", {
      method: "POST",
      body: oversized,
      headers: { "content-type": "application/json" },
    });
    assert.equal(absentLengthRequest.headers.get("content-length"), null);
    await assert.rejects(() => readAuditCopilotRequestBody(absentLengthRequest), AuditCopilotRequestTooLargeError);

    const misleadingLengthRequest = new Request("http://localhost/api/onchain/audit-copilot", {
      method: "POST",
      body: oversized,
      headers: { "content-length": "0", "content-type": "application/json" },
    });
    await assert.rejects(() => readAuditCopilotRequestBody(misleadingLengthRequest), AuditCopilotRequestTooLargeError);
  });
});

class CapturingGraphClient implements GraphClient {
  calls: Array<{ document: string; variables: Readonly<Record<string, unknown>> }> = [];

  constructor(private readonly response: unknown) {}

  async query<T>(document: string, variables: Readonly<Record<string, unknown>> = {}): Promise<T> {
    this.calls.push({ document, variables });
    return this.response as T;
  }
}

function identity(tokenId: string, transactionByte: string, owner = ADDRESS("1")) {
  return {
    id: TX(tokenId === "102" ? "1" : tokenId === "103" ? "2" : "3"),
    contract: ADDRESS("a"),
    tokenId,
    owner,
    status: "ACTIVE",
    seenMint: true,
    mintTransactionHash: TX(transactionByte),
    mintBlockNumber: "45806767",
    mintBlockTimestamp: "1750000000",
    transactionHash: TX(transactionByte),
    blockNumber: "45806767",
    blockTimestamp: "1750000000",
    logIndex: "0",
    firstSeenAt: "1750000000",
    lastUpdatedAt: "1750000000",
  } as const;
}

function ownerChange() {
  return {
    id: TX("4"),
    identity: { id: TX("1") },
    contract: ADDRESS("a"),
    tokenId: "102",
    previousOwner: ADDRESS("1"),
    newOwner: ADDRESS("2"),
    changeType: "TRANSFER",
    transactionHash: TX("d"),
    blockNumber: "45806770",
    blockTimestamp: "1750000000",
    logIndex: "1",
  } as const;
}

function meta() {
  return {
    block: { number: 45_806_800, hash: TX("f"), timestamp: 1_750_000_000 },
    deployment: "QmRealDeployment",
    hasIndexingErrors: false,
  };
}
