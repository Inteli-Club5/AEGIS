# AEGIS Tasks

Branch task list for `feat/policy-engine-level-1`. Keep the top unchecked item as
the current focus for the next agent session.

> On this branch, `docs/aegis-current-scope.md` overrides older architecture,
> bounty, demo, and implementation notes when they conflict with Policy Engine
> Level 1 scope.

## Current Focus

- [ ] Manually test the new "Fund this wallet" action (Wallet tab, agent
  detail page) in a real browser with a real MetaMask session: connect,
  enter an amount, confirm the transaction, and confirm the Safe's live
  balance updates afterward. Headless testing this session could only
  confirm the code compiles/lints and that the page renders correctly
  without a connected wallet - nothing that needs an injected provider could
  be clicked through.

## Done

- [x] 2026-07-25: Added a "Fund this wallet" action to the agent detail
  page's Wallet tab so the operator can send native HBAR from their already-
  connected MetaMask straight to the agent's Safe address
  (`FundWalletCard.tsx`, new file). Uses wagmi's `useSendTransaction` +
  an imperative `waitForTransactionReceipt` (not the reactive hook, to avoid
  a `useEffect` keyed on an unstable query-result object) and viem's
  `parseEther`/`formatUnits` at 18 decimals, matching Hedera testnet's
  EVM-facing `nativeCurrency.decimals` - a different unit system from the
  Policy Engine's own 8-decimal tinybar accounting (`lib/policy/amount.ts`)
  that must not be conflated with it. Also replaced the Wallet tab's static,
  always-stale `agent.balanceHbar` display with a live `useBalance` query on
  the Safe's address, since a stale balance next to a working funding action
  would be actively misleading. Initially built a "wallet not connected"
  fallback inside the card, then removed it after tracing
  `app/agents/[id]/page.tsx`: that page renders behind a `ConnectGate` and
  only mounts `AgentDetailView` once a wallet is already connected, so the
  fallback was dead code for a state the page architecture already rules
  out. `check-types` and `lint` pass clean; a headless-Chrome smoke test
  confirmed the (wallet-agnostic) dashboard renders with no console/runtime
  errors, but the connected-wallet path itself needs a real browser
  extension to click through - see Current Focus above.
- [x] 2026-07-25: The user manually walked the full onboarding flow (register
  agent -> create policy -> activate) in a real browser with a real MetaMask
  session and confirmed it works end to end - this closed the one
  verification gap every prior session had deferred (previous passes only
  used scripted/curl signing with a throwaway private key, never an actual
  browser extension). While repeating the walkthrough for a second agent,
  found a real bug: creating a brand-new agent showed "Create version v2"
  instead of "Create policy v1". Root cause: `OnboardingWizard.tsx`'s
  `handleAgentCreated()` set the new agent into state but never cleared
  `policy`/`wallet`, so a policy left over from a previously
  registered-but-never-activated agent (wizard opened, agent created, then
  abandoned) leaked into the next, genuinely new agent's context. Fixed by
  explicitly resetting `setPolicy(undefined)` and `setWallet(undefined)`
  alongside `setStep(1)` in `handleAgentCreated`.
- [x] 2026-07-25: Exposed the recovery guardian address as a user choice in
  `StepCreatePolicy.tsx` (shown only on an agent's first policy version, since
  that's when the wallet is actually created) - "use the AEGIS-configured
  default" or "use a specific wallet", normalizing any custom address to its
  correct EIP-55 checksum before sending (`lib/policy/form.ts`) so a
  miscased user-entered address can't trigger the same class of failure the
  checksum bug below did. Verified live: a fresh, arbitrary, randomly
  generated address was successfully set as a real deployed Safe's recovery
  guardian end to end. Added 2 unit tests (checksum normalization + rejection
  of a malformed address) alongside the existing `lib/policy/form.test.ts`
  suite; all pass.
- [x] 2026-07-25: Re-reviewed the fixed Policy Engine frontend integration end
  to end (real EIP-712-signed create + activate against a live service,
  Postgres-backed) after the previous review's blockers were fixed. Found and
  fixed one remaining real bug: `AEGIS_RECOVERY_GUARDIAN_ADDRESS` in
  `services/agent-service/.env` had an invalid EIP-55 checksum
  (`...aE61` instead of `...AE61`), which made every wallet creation fail
  whenever the frontend didn't supply its own guardian address - i.e. always,
  today. `check-types`, `lint`, and all 60 backend unit tests pass; a live
  signed create -> activate -> re-activate (retry-safety) round trip succeeded
  end to end after the fix.
- [x] 2026-07-25: Reviewed the uncommitted Policy Engine frontend integration
  against the Level 1 contract, confirmed frontend/backend policy hash and
  EIP-712 signature parity, and recorded the remaining integration blockers.
- [x] 2026-07-25: Policy Engine Level 1 PR #7 was merged into `main`.
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
