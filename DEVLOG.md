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
