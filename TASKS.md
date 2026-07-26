# AEGIS Tasks

Branch task list for `feat/policy-engine-level-1`. Keep the top unchecked item as
the current focus for the next agent session.

> On this branch, `docs/aegis-current-scope.md` overrides older architecture,
> bounty, demo, and implementation notes when they conflict with Policy Engine
> Level 1 scope.

## Current Focus

- [ ] Decide whether AEGIS should accept any agent/user free-text description
  of intent into the TeeML flow. Today it deliberately does not: the
  precheck v2 body and the TeeML verify body both reject `reason` /
  `agentReason` / `semanticContext` as unknown properties, and the system
  prompt instructs the model not to trust or request agent justification
  (`POTENTIAL_PROMPT_INJECTION` on anything that tries). Four options were
  laid out 2026-07-25, from safest to riskiest: (1) keep as-is, no free text
  at all; (2) accept a declared-intent field for audit/dashboard display
  only, never sent to the model or used in the verdict (recommended); (3)
  reintroduce a bounded free-text field into the model prompt, sandboxed as
  untrusted data per the existing prompt-injection guard, but with real
  residual risk; (4) let free text genuinely influence the verdict (not
  recommended - reopens the exact social-engineering-the-verifier risk the
  current design was hardened against). No decision made yet; nothing
  implemented for this.

- [ ] Decide whether to invest in reverse-engineering the hackathon TeeTLS
  provider's undocumented signed-response commitment scheme (`text` field is
  `<hash>:<hash>:provider_type:provider_identity:tls_fingerprint`, not raw
  content - discovered 2026-07-25, exact hash inputs unknown) to close the
  byte-for-byte content-verification gap in `zero-g-direct-inference.ts`, or
  accept the current `processResponse` signature-validity check (proves a
  genuine signature from the acknowledged TEE signer exists for the exact
  chat ID, not that it matches this content byte-for-byte) as sufficient for
  this explicitly non-production, hackathon-only profile. Neither choice
  blocks the demo. (Optional/courtesy, unrelated) report the confirmed
  testnet Router `chat_id_not_found` bug to 0G/Integrate Network support.
  Separately: decide whether `production-private-teeml` (mainnet) should
  also move to Direct mode before that path is ever exercised for real.

## Done

- [x] 2026-07-25: Root-caused the hackathon TeeTLS `chat_id_not_found` block to
  a bug in the testnet Router's completion proxy (confirmed independent of
  agent identity and of `verify_tee` via live diagnosis and an A/B test), then
  fixed it by moving the `hackathon-testnet-teetls` profile to the official
  SDK's Direct broker mode (bypasses the Router; talks to the pinned provider
  directly with a funded ledger, acknowledged TEE signer, and
  `processResponse` verification). Also fixed a separate, previously-unhit bug:
  `ZG_TEEML_MAX_OUTPUT_TOKENS` defaulted/ceilinged at 256, which silently
  truncates the real verdict schema's four hex hashes mid-JSON; raised to 768
  everywhere. A code review then caught that `processResponse` alone doesn't
  prove signed content matches the trusted verdict text (it checks signature
  validity, not a content commitment); attempting the suggested fix (reusing
  the Router path's byte-for-byte verifier) failed closed on every real
  response because the provider's actual signed response is an undocumented
  hash commitment, not raw text - confirmed by live debugging, not fixable
  without provider documentation. Reverted to `processResponse` with this
  limitation explicitly disclosed in code comments and both 0G docs, rather
  than silently overstating the verification. `npm run test:0g:teetls:hackathon`
  now produces a real signed ALLOW/DENY evidence pair (twice, including a
  second full fresh run from Hedera account creation), and a full real HTTP
  flow (Hedera account, Safe, 0G Agentic ID, Policy, Level 1 precheck, TeeML
  verify) completes with `TEETLS_HACKATHON_ALLOWED`. Production
  `production-private-teeml` (mainnet, Router-based) is untouched and still
  unproven.

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
