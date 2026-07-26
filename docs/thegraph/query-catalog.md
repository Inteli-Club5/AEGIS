# AEGIS GraphQL query catalog

All runtime operations are static GraphQL documents. User input is passed only through validated variables; no operation concatenates filter text, field names, ordering, fragments, or endpoint URLs. Default and maximum page sizes are enforced by the client.

The canonical implementation lives in `packages/nextjs/lib/onchain-data/queries.ts`. This document describes its stable operation intent rather than creating a second source of query text.

## Hedera operations

| Catalog name | GraphQL operation/entity | Variables | Purpose |
| --- | --- | --- | --- |
| `recentAgents` | `RecentHederaAgents` / `agentOnchainSummaries` | `first`, cursor/offset, optional `agentIdHash`, `safe` | Bounded recent agent projections. |
| `agentById` | `HederaAgentById` / `agentOnchainSummary` | exact entity `id` | One Hedera agent summary. |
| `agentBySafe` | `RecentHederaAgents` | exact validated 20-byte `safe`, page variables | Agents linked to a Safe emitted by the registry. |
| `recentTeeMLValidations` | `RecentTeeMLValidations` / `teeMLValidations` | page variables and optional filters | Recent sanitized registry facts. |
| `validationsByVerdict` | `RecentTeeMLValidations` | `verdict = ALLOW | DENY` | Verdict filter. |
| `validationsByReasonCode` | `RecentTeeMLValidations` | exact 32-byte `reasonCodeHash` | Structured reason-code hash filter. |
| `validationByRequestId` | `RecentTeeMLValidations` | exact 32-byte registry `requestId` hash | Exact request lookup. |
| `validationByActionHash` | `RecentTeeMLValidations` | exact 32-byte `actionHash` | Exact action lookup. |
| `validationsByPolicyHash` | `RecentTeeMLValidations` | exact 32-byte `policyHash` | Policy-reference history. |
| `validationByTransactionHash` | `RecentTeeMLValidations` | exact 32-byte EVM transaction hash | Exact transaction lookup. |
| `validationsBySafe` | `RecentTeeMLValidations` | exact 20-byte Safe address | Validation history for one Safe. |
| `validationsByModel` | `RecentTeeMLValidations` | exact 32-byte `modelIdHash` | Actions verified by one sanitized model identifier hash. |
| `validationsByRecorder` | `RecentTeeMLValidations` | exact 20-byte recorder address | Recorder audit. |
| `validationsByDateRange` | `RecentTeeMLValidations` | validated `dateFrom`, `dateTo` Unix seconds | Inclusive block-timestamp range. |
| `validationDetail` | `TeeMLValidationById` / `teeMLValidation` | exact event entity `id` | Full public detail with transaction/block provenance. |
| `executionsBySafe` | `SafeExecutionsBySafe` / `safeExecutions` | `safe`, page variables | Future Safe success/failure facts discovered after registry events. |
| `policyReferences` | `PolicyReferences` / `policyReferences` | optional `agentIdHash`, `policyHash`, page variables | Counts derived only from registry events. |
| `agentSummary` | `HederaAgentById` | exact summary `id` | ALLOW/DENY/validation/execution projection. |
| `dailyMetrics` | `DailyAgentMetrics` / `dailyAgentMetrics` | `agentIdHash`, range, bounded `first` | Day-bucket validation metrics. |
| `indexingStatus` | `IndexingStatus` / `_meta` | none | Indexed block, deployment, block timestamp when available, and `hasIndexingErrors`. |

`requestId` is the registry's explicit `keccak256(UTF-8(trim(UUID-string)))` representation, not the raw UUID. The UI labels this conversion so users do not mistake it for a silently changed application identifier.

## 0G operations

| Catalog name | GraphQL operation/entity | Variables | Purpose |
| --- | --- | --- | --- |
| `recentAgenticIdentities` | `RecentAgenticIdentities` / `agenticIdentities` | `first`, cursor/offset, optional `owner`, `tokenId` | Minted identity facts/current owner projection. |
| `agenticIdentityById` | `AgenticIdentityById` / `agenticIdentity` | exact identity `id` | Identity plus bounded ownership-change history. |
| `identitiesByOwner` | `RecentAgenticIdentities` | exact validated 20-byte owner | Owner filter. |
| `identityByToken` | `RecentAgenticIdentities` | canonical unsigned token ID | Token lookup within the configured chain/contract deployment. |
| `recentUsageAuthorizations` | `AuditZeroGAuthorizations` / `agenticIdentityAuthorizations` | bounded `first` | Verified `UsageAuthorized` and `UsageRevoked` facts with token/user/action provenance. |
| `recentDelegations` | `AuditZeroGDelegations` / `agenticIdentityDelegations` | bounded `first` | Verified `DelegateAccessSet` facts normalized as set/revoke changes. |
| `zeroGIndexingStatus` | `IndexingStatus` / `_meta` | none | 0G indexed block and indexing-error state. |

The verified minimal event surface supports ownership, usage authorization/revocation, and delegation changes. It does not index the dynamic-string `IntelligentDataSet` event, dereference metadata, or expose a private/decrypted payload. No current fixed-size event supplies an `agentIdHash`, so agent-hash filtering remains unavailable on the 0G source.

## Audit Copilot operations

The live 0G Audit Copilot calls only the following static operations. Natural-language input selects an allowlisted intent; it never becomes GraphQL text.

| Intent | Static operation | Maximum input | Required evidence |
| --- | --- | --- | --- |
| `AGENTIC_ID_REGISTRY_SUMMARY` | `AuditZeroGRegistrySummary` | `first <= 20` | Aggregate claims cite the `ZeroGProtocolSummary` snapshot at the `_meta` block; a separately labelled identity citation supplies required transaction-backed activity and explicitly does not prove the aggregate. |
| `RECENT_AGENTIC_IDS` | `AuditZeroGIdentities` | `first <= 20` | Cited identity entity, transaction, and block. |
| `AGENTIC_ID_OWNER_ACTIVITY` | `AuditZeroGIdentities` | `first <= 20` | Bounded, most-recently updated active identity sample grouped deterministically by owner; never described as a registry-wide ranking. |
| `RECENT_OWNERSHIP_CHANGES` | `AuditZeroGOwnerChanges` | `first <= 20` | Cited ownership-change event entity. |
| `RECENT_USAGE_AUTHORIZATIONS` | `AuditZeroGAuthorizations` | `first <= 20` | Cited authorization/revocation event entity. |
| `RECENT_DELEGATIONS` | `AuditZeroGDelegations` | `first <= 20` | Cited delegation event entity. |

The API rejects unknown object keys, questions longer than 240 characters, non-allowlisted intents, invalid limits, bodies over 4,096 bytes regardless of `Content-Length`, and evidence-free answers. It fails closed instead of returning analysis when `_meta` reports indexing errors or stale/incomplete freshness. Hedera-backed Audit operations are deliberately absent until `TG-AUDIT-COPILOT-001` is satisfied.

## Cross-chain operation

`crossChainAgentView` is not a cross-chain GraphQL join. It executes bounded named operations against both endpoints, validates each response, then applies `docs/thegraph/cross-chain-join.md` in the dashboard client. The result carries both source records, match keys, partial/mismatch/ambiguity state, and freshness for each endpoint.

## Unsupported operations

`paymentsByAgent` is a named unsupported capability rather than a fabricated query. No current Hedera AEGIS contract emits a payment event with agent, asset, destination, or amount. The client returns an explicit unsupported state and the dashboard renders the gap. A future contract event and schema version must be implemented before this operation can return data.

Likewise, Safe `ExecutionSuccess`/`ExecutionFailure` proves execution outcome and payment reimbursement only at Safe-protocol level; it does not prove the AEGIS business asset/destination semantics requested for a Payment entity.

## Pagination and exact search

- Page sizes are bounded and validated.
- Ordering is deterministic and the client returns an opaque, versioned continuation token.
- Exact byte searches validate length before sending a variable.
- Token IDs and date ranges are normalized as numeric variables.
- Empty input becomes `null`; malformed input is rejected instead of being inserted into a query.
- A result page includes source `_meta` freshness.

The live integration gate must cover verdict, date range, request ID, policy hash, agent join, pagination, and `_meta` against the applicable real deployed Subgraph. Unit tests alone are not E2E evidence. Until the Hedera registry and source stack are live, these Hedera cases remain under `TG-DEPLOY-001` and `TG-HEDERA-RPC-001`; no fixture is promoted as E2E evidence.
