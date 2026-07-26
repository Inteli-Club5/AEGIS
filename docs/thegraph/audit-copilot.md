# AEGIS Audit Copilot

## Current product boundary

The branch contains a minimum live, read-only Audit Copilot over the 0G Agentic ID Subgraph. It is not in the AEGIS enforcement path, does not submit transactions, and is not a free-form GraphQL agent. Its purpose is to answer a small set of natural-language audit questions from live indexed evidence and attach transaction-level citations.

All six allowlisted intents were exercised through the real Next.js HTTP route against synchronized Subgraph CID `QmaVs13eKCFLV9MAoZNkb4S5oqZ7ToV2nyVPu6kGHQqbY9`. Each returned HTTP 200 with indexed entity/transaction/block citations and fresh `_meta`; a question requesting private TeeML prompt content was rejected with HTTP 400. The sanitized capture is `docs/evidence/thegraph/audit-copilot.sanitized.json`.

The current implementation is:

- engine: `packages/nextjs/lib/onchain-data/auditCopilot.ts`;
- static operations: `packages/nextjs/lib/onchain-data/queries.ts`;
- server route: `POST /api/onchain/audit-copilot` in `packages/nextjs/app/api/onchain/audit-copilot/route.ts`;
- dashboard: `packages/nextjs/app/dashboard/audit-copilot/page.tsx`;
- endpoint source: server-only `THEGRAPH_0G_SUBGRAPH_URL`;
- evidence source: `aegis-0g` GraphQL and `_meta` only.

This is a deterministic intent/tool layer today. It creates immediate, auditable value without pretending that an unconstrained chatbot is needed. A future language model may phrase a result, but it must remain behind the same intent and evidence boundary.

## Live allowlisted intents

| Intent | Question class | GraphQL tool | Indexed evidence |
| --- | --- | --- | --- |
| `AGENTIC_ID_REGISTRY_SUMMARY` | Registry counts at the indexed block | `AuditZeroGRegistrySummary` | `ZeroGProtocolSummary` snapshot citation plus separately labelled transaction-backed identity evidence. The identity citation does not prove the aggregate. |
| `RECENT_AGENTIC_IDS` | Most recently updated identities | `AuditZeroGIdentities` | `AgenticIdentity`. |
| `AGENTIC_ID_OWNER_ACTIVITY` | Bounded active identities grouped by current owner | `AuditZeroGIdentities` | `AgenticIdentity`. |
| `RECENT_OWNERSHIP_CHANGES` | Mint/transfer/burn changes | `AuditZeroGOwnerChanges` | `AgenticIdentityOwnerChange`. |
| `RECENT_USAGE_AUTHORIZATIONS` | Recent usage grants and revocations | `AuditZeroGAuthorizations` | `AgenticIdentityAuthorization`. |
| `RECENT_DELEGATIONS` | Recent delegate-access changes | `AuditZeroGDelegations` | `AgenticIdentityDelegation`. |

These are registry-wide 0G facts. An answer must not label every indexed identity as AEGIS-linked; linkage requires the canonical keys in `cross-chain-join.md`.

## Request and response contract

The request is a strict JSON object:

```json
{
  "question": "Show the most recent indexed Agentic ID usage authorizations.",
  "intent": "RECENT_USAGE_AUTHORIZATIONS",
  "limit": 10
}
```

- `question` is required and contains 1 through 240 characters.
- `intent` is optional; when omitted, a bounded deterministic classifier must select one of the allowlisted intents.
- `limit` defaults to 10 and must be an integer from 1 through 20.
- unknown keys, invalid JSON, invalid intents, out-of-range limits, and non-allowlisted questions are rejected.
- the HTTP body is streamed through a hard 4,096-byte cap before JSON parsing, even when `Content-Length` is absent, invalid, or understates the payload; successful responses use `cache-control: no-store`.

The response schema is conceptually:

```ts
type AuditCopilotResponse = {
  intent: AuditCopilotIntent;
  question: string;
  answer: string;
  findings: Array<{
    statement: string;
    citations: AuditCopilotCitation[];
  }>;
  citations: AuditCopilotCitation[];
  freshness: IndexerFreshness;
  warnings: string[];
};

type AuditCopilotCitation = {
  sourceSubgraph: "aegis-0g";
  sourceChain: "0g-galileo";
  provenance: "EVENT_TRANSACTION" | "INDEXED_ENTITY_SNAPSHOT";
  entityType: "ZeroGProtocolSummary" | "AgenticIdentity" | "AgenticIdentityOwnerChange"
    | "AgenticIdentityAuthorization" | "AgenticIdentityDelegation";
  entityId: string;
  transactionHash: `0x${string}` | null;
  blockNumber: string;
};
```

`EVENT_TRANSACTION` citations always include an exact transaction hash and block. `INDEXED_ENTITY_SNAPSHOT` is used only for the mutable `ZeroGProtocolSummary` state queried at the cited `_meta` block and deliberately carries `transactionHash: null`; it must not be presented as one event proving the aggregate. A registry-summary response also includes separately labelled transaction-backed identity evidence so the global response invariant remains intact.

The engine refuses to answer when a query returns no transaction-backed evidence. `_meta` is converted to a freshness object, and either `hasIndexingErrors: true` or stale/incomplete freshness rejects the answer entirely. Results from an errored or stale indexer are never returned with a warning as if they were usable evidence.

## System prompt for a future language-model presenter

Any future model that summarizes tool results must use the following policy (or a stricter equivalent):

> You are the read-only AEGIS Audit Copilot. Answer only from results returned by allowlisted AEGIS Subgraph tools. Never construct GraphQL, call RPC, query Mirror Node or an explorer, access the AEGIS private database, infer private policy/TeeML content, or claim a relationship that the indexed keys do not prove. Every event finding must cite a returned entity ID, source Subgraph, transaction hash, and block number. An aggregate may cite its summary-entity snapshot and indexed block only when it is explicitly labelled as a snapshot; the response must also include separately labelled transaction-backed evidence and must never imply that one transaction proves the aggregate. If evidence is missing, ambiguous, stale, or reports indexing errors, refuse the answer and do not fill the gap. Never issue a mutation or transaction instruction.

The model receives only normalized tool results, never an endpoint, Gateway key, private prompt, semantic rules, decrypted metadata, or raw TeeML output.

## Security model

- read-only GraphQL operations only; no mutation path exists;
- static query documents and validated variables; raw user-authored GraphQL is never accepted;
- endpoint is selected by server configuration, never by the request;
- request/object allowlist and bounded question length;
- maximum 20 entities per tool call;
- Graph client timeout, streaming HTTP body cap independent of `Content-Length`, and no-store response;
- no RPC, explorer, Mirror Node, operational database, or JSON-fixture fallback;
- no URI dereferencing and no dynamic-string Agentic ID metadata indexing;
- no conclusion without entity/transaction/block citations;
- fail-closed `_meta` indexing errors and freshness;
- unsupported question classes fail closed.

Production hardening before public exposure should add authentication/rate limiting at the route boundary and infrastructure-level GraphQL complexity controls. Public production introspection may be disabled where operationally appropriate; the internal versioned schema remains available to the tool registry.

## Acceptance scenarios already defined for the 0G MVP

1. **Live registry summary:** query the live `aegis-0g` endpoint, attribute aggregate metrics to the `ZeroGProtocolSummary` snapshot at the `_meta` block, cite at least one separately labelled real identity transaction/block/entity, and never claim that the identity transaction proves the aggregate.
2. **Live event analysis:** answer ownership, authorization, or delegation intent only when the corresponding live entities exist; every finding cites its exact event entity and transaction/block.
3. **Fail-closed request:** reject an unsupported question, unknown field, excessive limit, empty result, or unavailable/stale evidence condition without changing to RPC, a private API, or fixture data.

Runtime smoke evidence belongs in `docs/evidence/thegraph/` and must state the GraphQL endpoint class, intent, returned entity IDs, transaction hashes, blocks, `_meta`, and `containsSecrets: false`. The current 0G acceptance capture is `docs/evidence/thegraph/audit-copilot.sanitized.json`.

## Hedera extension (`TG-AUDIT-COPILOT-001`)

The remaining task is not “build a chatbot.” It is to add live Hedera-backed intents after the required entities exist:

- DENY frequency by bounded time range;
- denied validation counts by `policyHash`;
- actions by `modelIdHash`;
- Safe executions without a correlatable TeeML validation;
- validation/execution trend changes that can be computed from indexed facts.

Preconditions:

1. `TG-DEPLOY-001` produced a real singleton registry, a public artifact, and at least one explicitly labelled authorized contract/indexing test record or a real verified TeeML record.
2. `TG-HEDERA-RPC-001` produced `HEDERA_GRAPH_RPC_READY`, a healthy/synced `aegis-hedera` deployment, `_meta`, and live GraphQL entities.
3. Any business payment/execution analysis that needs missing fields waits for `TG-EVENTS-001`.

Implementation points:

- extend `AUDIT_COPILOT_INTENTS` and its strict classifier;
- add one static named query per new intent to `queries.ts`;
- validate and normalize each response before analysis;
- add Hedera citations with source Subgraph, entity ID, transaction hash, and block;
- preserve partial-source, stale, mismatch, and no-evidence behavior;
- add unit tests and a live HTTP/GraphQL acceptance capture.

Removal criterion: remove the `TG-AUDIT-COPILOT-001` code marker only after at least one Hedera intent passes its live GraphQL citation test, query/input limits, invalid-question test, no-RPC boundary test, and freshness/error test. No private context or fixture response may appear in that evidence.

## Subgraph MCP migration boundary

While deployments are self-hosted, tools call the real local GraphQL endpoints directly. This is not represented as Subgraph MCP.

After an AEGIS Subgraph is genuinely published to The Graph Network, Subgraph MCP may provide schema discovery and constrained read-only queries for that specific allowlisted deployment. Migration replaces only the query adapter for that source; intent names, static-operation policy, response validation, pagination, citations, freshness, and cross-chain rules remain unchanged. MCP is not a dashboard runtime dependency.

## Best AI Use Case of The Graph

The feature qualifies on product substance only when The Graph is essential to each answer: live Subgraph schemas define the available facts, GraphQL entities supply the evidence, `_meta` exposes data quality, and transaction/block references make conclusions auditable. The 0G MVP already applies this discipline. Hedera analysis will be enabled only over real indexed entities. A decorative chatbot, raw arbitrary-GraphQL generator, or database-backed answer would violate the product thesis.
