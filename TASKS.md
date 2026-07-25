# AEGIS Tasks

Branch task list for `feat/policy-engine-level-1`. Keep the top unchecked item as
the current focus for the next agent session.

> On this branch, `docs/aegis-current-scope.md` overrides older architecture,
> bounty, demo, and implementation notes when they conflict with Policy Engine
> Level 1 scope.

## Current Focus

- [ ] Round 1 approval/commit gate: review the Policy Engine Level 1 lifecycle
  and Phase 1.5 PostgreSQL validation diff, then commit only after explicit
  approval. Do not start Round 2 or implement Action Precheck until authorized.

## Done

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
