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

## 2026-07-25 11:47 AM - Claude Code (Rodrigo) - agent detail screen rework
- did: reworked `/agents/[id]` on Rodrigo's request. Header band
  (`AgentHeader` in `features/agents/components/AgentDetailView.tsx`) now
  carries Balance, Connected and the protected-wallet facts (truncated Safe
  address + HashScan link + network) next to the agent profile, with a thin
  owners strip underneath listing the three signers and the `2-of-3`
  threshold - this is where the removed `Wallet` tab's content went. Tabs are
  now `Overview | Policy | Settings`: `Wallet` folded into the header,
  `Activity` folded into Overview. Overview dropped the Agent/Capabilities
  cards and became macro numbers + logs - it reuses the dashboard's
  `StatStrip` and `PeriodFilter`, but the stats are derived client-side from
  that agent's own entries via the new `lib/utils/stats.ts`
  (`filterByPeriod` + `summarizeActivity`, which `getDashboardStats` now
  shares instead of inlining the same math). Logs render through the new
  `features/agents/components/AgentLogTable.tsx` (When + log id, Action,
  Verdict, Reason, Amount) with an All/Approved/Denied filter; the dashboard's
  `ActivityTable` stays untouched since it needs the agent column. The
  Capabilities card moved into the Policy tab so nothing was lost with the
  card removal. Settings gained the key-export flow Rodrigo asked for: a
  prominent "Reveal AEGIS private key" section opening
  `features/agents/components/RevealPrivateKeyDialog.tsx`, a three-gate
  dialog (acknowledge that the agent becomes permanently unavailable on
  AEGIS -> 6-digit 2FA challenge -> re-type the agent name) reusing the
  existing `Stepper`. The 2FA field is deliberately a shell marked
  `TODO(2FA)`: the front-end environment is ready, the authenticator flow is
  not. It calls the new `revealAgentPrivateKey()` in `lib/api/agents.ts`
  (front-end mock layer, no backend involved), which validates the code shape
  and then always answers `unavailable` - it never fabricates a key. Result
  type `KeyExportResult` added to `lib/types/aegis.ts`. Also added
  `.claude/launch.json` so the agent tooling can boot the Next.js dev server.
- next: visual pass with Rodrigo on the new header band (the preview pane
  came up blank against the already-running dev server on port 3000, so the
  layout has not been eyeballed yet), then wire the real 2FA challenge and
  key-export endpoint once the backend exposes them.
- blockers: none. Note `TASKS.md` is referenced by the playbook but does not
  exist in the repo, so no task list was updated.
- interfaces touched: none on the cross-lane contracts. Front-end only:
  `revealAgentPrivateKey(agentId, twoFactorCode) -> KeyExportResult` is the
  shape the backend key-export endpoint should fill.
