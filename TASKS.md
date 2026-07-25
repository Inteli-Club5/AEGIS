# AEGIS Tasks

Branch task list for `feat/policy-engine-level-1`. Keep the top unchecked item as
the current focus for the next agent session.

> On this branch, `docs/aegis-current-scope.md` overrides older architecture,
> bounty, demo, and implementation notes when they conflict with Policy Engine
> Level 1 scope.

## Current Focus

- [ ] Confirm why the selected testnet TeeTLS provider returns HTTP 400 from
  its signed-response endpoint, then run one newly authorized ALLOW and DENY
  pair and review the sanitized hackathon evidence.

## Done

- [x] 2026-07-25: Implemented explicit 0G semantic-verification security
  profiles: mainnet-only Private/TeeML for production and testnet-only TeeTLS
  for the hackathon, with provider pinning, no Router or application fallback,
  strict TEE/signature/content verification, honest persistence labels, profile
  isolation, separate demo-only ALLOW state, PostgreSQL constraints and handoff
  triggers, immutable final artifacts, audit-to-verification binding,
  documentation, and full local tests. Router testnet funding is now
  available and the real request reaches the provider; live evidence remains
  externally blocked because its signed-response endpoint returns HTTP 400.

- [x] 2026-07-25: Round -1 and Round 0 scope/audit findings were consolidated
  into `docs/aegis-current-scope.md`.
- [x] 2026-07-25: Round 1 implemented Policy Engine Level 1 Policy data
  contracts and lifecycle in `services/agent-service`, including strict schema
  validation, deterministic `policyHash`, operator signature authorization,
  PostgreSQL/Drizzle schema and migration, concrete Policy HTTP routes, API
  documentation, and service tests.
- [x] 2026-07-25: Phase 1.5 added local PostgreSQL Docker setup, applied the
  real Drizzle migration against a clean PostgreSQL database, added PostgreSQL
  integration tests, audited/corrected operator signatures to EIP-712
  `PolicyCommitment`, and reviewed the diff for Round 1 scope hygiene.
- [x] 2026-07-25: Phase 2 implemented the pure deterministic evaluator with
  `PASS_TO_TEEML`/`DENY_PRECHECK`, stable reason codes, explicit `now`, bigint
  amount handling, and unit tests for deterministic and side-effect-free
  behavior.
- [x] 2026-07-25: Phase 3 implemented durable precheck orchestration with
  PostgreSQL-backed idempotency, monotonic wallet nonces, action requests,
  precheck records, UsageHolds, sanitized audit events, real HTTP routing, and
  PostgreSQL integration tests for concurrency and rollback.
- [x] 2026-07-25: Hardened precheck semantic-context privacy by replacing the
  legacy action `reason` path with required `semanticContext`, removing
  persisted private payload storage, adding an idempotent cleanup migration,
  persisting only `semanticContextHash`, and documenting the future TeeML
  persistence allowlist.
- [x] 2026-07-25: Completed guided Policy Engine Level 1 validation and coverage
  hardening, adding regression coverage for lifecycle validation, operator auth,
  canonical hashing, evaluator URL handling, precheck idempotency/privacy,
  HTTP errors, PostgreSQL conflict mapping, and legacy migration upgrade
  behavior.
- [x] 2026-07-25: Completed Step 8 PR-readiness cleanup by fixing Drizzle
  migration metadata hygiene, making `db:generate` a clean no-op, preserving
  runtime migration behavior, and rerunning the full release validation suite.
