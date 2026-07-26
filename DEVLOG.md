# DEVLOG

Append-only. One entry per work session (human or AI). Entries are chronological:
oldest at the top, newest at the bottom. Use English AM/PM timestamps. Format:

```
## YYYY-MM-DD hh:mm AM/PM - <name or agent> - <lane>
- did: <what changed, files/PRs>
- next: <the single next task>
- blockers: <none | what + who can unblock>
- interfaces touched: <none | which, and the change>
```

---

## 2026-07-24 12:00 AM - Claude Code (CryptoVictor) - setup
- did: executed SETUP.md end to end per PLAYBOOK.md - merged scaffold-hbar
  (Hedera-wired scaffold-eth-2, submodules included) into the repo root, cloned
  0g-compute-ts-starter-kit into services/decision-verifier, wrote the
  services/cosigner skeleton, moved the architecture doc to
  docs/AEGIS_ARQUITETURA_REFATORADA_V3_FINAL.md, prepended the "start here"
  block to AGENTS.md/CLAUDE.md (and added an AEGIS-specific section to
  CLAUDE.md), extended .gitignore (.env, .next, foundry out/cache/broadcast),
  ran yarn install + service npm installs, git init on `main`, first commit.
  No TASKS.md item was started - scope was setup only, per instructions. The
  original entry did not record a time; 12:00 AM is used only to keep the
  normalized DEVLOG chronological.
- next: freeze interfaces in docs/interfaces.md with the team (first Shared
  task in TASKS.md), then create a GitHub remote and push.
- blockers: none. Foundry deploy and dashboard dev server were not run -
  deploying needs a funded Hedera testnet key, left for whoever owns that step.
- interfaces touched: none.

## 2026-07-24 05:30 AM - Codex (Leunam) - tooling
- did: installed the `ethskills` Codex skill from
  `austintgriffith/ethskills` root `SKILL.md` into
  `/home/inteli/.codex/skills/ethskills` and verified the installed metadata.
  No AEGIS product task was started.
- next: freeze interfaces in docs/interfaces.md with the team (first Shared
  task in TASKS.md), then create a GitHub remote and push.
- blockers: none.
- interfaces touched: none.

## 2026-07-24 01:20 PM - Claude Code (CryptoVictor) - docs
- did: wrote `docs/AEGIS_ARCHITECTURE.md`, an English production-locked
  rewrite of the old `AEGIS_ARQUITETURA_REFATORADA_V3_FINAL.md` (removed
  mid-session from the working tree). Three previously-open questions are now
  locked: Protected Agent Wallet is a real Safe (2-of-2, not a mock vault),
  The Graph is the indexing layer for dashboard/audit log/Trust Badge
  (promoted from stretch), and ENS is dropped entirely for agent identity
  (AgentProfile + PolicyRegistry + Graph-indexed history instead). Mid-session
  the user also corrected the product thesis: AEGIS creates the AI agent
  itself on Hedera in this version - it is not "bring your own agent" yet
  (that's roadmap) - fixed in §1, §3.2, §15 of the new doc. Seeded
  `docs/decisions.md` (ADR-lite) with all four decisions and updated
  `CLAUDE.md`'s doc pointers to the new file.
- next: `bounty.md`, `x402-bounty.md`, and `TASKS.md` were also deleted from
  the working tree mid-session (not by this agent) - confirm with the team
  whether that's intentional before anyone relies on TASKS.md's "read this
  first" instruction in PLAYBOOK.md/CLAUDE.md, since it currently points at a
  file that no longer exists. After that, freeze `docs/interfaces.md` (still
  the first Shared task as of the last surviving copy of TASKS.md).
- blockers: none for the docs work. TASKS.md is gone so its checkbox for
  "Seed docs/decisions.md" couldn't be marked done there - now done, tracked
  here instead.
- interfaces touched: `docs/AEGIS_ARCHITECTURE.md` supersedes
  `AEGIS_ARQUITETURA_REFATORADA_V3_FINAL.md` as the architecture source of
  truth (loudly noting per PLAYBOOK.md rule 5).

## 2026-07-24 06:49 PM - Codex (Leunam) - tooling
- did: inspected the local 0G agent skills setup. Found `.0g-skills/` cloned
  from `0gfoundation/0g-agent-skills`, confirmed it is currently untracked,
  and confirmed Codex already has the separate `0g-compute` skill installed in
  `/home/inteli/.agents/skills/0g-compute`. No Codex global skill installation
  or project instruction edits were made.
- next: decide whether to keep `.0g-skills/` as local reference, ignore it,
  submodule it, or install/create a clean global Codex wrapper skill for the
  unified 0G repo.
- blockers: `TASKS.md` is still missing, so no task list update was possible.
- interfaces touched: none.

## 2026-07-24 07:48 PM - Codex (Leunam) - 0G Agentic ID
- did: implemented the first AEGIS dashboard 0G Agentic ID integration inside
  `packages/nextjs`. Added `packages/nextjs/integrations/0g/agentic-id/`
  with AgentProfile types, metadata/hash helpers, 0G Galileo chain config, a
  minimal official AgenticID ABI, and `createAgenticIdForAegisAgent(input)`.
  The flow read `mintFee()`, called `iMint(to, datas)`, parsed token ID from
  the `Transfer` event, and called `setTokenURI` when a metadata URI was
  provided. Added local AgentProfile persistence to the existing Zustand store,
  replaced `/` with the AEGIS AgentProfile dashboard, added example metadata at
  `packages/nextjs/public/metadata/agent-profile.json`, added
  `mock-vs-real.md`, and updated Next env defaults for 0G Galileo.
- next: test a live mint with a funded wallet on 0G Galileo and a real
  metadata URI.
- blockers: `TASKS.md` and `docs/interfaces.md` do not exist in this repo, so
  no task checklist or shared interface doc update was possible.
- interfaces touched: `packages/nextjs/integrations/0g/agentic-id/types.ts`
  defined the local AgentProfile and Agentic ID result contract for the
  dashboard. No Hedera deployment artifacts or DecisionVerifier/TeeML/Safe
  interfaces were touched.

## 2026-07-24 08:10 PM - Codex - 0G Agentic ID docs
- did: consolidated the real-vs-fallback documentation into
  `docs/0g/notes/agentic-id-sync-notes.md` and removed the separate
  `packages/nextjs/integrations/0g/agentic-id/mock-vs-real.md` file so 0G
  notes are not scattered inside runtime code directories.
- next: stage only the curated notes, Next.js integration files, metadata
  example, env example, and DEVLOG; keep raw docs/clones/local skills out of
  git.
- blockers: `TASKS.md` and `docs/interfaces.md` are still absent.
- interfaces touched: none.

## 2026-07-24 08:26 PM - Codex - 0G Agentic ID backend
- did: removed the AEGIS Agentic ID dashboard/localStorage/static metadata
  fallback path and converted the integration to a backend-only real flow in
  `packages/nextjs`. Added `POST /api/0g/agentic-id`, 0G Storage metadata
  upload with Merkle root verification and verified download, AgenticID
  `mintFee()` + `iMint()` + `setTokenURI()` + final `transferFrom()` execution,
  and final `ownerOf`/`tokenURI` checks. Updated `PLAYBOOK.md`, `AGENTS.md`,
  and `DEVLOG.md` to require chronological DEVLOG entries with English AM/PM
  timestamps. Updated `docs/0g/notes/agentic-id-sync-notes.md` for the
  backend-only no-mock scope.
- next: run a live 0G Galileo registration with funded `ZERO_G_PRIVATE_KEY` and
  persist the returned result in the real AEGIS backend store once that storage
  layer exists.
- blockers: live mint was not run because no funded 0G Galileo private key was
  provided in env. `TASKS.md` and `docs/interfaces.md` are still absent.
- interfaces touched: added backend API `POST /api/0g/agentic-id` and updated
  `packages/nextjs/integrations/0g/agentic-id/types.ts` for the real 0G
  registration result.

## 2026-07-24 08:44 PM - Codex - docs
- did: translated the remaining Portuguese Markdown content in
  `docs/0g/notes/agentic-id-sync-notes.md` to English, preserving technical
  meaning, paths, links, and branch notes. Verified Markdown files with `rg`
  searches for Portuguese accents and strong Portuguese terms.
- next: restore `TASKS.md` or decide the current replacement for task tracking,
  because `PLAYBOOK.md` still requires it.
- blockers: `TASKS.md` is still missing, so no task checklist update was
  possible.
- interfaces touched: none.

## 2026-07-24 09:06 PM - Codex - env docs
- did: expanded the root `.env.example` into an English consolidated local
  environment example with Next.js, Hedera, 0G Agentic ID, decision verifier,
  cosigner, and contract tooling sections. Updated `packages/nextjs/.env.example` with
  English placeholders for the dashboard, Hedera mirror URLs, build flags, and
  preferred `ZERO_G_*` Agentic ID variables.
- next: restore `TASKS.md` or decide the current replacement for task tracking,
  because `PLAYBOOK.md` still requires it.
- blockers: `TASKS.md` is still missing, so no task checklist update was
  possible.
- interfaces touched: none.

## 2026-07-24 09:13 PM - Codex - build triage
- did: reproduced `yarn next:build` from the repo root and confirmed the normal
  Next.js production build completes successfully, including static page
  generation and `.next/server/pages-manifest.json`. Also tested
  `NEXT_PUBLIC_IPFS_BUILD=true yarn next:build`; that path fails separately
  because API routes are incompatible with `output: "export"`.
- next: keep the default build path for the dashboard unless/until the API
  routes are split from the static IPFS export target.
- blockers: `TASKS.md` is still missing, so no task checklist update was
  possible.
- interfaces touched: none.

## 2026-07-24 09:44 PM - Codex - 0G Agentic ID validation
- did: migrated Storage upload from deprecated `@0glabs/0g-ts-sdk` to
  `@0gfoundation/0g-storage-ts-sdk@1.2.10`, aligned root `ethers` to `6.13.1`,
  and confirmed a live 0G Storage smoke upload on Galileo
  (`0x3898c18847355075c64a6fc1e99958f2532f1f3b23cbaee79dba6cd00a176c6f`).
  Rebuilt/restarted the Next.js backend and successfully registered AEGIS demo
  agent `aegis-agent-demo-001` as Agentic ID token `102` on
  `0x2700F6A3e505402C9daB154C5c6ab9cAEC98EF1F`. Live txs:
  metadata upload
  `0xdf0bd7f4daa62bf5a0f7baf1c3246e4c1ea9414b66197eb46f6f560f3ca1310a`,
  mint `0x9f132d14dd4071eea5b7bb29eee83d76631b00c0aab8234c3fefddf093a69a51`,
  and `setTokenURI`
  `0x983206304c90fa39d657c223348fb163b8f2109a8a9f0750b8527ca40ab34984`.
  Independent onchain reads confirmed `ownerOf(102)`, `tokenURI(102)`, and
  eight intelligent data hashes.
- next: persist successful Agentic ID registration results in the real AEGIS
  backend store once that storage layer exists.
- blockers: `TASKS.md` and `docs/interfaces.md` are still absent, so no task
  checklist or shared interface document update was possible.
- interfaces touched: backend API `POST /api/0g/agentic-id` behavior is now
  live-validated against 0G Galileo; no Hedera deployment artifacts changed.

## 2026-07-25 12:17 AM - Codex (Leunam) - Policy Engine Level 1 scope
- did: restored the required `TASKS.md`, created
  `docs/aegis-current-scope.md` as the branch scope/interface handoff, and
  completed the read-only Round 0 codebase audit inside that consolidated
  branch document.
- next: implement Round 1 Policy lifecycle only.
- blockers: none.
- interfaces touched: `docs/aegis-current-scope.md` defines the Round 1 Policy
  lifecycle, canonicalization, PostgreSQL source-of-truth boundary, and explicit
  no-precheck/no-execution scope.

## 2026-07-25 01:21 AM - Codex (Leunam) - Policy Engine Level 1 lifecycle
- did: implemented Round 1 Policy Engine Level 1 Policy data contracts and
  lifecycle in `services/agent-service`. Added strict Policy request
  validation, deterministic canonicalization and `policyHash`, EVM operator
  signature verification, ownership and protected-wallet checks, full
  create/read/list-versions/update/activate/revoke/active-policy service
  operations, PostgreSQL/Drizzle schema and migration, concrete Express routes,
  API documentation, root service scripts, and 17 service tests. Ran
  `npm --prefix services/agent-service test`, `npm --prefix
  services/agent-service run typecheck`, `npm --prefix services/agent-service
  run lint`, and `npm --prefix services/agent-service run build`.
- next: Round 2 should implement Action Precheck on top of the persisted ACTIVE
  Policy lifecycle, including idempotency, normalized action hashing,
  UsageHold schema/behavior, concurrency checks, and stable denial codes.
- blockers: none for Round 1. Running tests requires the TypeScript runner to
  create an IPC pipe under `/tmp`; this environment needed escalated execution
  for that command. PostgreSQL integration requires `DATABASE_URL` and the new
  Drizzle migration to be applied.
- interfaces touched: `docs/aegis-current-scope.md` documents the mutating
  Policy operation authorization headers and canonical operator-signature
  message, and narrows the Level 1 asset catalog to native HBAR plus
  pre-registered fungible HTS tokens for Hedera testnet. No final ALLOW,
  DecisionReceipt, Precheck endpoint, 0G/TeeML, Hedera execution, Safe, fee,
  contract, ABI, deployment, or onchain event interface was added.

## 2026-07-25 02:02 AM - Codex (Leunam) - Policy Engine Level 1 Phase 1.5
- did: added local PostgreSQL infrastructure with `compose.yaml`, an init
  script for isolated `aegis_test`, reproducible root Docker scripts, and
  PostgreSQL setup documentation. Applied the real Drizzle migration
  `0000_lethal_blue_shield.sql` against a clean PostgreSQL test database,
  verified Drizzle history, tables, enums, foreign keys, checks, unique
  indexes, and second-run idempotency. Added PostgreSQL integration tests for
  real agent/wallet persistence, Policy lifecycle, active-version uniqueness,
  revocation, explicit-now expiry, authorization failures, rollback on failed
  activation, concurrent activation, advisory transaction locks, and database
  constraints. Replaced the interim personal-sign operator proof with an
  EIP-712 `PolicyCommitment` bound to operation, network, operator, agent,
  wallet, policy ID, source policy ID on updates, version, `policyHash`, and
  validity. Updated only the necessary environment examples, consolidated
  Policy scope/interface doc, and task tracker.
- next: do not advance to Round 2 until Round 1 is explicitly approved for
  commit and the next implementation round is authorized.
- blockers: none found for the Phase 1.5 validation. Local Docker used
  `POSTGRES_PORT=55432` because host port 5432 was already occupied.
- interfaces touched: `docs/aegis-current-scope.md` now documents EIP-712
  `PolicyCommitment` authorization and its replay boundaries. No evaluator,
  precheck, UsageHold, TeeML, Safe, The Graph, Hedera execution, or fee logic
  was added.

## 2026-07-25 02:10 AM - Codex (Leunam) - docs cleanup
- did: consolidated the new Policy Engine branch docs into
  `docs/aegis-current-scope.md` and removed redundant temporary documents
  before committing. Updated `PLAYBOOK.md`, `CLAUDE.md`, `README.md`,
  `TASKS.md`, and `docs/decisions.md` so the branch has one live scope,
  interface, and handoff document.
- next: create the requested two commits: local PostgreSQL environment first,
  then Policy implementation, migration, docs, and tests.
- blockers: none.
- interfaces touched: `docs/aegis-current-scope.md` remains the single active
  Level 1 interface document.

## 2026-07-25 02:25 AM - Codex (Leunam) - Round 1 checklist hardening
- did: audited the Round 1 readiness checklist, bound local PostgreSQL to
  `127.0.0.1`, added `.env.docker.example`, opened the matching `.gitignore`
  exception, added HTTP integration coverage for real Policy routes plus
  existing agent/wallet routes persisting records that can receive a Policy, and
  revalidated Drizzle migration on a newly created empty PostgreSQL database.
  Ran unit tests, PostgreSQL integration tests, typecheck, lint, build, Docker
  Compose config/health checks, and `npm audit --omit=dev` without running
  `npm audit fix`.
- next: keep the two requested commits split between local PostgreSQL setup and
  Policy lifecycle implementation/docs/tests.
- blockers: `npm audit --omit=dev` reports pre-existing advisories through
  Hedera, LangChain/MCP, ethers/ws, protobufjs, and uuid dependencies. The new
  Drizzle advisory found during the audit was resolved by an explicit
  `drizzle-orm@0.45.2` upgrade; no `npm audit fix` was executed.
- interfaces touched: `docs/aegis-current-scope.md` documents the localhost-only
  PostgreSQL bind, `.env.docker.example`, and HTTP/DB validation path.

## 2026-07-25 02:42 AM - Codex (Leunam) - Policy Engine Level 1 Phase 2
- did: implemented the pure `DeterministicPolicyEvaluator` in
  `services/agent-service/src/policy-engine/evaluator.ts` with deterministic
  `PASS_TO_TEEML`/`DENY_PRECHECK` results, stable reason codes, explicit `now`,
  bigint amount handling, asset catalog checks, usage snapshot limits, optional
  pure nonce-reuse evidence, optional pure action-hash comparison evidence, and
  no database/network/runtime side effects. Added pure unit coverage in
  `services/agent-service/src/policy-engine/evaluator.test.ts` for valid HBAR
  and HTS actions, ordered denial reasons, boundary limits, bigint amounts,
  nonce/hash failures, input immutability, no `Date.now()`, and no environment
  dependency. Ran `npm --prefix services/agent-service test`, `npm --prefix
  services/agent-service run typecheck`, `npm --prefix services/agent-service
  run lint`, and `npm --prefix services/agent-service run build`.
- next: human review of Phase 2 only. Do not start Phase 3 until explicitly
  approved.
- blockers: none for the pure evaluator. `docs/interfaces.md` and the old
  handoff file remain absent after the prior documentation consolidation, so
  `docs/aegis-current-scope.md`, the Phase 1 implementation, and the Phase 2
  approval prompt were used as the effective sources.
- interfaces touched: added the Phase 2 pure evaluator input/output contract in
  `services/agent-service/src/policy-engine/evaluator.ts`; no endpoint,
  persistence, UsageHold lifecycle, TeeML/0G, Safe, Hedera execution, fees,
  DecisionReceipt, contract, ABI, deployment, or migration interface was added.

## 2026-07-25 03:06 AM - Codex (Leunam) - Policy Engine Level 1 Phase 3
- did: implemented durable Level 1 precheck orchestration. Added PostgreSQL
  schema/migration support for asset catalog, wallet nonces, action requests,
  precheck records, usage holds, and sanitized audit events. Added
  `PrecheckService`, action normalization, deterministic request/action hashes,
  idempotency handling, monotonic nonce allocation, UTC daily usage snapshots,
  advisory-lock-backed PostgreSQL transactions, the real
  `POST /agents/:agentId/wallets/:walletId/actions/precheck` route, and
  explicit agent-authentication adapter wiring. Added unit coverage for service
  orchestration and PostgreSQL integration coverage for PASS/DENY flows,
  idempotency, holds, concurrency, atomic rollback, and HTTP semantics. Updated
  only the active scope/API notes, local env examples, and DEVLOG.
- next: human review of Phase 3 only. Do not start Phase 4 until explicitly
  approved.
- blockers: no secure reusable agent authentication mechanism exists in the
  codebase yet, so the precheck route requires an injected authentication
  adapter and fails with `agent_auth_unconfigured` if none is configured. This
  avoids trusting raw agent headers as authentication.
- interfaces touched: added Level 1 precheck persistence/API contracts and
  migration `0001_level1_precheck_orchestration.sql`. No TeeML/0G call,
  semantic rule evaluation, DecisionReceipt, Safe co-signature, Hedera
  execution, fee, The Graph/Subgraph, contract, ABI, deployment, insurance,
  recovery, payout, coverage, or circuit breaker behavior was added.

## 2026-07-25 03:21 AM - Codex (Leunam) - Policy Engine Level 1 PR Prep
- did: prepared the Policy Engine Level 1 branch for PR by keeping only the
  implementation and documentation needed for the durable Policy/precheck flow,
  excluding the unrelated main-branch lockfile stash, removing the temporary
  Phase 4 prompt artifact from the PR, updating `TASKS.md` and
  `docs/aegis-current-scope.md`, and adding precise English TODOs at the
  future TeeML and UsageHold finalization integration points. Rechecked the
  current Policy Engine state with local PostgreSQL healthy on
  `127.0.0.1:55432`, a successful Drizzle migration against `aegis_test`, 46
  passing unit tests, 13 passing PostgreSQL integration tests, and passing
  typecheck, lint, and build.
- next: open a PR from `feat/policy-engine-level-1` to `main`.
- blockers: none.
- interfaces touched: none.

## 2026-07-25 10:07 AM - Codex - Policy Engine Level 1 privacy hardening
- did: inspected the Phase 3/4 private-context path and removed persisted
  private action payload storage from precheck orchestration. The precheck
  request now requires normalized `semanticContext`, calculates
  `semanticContextHash`, binds `requestPayloadHash` and `actionHash` to that
  hash, passes only normalized action fields to the deterministic Level 1
  evaluator, and discards the text after the precheck response. Replaced
  `private_payload`/`reason_hash` with `semantic_context_hash` in Drizzle schema,
  corrected migration `0001_level1_precheck_orchestration.sql` for fresh
  databases, and added idempotent cleanup migration
  `0002_precheck_semantic_context_privacy.sql` for databases that already
  applied the old `0001`. Updated tests and docs to reject legacy action
  `reason`, remove textual proof notes, assert private text is absent from
  precheck tables, and document the future TeeML persistence allowlist.
  Validation run: `npm --prefix services/agent-service test`, `npm --prefix
  services/agent-service run typecheck`, `npm --prefix services/agent-service
  run lint`, `npm --prefix services/agent-service run build`, and
  `TEST_DATABASE_URL=postgresql://aegis:aegis_dev@localhost:55432/aegis_test npm
  --prefix services/agent-service run test:integration`.
- next: review the privacy-hardening diff before opening or updating the
  Policy Engine Level 1 PR.
- blockers: none.
- interfaces touched: Precheck request body changed from optional action
  `reason` to required `semanticContext`; `aegis_action_requests` persistence
  changed from `private_payload` plus `reason_hash` to
  `semantic_context_hash` only for private semantic context, with cleanup
  migration `0002_precheck_semantic_context_privacy.sql`.

## 2026-07-25 10:45 AM - Codex - Policy Engine Level 1 guided validation
- did: completed the guided Step 7 validation pass for the branch diff against
  `main` and covered the classified gaps in this step. Added focused regression
  coverage for lifecycle payload validation, operator auth normalization and
  replay checks, canonical hash ordering, malformed evaluator URL destinations,
  in-memory uniqueness constraints, precheck parser/idempotency/privacy
  behavior, HTTP policy/precheck error paths, PostgreSQL unique/error mapping,
  and the legacy privacy cleanup migration upgrade path. Fixed
  `mapPgConflict` so Drizzle/PostgreSQL unique violations wrapped in
  `error.cause` still map to `database_unique_constraint`, and corrected
  `0002_precheck_semantic_context_privacy.sql` so legacy rows receive an
  explicit unavailable semantic-context hash sentinel instead of reusing the
  request payload hash as semantically false data. Validation run:
  `DATABASE_URL=postgresql://aegis:aegis_dev@localhost:55432/aegis_test npm
  --prefix services/agent-service run db:migrate`, `npm --prefix
  services/agent-service test` (56 passing unit tests),
  `TEST_DATABASE_URL=postgresql://aegis:aegis_dev@localhost:55432/aegis_test npm
  --prefix services/agent-service run test:integration` (15 passing
  PostgreSQL integration tests), `npm --prefix services/agent-service run
  typecheck`, `npm --prefix services/agent-service run lint`, `npm --prefix
  services/agent-service run build`, `git diff --check`, and the Node
  experimental coverage command for `src/policy-engine/*.test.ts` plus
  `src/policy-engine/*.integration.ts` (71 passing tests, all-files 92.69%
  lines / 88.86% branches / 91.78% functions; core Policy Engine runtime
  modules are at 100% line coverage except `db/postgres.ts` reporting 99.72%
  on the internal error-code fallback despite covered wrapped/null-cause
  scenarios).
- next: review the final diff and decide whether to regenerate Drizzle snapshot
  metadata before opening or updating the Policy Engine Level 1 PR.
- blockers: none. Low-risk tooling hygiene remains: `drizzle/meta/_journal.json`
  lists `0001` and `0002`, while the repo currently has only
  `0000_snapshot.json`; runtime migration through Drizzle and direct integration
  migration both passed.
- interfaces touched: no new runtime API was added in this validation pass; the
  existing `semanticContext` precheck interface was exercised, and the
  migration upgrade semantics for legacy private precheck columns were
  clarified.

## 2026-07-25 11:03 AM - Codex - Policy Engine Level 1 PR readiness
- did: completed Step 8 PR-readiness cleanup. Investigated the remaining
  Drizzle metadata hygiene gap by running `drizzle-kit generate` against
  temporary migration folders, confirmed the missing `0001`/`0002` snapshots
  would cause a duplicate generated `0003` migration, and fixed the metadata by
  adding `drizzle/meta/0001_snapshot.json` and `drizzle/meta/0002_snapshot.json`
  with the correct snapshot chain. Replaced the Drizzle bigint default
  `default(1n)` with `default(sql\`1\`)` in the schema so `db:generate` can
  serialize the schema while preserving the same SQL default. Validation run:
  `npm --prefix services/agent-service run db:generate` (no schema changes),
  `DATABASE_URL=postgresql://aegis:aegis_dev@localhost:55432/aegis_test npm
  --prefix services/agent-service run db:migrate`, `npm --prefix
  services/agent-service test` (56 passing unit tests),
  `TEST_DATABASE_URL=postgresql://aegis:aegis_dev@localhost:55432/aegis_test npm
  --prefix services/agent-service run test:integration` (15 passing
  PostgreSQL integration tests), `npm --prefix services/agent-service run
  typecheck`, `npm --prefix services/agent-service run lint`, `npm --prefix
  services/agent-service run build`, `git diff --check`, and the Node
  experimental coverage command for the Policy Engine tests (71 passing tests,
  all-files 92.69% lines / 88.86% branches / 91.78% functions).
- next: commit the ready branch changes, push, and open or update the Policy
  Engine Level 1 PR against `main`; then verify remote CI.
- blockers: none.
- interfaces touched: no runtime API or migration SQL behavior changed in this
  step; Drizzle generation metadata and schema serialization were corrected.

## 2026-07-25 03:55 PM - Codex - 0G TeeML semantic-verifier discovery
- did: created `feat/0g-teeml-semantic-verifier`, read the current Level 1
  sources and existing Agentic ID/Hedera paths, audited the free-text semantic
  context and persistence model, and consulted the required official 0G Router,
  Private Computer, SDK, and skill sources. Documented the current Router
  contract and the missing trusted-evidence prerequisite in
  `docs/0g/teeml-sources.md` and
  `docs/0g/teeml-semantic-verifier.md`. No runtime integration, dependency,
  migration, fallback, signer, Safe execution, or Hedera execution was added.
- next: implement a separately approved, operator-signed
  `TrustedServiceDescriptorV1` Policy contract and durable verified Agentic ID
  capability source, then explicitly version the Level 1 action commitment
  without caller-controlled semantic prose.
- blockers: `TEEML_SCOPE_BLOCKED_TRUSTED_SEMANTIC_EVIDENCE_MISSING`. The
  repository has no trusted service/product descriptor or signed task source,
  and persisted action requests cannot reconstruct the structured
  Level 1-approved action after restart.
- interfaces touched: documentation only; no runtime interface changed.

## 2026-07-25 04:00 PM - Codex - 0G TeeML semantic verifier implementation
- did: implemented the fail-closed 0G Router/private TeeML flow in
  `services/agent-service`, including strict transient semantic context,
  deterministic context/request commitments, strict verdict parsing, live
  private-provider catalog validation, Router TEE verification, independent
  SDK signature/content verification, sanitized PostgreSQL artifacts, state and
  UsageHold transitions, concurrency locks, and no automatic retry. Added the
  operator-signed trusted service descriptor, durable Agentic ID capability and
  registration ledgers, authenticated Agentic ID coordination, shared
  canonical metadata commitments, and migrations `0003` through `0005`.
  Removed caller-controlled semantic prose from Level 1 requests and
  persistence, documented current trust boundaries and inherited limitations,
  and added the opt-in real 0G evidence command. Validation passed: Drizzle
  generation (no drift), migrations, 170 unit tests, 39 PostgreSQL integration
  tests, agent-service typecheck/lint/build, Next.js typecheck/lint/production
  build, privacy/fallback greps, and `git diff --check`.
- next: configure a funded Router key and a live private TeeML model, run
  `npm run test:0g:teeml` through real ALLOW and DENY cases, review the
  sanitized evidence, and obtain human approval before any commit.
- blockers: `TEEML_REAL_INTEGRATION_BLOCKED`; `ZG_ROUTER_API_KEY` and
  `ZG_TEEML_MODEL` are not configured, so provider availability, real cost,
  latency, token usage, and `docs/evidence/0g-teeml-verification.json` cannot be
  verified. Separate inherited work remains for agent credential/profile
  provisioning, the legacy fixed Safe owner/guardian configuration, and a
  versioned live-Policy Agentic ID update.
- interfaces touched: strict Level 1 precheck v2; signed
  `TRUSTED_SERVICE_DESCRIPTOR_V1`; `TrustedSemanticContext`;
  `TeeMlSemanticVerdict`; `VerifiedTeeMlArtifact`; Agentic ID registration
  commitment/ledger; agent and internal-service authentication; TeeML HTTP
  route, statuses, technical codes, and UsageHold behavior.

## 2026-07-25 04:15 PM - Codex - 0G Router testnet profile and credential guard
- did: investigated the supplied 0G configuration without printing secrets,
  found a wallet-shaped 64-hex value in the Router API-key slot, stopped further
  inference attempts, restricted the local env file to mode `0600`, and added a
  constructor guard that accepts only `sk-` inference keys before any network
  use. Added exact allowlisted mainnet/testnet Router profiles with paired RPCs
  and explicit chain IDs, selected the official testnet Router for this branch,
  aligned provider discovery with the documented `model_id` parameter, and
  kept local exact-model filtering. The public testnet catalog was consulted
  without credentials: its chatbot is TeeTLS and its only TeeML entry is an
  image editor, so no semantic inference or evidence was fabricated. Updated
  current 0G documentation and env examples. Validation passed: 176 unit tests,
  agent-service typecheck/lint/build, focused 0G adapter tests, and
  `git diff --check`.
- next: create a testnet Router inference key beginning with `sk-` through
  `pc.testnet.0g.ai`, fund the Router deposit, and recheck the live catalog. Run
  the two-case opt-in evidence test only when testnet exposes a private TeeML
  chatbot; otherwise use a separately funded mainnet Router profile with human
  approval.
- blockers: `TEEML_REAL_INTEGRATION_BLOCKED`; the current local credential is
  not a Router inference key, and the 2026-07-25 public testnet catalog has no
  private TeeML chatbot. AEGIS does not downgrade to TeeTLS or use the TeeML
  image editor as a semantic-verifier fallback.
- interfaces touched: `ZG_ROUTER_BASE_URL` now selects one of two exact Router
  network profiles; the corresponding Compute RPC and chain ID are derived and
  cannot be independently overridden. Router inference keys now require the
  official `sk-` prefix before catalog or completion dispatch.

## 2026-07-25 04:30 PM - Codex - 0G testnet private TeeML live preflight
- did: validated the updated local secret only through non-sensitive metadata:
  the value has the required `sk-` prefix, the env file remains ignored with
  mode `0600`, and the selected Router is the exact official testnet profile.
  Re-queried the public testnet model catalog and ran the opt-in live command.
  Both executions failed closed with `TEEML_NOT_PRIVATE` before completion
  dispatch because the configured TeeML chatbot is absent from testnet and the
  only available chatbot is TeeTLS. Enhanced the sanitized live-test result to
  report `requestDispatched`; the confirmed value is `false`. No inference,
  charge evidence, semantic plaintext, raw response, or evidence file was
  produced. Updated the operational documentation to distinguish local key
  format validation from unexercised remote Router authentication. Validation
  passed: 176 unit tests, agent-service typecheck/lint/build, migrations on
  real PostgreSQL, 39 PostgreSQL integration tests, and `git diff --check`.
  Independent review found no high or medium issue; its one low operational
  reporting gap was fixed so post-completion live-test failures report
  `requestDispatched: true` instead of an unknown value.
- next: wait for the official testnet Router catalog to expose a private TeeML
  chatbot, or obtain human approval and a funded mainnet Router profile. Then
  run exactly one real ALLOW and one real DENY case and review the sanitized
  evidence before declaring the branch ready.
- blockers: `TEEML_REAL_INTEGRATION_BLOCKED`; the official testnet catalog has
  no private TeeML chatbot. The local `sk-` shape is valid, but remote
  authentication, Router credit, `tee_verified`, provider signature, model
  verdicts, cost, latency, and token usage cannot be exercised without an
  eligible provider.
- interfaces touched: the opt-in command now includes the sanitized
  `requestDispatched` classification in blocked output. Runtime HTTP and
  persistence contracts are unchanged.

## 2026-07-25 05:05 PM - Codex - 0G hackathon TeeTLS semantic verifier
- did: implemented an explicit two-profile 0G security contract without a
  downgrade path. `production-private-teeml` is the default, requires mainnet,
  private routing, TeeML, and sealed inference. The temporary
  `hackathon-testnet-teetls` profile requires testnet, verified routing, TeeTLS,
  and records `sealedInference: false`; its centralized broker-signer handling
  is isolated from production. Both profiles pin the catalog-selected provider,
  set Router fallbacks to false, request `verify_tee: true`, validate
  `x_0g_trace.tee_verified`, compare signed content byte-for-byte, and verify the
  signature through `@0gfoundation/0g-compute-ts-sdk@0.9.0`. Added migrations
  `0006` and `0007` for exact, non-null profile tuples, profile-aware HTTP and
  sanitized evidence contracts, no-retry live diagnostics, privacy/fallback
  documentation, and coverage scripts. Validation passed: 193 unit tests, 41
  PostgreSQL integration tests, coverage at 85.34% lines / 86.94% branches /
  87.49% functions, migration on real PostgreSQL, Drizzle no-drift generation,
  typecheck, lint, build, and independent security review with no high or medium
  findings. A single authorized live TeeTLS run selected the real provider and
  received sanitized HTTP 402 after dispatch; no retry or evidence file was
  produced.
- next: fund the Router testnet Payment Layer account, then run exactly one real
  TeeTLS ALLOW and DENY pair and review
  `docs/evidence/0g-teetls-hackathon-verification.json` before human approval.
- blockers: `TEEML_REAL_INTEGRATION_BLOCKED`; the 0G Router testnet Payment
  Layer account returned HTTP 402 for insufficient credit. Real `tee_verified`,
  signed-content verification, verdict hashes, latency, token usage, and the
  sanitized ALLOW/DENY evidence cannot be recorded until that account is
  funded. Production Private/TeeML mainnet evidence remains a separate future
  deployment requirement.
- interfaces touched: added `ZG_TEEML_SECURITY_PROFILE`, the exact production
  and hackathon security tuples, `securityProfile`, `verificationMode`, and
  `sealedInference` to final artifacts and HTTP responses, migrations `0006`
  and `0007`, and separate opt-in commands/evidence paths for production TeeML
  and hackathon TeeTLS.

## 2026-07-25 05:46 PM - Codex - 0G verifier final integrity hardening
- did: completed the production Private/TeeML and explicit hackathon testnet
  TeeTLS separation. Reserved `TEEML_ALLOWED` for the exact production tuple,
  introduced `TEETLS_HACKATHON_ALLOWED` for demo evidence, and released the
  UsageHold for every hackathon result so it cannot reach the future signer or
  execution handoff. Added upgrade-safe migrations through `0011`, including
  reconciliation of legacy nullable proof rows, exact profile constraints, an
  action handoff trigger, immutable final verification artifacts, and an
  audit-to-verification/action binding trigger. Added direct SQL tampering,
  empty-database, transactional upgrade, restart, concurrency, privacy, and
  hold tests. Final validation passed: PostgreSQL migrations; 194 unit tests;
  44 PostgreSQL integration tests; 85.31% line, 87.00% branch, and 87.53%
  function coverage; agent-service typecheck, lint, and build; Drizzle no-drift
  generation; Next.js typecheck, lint, and production build; privacy/fallback
  audits; and two independent reviews after the reported database integrity
  findings were fixed. The production opt-in preflight against the local
  testnet configuration failed closed with `TEEML_CONFIG_ERROR` and
  `requestDispatched: false`, confirming that no profile/network downgrade is
  possible.
- next: fund the 0G Router testnet Payment Layer account, run exactly one real
  TeeTLS ALLOW and DENY pair, inspect the sanitized evidence, and obtain human
  approval before any commit. For production deployment, switch to the default
  mainnet `production-private-teeml` profile and obtain separate real
  Private/TeeML evidence.
- blockers: `TEEML_REAL_INTEGRATION_BLOCKED`; the only attempted real
  hackathon call selected and reached the actual testnet TeeTLS provider but
  returned Router HTTP 402 for insufficient Payment Layer credit. No retry,
  model verdict, verified signed response, or evidence file was fabricated.
- interfaces touched: distinct production and hackathon ALLOW states across
  verification, action, HTTP, and sanitized audit contracts; hackathon ALLOW
  now releases the UsageHold; final database artifacts are immutable and audit
  rows must match the linked final verification and action tuple exactly.

## 2026-07-25 07:08 PM - Codex - funded 0G TeeTLS live retry and branch handoff
- did: re-ran the explicitly authorized hackathon test after the Router testnet
  Payment Layer was funded. The real completion request was dispatched to the
  selected TeeTLS provider, resolving the prior HTTP 402 blocker. The provider's
  subsequent signed-response endpoint returned HTTP 400, and AEGIS failed
  closed with `TEEML_NOT_VERIFIED / SIGNATURE_UNAVAILABLE`. No automatic retry,
  unsigned verdict acceptance, raw artifact, or evidence file was produced.
  Updated current-status documentation and prepared the full branch for the
  human-approved commit and remote push.
- next: confirm signed-response availability for the selected testnet TeeTLS
  provider, then run one newly authorized ALLOW and DENY pair and inspect the
  sanitized evidence.
- blockers: `TEEML_REAL_INTEGRATION_BLOCKED`; real completion dispatch is
  funded and functional, but the provider signature endpoint returns HTTP 400,
  so no cryptographically verified ALLOW/DENY evidence exists yet. Production
  Private/TeeML mainnet evidence remains a separate deployment requirement.
- interfaces touched: none; runtime, HTTP, database, and evidence contracts are
  unchanged by the live retry.

## 2026-07-25 07:38 PM - Claude - full local flow validation and live signature diagnosis
- did: ran the complete local acceptance path for the 0G TeeML semantic
  verifier feature committed at c0779d5. `services/agent-service`: installed
  the previously un-installed `@0gfoundation/0g-compute-ts-sdk` dependency,
  then typecheck, 194 unit tests, and build all passed clean. Found and fixed
  a real test-infra bug: `npm run test:integration` silently failed 2 of 3
  suites (teeml, agentic-id-registration) because those files never loaded
  `.env` - only `policy-engine.postgres.integration.ts` happened to work via a
  transitive `dotenv/config` import through `index.ts`. Added the missing
  import to both files and confirmed all 44/44 integration tests now pass in a
  fully clean shell (`env -i`), not just one with a pre-sourced environment.
  `packages/nextjs`: `yarn install` plus clearing a stale `.next` cache made
  `check-types` clean. Dispatched a `grumpy-carlos-code-reviewer` pass over the
  full teeml/0G integration code and migrations 0004-0011; verdict: no
  fail-open bugs, profile downgrade paths, or DB-invariant gaps found. Applied
  its two low-risk recommendations: a clarifying comment on the on-chain
  `verifiability` check in `zero-g-signed-response-verifier.ts` (documents that
  it is a different vocabulary from the Router catalog's field and must not be
  keyed on `securityProfile`), and collapsed the `verify()` existence/ownership
  check in `service.ts` into a single 404 to stop leaking `requestId`
  existence to non-owning agents. Left two review suggestions (widen the
  final-verification immutability trigger to cover `PROCESSING` rows;
  consolidate the two independent `ZG_TEEML_SECURITY_PROFILE` env parses in
  `index.ts` into one) as recommendations, not applied. The user then supplied
  real testnet credentials (0G Router API key, 0G Galileo private key/contract
  config) directly in the local `.env`/`.env.local` files (never committed;
  both remain gitignored) so the live hackathon test could run for real. The
  opt-in `test:0g:teetls:hackathon` command dispatched a real completion and
  reproduced the same `TEEML_NOT_VERIFIED / SIGNATURE_UNAVAILABLE` (HTTP 400)
  block from prior sessions. Root-caused it with an instrumented standalone
  script (deleted after use, never committed): the provider's signed-response
  endpoint returns `{"error":"...Chat id not found or expired, chat_id_not_found"}`
  regardless of which chat identifier is used (`ZG-Res-Key` header or
  `envelope.id`) and regardless of latency (as low as ~840ms after completion),
  ruling out both a wrong-field bug and a TTL/timing bug in AEGIS's client
  code. This is a provider-infrastructure issue on the selected testnet TeeTLS
  provider (`compute-network-6.integratenetwork.work`, address
  `0xa48f...67836`), most likely a signed-response GET landing on a different
  backend replica than the one that served the completion POST, with no shared
  chat-id cache between them.
- next: escalate the confirmed provider-side bug to 0G/provider support, or
  find a different eligible testnet TeeTLS provider; then run one authorized
  ALLOW/DENY pair and review the sanitized evidence. Separately, consider
  applying the two deferred review recommendations (broader immutability
  trigger, single security-profile parse) when next touching `teeml/`.
- blockers: `TEEML_REAL_INTEGRATION_BLOCKED`; confirmed provider-side
  `chat_id_not_found` on the signed-response endpoint, not a credentials,
  timing, or AEGIS client-code issue.
- interfaces touched: none functionally; the two applied fixes are a
  documentation comment and a response-code collapse (403+404 -> 404) on an
  existing error path, both covered by the existing passing test suite.

## 2026-07-25 08:18 PM - Claude - real end-to-end flow with fresh agent data; provider bug confirmed independent of agent identity
- did: the user hypothesized the earlier `chat_id_not_found` block might be an
  artifact of testing with an agent/data created in a different environment,
  and asked for the complete real flow to be run from scratch with data
  generated here. Discovered the local dev PostgreSQL database
  (`aegis_dev`, DATABASE_URL) was still on the pre-c0779d5 migration state -
  `aegis_agentic_id_registrations`, `aegis_agent_semantic_profiles`,
  `aegis_teeml_verifications`, and `aegis_teeml_audit_events` were all missing
  - because only `TEST_DATABASE_URL` had received migrations 0003-0011 via the
  integration-test runs. Ran `npm run db:migrate` against the dev database
  (additive/upgrade-safe, per the migration design) to fix this permanently.
  Generated a shared `AEGIS_AGENTIC_ID_INTERNAL_TOKEN` and added it to both
  `services/agent-service/.env` and `packages/nextjs/.env.local` (both
  gitignored, never committed). Rather than touch the user's already-running
  dev servers (ports 3000/4200, pre-dating this session's env changes),
  started an isolated Next.js instance on port 3001 and a one-off
  `agent-service` bootstrap (temporary script, deleted after use, never
  committed) on port 4201 with a closure-based test-only authenticator, and
  drove the entire real HTTP flow with brand-new data: real Hedera
  `AccountCreateTransaction` (new account `0.0.9755293`), real 2-of-3 Safe
  deployment on Hedera testnet, a real 0G Agentic ID mint on Galileo testnet
  (token `108`, real explorer tx), a real EIP-712-signed Policy
  create+activate, a real Level 1 precheck reaching `PENDING_TEEML`, and
  finally a real `POST /actions/:requestId/teeml/verify` call through the real
  0G Router. Result: steps 1-6 all succeeded for the first time end-to-end in
  this environment; step 7 failed with the identical `TEEML_NOT_VERIFIED`
  (502) as every prior session, using an agent, wallet, Agentic ID, and Policy
  created entirely fresh in this run. This conclusively rules out the
  "agent created elsewhere" hypothesis - the block is confirmed to be the
  provider-side `chat_id_not_found` bug on the selected testnet TeeTLS
  provider, independent of which AEGIS agent/policy/precheck data drives the
  request.
- next: escalate the confirmed provider-side bug to 0G/provider support, or
  select a different eligible testnet TeeTLS provider; then rerun the same
  real flow for one authorized ALLOW and one DENY pair and review the
  sanitized evidence. Separately: run `npm run db:migrate` (or equivalent)
  against any other environment's dev database that predates commit c0779d5,
  since the missing-migrations gap found here could recur elsewhere.
- blockers: `TEEML_REAL_INTEGRATION_BLOCKED`; unchanged - confirmed
  provider-side `chat_id_not_found`, now verified independent of agent
  identity/history.
- interfaces touched: none; no source files changed this entry. The dev
  PostgreSQL database was brought up to the current migration state (schema
  change only, no code/interface change).

## 2026-07-25 08:57 PM - Claude - fixed the hackathon TeeTLS block: 0G Direct SDK mode replaces the buggy Router path
- did: the user suspected the recurring `chat_id_not_found` block was actually
  fixable, not a dead end, and asked to dig further and try the official
  SDK's "Direct" broker mode (bypassing the 0G Router entirely) against the
  same pinned provider. Verified against the official 0G docs
  (`docs.0g.ai/.../router/overview`, `.../faq`, `.../verifiable-execution`)
  that `router-api-testnet.integratenetwork.work` is genuinely the documented
  official testnet Router (not a rogue third-party endpoint), and that the
  docs do not specify whether provider-side signature retrieval is
  single-use or keyed differently internally - a real, confirmed
  documentation gap. Ran a live A/B test calling the Router with
  `verify_tee: true` vs `false`: both failed identically at the signature
  endpoint, which rules out "the Router's own synchronous verification
  consumes the record" and points at the Router's completion-proxying itself.
  Then funded a real ledger and provider sub-account, acknowledged the
  provider's TEE signer on-chain, and called the SAME provider's own
  `/v1/proxy/chat/completions` directly (bypassing the Router) using the
  SDK's broker-signed billing headers; `broker.inference.processResponse`
  returned `true` - independent signature verification succeeded on the first
  try. This conclusively isolated the bug to the Router's completion proxy,
  not 0G's protocol, the provider, or AEGIS's prior Router-based
  implementation.
  Wrote a new `services/agent-service/src/integrations/0g/zero-g-direct-inference.ts`
  implementing `ZeroGDirectInferenceGateway` (a `TeeMlInferenceGateway`) on
  the SDK's Direct broker mode: lazy one-time ledger/acknowledgment setup,
  exact provider address and provider-side model id pinning (new
  `ZG_TEEML_PROVIDER_ADDRESS`/`ZG_TEEML_PROVIDER_MODEL_ID` env vars, no
  catalog-based discovery), `response_format: json_object`, and
  `processResponse` as the sole verification source of truth. Wired it into
  `zero-g-semantic-inference.ts`: `createZeroGSemanticInferenceFromEnv` now
  routes the `hackathon-testnet-teetls` profile to this new Direct-mode
  gateway unconditionally, leaving the existing Router-based path completely
  untouched and still exclusively used by `production-private-teeml`
  (mainnet, still live-unproven, out of scope for this fix). Updated the
  opt-in live harness (`zero-g-semantic.live.ts`) to require the new env vars
  and emit accurate evidence fields per profile.
  While validating, hit a second, previously-unreached bug: the real verdict
  JSON (schemaVersion, verdict, reasonCode, four 66-char hex hashes) needs
  well over 256 output tokens; `ZG_TEEML_MAX_OUTPUT_TOKENS`'s 256 default AND
  hard ceiling (in `zero-g-router-client.ts`, shared by both profiles)
  silently truncated valid model output mid-JSON, always failing closed as
  `TEEML_OUTPUT_INVALID`. This was never hit before because no run had ever
  gotten past the signature-verification step. Raised the default and ceiling
  to 768 in all three places (router client ceiling, shared default constant,
  direct-gateway default) and updated the one test that asserted the old 257
  boundary to 769.
  Result: `npm run test:0g:teetls:hackathon` now completes with
  `TEETLS_HACKATHON_INTEGRATION_VERIFIED`, both ALLOW and DENY cases
  independently signature-verified, real evidence written to
  `docs/evidence/0g-teetls-hackathon-verification.json`. Reran the full real
  HTTP flow (precheck against the already-persisted real agent/wallet/policy
  from the earlier full-flow session) through the actual
  `POST /actions/:requestId/teeml/verify` route and got a real
  `TEETLS_HACKATHON_ALLOWED` / `verdict: "ALLOW"` response for the first time
  this branch. Full validation suite reran clean: typecheck, 194 unit tests,
  44 PostgreSQL integration tests, build. Updated
  `docs/aegis-current-scope.md` and `docs/0g/teeml-semantic-verifier.md` to
  describe the Direct-mode path and mark the Router-specific sections as
  production-only. Dispatched a `grumpy-carlos-code-reviewer` pass over the
  new gateway and its wiring; findings pending.
- next: apply the code-review findings for `zero-g-direct-inference.ts` once
  they land. Optionally report the confirmed Router bug to 0G/Integrate
  Network support (courtesy - AEGIS itself is unblocked). Decide whether
  `production-private-teeml` should eventually move to Direct mode too,
  before that mainnet path is ever exercised for real.
- blockers: none for the hackathon path - it is real, funded, and verified
  end-to-end. Production Private/TeeML mainnet evidence remains a separate,
  unstarted deployment requirement.
- interfaces touched: `ZeroGSecurityProfile` resolution now routes
  `hackathon-testnet-teetls` to a new Direct-SDK gateway instead of the
  Router client; new required env vars for that profile
  (`ZG_COMPUTE_PRIVATE_KEY`, `ZG_TEEML_PROVIDER_ADDRESS`,
  `ZG_TEEML_PROVIDER_MODEL_ID`); `ZG_TEEML_MAX_OUTPUT_TOKENS` default/ceiling
  raised 256 -> 768. `production-private-teeml`'s Router-based contract is
  unchanged.

## 2026-07-25 09:23 PM - Claude - full fresh end-to-end run, code review, and an honest correction to the Direct-mode verification claim
- did: the user asked to test the complete flow again, starting from Hedera
  agent creation, now that the Direct-mode fix was in place. Ran it fully
  fresh (new Hedera account `0.0.9757226`, new Safe, new 0G Agentic ID token
  `109`, new Policy, new precheck) through the real HTTP routes and got a
  second real `TEETLS_HACKATHON_ALLOWED` verdict, confirming the fix is not a
  one-off. In parallel, a `grumpy-carlos-code-reviewer` pass on
  `zero-g-direct-inference.ts` landed with a critical finding: the gateway
  trusted `broker.inference.processResponse`'s boolean as full content
  verification, but that SDK method's `content` parameter is billing/usage
  JSON per its own docstring - it never compares the provider's signed
  response against the actual model content this gateway trusts as an
  ALLOW/DENY verdict. The reviewer's suggested fix was to reuse
  `ZeroGSignedResponseVerifier` (the Router path's verifier, which does
  byte-for-byte compare the signed `text` against `content`) instead.
  Attempting that fix failed closed on every real response
  (`SIGNATURE_RESPONSE_INVALID`). Live debugging (temporary instrumentation,
  removed after) revealed why: the provider's real signed response is
  `{text: "<hash>:<hash>:centralized:aliyun:<tls_fingerprint>", signature,
  signing_address, signing_algo, provider_type, provider_identity,
  tls_cert_fingerprint}` - a compact hash commitment plus extra fields, not
  the raw completion text `ZeroGSignedResponseVerifier` assumes. Tried roughly
  a dozen candidate hash inputs (content, full request body, messages array,
  system prompt, user content, chat ID, various combinations, sha256) against
  the observed commitment hashes; none matched. This is a previously-unknown
  fact: nobody had ever seen this provider's real signed-response body before
  (every earlier Router-based attempt failed at `chat_id_not_found` first),
  so the original assumption baked into `zero-g-signed-response-verifier.ts` -
  written before any successful verification was ever observed - was never
  actually validated against a real response, and is provably wrong for this
  provider. Rather than keep guessing at an undocumented per-provider
  commitment scheme, reverted `zero-g-direct-inference.ts` to
  `broker.inference.processResponse` and added an explicit, prominent
  "KNOWN LIMITATION" comment in the file plus corrections in
  `docs/aegis-current-scope.md` and `docs/0g/teeml-semantic-verifier.md`:
  verification here confirms a genuine signature from the provider's
  acknowledged TEE signer exists for the exact chat ID, but does not
  independently prove that signed payload corresponds byte-for-byte to the
  specific model content this gateway trusts. This is disclosed, not silently
  overstated - consistent with the hackathon profile's existing "may process
  plaintext, never production-authorizing" status. Applied the reviewer's
  other, unambiguous findings: bounded streaming reads for the completion
  response (matching the Router client's pattern, replacing a buffer-then-check
  read), conservative `requestDispatched: true` on completion timeout/abort
  (matching the Router path's "assume dispatched, reconcile manually"
  semantics), broker-creation retry-on-failure (matching the existing
  ensure-ready reset pattern), constructor dependency injection for the broker
  factory and fetch (for testability), and removed a false-positive strict
  `body.model === metadata.model` check added during the fix attempt (the
  completion body's self-reported model string uses a different, shorter
  format than the on-chain registry value and was rejecting valid responses).
  Re-ran the full validation suite clean: typecheck, 194 unit tests, 44
  PostgreSQL integration tests, build, and the real opt-in hackathon test
  (fresh real ALLOW/DENY pair, evidence file rewritten).
- next: decide whether to invest further in reverse-engineering the
  provider's commitment scheme (would need 0G/provider documentation or
  source access neither available today) to close the byte-for-byte
  verification gap, or accept `processResponse`'s signature-validity
  guarantee as sufficient for a hackathon-only, explicitly-non-production
  profile. Neither blocks the demo; both should be a conscious call, not a
  default. Unrelated: still consider whether `production-private-teeml`
  should eventually move to Direct mode, and whether to report the confirmed
  Router `chat_id_not_found` bug to 0G/Integrate Network as a courtesy.
- blockers: none for demo purposes - the hackathon path is real, funded, and
  produces genuine (if narrower-than-originally-claimed) signature evidence.
  The byte-for-byte content-commitment verification gap is open and
  documented, not blocking.
- interfaces touched: `zero-g-direct-inference.ts`'s internal verification
  step only (now `processResponse`-based with DI-friendly constructor
  dependencies); `TeeMlInferenceResult`/`TeeMlError` contracts unchanged. Two
  documentation files corrected to remove an overstated "independently
  signature-verified" / "byte-for-byte" claim about the hackathon path.
