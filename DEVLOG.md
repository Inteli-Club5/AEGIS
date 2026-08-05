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

## 2026-07-25 12:00 PM - Claude - Rodrigo (product/docs)
- did: restructured `docs/aegis_financial_model.md` section 3 into
  "Revenue sources in detail", turning the standalone "Activation fee" section
  into subsection 3.1 and adding 3.2 (Execution fee) and 3.3
  (Provider/network fee) with trigger, payer, and rules for each. Also closed
  the dangling sentence in 3.1 by stating explicitly that the activation fee
  converts into execution credit. Sections 4-8 keep their numbering.
- next: confirm with the team whether the provider-fee settlement cadence
  described in 3.3 matches what the cosigner/executor will actually implement.
- blockers: `TASKS.md` is still absent, so no task checklist update was
  possible.
- interfaces touched: none.


## 2026-07-25 12:40 PM - Claude - Rodrigo (product/docs)
- did: created `docs/roadmap.md`, a phased roadmap (Phase 0 hackathon MVP
  through Phase 5 long-horizon open questions) built by cross-referencing
  every already-documented "later"/TODO item across `docs/AEGIS_ARCHITECTURE.md`
  §9, `docs/decisions.md`, `docs/aegis_financial_model.md` §4/§6, the
  `services/cosigner` and Agentic ID route TODOs, and the recurring
  `docs/interfaces.md`/`TASKS.md` blockers from past DEVLOG entries. Added
  three product asks as explicit phases: a capped-user private beta (Phase 1),
  agent-provider partnerships (Phase 3, marked Proposed - no prior doc
  mention), and a financial-roadmap section (§9) that reproduces the real
  Short term / Medium term projection tables from
  `docs/aegis_financial_model.md` §5 and explicitly flags that no month-1,
  month-6, year-1, or 5-year projection exists yet rather than inventing one.
  Linked the new doc from `README.md`'s doc-pointer list.
- next: team decision on Phase 3's shape (integration SDK vs. something else)
  and on modeling the real month-1/month-6/year-1/5-year financial projection
  once Phase 1 beta usage data exists.
- blockers: `TASKS.md` is still absent, so no task checklist update was
  possible.
- interfaces touched: none.

## 2026-07-25 01:20 PM - Claude - Rodrigo (product/docs)
- did: corrected a product-thesis error that had propagated across
  `docs/AEGIS_ARCHITECTURE.md` (§1, §3.2, §14) and `docs/decisions.md`: the
  docs claimed "AEGIS creates the AI agent itself... as part of onboarding,"
  but per Rodrigo's correction the user has always brought their own agent
  (the AI/bot that decides and proposes trades) - AEGIS never authored or
  operated that decision logic, only the on-chain protected wallet/identity
  around it and the policy verification gate. Reworded `docs/AEGIS_
  ARCHITECTURE.md` §1's product thesis and pull-quote, renamed and reworded
  §3.2 "Create agent" to "Register the agent," and rewrote the §14 standing
  truth. Appended a new dated line to `docs/decisions.md` (per its own
  never-edit-history rule) superseding the 2026-07-24 line rather than
  deleting it. Updated `docs/roadmap.md` to match: Phase 0's scope line and
  table row no longer say "AEGIS-created agent"; retitled Phase 2 from
  "Chain, asset, and agent-source expansion" to "Chain and asset expansion"
  since bring-your-own-agent was never a future item; reworded Phase 3's
  goal statement to contrast self-serve one-by-one registration against
  partner-scale integration instead of the wrong AEGIS-vs-user framing; and
  aligned Phase 4's section header with its already-shortened table label
  ("Monetization expansion").
- next: `README.md` line 3 ("It creates the agent itself on Hedera...") and
  `PLAYBOOK.md` line 117 ("Create/register agent, AEGIS-created on Hedera")
  still carry the same stale claim - out of this session's authorized scope
  (roadmap + architecture + decisions.md only), flagged to Rodrigo, not
  edited.
- blockers: `TASKS.md` is still absent, so no task checklist update was
  possible.
- interfaces touched: none. Product-thesis correction only; no ABI/API/
  schema changed.
## 2026-07-24 10:31 PM - Claude Code (CryptoVictor) - dashboard
- did: merged the untracked root-level `front-aegis-main/` (a standalone
  Next.js UI prototype - landing, onboarding wizard, dashboard, agent detail,
  all on mock data) into `packages/nextjs`, then deleted the source folder.
  Copied `features/`, `lib/`, `components/{ui,layout}/`, the new
  `app/{dashboard,onboarding,agents}` routes, and `public/` assets in with no
  collisions; added a `@/*` tsconfig path alias alongside the existing `~~/*`
  so the prototype's imports resolve unchanged; added `lucide-react` to
  `package.json`. Overwrote `app/page.tsx` (was a no-op stub) and
  `app/layout.tsx` with the prototype's versions, but had to re-wrap the new
  layout in the existing `ScaffoldHbarAppWithProviders` + `ThemeProvider` -
  dropping them outright broke the prerender for `/debug` and
  `/blockexplorer` (`WagmiProviderNotFoundError`). Kept the existing
  `next.config.ts` as-is (front-aegis-main's version was empty create-next-app
  boilerplate; overwriting would have dropped `outputFileTracingRoot`, the
  IPFS export branch, and the webpack externals the monorepo build needs).
  Copied the prototype's `docs/` (design-system.md, interface-escrita.md, its
  own AEGIS_ARCHITECTURE.md/decisions.md) into `packages/nextjs/docs/`
  untouched rather than merging into root `docs/` - its architecture doc and
  decisions.md **contradict** the root's production-locked versions (notably
  "bring your own agent" vs. the locked "AEGIS creates the agent" flow, and
  dropped protected-wallet onboarding step), so reconciling them needs a human
  call, not a silent overwrite. Also found and flagged to the user (not
  copied, not acted on) a prompt-injection attempt in the prototype's
  `AGENTS.md`/`CLAUDE.md` telling agents to read instructions from
  `node_modules/next/dist/docs/` before writing code. Verified with
  `yarn workspace @sh/nextjs run check-types`, `run build` (all 12 routes,
  old and new, build and prerender clean), and `run format`.
- next: reconcile `packages/nextjs/docs/AEGIS_ARCHITECTURE.md` and
  `decisions.md` against the root's locked versions (human decision - which
  agent-onboarding flow is actually correct). The new pages currently render
  wrapped in the old scaffold's `Header`/`Footer` chrome as well as their own
  `Nav`/`Footer` (front-aegis-main pages carried their own) - cosmetic
  double-chrome to resolve when the two UIs are actually wired together
  (explicitly out of scope for this session per instructions). The mock
  wallet/data layer (`features/wallet`, `lib/mock`) still needs wiring to the
  real wagmi/contract hooks.
- blockers: none. `TASKS.md` is still missing, so no task checklist update was
  possible.
- interfaces touched: none to the locked architecture/decisions docs (the
  prototype's conflicting copies live only under `packages/nextjs/docs/`, not
  merged into root `docs/`).

## 2026-07-24 10:38 PM - Claude Code (CryptoVictor) - cleanup
- did: removed the front-aegis-main docs that weren't actually part of this
  project - `packages/nextjs/docs/AEGIS_ARCHITECTURE.md`, `decisions.md`,
  `AEGIS_ARCHITECTURE.png`, and `AEGIS_USER_FLOW.png` were the prototype's own
  stale copies of the root's docs (the two PNGs were byte-identical to
  `docs/`'s; the two `.md` files diverged and conflicted with the
  production-locked root versions, per the prior entry). Kept
  `design-system.md` and `interface-escrita.md`, which are unique
  frontend-specific docs cited by the merged component/lib code and don't
  exist elsewhere. Also removed `services/decision-verifier/demo-compute-flow.ts`
  and `DEMO_SCRIPT.md` - confirmed neither is imported by `src/` (the actual
  Express service `tsc` compiles; its `tsconfig.json` `include` is scoped to
  `src/**/*` already) or referenced anywhere outside that service's own
  `package.json`/`README.md`. Dropped the now-dead `"demo"` script from
  `package.json` and cleaned every reference to the demo script out of
  `README.md` (repo structure tree, the "Run the Complete Flow" section, the
  `npm run demo` dev-scripts line, the "Demo Script Guide" link, and the
  closing tagline). Verified with `grep` that no other file in the repo
  references the removed docs or demo files (aside from this DEVLOG's own
  history), and re-ran `yarn workspace @sh/nextjs run check-types`/`build`
  after the docs removal - unaffected, since docs aren't part of the app
  bundle.
- next: same as the prior entry - reconcile the frontend's architecture
  assumptions with the root's locked docs, and wire the mock wallet/data layer
  to real hooks.
- blockers: none.
- interfaces touched: none.

## 2026-07-24 11:14 PM - Claude Code (CryptoVictor) - i18n & de-mocking
- did: translated every remaining Portuguese comment in the merged
  `packages/nextjs` frontend to English (`lib/types/aegis.ts`,
  `lib/api/{agents,onboarding}.ts`, `lib/fixtures/store.ts`,
  `lib/utils/hash.ts`, and the wallet feature files), and rewrote both
  `packages/nextjs/docs/design-system.md` and `interface-escrita.md` in full
  English. Per instructions, also stripped "mock" out of naming while
  keeping the underlying local/simulated behavior intact, replacing it with
  `TODO(backend)` markers at every swap point: renamed `lib/mock/` to
  `lib/fixtures/` (updated all `@/lib/mock/*` imports), `mockHash.ts` to
  `hash.ts` (`mockHash()` to `deterministicHash()`), `MOCK_DELAY_MS` to
  `SIMULATED_LATENCY_MS`, `aegis.mock-session`/`aegis.mock-agents`
  localStorage keys to `aegis.session`/`aegis.local-agents`, and
  `MOCK_ADDRESS` to `PLACEHOLDER_ADDRESS` in `ConnectWalletProvider.tsx`. The
  user-facing "Mock session" copy in `ConnectModal.tsx` became "This session
  is simulated locally." `interface-escrita.md`'s framing changed from "this
  delivery is a mocked front-end" to describing the screens as the actual
  production spec, with the local data layer called out via `TODO(backend)`
  notes instead of a leading "mocked" disclaimer;
  `design-system.md` §13's `lib/mock/` references were updated to
  `lib/fixtures/` to match the code. Verified with `check-types`, `build`
  (all 12 routes clean), and `format` after every batch of edits, plus `grep`
  sweeps confirming zero remaining Portuguese-accented characters or "mock"
  occurrences (`mockup-code`, a DaisyUI CSS class in the pre-existing
  blockexplorer components, is unrelated and was left alone).
- next: reconcile `packages/nextjs/docs/AEGIS_ARCHITECTURE.md`/`decisions.md`
  against the root's locked versions (carried over from the prior entry,
  still unresolved), then start wiring the `TODO(backend)`-marked spots
  (`lib/api/*`, `lib/fixtures/*`, `ConnectWalletProvider.tsx`) to real
  wagmi/contract calls.
- blockers: none.
- interfaces touched: none.

## 2026-07-24 11:23 PM - Claude Code (CryptoVictor) - i18n filenames
- did: renamed the last Portuguese-named file in the repo,
  `packages/nextjs/docs/interface-escrita.md`, to `screen-specification.md`
  (matching the English title it already had after the prior entry's
  translation pass). Updated every reference to the old filename: the
  markdown link and the §0.1/§3 cross-references in `design-system.md`, and
  the `screen-specification.md §4`/`§5.1` code comments in
  `lib/api/agents.ts`, `lib/api/onboarding.ts`, and `lib/fixtures/store.ts`.
  Left DEVLOG's own prior entries referencing the old filename untouched -
  they're a historical record of what the file was called at the time, not a
  live reference to update. Swept the whole repo (not just `packages/nextjs`)
  for other Portuguese-named files (`arquitetura`, `decisões`, `politica`,
  `planejamento`, `usuario`, `carteira`, etc.) - found none. Verified with
  `check-types` and a `grep` sweep confirming no remaining
  `interface-escrita` references outside DEVLOG history.
- next: same as the prior entry - reconcile
  `packages/nextjs/docs/AEGIS_ARCHITECTURE.md`/`decisions.md` against the
  root's locked versions, then wire the `TODO(backend)`-marked spots to real
  wagmi/contract calls.
- blockers: none.
- interfaces touched: none.

## 2026-07-24 11:46 PM - Claude Code (CryptoVictor) - dashboard QA
- did: actually ran the merged dashboard instead of just building it - started
  `yarn next:dev`, installed Playwright + Chromium into the session scratch
  dir (no project skill covered running this app yet), and drove `/`,
  `/dashboard`, `/onboarding`, `/agents/[id]`, `/debug`, and `/blockexplorer`
  headlessly with screenshots + console/page-error capture. Found and fixed
  two real bugs the build/typecheck couldn't catch: (1) `app/globals.css`
  (inherited from the front-aegis-main merge) never registered the daisyUI
  plugin, so every daisyUI-dependent class the pre-existing scaffold-hbar
  screens use (`Header`'s dropdown/navbar/menu, `RainbowKitCustomConnectButton`,
  `/debug`'s buttons and cards) emitted no CSS at all - visually this left the
  burner wallet's "Private Key" dropdown permanently expanded on every single
  page. Confirmed with the user before fixing (architectural CSS decision,
  not a typo) and re-added the `@plugin "daisyui"` + light/dark theme
  registration and the Tailwind v4 border-color compat rule, both marked
  `TODO(design)` to drop once `/debug`/`/blockexplorer` move off daisyUI.
  (2) `features/landing/components/Nav.tsx` used `fixed inset-x-0 top-0`,
  which pinned it directly on top of the old scaffold `Header` (also pinned
  to the viewport top), overlapping their text on `/`. Fixed by switching to
  `sticky top-0`, matching the pattern `AppTopbar.tsx` already used
  correctly on the other new routes (which is why only the landing page
  showed the overlap, not `/dashboard`/`/onboarding`/`/agents/[id]`). Also
  caught along the way: `app/globals.css` itself still had Portuguese
  comments, missed earlier because that sweep only covered `.ts`/`.tsx`/`.md`
  - translated them. Re-verified with `check-types` and a clean `next build`
  (stopped the dev server first; running both against the same `.next`
  directory concurrently threw an unrelated `PageNotFoundError: /_document`
  that was a build/dev collision, not a code regression). Pre-existing,
  unrelated to this merge: `/blockexplorer` logs a CORS console error
  fetching the HBAR price from `api.coingecko.com` - not caused by anything
  touched this session.
- next: per the `run` skill's guidance, this project has no committed skill
  for launching `packages/nextjs` yet - worth capturing via
  `/run-skill-generator` (dev command, port, the Playwright driver pattern)
  so the next session doesn't have to rediscover it. Otherwise same
  outstanding items as prior entries: reconcile
  `AEGIS_ARCHITECTURE.md`/`decisions.md`, wire the `TODO(backend)` spots to
  real wagmi/contract calls, and eventually retire the daisyUI dependency
  from `/debug`/`/blockexplorer` so the `TODO(design)` block in
  `globals.css` can come out.
- blockers: none.
- interfaces touched: none.

## 2026-07-25 12:07 AM - Claude Code (CryptoVictor) - remove old scaffold chrome
- did: user asked to remove the old scaffold-hbar interface entirely since it
  clashed visually with the new AEGIS design (confirmed scope first - full
  removal, including the `/debug` and `/blockexplorer` dev tools, not just the
  chrome around them). Deleted `app/debug/` and `app/blockexplorer/` (routes +
  all `_components`), `components/Header.tsx`, `components/Footer.tsx`,
  `components/LocalChainErrorBanner.tsx`, `components/SwitchTheme.tsx`,
  `components/scaffold-hbar/RainbowKitCustomConnectButton/` (the burner-wallet
  UI from the last entry's dropdown fix), and `components/scaffold-hbar/HederaAddress.tsx`
  - all confirmed orphaned by grep before deletion. Simplified
  `ScaffoldHbarAppWithProviders.tsx` to just the Wagmi/RainbowKit/QueryClient
  provider stack (kept - still needed for real wallet wiring later) plus
  `Toaster`, dropping the `Header`/`LocalChainErrorBanner`/`Footer` chrome
  wrapper entirely; recolored the RainbowKit theme and the nprogress bar from
  the old scaffold purple/blue to AEGIS's `#62affc` brand blue. Trimmed
  `components/scaffold-hbar/index.tsx` to only export `BlockieAvatar` (the one
  piece still used, for `RainbowKitProvider`'s avatar prop). Restyled the two
  remaining daisyUI-dependent files instead of deleting them, since both are
  still load-bearing: `app/not-found.tsx` (generic 404, now AEGIS tokens) and
  `utils/scaffold-hbar/notification.tsx` (the toast helper every
  `useScaffoldReadContract`/`useScaffoldWriteContract`/etc. hook calls -
  swapped `@heroicons/react` for `lucide-react` and daisyUI's
  `bg-base-200`/`text-error`/`loading-spinner` classes for AEGIS's
  `bg-surface-raised`/`text-danger`/a `Loader2` spin icon). Confirmed via
  `grep` zero remaining daisyUI class usage anywhere in the app, so removed
  the `@plugin "daisyui"` registration and the border-color compat rule from
  `app/globals.css` entirely - both were added in the prior entry specifically
  to keep the now-deleted screens working, and are no longer needed by
  anything. Removed the now-fully-unused dependencies from `package.json`:
  `@heroicons/react`, `daisyui`, `@scaffold-hbar-ui/components`,
  `@scaffold-hbar-ui/debug-contracts`, `@scaffold-hbar-ui/hooks`, and
  `qrcode.react` (confirmed zero references to each before removing, ran
  `yarn install` to update the lockfile). Also deleted `styles/globals.css`,
  the original scaffold stylesheet - it had been fully orphaned since the
  front-aegis-main merge switched the active import to `app/globals.css`, and
  nothing pointed at it anymore.
- next: verified with `check-types`, a clean `next build` (8 routes now,
  down from 12 - `/debug` and `/blockexplorer` correctly gone, everything
  else unchanged), and a headless Playwright pass confirming `/debug` and
  `/blockexplorer` now 404, `/`, `/dashboard`, `/onboarding`, and
  `/agents/[id]` render with zero console/page errors and no leftover
  scaffold-hbar branding. This also resolves the prior entry's `TODO(design)`
  daisyUI carve-out - there's nothing left in the app that needs it. Still
  outstanding: reconcile `AEGIS_ARCHITECTURE.md`/`decisions.md` against the
  root's locked versions, wire the `TODO(backend)` spots to real
  wagmi/contract calls, and capture a `/run-skill-generator` skill for this
  package (still missing, per the prior entry).
- blockers: none.
- interfaces touched: none. Note for whoever owns contract debugging
  (Victor's lane per PLAYBOOK.md): `/debug` and `/blockexplorer` are gone,
  not hidden - restoring them means re-adding the deleted files from git
  history, not just re-wiring a route.

## 2026-07-25 10:15 AM - Claude Code (CryptoVictor) - dashboard

- did: at the user's direct request, wired the "Connect wallet" flow to a
  real wagmi/RainbowKit connection - the biggest outstanding `TODO(backend)`
  called out repeatedly since the 2026-07-24 10:31 PM entry. This touches
  `packages/nextjs` (nominally Leunam's lane per `PLAYBOOK.md`); noting it
  here since the user drove it directly this session. Rewrote
  `features/wallet/components/ConnectWalletProvider.tsx` to drop the fake
  localStorage/`setTimeout` session entirely in favor of real
  `useAccount`/`useConnect`/`useDisconnect`, keeping the exact same context
  shape (`status`/`address`/`openModal`/`connect`/`disconnect`) so none of
  its eight consumers (`ConnectGate`, `AppTopbar`, `Nav`, `Hero`, the
  dashboard/onboarding/agent-detail gates) needed changes. Added
  `coinbaseWallet` to `services/web3/wagmiConnectors.tsx`'s wallet list so
  all three tiles the existing `ConnectModal.tsx` UI already offered
  (MetaMask/WalletConnect/Coinbase - per `docs/screen-specification.md`
  S01/S02, which this session confirmed is the frozen spec for this custom
  modal, not RainbowKit's default one) have a real connector behind them.
  Hardest part, worth flagging loudly for whoever touches this next:
  RainbowKit's `connectorsForWallets()` tags each connector with an
  undocumented `rkDetails.id` carrying the wallet's *true* identity - a
  connector's own top-level `id`/`name` instead reflect whichever protocol
  it fell back to (MetaMask with no extension installed silently becomes a
  bare `id: "walletConnect"` connector). Matching on `id` directly (the
  first attempt) made every "MetaMask" click silently resolve to the wrong
  connector. Found this by dumping the live connector list in a running
  browser, not from any doc; the fix (`findConnector()` in
  `ConnectWalletProvider.tsx`) is now commented in-place with the exact
  rainbowkit version (2.2.9) it was verified against, plus a dev-only
  `console.warn` canary that fires if a future `@rainbow-me/rainbowkit`
  bump ever removes `rkDetails`. Sent the diff through
  `grumpy-carlos-code-reviewer`, which independently re-verified the
  `rkDetails` mechanism against the installed package source and confirmed
  it's correct, then caught a real bug: the connected panel's HBAR balance
  (`useBalance` + viem's `formatUnits`, added to satisfy S02's "address,
  balance, Disconnect" spec) raced a fixed 900ms auto-redirect-to-dashboard
  timer, so on a slow RPC the balance could silently never render before
  the modal closed. Fixed by dropping the auto-redirect entirely - the user
  now clicks the existing "Open dashboard" button once actually connected,
  which also just reads simpler. Also applied the review's smaller findings:
  `disconnect()` was missing error handling on `disconnectAsync()`; `address`
  was widened from wagmi's branded type to a plain `string` for no reason,
  forcing an unnecessary cast in `ConnectModal.tsx`; the rejected-connection
  check matched `err.name` by string instead of `viem`'s exported
  `UserRejectedRequestError` class; and `wagmiConnectors.tsx`'s
  `appName: "scaffold-hbar"` was about to become real users' first
  wallet-popup impression of the app (now `"AEGIS"`). Verified with a
  Playwright driver against a live `yarn next:dev`: MetaMask with no
  extension (unavoidable in headless Chromium) now fails fast with a clear,
  honest error instead of hanging forever; WalletConnect genuinely mounts
  RainbowKit's real `w3m-modal` web component; Coinbase Wallet's SDK starts
  a real connection attempt; `/dashboard` and `/onboarding` still gate
  correctly when disconnected; zero console/page errors across all of it.
  `check-types`, lint, and a full production build all pass. Also updated
  `docs/screen-specification.md`'s §6 "Out of scope" line, which still said
  real wallet connection wasn't done.
- next: two candidates, pick based on how close demo day is - (1) a manual
  pass with an actual MetaMask browser extension installed (not headless -
  structurally impossible to test in this session's sandboxed Chromium),
  since that's the most common real path and the one this session's
  automated testing could not exercise; or (2) continue the integration the
  user asked for by wiring `lib/api/*`/`lib/fixtures/*` to real contract
  calls now that a real connected address exists to call them with. Also
  still open from prior entries: `TASKS.md` remains missing repo-wide (every
  session back to 2026-07-24 has flagged this - PLAYBOOK.md's "read this
  first" instruction points at a file that doesn't exist), and
  `AEGIS_ARCHITECTURE.md`/`decisions.md` under `packages/nextjs/docs/` still
  need reconciling against the root's locked versions.
- blockers: none.
- interfaces touched: none of the four frozen lane interfaces in
  `docs/interfaces.md`'s definition (that file still doesn't exist either).
  `docs/screen-specification.md` §6 updated as noted above - not a frozen
  interface, but stale enough to mislead the next reader if left alone.

## 2026-07-25 11:10 AM - Claude Code (CryptoVictor) - dashboard

- did: at the user's request ("integrate with whatever the backend already
  has, leave the rest mocked"), surveyed the actual state of every
  contract/service/route in the repo before touching anything (an Explore
  agent read every `.sol` file, both backend services, and every
  `lib/api/*`/`lib/fixtures/*` function). Findings worth recording since nothing
  else in the repo currently documents them: `PolicyRegistry` and `AgentVault`
  don't exist as contracts anywhere - the only deployed contracts
  (`HederaToken`, `HtsTokenCreator`, both on Hedera testnet, addresses in
  `packages/nextjs/contracts/deployedContracts.ts`) are unrelated scaffold-eth
  leftovers nothing in the UI calls. `services/cosigner` is a real skeleton -
  one endpoint, `/cosign` hardcoded to `501 not_implemented`, Safe SDK listed
  in `package.json` but never imported. `services/decision-verifier` has real
  0G Compute broker plumbing but no AEGIS-specific ALLOW/DENY logic on top.
  The Graph indexing layer doesn't exist as a line of code anywhere, despite
  `decisions.md` marking it core. But **`services/agent-service` - not in
  `PLAYBOOK.md`'s repo map, not mentioned in any prior DEVLOG entry - turned
  out to be the most complete real backend piece in the repo**: it creates a
  genuine Hedera testnet account per agent (`@hiero-ledger/sdk`), deploys a
  genuine Safe 2-of-3 smart account (`@safe-global/protocol-kit`, owners =
  [agent's own EVM address, the fixed AEGIS cosigner address, a recovery
  guardian]), and already calls this same dashboard's own working
  `/api/0g/agentic-id` route to mint a real Agentic ID once the wallet
  exists. It had a real (gitignored) `.env` with funded Hedera testnet
  operator credentials already configured - nothing in the dashboard called
  any of it. Presented this map to the user, who confirmed prioritizing
  onboarding -> `services/agent-service` over the narrower "0G-only" option.
  Built the integration: a new server-only `lib/server/agentService.ts`
  (`import "server-only"`, matching the convention already set by
  `integrations/0g/agentic-id/env.ts`) proxies to
  `AGENT_SERVICE_URL` (defaults `http://localhost:4200`, added to
  `.env.example`); three new routes under `app/api/agent-service/` forward to
  agent-service's `POST /create-agents`, `POST /agents/:id/create-wallets`,
  and `POST /agents/:id/register-agentic-id` (all carry the same
  `TODO(auth)` acknowledgment `/api/0g/agentic-id` already has - none of this
  is authenticated yet, testnet/hackathon-tolerable but not production-safe).
  Rewrote `lib/api/onboarding.ts`: `createAgent()` now takes the real
  connected wallet address as `ownerWallet` (mapping the dashboard's own
  `AgentType` strings to agent-service's different ones) and persists the
  real `agentId`/`hederaAccountId` returned into the existing
  localStorage-backed store - `createPolicy()` is untouched, correctly,
  since no PolicyRegistry exists to call. `activateProtection()` now makes
  two real sequential calls (deploy the Safe, then register the Agentic ID)
  and reports phase via an `onPhase` callback so `StepActivate.tsx` can show
  "Deploying protected wallet..." / "Registering 0G Agentic ID..." instead of
  a static label - this step now takes real seconds, not a fake 900ms delay.
  Fixed `StepRegisterAgent.tsx`'s copy, which said "Connect an agent you
  already run... AEGIS doesn't create or host the agent for you" - leftover
  from the front-aegis-main prototype's conflicting "bring your own agent"
  thesis, flagged as unresolved in every DEVLOG entry since 2026-07-24
  10:31 PM. It directly contradicted both the root's locked
  `docs/decisions.md` ("AEGIS creates the agent") and what the newly-wired
  real backend actually does (mints a brand-new Hedera account every time;
  there is no connect-existing-agent code path). Added
  `hederaAccountId`/`agenticId` to `AgentDetail` and surfaced both in
  `AgentDetailView.tsx`'s Overview tab. Verified the entire chain for real -
  not just type-checked - by curling the three new routes directly against a
  live `services/agent-service`: got back a genuine new Hedera account
  (`0.0.9745300`), a genuine deployed Safe (`0x37d32e87DDB851A6232BBce3f1fDfC669988464E`,
  with a real transaction hash), and a genuine minted 0G Agentic ID (token
  `#105`, real 0G Galileo explorer link). Sent the diff through
  `grumpy-carlos-code-reviewer`, which traced the actual `@safe-global/protocol-kit`
  source and caught a real bug before it could bite mid-demo: Safe deployment
  to a CREATE2 address is deterministic and neither `createWallet.ts` nor its
  route checks if one already exists, so if the wallet step succeeds but the
  agentic-id step fails (any transient hiccup) and the user clicks "Activate
  protection" again - the only recovery affordance the UI offers - the retry
  redeploys to the same address and hits a permanent "Safe already deployed"
  wall. Reproduced this live (confirmed the exact error) before fixing it:
  `activateProtection()` now checks its own local `walletInfo` first and
  skips straight to the agentic-id call if a wallet's already recorded.
  Also applied the review's smaller findings: added `import "server-only"`
  to the new proxy helper (matching existing convention), aligned all three
  routes' body-parsing so a malformed/empty POST can't throw before it even
  reaches the proxy, added a defensive `owners.length !== 3` check (the
  Safe's three owners come back as a bare array positionally, not named
  fields - correct today per the actual `OwnerManager.sol` contract behavior,
  but nothing enforces that contract, so a mismatch would otherwise
  silently corrupt `ProtectedWalletInfo` instead of failing loudly), removed
  an unused `evmAddress` field, and added a comment clarifying the
  client-side duplicate-name check is a same-browser UX nicety now that IDs
  are backend-issued UUIDs, not a global-uniqueness guarantee. One review
  finding intentionally left unfixed, flagged loudly instead: the 0G Agentic
  ID mint itself (`integrations/0g/agentic-id/createAgenticIdForAegisAgent.ts`,
  pre-existing code from an earlier session, not touched by this diff) has
  no idempotency check either - a retry after a partial failure there would
  mint a second, orphaned token. This was unreachable before today (nothing
  called it from the UI); it's reachable now. Fixing it means touching 0G
  integration code outside this task's scope, not a dashboard-only change.
  `check-types` and lint pass clean on every changed file. Also caught and
  reverted an unrelated, unexplained diff in `lib/fixtures/store.ts` (two
  comments missing, no logic change) that appeared in the working tree
  without any corresponding edit from this session - restored via
  `git checkout --` after confirming nothing intentional was lost.
- next: same real-MetaMask-extension manual-test gap as the prior entry
  (still can't exercise a real wallet in this sandbox), now doubled for the
  onboarding flow specifically - nobody has clicked "Register agent" ->
  "Activate protection" through a real browser with a real connected wallet
  yet, only curl'd the underlying routes directly. After that: the two
  biggest remaining pieces per the demo north star in `PLAYBOOK.md` are a
  real `PolicyRegistry` (so `createPolicy()` has something real to call) and
  real `/cosign` logic in `services/cosigner` (currently hardcoded
  `501 not_implemented`) - without both, the gate/block/payout steps 3-5 of
  the demo have nothing real to run against. Still open from prior entries:
  `TASKS.md` remains missing repo-wide, and
  `packages/nextjs/docs/AEGIS_ARCHITECTURE.md`/`decisions.md` still need
  reconciling against the root's locked versions (this session's copy fix in
  `StepRegisterAgent.tsx` resolves the *product-thesis* half of that
  disagreement in practice, but the docs themselves are still unreconciled).
- blockers: none. Everything needed to run this live (agent-service's real
  Hedera operator key, Groq key, cosigner address) was already configured in
  `services/agent-service/.env` from an earlier, undocumented session -
  worth someone confirming that funded operator account has a healthy HBAR
  balance before demo day, since every agent creation spends real (testnet)
  HBAR from it.
- interfaces touched: **new** - the HTTP contract between `packages/nextjs`
  and `services/agent-service` (three routes under `app/api/agent-service/`,
  documented above; `AGENT_SERVICE_URL` env var). `docs/interfaces.md` still
  doesn't exist to formally record this in, per every prior entry's same
  note - this is now the second real cross-service contract (after
  `/api/0g/agentic-id`) waiting for that file to exist.
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

## 2026-07-25 02:07 PM - Codex (Leunam) - Policy Engine Level 1 privacy hardening
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

## 2026-07-25 02:45 PM - Codex (Leunam) - Policy Engine Level 1 guided validation
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

## 2026-07-25 03:03 PM - Codex (Leunam) - Policy Engine Level 1 PR readiness
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
## 2026-07-25 12:43 PM - Codex - Frontend Policy integration review
- did: reviewed the uncommitted `feat/frontend-integration` Policy onboarding
  and agent-detail changes against the Level 1 contract and backend source.
  Confirmed that the Safe response supplies the required `walletId`, the Next.js
  proxy routes target the implemented create/activate endpoints, and a
  frontend-generated `policyHash`, `policyId`, and EIP-712 `CREATE_POLICY`
  signature are accepted by the real lifecycle service. Found remaining
  merge-blocking issues: activation discards the returned ACTIVE Policy,
  activation plus Agentic ID registration is not retry-safe after partial
  success, HTS action selection cannot produce an HTS asset policy, monetary
  input/display uses precision-unsafe JavaScript numbers, editing a draft
  creates a new version-1 series instead of using PATCH, and lifecycle reads
  still come from browser storage. Validation run: `yarn next:check-types`,
  `yarn next:lint`, clean `yarn next:build`, `yarn agent-service:test` (56
  passing tests), `git diff --check`, and an isolated frontend/backend hash plus
  EIP-712 parity check.
- next: fix the frontend integration blockers, add focused tests for amount
  conversion and retry/partial-success behavior, then rerun the review.
- blockers: the current activation flow cannot recover when Policy activation
  succeeds but Agentic ID registration fails; retry attempts to activate the
  already ACTIVE Policy and stops before registration.
- interfaces touched: none; this session was review-only.

## 2026-07-25 02:18 PM - Claude Code (CryptoVictor) - policy engine re-review

- did: re-reviewed the Policy Engine frontend integration after the prior
  session's blockers (non-resumable activation, non-authoritative ACTIVE
  state, float-precision amounts, HTS-incapable asset choice, browser-only
  lifecycle reads) were fixed elsewhere - the fixed version replaces this
  session's earlier, less complete implementation with a materially better
  one: `activateProtection` now checks `policy.status === "DRAFT"` before
  signing again (retry-safe - matches the pattern already used for wallet
  creation), reads the authoritative ACTIVE state back from the real backend
  (`lib/api/policies.ts`'s `getActivePolicy`) instead of trusting local state,
  handles HTS token assets end to end (`lib/policy/form.ts`), converts
  decimal/base-unit amounts with BigInt math (`lib/policy/amount.ts`, no
  floats), and versions policies correctly via a `CREATE`/`UPDATE`/`REUSE`
  planner (`lib/policy/save-plan.ts`) that diffs against the real backend's
  version history instead of always creating a new v1. Verified for real
  rather than by reading code alone: `check-types`, `lint`, and all 60
  `services/agent-service` unit tests pass; stood up the local PostgreSQL
  (`docker compose`, port 5433 - 5432 is taken by an unrelated container on
  this machine) and ran the Drizzle migration since a fresh `npm install`
  was needed for the newly-merged `drizzle-orm`/`drizzle-kit`/`pg`
  dependencies; then ran a live signed round trip (a throwaway key via
  viem's `signTypedData`, not a browser wallet) through create-agent ->
  create-wallet -> sign+create policy -> sign+activate -> re-read active
  policy (retry-safety check) against the real running services - full chain
  succeeded, with the backend's independently-recomputed `policyHash`
  matching the client-computed one exactly. Found and fixed one real bug
  this surfaced: `AEGIS_RECOVERY_GUARDIAN_ADDRESS` in
  `services/agent-service/.env` was set to an EIP-55-invalid checksum
  (`...aE61`, correct is `...AE61`) - since the frontend never sends its own
  `recoveryGuardianAddress` (confirmed by reading `ensureWallet()` in
  `lib/api/onboarding.ts` - it POSTs an empty body), every wallet creation
  was silently falling through to this broken configured default and failing
  with a viem checksum error. This blocked the *entire* onboarding flow
  end to end until fixed. Also answered a direct question from the user:
  the backend's `walletConfig.ts` (`resolveRecoveryGuardianAddress`) already
  supports any address as recovery guardian via the request body, with a
  priority chain (explicit request > `AEGIS_RECOVERY_GUARDIAN_ADDRESS` >
  the agent owner's own wallet) - but nothing in the UI exposes this choice
  to the user yet, so every agent today gets the same fixed guardian.
- next: team decision needed (recorded in TASKS.md) on whether to expose a
  recovery-guardian-address field in the onboarding UI, or leave the fixed
  server-configured guardian as the Level 1 default and revisit later.
- blockers: none. The one blocker this uncovered (bad guardian checksum) is
  fixed and verified.
- interfaces touched: none - `AEGIS_RECOVERY_GUARDIAN_ADDRESS`'s value was
  corrected, not its meaning or shape.

## 2026-07-25 02:29 PM - Claude Code (CryptoVictor) - recovery guardian UI

- did: acted on this session's own "team decision needed" note immediately -
  the user chose to expose the recovery-guardian-address choice in the UI.
  Added `recoveryGuardianMode: "DEFAULT" | "CUSTOM"` and
  `recoveryGuardianAddress` to `PolicyFormValues`
  (`lib/policy/form.ts`), shown as a new fieldset in `StepCreatePolicy.tsx`
  - gated to only appear on an agent's *first* policy version, since that's
  the one moment `ensureWallet()` actually creates the Safe (later versions
  reuse the already-persisted wallet, so the choice would be inert and
  misleading if shown again). A custom address is normalized to its correct
  EIP-55 checksum via viem's `getAddress()` before it ever leaves the browser
  - directly closing the exact failure mode the last entry's bug was an
  instance of, this time for user-typed input instead of a static `.env`
  value. Threaded `recoveryGuardianAddress` through `parsePolicyForm` ->
  `createPolicy`'s options -> `savePolicyDraft` -> `ensureWallet` ->
  the `POST .../wallet` body (previously always empty). Added two unit tests
  to the existing `lib/policy/form.test.ts` suite (checksum normalization
  using the literal miscased address from the bug this fixes, and rejection
  of a malformed address) - both pass, alongside the full existing suite (20
  tests) and `services/agent-service`'s 60 unit tests. Verified live against
  the running services: generated a fresh, arbitrary, random address and
  confirmed it came back as the actual third owner on a newly deployed real
  Safe - the backend already supported this, the UI just needed to ask.
  `check-types` and `lint` pass clean.
- next: per the new TASKS.md focus - a real browser walkthrough (actual
  MetaMask, not scripted signing) of the full onboarding flow is the one
  verification gap every session so far has shared and deferred.
- blockers: none.
- interfaces touched: none new - `POST .../agents/:agentId/wallet`'s optional
  `recoveryGuardianAddress` body field already existed; the frontend simply
  uses it now.

## 2026-07-25 03:00 PM - Claude Code (CryptoVictor) - real MetaMask walkthrough + "v2" labeling bug

- did: the user manually walked the full onboarding flow (register agent ->
  create policy -> activate) in a real browser with a real MetaMask session
  and confirmed it works end to end - this closes the one verification gap
  every session so far had deferred (prior passes only used scripted/curl
  signing with a throwaway private key, never an actual browser extension).
  While repeating the walkthrough for a second agent, the user found a real
  bug: creating a brand-new agent showed "Create version v2" instead of
  "Create policy v1" in `StepCreatePolicy.tsx`. Root cause:
  `OnboardingWizard.tsx`'s `handleAgentCreated()` set the new agent into
  state but never cleared `policy`/`wallet` - so a policy left over from a
  previously *registered-but-never-activated* agent (wizard opened, agent
  created, then abandoned before finishing) leaked into the next, genuinely
  new agent's context. Fixed by explicitly resetting `setPolicy(undefined)`
  and `setWallet(undefined)` alongside `setStep(1)` in `handleAgentCreated`.
  `check-types` and `lint` pass clean.
- next: per the user's own immediate follow-up request - add a way to fund
  a protected wallet's Safe directly from the connected MetaMask wallet (no
  such path existed; the Safe starts at a zero balance after deployment and
  the dashboard only ever showed a static, never-live balance figure).
- blockers: none.
- interfaces touched: none.

## 2026-07-25 03:40 PM - Claude Code (CryptoVictor) - fund protected wallet from MetaMask

- did: added a "Fund this wallet" action to the agent detail page's Wallet
  tab (`FundWalletCard.tsx`, new file, rendered from `AgentDetailView.tsx`'s
  `WalletTab`) - lets the operator send native HBAR from their already-
  connected MetaMask straight to the agent's Safe address, using wagmi's
  `useSendTransaction` + an imperative `waitForTransactionReceipt` (from
  `wagmi/actions`, against the app's shared `wagmiConfig`) rather than the
  reactive `useWaitForTransactionReceipt` hook, to avoid coupling balance
  refetches to a `useEffect` keyed on an unstable query-result object.
  Amounts are parsed/formatted with viem's `parseEther`/`formatUnits` at 18
  decimals, matching Hedera testnet's EVM-facing `nativeCurrency.decimals`
  (confirmed by reading viem's `hederaTestnet` chain definition directly) -
  a different unit system from the Policy Engine's own 8-decimal tinybar
  accounting (`lib/policy/amount.ts`) that must not be conflated with it.
  Also replaced the Wallet tab's static, always-stale `agent.balanceHbar`
  display with a live `useBalance` query on the Safe's address, since
  showing a stale balance right next to a working funding action would be
  actively misleading. Initially built a "wallet not connected" fallback UI
  inside the card (mirroring `ConnectModal.tsx`'s pattern), then removed it
  after tracing `app/agents/[id]/page.tsx`: that page itself renders behind
  a `ConnectGate` and only ever mounts `AgentDetailView` once
  `useConnectWallet()`'s `status === "connected"`, so the card's wallet
  address can never actually be null at render time - the fallback branch
  was dead code for a state the page architecture already rules out.
  `check-types` and `lint` both pass clean. Verified what's verifiable
  without a real wallet extension: installed `playwright-core` into the
  scratchpad (pointed at the machine's existing Google Chrome install, no
  browser download needed) and drove headless Chrome against the running
  dev server - the dashboard renders with zero console/page errors. Could
  not go further: `/agents/[id]` renders behind `ConnectGate`, and headless
  Chrome has no injected wallet provider (no real MetaMask, no EIP-6963
  announcement) to connect with, so the connected-wallet UI this feature
  actually adds could not be clicked through by the agent itself.
- next: this closes the user's explicit request. A real MetaMask
  click-through (connect -> enter amount -> confirm -> see the balance
  update) still needs the user's own browser/extension, same as every other
  wallet-signing path this session - see TASKS.md's new Current Focus.
- blockers: none.
- interfaces touched: none - sends a plain native transfer to an existing
  Safe address; no new backend endpoint involved.

## 2026-07-25 04:10 PM - Claude Code (CryptoVictor) - deposit funds on the success screen

- did: the user tried the fund-wallet feature and asked for it to be
  verified, but there was no way to identify which agent/Safe they'd used -
  agent-service keeps profiles in an in-memory `Map` (no list endpoint) and
  the "which agents did I create" record lives in the browser's own
  localStorage, neither of which the agent can see from outside a live
  browser session. Rather than asking the user to hunt down the address,
  acted on their follow-up ask directly: reused `FundWalletCard` (previous
  entry) inside `SuccessScreen.tsx`, the onboarding wizard's final screen,
  so depositing happens one step after activation instead of requiring a
  trip through the dashboard to find the agent again. Threaded
  `wallet: ProtectedWalletInfo` into `SuccessScreen` (previously not passed
  at all) by narrowing `OnboardingWizard.tsx`'s completion guard from
  `done && agent` to `done && agent && wallet` - a safe narrowing, since
  `StepActivate` (the only path that sets `done`) can't render without
  `wallet` already being set. Replaced the "Go to dashboard" button with
  "Go to agent", linking straight to `/agents/${agent.id}`, per the explicit
  ask to land on the agent's own screen after this step rather than the
  dashboard - dashboard access isn't lost, it's one click further via that
  page's own "Back to dashboard" link. Confirmed the same "wallet is always
  connected here" invariant `FundWalletCard` relies on (see previous entry)
  also holds for this new call site: `app/onboarding/page.tsx` gates the
  whole wizard behind its own `ConnectGate`, same as the agent detail page.
  `check-types` and `lint` both pass clean.
- next: the user can now click through create-agent -> activate -> deposit
  -> go to agent in one continuous flow to verify the deposit lands on the
  right Safe, without needing to separately report an address.
- blockers: none.
- interfaces touched: none - `SuccessScreen`'s prop signature gained
  `wallet`, but it's a new internal component prop, not a service contract.

## 2026-07-25 04:45 PM - Claude Code (CryptoVictor) - the real "v2" bug

- did: the user reported the same "v2" symptom again after the earlier fix
  (`handleAgentCreated` resetting `policy`/`wallet` state) was already
  verified in place. Traced the whole chain again instead of assuming that
  fix was wrong: re-verified `OnboardingWizard.tsx`'s reset is still intact,
  read `StepRegisterAgent.tsx` and `services/agent-service/src/createAgent.ts`
  end to end (confirmed `agentId` is a fresh `randomUUID()`, the EVM address
  comes from a freshly generated ECDSA keypair, and a real new Hedera account
  is created per call - so no backend ID or Safe-owner collision between
  agents). The actual root cause was one layer up: `features/onboarding/
  draft.ts` persists the wizard's progress to `localStorage`
  (`aegis.onboarding-draft`) so a page reload mid-flow doesn't lose work -
  and `clearDraft()` is only ever called from `handleActivated` (success) or
  the wizard's own Cancel -> Discard dialog. Any *other* way of leaving
  mid-flow (closing the tab, navigating elsewhere, anything short of that
  explicit Discard) leaves the draft sitting in `localStorage` indefinitely.
  The next time `/onboarding` loads - regardless of how it's reached - it
  silently resumes straight into that old, abandoned agent's
  `StepCreatePolicy` or `StepActivate`, correctly showing "Create version
  v2" for what genuinely is that old agent's second policy version - with
  nothing on screen telling the user this isn't a fresh session. A user
  intending to register a brand-new agent has no way to notice they've been
  silently handed someone else's unfinished state instead. Fixed at the
  single entry point all of this funnels through, `app/onboarding/page.tsx`:
  when the read draft is past step 0, show an explicit "Continue setting up
  {agent}?" prompt instead of ever silently choosing for the user - "Protect
  a different agent" calls `clearDraft()` and forces `OnboardingWizard` to
  mount with `initialDraft: null`, guaranteeing a clean step-0 start
  regardless of `useSyncExternalStore`'s own re-render timing.
  `check-types` and `lint` pass clean.
- next: this needs a real-browser click-through to confirm - specifically,
  abandon a draft mid-flow (e.g. navigate away from step 1 without using
  Cancel), then reload `/onboarding` and confirm the new prompt appears
  instead of a silent resume.
- blockers: none.
- interfaces touched: none.

## 2026-07-25 05:05 PM - Claude Code (CryptoVictor) - navigation papercuts

- did: the user reported three separate navigation issues in one pass, all
  in the "connect wallet" / "get to the dashboard" surface. (1) Mid-way
  through creating a new agent, there was no one-click way back to the
  dashboard: `AppTopbar`'s logo (rendered on every app page, including
  `/onboarding`) always linked to `/`, the marketing landing page, not
  `/dashboard` - so clicking it while connected sent the user somewhere
  they didn't want to go instead of back. (2) More generally, the logo
  should behave differently depending on connection state - `/dashboard`
  once connected, `/` only when not - and it didn't check connection state
  at all. (3) The connected-wallet address pill in `AppTopbar` was a
  non-interactive `<span>`; clicking it did nothing, when it should open the
  wallet modal like every other "click the wallet" affordance in the app
  already does (`Nav.tsx`'s connect button, `ConnectGate`'s connect button).
  (4) The landing page's "Launch the app" button (`Hero.tsx`) always called
  `openModal()` unconditionally, even for a wallet that's already connected,
  instead of skipping straight to `/dashboard` the way `Nav.tsx`'s own
  connected-state pill already does. Fixed all four in the same pass since
  they're the same underlying gap (call sites not checking connection status
  before deciding where to send the user): `AppTopbar.tsx` now derives
  `connected = status === "connected" && address` once and uses it for both
  the logo's `href` and to decide whether the address pill renders as a
  clickable button; `Hero.tsx` added a `handleLaunch` that checks `status`
  before choosing between `router.push("/dashboard")` and `openModal()`.
  `check-types` and `lint` pass clean.
- next: real-browser click-through - specifically confirm the logo takes you
  to `/dashboard` from mid-onboarding, clicking the address pill opens the
  wallet modal, and "Launch the app" on `/` skips straight to the dashboard
  when a wallet is already connected.
- blockers: none.
- interfaces touched: none.

## 2026-07-25 05:35 PM - Claude Code (CryptoVictor) - delete agent (off-chain only)

- did: the user asked for a way to delete agents that clears AEGIS's own
  saved records but explicitly leaves blockchain state alone (the Hedera
  account, any deployed Safe). Checked the schema first since this shapes
  scope: `services/agent-service/src/policy-engine/db/schema.ts`'s
  `aegis_wallets` and `aegis_policies` both have a `NOT NULL` FK to
  `aegis_agents.agentId` with no `onDelete` cascade configured, so a naive
  `DELETE FROM aegis_agents` would fail outright for any agent that ever
  went through onboarding. Added `deleteAgent(agentId)` to the
  `PolicyRepository` interface (`repository.ts`) with three implementations
  the compiler forced coverage of: `InMemoryPolicyRepository` (used by unit
  tests - straightforward Map deletes), `PostgresPolicyRepository`
  (`db/postgres.ts` - one transaction deleting `aegis_wallet_nonces` (by the
  agent's wallet ids) -> `aegis_wallets` -> `aegis_policies` ->
  `aegis_agents`, in FK-dependency order), and `UnconfiguredPolicyRepository`
  (throws the same "DATABASE_URL is required" error every other method on
  that stub already throws). Wired a new `DELETE /agents/:agentId` route in
  `index.ts` that clears the in-memory profile (`store.ts`, new
  `deleteAgent()`) unconditionally and additionally cascades through
  Postgres when `DATABASE_URL` is configured. On the frontend: a new
  `DELETE` proxy handler alongside the existing `GET` in
  `app/api/agent-service/agents/[agentId]/route.ts` (had to widen the
  `method` union in both `lib/api/http.ts`'s `requestJson` and
  `lib/server/agentService.ts`'s `proxyAgentServiceRequest`, which only
  allowed `GET | POST | PATCH` before), a new `deleteAgent()` in
  `lib/api/agents.ts` that calls the backend then clears the local dashboard
  cache (`deleteCreatedAgent()`, new in `lib/fixtures/store.ts`), and a
  "Danger zone" section with a "Delete agent" button on the agent detail
  page, behind the existing `ConfirmDialog` component, redirecting to
  `/dashboard` on success. `check-types`, `lint`, and all 60
  `services/agent-service` unit tests pass (the interface change meant the
  compiler caught every implementer that needed updating - none were missed
  silently).
- next: real-browser click-through, plus specifically verify a second
  DELETE of an already-deleted agent doesn't error (it shouldn't - the route
  doesn't check existence first, matching normal DELETE idempotency).
- blockers: none.
- interfaces touched: new `DELETE /agents/:agentId` on `services/agent-service`
  (in-memory + Postgres cleanup, blockchain/Safe state untouched by design);
  `PolicyRepository`'s `deleteAgent` is a new required method on that
  interface.

## 2026-07-25 07:35 PM - Claude Code (CryptoVictor) - "Invalid response from the agent service" on delete

- did: the user tried the new delete-agent feature and hit
  "Invalid response from the agent service" immediately on click. Found two
  separate problems stacked on top of each other. (1) Process hygiene, not
  code: `services/agent-service`'s dev server had *two* redundant
  `tsx watch` instances running (from 13:51 and 14:16, both stale leftovers
  from earlier in this session), and the one actually bound to port 4200
  hadn't restarted since 15:33 - its watcher stopped picking up file
  changes at some point, so it was serving code from *before* this
  session's `DELETE /agents/:agentId` route existed, returning Express's
  default 404 HTML page for the unmatched route. Confirmed by curling the
  backend directly (`Cannot DELETE /agents/...`) before touching anything.
  Killed both stale instances and started one clean one - directly
  analogous to the `.next`/dev-server collision lesson from earlier this
  session, just for this other service. (2) A real code bug underneath,
  which the stale process had been masking: `lib/server/agentService.ts`'s
  `proxyToAgentService` unconditionally called `upstream.json()` on every
  response, which throws on the genuinely empty body a `204 No Content`
  response has by definition - the exact "Invalid response from the agent
  service" string is that call's catch-fallback. Even after fixing that,
  `proxyAgentServiceRequest` still crashed: `NextResponse.json(body, {
  status: 204 })` itself throws, because the Fetch spec forbids a body on
  204/205/304 responses - confirmed by curling the proxy route directly and
  watching it go from the 404 HTML case to a bare `500` with no body at all
  once the backend was serving the real route again. Fixed both:
  `proxyToAgentService` now short-circuits on `upstream.status === 204`
  before ever calling `.json()`, and `proxyAgentServiceRequest` returns a
  bodyless `new NextResponse(null, { status: 204 })` instead of trying to
  JSON-serialize an empty body onto a null-body status. Re-verified with
  curl end to end (backend directly, then through the Next.js proxy) that a
  DELETE now returns a clean `204 No Content` both ways. `check-types` and
  `lint` pass clean.
- next: real click-through in the browser to confirm the UI's delete flow
  (button -> confirm dialog -> redirect to dashboard) now completes without
  the error.
- blockers: none.
- interfaces touched: none - this only fixes how an existing 204 response is
  passed through the proxy layer, not any route's contract.

## 2026-07-25 08:05 PM - Claude Code (CryptoVictor) - stale wallet after disconnect

- did: the user reported that disconnecting sometimes leaves a wallet
  "placeholder" showing - a specific real address
  (`0xbfE23d24192f427DBc1c12e7723321cf7999412E`) with a `0.0` HBAR balance,
  not their actual MetaMask account. That address isn't hardcoded anywhere
  in the repo (grepped for it directly), so it had to be a genuinely-earlier
  wallet connection resurfacing. Checked wagmi's docs (via context7) for how
  `useDisconnect` and reconnection actually behave: `disconnect.mutate()`
  called with no `connector` only tears down "the current connection" - if
  multiple connectors have ever been used in the same browser (this exact
  session tested MetaMask, WalletConnect, and Coinbase while debugging
  `findConnector()`'s RainbowKit matching), each gets its own persisted
  entry in wagmi's `localStorage`-backed store, and a bare
  `disconnectAsync()` doesn't necessarily clear all of them. Separately,
  `WagmiProvider`'s `reconnectOnMount` defaults to `true`, so on the next
  mount wagmi auto-reconnects using whatever's left in that persisted
  store - if a stale, never-explicitly-disconnected connection from an
  earlier test account is still sitting there, that's exactly what
  reappears, with whatever real (likely zero) balance that account
  actually has. Fixed `ConnectWalletProvider.tsx`'s `disconnect()`: it now
  reads `useConnections()` (every currently active connection, not just the
  "current" one) and calls `disconnectAsync({ connector })` for each in
  parallel, before navigating to `/` - matching wagmi's own documented
  pattern for tearing down multiple simultaneous connections, rather than
  leaving any of them for `reconnectOnMount` to pick back up later.
  `check-types` and `lint` pass clean.
- next: this needs a real multi-wallet browser test to fully confirm -
  connect with one wallet, disconnect, connect with a different one,
  disconnect again, then reload and verify nothing reconnects on its own
  and no stale account/balance ever reappears.
- blockers: none.
- interfaces touched: none.

## 2026-07-26 12:18 AM - Claude Code (CryptoVictor) - payment execution phase: DecisionReceipt, cosigner, real Hedera execution, and a Safe/Hedera EVM compatibility bug

- did: implemented the full post-TeeML payment/execution handoff described in
  `docs/aegis-current-scope.md`'s "Remaining Handoff": the AEGIS execution fee
  (1% of amount, floored at 0.01 HBAR, capped at 2.00 HBAR -
  `payment/fee.ts`), the final `DecisionReceipt` schema and EIP-712 signing
  with a dedicated `agentVerifierSigner` key separate from the agent's and
  cosigner's own keys (`payment/decision-receipt.ts`), a real `cosigner`
  service that independently re-verifies the receipt (ALLOW verdict,
  freshness, correct signer) before co-signing
  (`services/cosigner/src/cosign.ts`), and the `POST
  /actions/:requestId/execute` route wiring all of it together: rerun the
  Level 1 snapshot inside the existing advisory-locked transaction, build and
  sign the receipt, build and agent-sign the Safe payment, POST to the
  cosigner, and only commit the `UsageHold` after a confirmed real Hedera
  execution (never before). Also threaded through the explicit, fail-closed
  `AEGIS_ALLOW_HACKATHON_EXECUTION` opt-in the team decided on: a hackathon
  `TEETLS_HACKATHON_ALLOWED` verdict (not sealed, not production-grade) may
  trigger real testnet execution only when this flag is `true`, confined to
  Hedera testnet, never affecting the default `production-private-teeml`
  profile.
- did: hit a hard blocker getting the Safe's `execTransaction` to actually
  move HBAR - every attempt reverted with Safe's own `GS013` ("internal
  transaction failed"). Systematically ruled out every plausible cause via
  live testnet diagnosis: long-zero vs. the destination's canonical
  mirror-node `evm_address` (both failed - fixed `payment/destination.ts` to
  prefer the canonical address anyway, since it's still more correct, but it
  wasn't the root cause), MultiSend batching vs. a single leg (both failed),
  the destination/fee-recipient account not yet existing on Hedera (bootstrapped
  it, still failed), gas-estimation false-negative vs. genuine on-chain revert
  (confirmed genuine via the mirror node's `error_message`, which decodes to
  the literal string `"GS013"`), gas stipend size (default/50000/2300, all
  failed), target type (EOA vs. a contract with `receive()`, both failed),
  and the specific JSON-RPC relay (Hashio vs. thirdweb, both failed
  identically). Isolated the real cause with a minimal repro with no Safe
  code involved at all: a trivial contract sending native value via a bare
  `.call{value}` succeeds when called directly, but reverts unconditionally
  when the exact same code runs via `DELEGATECALL` from a minimal proxy -
  which is exactly how every Safe `execTransaction` executes its inner call.
  This is an undocumented Hedera EVM (or relay) incompatibility with a
  fundamental smart-wallet pattern, not an AEGIS bug.
- did: found the fix by testing whether Hedera's HTS system-contract
  precompile (`0x167`, `cryptoTransfer`) - a different code path than a plain
  value-carrying `CALL`, since it moves value through Hedera's native ledger
  logic instead of EVM value semantics - works from the same delegatecall
  context. It does. Rebuilt the payment builder
  (`services/agent-service/src/payment/hts.ts`, `safe-payment.ts`) so the
  Safe's single `MetaTransactionData` targets the precompile with `value: 0`
  and an ABI-encoded `cryptoTransfer` call whose `TransferList` describes the
  whole split payment (debit the Safe, credit the destination, credit the
  AEGIS fee) atomically - which also means MultiSend batching is no longer
  needed at all. Mirrored the same encode/decode logic in the cosigner
  (`hts.ts`, rewritten `cosign.ts`) so it independently re-verifies the
  payment call's transfers against the receipt before co-signing. Deleted
  the now-unused `hbar-units.ts` (weibar conversion) from both services -
  HTS `cryptoTransfer` amounts stay in native tinybar. Documented the finding
  in `docs/decisions.md` (2026-07-26 entry) and `docs/aegis-current-scope.md`
  so no future session re-attempts a naive Safe MultiSend value transfer on
  Hedera.
- did: verified the complete fix with a full fresh end-to-end run on real
  Hedera testnet - create agent, create Safe wallet, fund it, register 0G
  Agentic ID, create and activate a Policy, precheck, real 0G TeeML verify
  (`TEETLS_HACKATHON_ALLOWED`), then `POST /actions/:requestId/execute`
  returned `200 EXECUTED` with a real `transactionHash`. Confirmed via the
  Hedera mirror node that the transaction's `result` is `SUCCESS` (not a
  false-positive) and that the destination and fee-recipient balances moved
  by the exact expected tinybar amounts. All prior debug/temporary code
  (the `AEGIS_DEBUG_COSIGN`-gated branch in `cosign.ts`, seven `_debug-*.ts`
  and one `_full-flow4.ts` scratch script) was removed once the fix was
  confirmed. `tsc --noEmit` and the full unit suite (25 tests across both
  services) pass clean.
- next: run the full validation suite (typecheck, unit, integration, build)
  one more time across both services as a final check, then step 9 from the
  handoff list (exposing sanitized public audit records through The Graph)
  is the next unimplemented piece of the north-star flow.
- blockers: none.
- interfaces touched: `POST /actions/:requestId/execute` (new, on
  `services/agent-service`); `POST /cosign` on `services/cosigner` - request
  body changed from a two-leg Safe MultiSend payload (`legs`,
  `agentSignature`) to a single `paymentCall` (`MetaTransactionData`
  targeting the HTS precompile); `buildPaymentLegs` renamed to
  `buildPaymentCall` (now returns one `MetaTransactionData`, not a two-tuple);
  `assertLegsMatchReceipt` renamed to `assertPaymentCallMatchesReceipt`;
  `resolveDestinationEvmAddress` is now async (queries the Hedera mirror node
  for an account's canonical `evm_address`, falling back to the long-zero
  alias only when none exists).
## 2026-07-25 12:35 AM - Codex (Leunam) - The Graph onchain read layer

- did: created and worked only on `feat/thegraph-aegis-onchain-data-layer`
  after confirming that the starting worktree was clean. Audited the existing
  Foundry/Hardhat, Hedera, Safe, 0G Agentic ID, TeeML, policy-engine, dashboard,
  Docker, PostgreSQL, and identifier boundaries before implementation. Added a
  non-upgradeable singleton `AegisTeeValidationRegistry` with final admin and
  recorder roles, immutable request idempotency, fixed-size sanitized fields,
  ALLOW/DENY-only verdicts, a domain-bound `recordHash`, and the exact indexed
  event. Added the strict root-only `tee-smartcontract-validation` loader,
  one-time deploy/verify workflow, sanitized public-artifact generation,
  example file, ignore rules, typed backend recorder port/adapter, and the
  required real-TeeML integration TODO. No deployment transaction was
  broadcast because the exact ignored secret file was not present; generic
  `.env` files were never used as a fallback.
- did: added isolated local Graph Node v0.44.0, PostgreSQL 16, and IPFS 0.34.1
  services with loopback-only ports, persistent volumes, and healthchecks.
  Added complete RPC preflight, create/deploy/status/smoke/E2E scripts and
  strengthened receipt checking to inspect every transaction in the full
  64-block window instead of accepting a small valid sample. Implemented
  separate Hedera and 0G Subgraphs with generated ABIs/manifests, deterministic
  event IDs, immutable facts, summaries, dynamic Safe templates, Matchstick
  tests, official linter integration, and no HTTP, contract-call, private-data,
  or cross-chain mapping behavior. The real 0G Agentic ID Subgraph was deployed
  locally at deployment `QmcUzJnzLLaHoqFDKi2YAS7j13KMRvwAP99u4VP94bPsaj`,
  synchronized successfully, and returned the independently verified token 102
  mint. Hedera remains unindexable through the tested public Hashio endpoint:
  the live Graph Node sees receipt block-hash mismatches and the final preflight
  found another recent transaction with no receipt.
- did: replaced confirmed/historical dashboard reads with server-only GraphQL
  clients and same-origin APIs. Added static variable-based queries, cursor
  pagination, block-pinned cross-chain snapshots, exact filters, search,
  source-specific freshness/errors, overview metrics, unified agent views,
  0G identity views, TeeML validation views, Safe execution views, policy
  views, detail routes, and an explicit unsupported payment state because no
  real business-payment event exists. Cross-chain joins remain honest under
  missing sources, duplicate candidates, truncation, mismatches, source
  failures, and records beyond the first 100 rows. Removed the Mirror Node
  proxy/hook and runtime fixture/local-storage/RPC fallbacks from the onchain
  read model. The only remaining `useBalance` is connected-wallet UX, outside
  confirmed history. A production HTTP smoke returned the real 0G token 102
  through GraphQL while visibly marking Hedera unavailable and the relationship
  ambiguous.
- did: documented official The Graph sources and installed versions, all six
  recommended Subgraph skill files, architecture and CROPS boundaries,
  cross-chain join semantics, the named query catalog, privacy rules, current
  network limitations, sponsor-eligibility uncertainty, and the complete
  future-only Audit Copilot/Subgraph MCP boundary. Added sanitized evidence for
  the Graph Node stack, RPC behavior, real 0G deployment/sync/query, Hedera
  blocker, and production dashboard GraphQL response. The mandatory human-style
  Grumpy review was rerun after pagination fixes and reported no remaining HIGH
  or MEDIUM frontend finding.
- validation: registry Solidity tests passed 19/19; loader/deploy/privacy tests
  passed 18/18; agent-service tests passed 70/70; Matchstick passed 3/3 per
  Subgraph; official Subgraph Linter reported no issues; Subgraph codegen and
  builds passed; the 0G preflight, deploy, smoke, status, and E2E passed against
  real indexed data; frontend tests passed 83/83, typecheck passed, aggregate
  lint passed, production build passed, Docker Compose config passed, and
  `git diff --check` passed. The deploy command failed closed without printing
  provider or secret details, Hedera preflight/deploy/smoke/E2E failed honestly,
  and no fake artifact or fallback was generated.
- next: provide the exact ignored root `tee-smartcontract-validation` file for
  the single Hedera Testnet registry deployment; replace Hashio with a
  Graph-Node-compatible Hedera RPC and synchronize the generated Hedera
  manifest; connect the real verified 0G/TeeML response to the recorder port;
  prove TeeML -> Hedera -> GraphQL -> dashboard end to end; obtain The Graph
  mentor confirmation that local Graph Node mode is prize-eligible; and perform
  final real-browser review.
- blockers: the dedicated deploy file and resulting registry artifact/address/
  transaction/start block are absent; the tested Hedera RPC does not preserve
  Graph-Node-required block/receipt consistency; the real TeeML verified-result
  integration is not merged; and local-node prize eligibility requires human
  sponsor confirmation. No commit was created.
- interfaces touched: new registry function/event and public deployment
  artifact contract; new `TeeValidationRegistryRecorder` backend port; new
  Hedera and 0G GraphQL schemas/endpoints; new server-only dashboard onchain
  APIs; new `THEGRAPH_HEDERA_SUBGRAPH_URL`, `THEGRAPH_0G_SUBGRAPH_URL`, optional
  `THEGRAPH_GATEWAY_API_KEY`, and local Graph Node status settings; exact
  deployment variables remain isolated to `tee-smartcontract-validation`.

## 2026-07-25 11:40 PM -03 - Codex - The Graph core completion and review hardening

- did: completed the branch-level The Graph core and superseded the earlier
  point-in-time entry above. Self-hosted Graph Node eligibility is now
  **HUMAN-CONFIRMED / RESOLVED**. The reproducible loopback-only stack remains
  Graph Node `v0.44.0`, PostgreSQL 16, IPFS `v0.34.1`, and the read-only Hiero
  JSON-RPC Relay `v0.78.1`. The separate 0G Subgraph is healthy/synced at CID
  `QmaVs13eKCFLV9MAoZNkb4S5oqZ7ToV2nyVPu6kGHQqbY9`; the final live GraphQL
  sample at block `45993590` returned 117 identities/mints, 16 transfers, 133
  owner-change facts, 14 authorization events, two delegation sets, and the
  independently verified AEGIS token 102 mint. These are point-in-time full
  configured-registry counts, not a claim that every identity belongs to AEGIS.
- did: retained the singleton non-upgradeable `AegisTeeValidationRegistry`,
  fixed-size sanitized event/record hash, role separation, duplicate-request
  rejection, generated ABI flow, artifact-driven Hedera manifest generation,
  and the exact root-only `tee-smartcontract-validation` loader. Hardened the
  deployment path with owner-only regular-file checks, a pre-broadcast pending
  journal, deterministic raw-transaction recovery, conclusive status-zero
  failure acknowledgement, explicit hash-bound redeploy authority, and an
  isolated chain-ID-296 Anvil integration that deploys, verifies roles/code,
  and records a separately signed `AUTHORIZED CONTRACT/INDEXING TEST RECORD`.
  The exact production secret file is still absent, so no real Hedera registry
  address, transaction, block, or deployment artifact is claimed and no
  broadcast was attempted.
- did: finalized the separate Hedera/0G schemas, deterministic event-only
  mappings, immutable facts, Safe dynamic data source, full Agentic ID event
  surface, generated bindings, Matchstick tests, official linter gates, strict
  repeated-read preflights, deploy/status/smoke/E2E scripts, typed static
  GraphQL clients, cursor pagination, exact filters/search, `_meta` freshness,
  partial cross-chain joins, and GraphQL-only dashboard APIs/pages. The live
  read-only Audit Copilot now has six constrained 0G intents with indexed
  entity/transaction/block citations; Hedera-backed intents remain explicitly
  gated on real Hedera entities. No free-form GraphQL, RPC read, explorer,
  fixture, or private-database fallback was added.
- did: fixed every independent review finding. Safe creation now uses a durable
  PostgreSQL state machine (`INITIALIZED`, `PREPARED`, `BROADCAST`, `FAILED`,
  `COMPLETED`), deterministic salt/address, a unique `(agent_id, network_id)`
  reservation, a dedicated advisory-lock pool, restart/replica reconciliation,
  a legacy-wallet pre-broadcast gate, nullable transaction provenance when a
  deployed Safe must be reconciled without inventing a hash, and explicit retry
  only after a conclusively reverted receipt. Guardian provenance is source-
  based and immutable before retry. Drizzle migrations `0003` and `0004` add
  the durable model and FAILED checkpoint. Removed the unused decision-verifier
  starter service, obsolete dashboard components/fixtures, direct historical
  RPC hooks, dead policy workflow, and the legacy Agentic ID wrapper that had
  manufactured a placeholder policy hash. The canonical real 0G Agentic ID API,
  contract ABI, storage integration, verified address, and deployment history
  remain intact and require a real bytes32 policy hash.
- did: aligned active product documentation with the frozen scope: no local
  TeeML verdict fallback, detailed reason, recovery/insurance/payout feature,
  or nonexistent `PolicyRegistry`/`AgentVault` producer is claimed. Added the
  canonical continuation handoff, exact task IDs/commands/acceptance evidence,
  live query catalog, architecture, cross-chain join, Audit Copilot security
  model, integration status, runbook, official-source ledger, and sanitized
  evidence. The previously stale TASKS fixture path was corrected.
- validation: Solidity registry tests passed 19/19 and the JavaScript/Anvil
  deploy-loader-privacy-crash-safety suite passed 48/48; gas report: deployment
  1,225,076 gas, bytecode size 6,064 bytes, and `recordTeeMLValidation` average
  40,201/max 64,197 gas. Agent-service unit tests passed 82/82 and PostgreSQL
  integration passed 16/16 against an isolated ephemeral database, including
  two replicas with query/lock pools at max 1; typecheck, lint, and build passed.
  Next.js tests passed 86/86, sequential typecheck passed, aggregate lint passed,
  and the production build passed without the deleted legacy route. Subgraph
  infrastructure tests passed 5/5, Hedera Matchstick 4/4, 0G Matchstick 5/5,
  codegen/build passed, and both official linter runs reported no issues. Real
  0G status/smoke/E2E passed at block `45993590` with no indexing errors. Docker
  Compose config, cosigner build, evidence JSON parsing, privacy/boundary checks,
  and `git diff --check` passed. Hedera strict preflight still terminates
  honestly in `HEDERA_GRAPH_RPC_BLOCKED`; no check was weakened.
- next: execute the external tasks in
  `docs/handoffs/THEGRAPH_INTEGRATION_CONTINUATION.md` in order: operate the
  dedicated Testnet Mirror Node -> Hiero relay path until
  `HEDERA_GRAPH_RPC_READY`; locally create the ignored exact deployment file and
  deploy/verify the singleton once; generate/deploy/sync the Hedera Subgraph and
  submit the explicitly labelled authorized indexing test; wire the real
  private/TEE/schema/hash-verified TeeML artifact; then add only real sanitized
  business event producers and Hedera Audit Copilot intents. The human explicitly
  authorized committing this completed branch and opening a PR to `main`; the PR
  must not be merged automatically.
- blockers: no internal core defect remains. External completion dependencies
  are `TG-DEPLOY-001` (exact ignored deploy file/funded deployer),
  `TG-HEDERA-RPC-001` (dedicated consistent Hedera data stack),
  `TG-TEEML-E2E-001` (real verified TeeML producer), `TG-EVENTS-001` (missing
  sanitized business event producers), and `TG-AUDIT-COPILOT-001` (live Hedera
  entities). These do not justify fake data or a read fallback.
- interfaces touched: the fixed TeeML registry function/event and public
  artifact schema; typed verified-TeeML writer; Hedera/0G GraphQL schemas and
  dashboard APIs; durable wallet-creation repository/state/provenance types;
  migrations `0003`/`0004`; and the exact server-only The Graph endpoint
  variables. No secret interface or private context was added to The Graph.

## 2026-07-26 12:02 AM -03 - Codex - Resolve main integration for The Graph PR
- did: merged `origin/main` at `f77b3e0` into
  `feat/thegraph-aegis-onchain-data-layer` to resolve PR #11 without rebasing or
  discarding either implementation. Preserved the newly merged real 0G
  semantic-verifier and explicit hackathon TeeTLS profile while retaining the
  durable Safe deployment state machine, GraphQL-only dashboard boundary, and
  separate Hedera/0G Subgraphs. Rebased the concurrent Drizzle histories at the
  migration level by retaining main migrations `0003` through `0011` and
  regenerating the complete Safe operation schema as migration
  `0012_heavy_ben_urich`, eliminating duplicate migration numbers and generated
  snapshot conflicts.
- did: removed the runtime Agentic ID placeholder policy commitment introduced
  by the merged branch. Agentic ID registration now requires the real non-zero
  hash of the active durable Policy selected for the exact agent and Safe
  wallet; missing Policy state fails before minting. Added regression coverage
  for the missing-policy gate. Updated the The Graph handoff and status docs to
  reflect that the verifier module is merged but the live hackathon TeeTLS
  artifact remains intentionally ineligible for the Hedera registry because it
  is non-private, non-sealed, and lacks independent byte-for-byte content
  commitment verification.
- validation: agent-service typecheck/build passed; combined unit tests passed
  221/221; PostgreSQL integration tests passed 45/45 against the healthy local
  isolated test database and applied the complete migration chain through
  `0012`. Next.js onchain/frontend tests passed 86/86, typecheck passed, and the
  production build completed. Registry tests passed 19/19 Solidity plus 48/48
  loader/deploy/privacy/Anvil tests. The Graph codegen/build passed, infrastructure
  tests passed 5/5, Hedera Matchstick passed 4/4, 0G Matchstick passed 5/5, and
  both Subgraph linter runs reported no issues. Aggregate lint, privacy/boundary
  checks, and `git diff --check` passed.
- next: commit this merge resolution, push the updated branch, and confirm PR
  #11 is mergeable against `main`; do not merge it automatically. External
  continuation remains ordered in
  `docs/handoffs/THEGRAPH_INTEGRATION_CONTINUATION.md`.
- blockers: no internal merge or core defect remains. Real completion still
  depends on `TG-DEPLOY-001`, `TG-HEDERA-RPC-001`, an eligible production-private
  and byte-for-byte verified `TG-TEEML-E2E-001` artifact, and the documented
  onchain event producers. The live demo TeeTLS result is never relabelled as
  production TeeML evidence.
- interfaces touched: active-Policy selection for Agentic ID registration,
  merged TeeML service boundary, Drizzle migration chain through `0012`, and
  canonical The Graph continuation/status documentation. No secret, private
  semantic context, fake verdict, RPC-read fallback, or database-history
  fallback was added.

## 2026-07-26 05:30 AM - Claude Code (CryptoVictor) - dashboard payment-flow integration + critical auth fix

- did: wired the previously backend-only payment/action flow (Level 1 precheck
  -> 0G TeeML verify -> Safe co-signed execute, already verified live by the
  team via curl/scripts) into the Next.js dashboard for the first time:
  Agentic ID registration and a new "Actions" tab
  (`features/agents/components/ActionsPanel.tsx`) on the agent detail page, an
  optional trusted-service (`TRUSTED_SERVICE_DESCRIPTOR_V1`) semantic-rule
  section on policy creation (`StepCreatePolicy.tsx`, `lib/policy/form.ts`,
  `lib/policy/hash.ts` - TeeML verify has nothing to match against without one),
  and four new same-origin proxy routes plus `lib/api/actions.ts` client
  wrappers.
- did: closed a real gap the existing static-env agent-bearer auth couldn't
  cover - agents created dynamically through onboarding get a random UUID
  agentId unknowable in advance, so `AEGIS_AGENT_AUTH_TOKENS_JSON` can never be
  pre-provisioned for them. Added dynamic per-agent token issuance at
  agent-creation time (`services/agent-service/src/store.ts`'s
  `issueAgentAuthToken`/`resolveAgentIdForAuthToken`), a composable
  authenticator (`policy-engine/agent-auth.ts`'s `createStoreAgentActorAuthenticator`/
  `composeAgentActorAuthenticators`, coexisting with the static env map), and a
  new internal-only `GET /internal/agents/:agentId/auth-token` route gated by a
  shared secret (`AEGIS_DASHBOARD_INTERNAL_TOKEN`) mirroring the existing
  `AEGIS_AGENTIC_ID_INTERNAL_TOKEN` dashboard<->service pattern.
- did: a `grumpy-carlos-code-reviewer` pass caught a critical vulnerability in
  that first implementation before it shipped - the four new proxy routes
  (register-agentic-id, precheck, TeeML verify, execute) fetched and used
  *any* named agent's real bearer token with no check that the caller actually
  owned that agent. An agentId is not a secret (visible in the URL, returned by
  the already-unauthenticated `GET /agents/:agentId`), so this would have let
  anyone who named an agent trigger a real Hedera testnet payment from its Safe,
  up to that policy's own limits, with zero wallet signature. Fixed by adding a
  new EIP-712 `AgentActionAuthorization` commitment
  (`packages/nextjs/lib/policy/action-auth.ts`, distinct domain from the
  existing `PolicyCommitment`/`DecisionReceipt` types to avoid any signature
  confusion) that the operator's connected wallet signs fresh before every one
  of the four calls, binding agentId + action + a hash of the exact request
  content + an issuance timestamp (300s freshness window). The Next.js server
  (`lib/server/agentService.ts::verifyAgentActionAuthorization`) recovers the
  signer, then independently confirms it against the agent's real `ownerWallet`
  (fetched from the existing `GET /agents/:agentId`) before ever fetching that
  agent's bearer token - closing the gap the same way the existing Policy
  Engine routes already prove operator ownership, just verified in the Next.js
  layer instead of the backend since these routes authenticate as the agent,
  not the operator.
- did: separately, while testing, brought the dashboard's 0G-backed onchain
  views back from "unavailable" by standing up the local Graph Node stack
  (`docker compose -f compose.thegraph.yaml`; query port remapped to 18000
  locally only, since 8000 was already held by an unrelated container on this
  machine) and deploying the 0G subgraph - build hash
  `QmaVs13eKCFLV9MAoZNkb4S5oqZ7ToV2nyVPu6kGHQqbY9` matches the team's
  previously-verified deployment exactly, confirming reproducibility.
  `THEGRAPH_HEDERA_SUBGRAPH_URL` was deliberately left unset: no TeeML registry
  contract has been deployed to real Hedera testnet (`TG-DEPLOY-001`/
  `TG-HEDERA-RPC-001`, external Mirror Node infra, unrelated to this session),
  so there is nothing for a Hedera subgraph to index yet; the dashboard's
  honest "unavailable" message there is correct, not a bug.
- validation: `services/agent-service` unit suite passes 238/239 (the one
  failure is pre-existing and unrelated to this work, confirmed via `git
  stash`); new tests for the auth bridge (`store.test.ts`,
  `agent-auth.test.ts`, `index.test.ts`'s new internal-route suite) and for the
  EIP-712 ownership check (`lib/policy/action-auth.test.ts`, 13 new cases
  covering signature recovery, freshness, and tamper-detection on every bound
  field) all pass. `packages/nextjs` `check-types`, `next lint`, and `next
  build` are clean; a live smoke test against the real running dev server
  confirmed all four new proxy routes correctly round-trip through the new
  internal-token bridge (404 for an unknown agent, proving the whole chain
  works end to end).
- next: a real-browser manual QA pass of the new Actions tab (same gap pattern
  the onboarding flow had before its own manual pass) and a full live
  Hedera+0G execute run through the new UI specifically (the underlying
  precheck/TeeML/execute logic itself is unchanged and already
  live-verified per the "payment execution phase" entry above; only the new
  UI/auth-bridge layer on top of it is unverified live end-to-end). Carlos's
  two minor findings (internal-token minimum-length check;
  `computeTrustedServiceMetadataHash` never independently re-verified
  server-side) remain open, non-blocking. See `TASKS.md`'s new "dashboard
  payment-flow integration" section for the full punch list.
- blockers: none for the demo. The Graph's Hedera side remains blocked on the
  same pre-existing external dependencies as before (`TG-DEPLOY-001`,
  `TG-HEDERA-RPC-001`) - unrelated to and unchanged by this session.
- interfaces touched: new `GET /internal/agents/:agentId/auth-token`
  (agent-service, internal-secret-gated); new `AEGIS_DASHBOARD_INTERNAL_TOKEN`
  env var (both services); new EIP-712 `AgentActionAuthorization` commitment
  and its three required request headers
  (`x-aegis-operator-address`/`-signature`/`-issued-at`) on the four new
  Next.js proxy routes - **loudly flagging this one**: any future route
  reusing `proxyAgentServiceRequestAsAgent` must call
  `verifyAgentActionAuthorization` first, or it reopens the exact
  any-named-agent vulnerability described above. New optional
  `TRUSTED_SERVICE_DESCRIPTOR_V1` semantic-rule section in policy creation.
  `THEGRAPH_0G_SUBGRAPH_URL` now set locally; `THEGRAPH_HEDERA_SUBGRAPH_URL`
  still intentionally unset.

## 2026-08-05 04:03 PM - AI agent - web3 core & contracts (auth hardening)

- did: authenticated the three `services/agent-service` routes that had zero
  auth at all - `POST /create-agents`, `POST /agents/:agentId/create-wallets`,
  and `DELETE /agents/:agentId` - each already flagged with a `TODO(auth)`
  comment on the Next.js proxy side. Before this, anyone who could reach the
  backend could register an agent under any `ownerWallet` (real Hedera
  account, operator-funded), deploy a real Safe for any existing agentId, or
  delete another operator's agent, with no proof of key possession. Added a
  new EIP-712 `AgentCommitment` scheme (`services/agent-service/src/
  policy-engine/{types,auth}.ts`, domain "AEGIS Agent Lifecycle", distinct
  from both the existing `PolicyCommitment` and the dashboard-only
  `AgentActionAuthorization` to avoid signature-domain confusion) covering
  `CREATE_AGENT`/`CREATE_WALLET`/`DELETE_AGENT` in one shared struct that
  blanks fields per operation (same convention `PolicyCommitment` already
  uses), with a 300s freshness window. `CREATE_WALLET`/`DELETE_AGENT` resolve
  the existing owner via a new `resolveAgentOwnerAddress` (in-memory store
  first, durable Postgres `AgentRecord` fallback - required because the
  in-memory profile store doesn't survive a restart, and several existing
  `walletCreation.test.ts` cases exercise exactly that restart path).
  `CREATE_AGENT` additionally gets a same-signature replay guard (in-memory,
  TTL'd to the freshness window) since, unlike the other two operations,
  it has no natural idempotency backstop - a captured valid signature could
  otherwise be replayed to mint real Hedera accounts on the operator's dime
  for as long as it stayed fresh.
- did: mirrored the scheme on the frontend (`packages/nextjs/lib/policy/
  agent-commitment.ts`, byte-for-byte against the backend's domain/types/
  field-blanking - verified field-by-field in review), wired the three
  Next.js proxy routes (`forwardOperator: true`, now also forwarding a new
  `x-aegis-operator-issued-at` header alongside the existing address/
  signature pair) and updated every call site that reaches these three
  routes to sign before calling: `createAgent`/`ensureWallet` (via
  `savePolicyDraft`/`createPolicy`) and `deleteAgentServiceProfile` in
  `lib/api/onboarding.ts`, `deleteAgent` in `lib/api/agents.ts`, and the UI
  (`StepRegisterAgent.tsx`, `StepCreatePolicy.tsx`, `AgentDetailView.tsx`,
  `app/dashboard/page.tsx`) supplying a `useSignTypedData()`-backed signer.
- did: a `grumpy-carlos-code-reviewer` pass on this before calling it done
  caught two real gaps that are now fixed (the `CREATE_AGENT` replay guard
  above, and an `agentId` canonicalization inconsistency within the
  `create-wallets` handler where the auth check and the operational code
  path normalized the param differently) plus two documented, deliberately
  NOT fixed in this pass:
  - **Proof-of-ownership stops impersonation, not resource exhaustion.**
    Anyone can still call `POST /create-agents` by generating a fresh
    throwaway keypair and self-signing a claim to own it - that costs the
    attacker nothing and still triggers a real operator-funded Hedera
    `AccountCreateTransaction` every time (`createAgent.ts`, no rate limit,
    no dedup, no cost). This fix closes "someone acting as your wallet
    without your signature"; it does **not** close "anyone spamming
    account creation with disposable keys." If Hedera-funds exhaustion via
    spam matters (the original report says it does), that needs something
    orthogonal - rate limiting, a stake/deposit, or an allowlist - as a
    follow-up, not implied-closed by this fix.
  - **UX regression, not a bug:** `ensureWallet()` (used by every
    `savePolicyDraft` call, i.e. every "save policy" action, not just first
    wallet creation) now signs a fresh `CREATE_WALLET` commitment on every
    call, even when the wallet already exists and the backend will just
    return it idempotently - one extra wallet-signature popup per save that
    didn't exist before this session. Deliberately did not add a local-cache
    short-circuit for this, since `ensureWallet`'s existing "always
    reconcile against the backend, never trust the local draft cache"
    comment documents a previously-fixed bug class this would risk
    reopening; flagging as a follow-up UX polish item instead.
- validation: `services/agent-service`'s full unit suite passes 245/246 (the
  1 failure is the same pre-existing environmental issue as prior sessions -
  confirmed via `git stash` it fails identically on the unmodified baseline,
  because this machine's `.env` sets a real `DATABASE_URL` which changes
  which branch one `walletCreation.test.ts` case hits). Added a new
  `agentLifecycleAuth.test.ts` (7 cases: unsigned/wrong-signer/stale/
  tampered-body/replayed for `create-agents`, wrong-signer/tampered-field
  for `create-wallets`, no-op-vs-authenticated for `delete`) plus updated
  `walletCreation.test.ts` to sign every request with a real keypair
  instead of a placeholder address string, and seeded a durable
  `AgentRecord` in the tests that simulate a restart (needed once ownership
  resolution started depending on it). `packages/nextjs` `check-types`,
  `lint`, and `next build` all pass clean.
- next: decide whether `CREATE_AGENT` resource-exhaustion (rate limiting /
  staking / allowlisting) and the `ensureWallet` double-signature UX
  regression are worth separate follow-up work, or accepted as-is for the
  demo.
- blockers: none.
- interfaces touched: new EIP-712 `AgentCommitment` commitment (backend
  `services/agent-service/src/policy-engine/{types,auth}.ts`, frontend
  `packages/nextjs/lib/policy/agent-commitment.ts` - **keep these two in
  sync by hand, same as the existing `PolicyCommitment` mirror**, since a
  drift silently breaks every signature with an unhelpful
  `invalid_operator_signature`) and a new required
  `x-aegis-operator-issued-at` header (alongside the existing operator
  address/signature pair) on `POST /create-agents`, `POST /agents/:agentId/
  create-wallets`, and `DELETE /agents/:agentId` (only when the agent
  already exists for DELETE - deleting an already-deleted/nonexistent agent
  remains an unauthenticated no-op, unchanged from before, since there is
  no state to protect and `GET /agents/:agentId` was already fully
  unauthenticated and already leaks the same existence information).
