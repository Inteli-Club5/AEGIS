# AEGIS Policy Engine Level 1

This is the single branch handoff and scope document for
`feat/policy-engine-level-1`. When it conflicts with older architecture, demo,
bounty, audit, or implementation notes, this file wins.

The branch has completed the Policy Engine Level 1 implementation through
durable precheck orchestration and is ready for PR review. Future TeeML, Safe,
Hedera execution, fee, and indexing integrations remain out of scope.

## Current State

Round 1 is implemented in `services/agent-service`:

- Policy schemas and TypeScript domain types;
- strict request validation with unknown-property rejection;
- deterministic canonicalization and backend-calculated `policyHash`;
- Policy create/read/list-versions/update/activate/revoke/active lookup;
- immutable active Policy behavior through versioning;
- supersession of the previous ACTIVE version;
- PostgreSQL persistence through Drizzle;
- local PostgreSQL Docker setup;
- EIP-712 operator signatures;
- unit tests, PostgreSQL integration tests, and HTTP route integration tests.

Phase 1.5 validated the real PostgreSQL path:

- `compose.yaml` starts `postgres:16-alpine`;
- `docker/postgres/init/001-create-test-db.sql` creates isolated `aegis_test`;
- `services/agent-service/drizzle/0000_lethal_blue_shield.sql` was applied with
  `drizzle-kit migrate` against a clean PostgreSQL database;
- Drizzle history, tables, enums, FKs, checks, unique indexes, second-run
  idempotency, advisory transaction locks, and constraints were verified.

Phase 2 added the pure `DeterministicPolicyEvaluator`: it has no database,
network, environment, logging, persistence, or `Date.now()` dependency and
returns only `PASS_TO_TEEML` or `DENY_PRECHECK`.

Phase 3 adds durable Level 1 precheck orchestration: the backend validates and
normalizes action requests, enforces idempotency, loads agent/wallet/active
Policy state, resolves the asset catalog, allocates a monotonic wallet nonce,
computes a usage snapshot and deterministic `actionHash`, calls the evaluator,
persists request/precheck/audit records, and creates a `UsageHold` only when the
deterministic result is `PASS_TO_TEEML`. The persisted functional state for a
passing precheck is `PENDING_TEEML`, not final approval.

## Out Of Scope For This Branch State

Do not implement or wire these until a later approved round:

- 0G/TeeML calls;
- Safe co-signing;
- Hedera execution;
- HBAR/HTS transfers;
- The Graph/Subgraph;
- execution fees or billing;
- contracts, ABIs, deployments, or onchain events;
- signed final `DecisionReceipt`;
- insurance, recovery, payout, coverage, or circuit breaker behavior.

`semanticRules` are stored and included in `policyHash`, but they are not
evaluated in Round 1.

## Domain Contract

Policy persisted statuses:

```ts
type PolicyStatus = "DRAFT" | "ACTIVE" | "SUPERSEDED" | "REVOKED";
type EffectivePolicyStatus = PolicyStatus | "EXPIRED";
```

`EXPIRED` is calculated from `validUntil` and explicit `now`; it is not
persisted.

Core Policy shape:

```ts
type Policy = {
  policyId: string;
  agentId: string;
  walletId: string;
  policyVersion: number;
  policyHash: `0x${string}`;
  status: PolicyStatus;
  validFrom: number;
  validUntil: number | null;
  rules: PolicyRules;
  semanticRules: SemanticRule[];
  createdAt: number;
  updatedAt: number;
  activatedAt: number | null;
  revokedAt: number | null;
  supersededAt: number | null;
  supersededByPolicyId: string | null;
};
```

Rules use integer base-unit strings for all financial amounts. Never use floats
at the transport or domain boundary.

Supported assets in this branch:

- native HBAR on Hedera testnet;
- pre-registered fungible HTS tokens on Hedera testnet.

ERC20, NFT, arbitrary asset, mainnet, and cross-chain assets are out of scope.

## Lifecycle Rules

- Creating a Policy returns `DRAFT`.
- An ACTIVE Policy is never updated in place.
- Updating any Policy creates `policyVersion + 1`, a new `policyHash`, and a new
  `DRAFT` row.
- Activating a new version atomically marks the previous ACTIVE Policy for the
  same `agentId + walletId` as `SUPERSEDED`.
- PostgreSQL enforces at most one ACTIVE Policy per `agentId + walletId`.
- `REVOKED` and `SUPERSEDED` versions are not reactivated implicitly.
- Historical Policies are not silently deleted.

## Hashing Rules

`policyHash` is calculated by the backend. Clients never provide it as source of
truth.

Before hashing:

- normalize identifiers, addresses, Hedera account IDs, token IDs, and URL
  origins;
- normalize amounts as integer base-unit strings;
- sort arrays whose order does not change meaning;
- remove duplicates after normalization;
- sort object keys recursively;
- exclude audit fields such as `createdAt`, `updatedAt`, activation/revocation
  timestamps, signatures, and commitments;
- include `agentId`, `walletId`, `policyVersion`, validity, `rules`, and
  `semanticRules`.

Do not use unnormalized `JSON.stringify()` output as hash input.

## Operator Signature

Mutating Policy routes require:

```http
X-AEGIS-Operator-Address: 0x...
X-AEGIS-Operator-Signature: 0x...
```

The signature is EIP-712 typed data over `PolicyCommitment`.

Domain:

```ts
{
  name: "AEGIS Policy Engine",
  version: "1",
  chainId: 296,
}
```

The commitment binds:

- operation;
- `networkId`;
- operator address;
- `agentId`;
- `walletId`;
- `policyId`;
- `sourcePolicyId` for updates;
- policy version;
- backend-calculated `policyHash`;
- `validFrom`;
- `validUntil` and whether it exists.

Replay into another agent, wallet, version, validity window, policy hash, policy
ID, operation, or network fails because those fields are part of the typed
message. The backend also verifies that the signer is the persisted owner of the
agent.

## Persistence

Policy routes require PostgreSQL through `DATABASE_URL`. Without it, Policy
routes fail explicitly with `policy_database_unconfigured`; existing non-Policy
routes may keep their previous in-memory behavior.

Tables created by the Policy Engine migrations:

- `aegis_agents`;
- `aegis_wallets`;
- `aegis_policies`;
- `aegis_asset_catalog`;
- `aegis_wallet_nonces`;
- `aegis_action_requests`;
- `aegis_precheck_records`;
- `aegis_usage_holds`;
- `aegis_audit_events`;
- `drizzle.__drizzle_migrations`.

Important database constraints:

- wallet `network_id` check for `hedera:testnet`;
- unique wallet identity on `(network_id, safe_address)`;
- unique operational wallet pair on `(agent_id, wallet_id)`;
- composite Policy FK from `(agent_id, wallet_id)` to wallets;
- unique active Policy partial index on `(agent_id, wallet_id)` where
  `status = 'ACTIVE'`;
- unique Policy series/version on `(policy_series_id, policy_version)`;
- unique idempotency key hash per `(agent_id, idempotency_key_hash)`;
- unique nonce use per `(wallet_id, aegis_nonce)`;
- one precheck record per request;
- one usage hold per request/precheck;
- wallet nonce FK to `aegis_wallets`;
- usage hold FKs to action request, precheck record, and asset catalog;
- asset catalog checks for `hedera:testnet`, HBAR decimals, and HTS identity.

## HTTP Routes

Implemented in `services/agent-service/src/policy-engine/routes.ts`:

```http
POST /policies
GET /policies/:policyId
GET /policies/:policyId/versions
PATCH /policies/:policyId
POST /policies/:policyId/activate
POST /policies/:policyId/revoke
GET /agents/:agentId/wallets/:walletId/policies/active?now=<unixSeconds>
POST /agents/:agentId/wallets/:walletId/actions/precheck
```

The precheck route requires `Idempotency-Key` and an explicit agent
authentication adapter. The repository does not trust raw `x-agent-id` or
`x-wallet-id` headers as authentication. If no adapter is configured, the route
fails with `agent_auth_unconfigured`.

Precheck request body:

```json
{
  "actionType": "HEDERA_HBAR_TRANSFER",
  "destination": {
    "kind": "HEDERA_ACCOUNT_ID",
    "value": "0.0.123456"
  },
  "assetId": "hedera:testnet:hbar",
  "amount": "100000000",
  "actionDeadline": 1784900300,
  "semanticContext": "Pay approved API provider invoice 123"
}
```

The client does not provide request IDs, precheck IDs, Policy identity,
`aegisNonce`, `actionHash`, `UsageHold`, status, result, fee, decimals, or
arbitrary network fields. `semanticContext` is the minimum private context for a
future TeeML step. The backend validates and normalizes it, computes
`semanticContextHash`, passes only the normalized action fields into the Level 1
deterministic evaluator, and does not interpret the text.

Until TeeML is implemented on a later branch, the semantic context text is
discarded after the precheck response. It is never stored in PostgreSQL, audit
events, action records, prompts, or detailed model-output fields. Future TeeML
persistence may store only `semanticContextHash`, `teemlVerdict`,
`teemlReasonCode`, `teemlRequestHash`, `teemlResponseHash`, `teeVerified`,
`providerId`, `modelId`, `artifactHash`, and `evaluatedAt`.

`PENDING_TEEML` uses HTTP `202 Accepted`; functional `DENY_PRECHECK` uses HTTP
`200 OK`; technical validation/auth/idempotency/database errors use the existing
`{ error, message }` shape.

## Local PostgreSQL

Local-only defaults:

```bash
POSTGRES_USER=aegis
POSTGRES_PASSWORD=aegis_dev
POSTGRES_DB=aegis_dev
POSTGRES_PORT=5432
DATABASE_URL=postgresql://aegis:aegis_dev@localhost:5432/aegis_dev
TEST_DATABASE_URL=postgresql://aegis:aegis_dev@localhost:5432/aegis_test
USAGE_HOLD_TTL_SECONDS=300
AUDIT_RETENTION_DAYS=90
```

Commands:

```bash
docker compose config
docker compose up -d postgres
docker compose ps postgres
docker compose logs -f postgres
docker compose down
DATABASE_URL=postgresql://aegis:aegis_dev@localhost:5432/aegis_dev npm --prefix services/agent-service run db:migrate
TEST_DATABASE_URL=postgresql://aegis:aegis_dev@localhost:5432/aegis_test npm --prefix services/agent-service run test:integration
```

`compose.yaml` binds PostgreSQL only to `127.0.0.1`. Use a different
`POSTGRES_PORT` if local port `5432` is already occupied.

Docker-only defaults are documented in `.env.docker.example`. Application
connection strings are documented in `.env.example` and
`services/agent-service/.env.example`.

## Validation Commands

Run from the repository root:

```bash
npm --prefix services/agent-service test
npm --prefix services/agent-service run test:integration
npm --prefix services/agent-service run typecheck
npm --prefix services/agent-service run lint
npm --prefix services/agent-service run build
```

The integration tests require `TEST_DATABASE_URL` and reset only the test
database schema. They use PostgreSQL real, cover the Policy and precheck HTTP
routes, verify idempotency, usage holds, advisory-lock concurrency, atomic
rollback, and agent/wallet records persisted through the existing routes.

## Where To Continue

Main Round 1 implementation files:

- `services/agent-service/src/policy-engine/types.ts`;
- `services/agent-service/src/policy-engine/validation.ts`;
- `services/agent-service/src/policy-engine/canonicalize.ts`;
- `services/agent-service/src/policy-engine/auth.ts`;
- `services/agent-service/src/policy-engine/evaluator.ts`;
- `services/agent-service/src/policy-engine/precheck.ts`;
- `services/agent-service/src/policy-engine/service.ts`;
- `services/agent-service/src/policy-engine/routes.ts`;
- `services/agent-service/src/policy-engine/db/schema.ts`;
- `services/agent-service/src/policy-engine/db/postgres.ts`;
- `services/agent-service/src/policy-engine/policy-engine.test.ts`;
- `services/agent-service/src/policy-engine/evaluator.test.ts`;
- `services/agent-service/src/policy-engine/precheck.test.ts`;
- `services/agent-service/src/policy-engine/policy-engine.postgres.integration.ts`;
- `services/agent-service/drizzle/0000_lethal_blue_shield.sql`;
- `services/agent-service/drizzle/0001_level1_precheck_orchestration.sql`.

Next permitted action is human PR review. Future integrations start only after
explicit approval.
