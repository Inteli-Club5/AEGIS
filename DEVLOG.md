# DEVLOG

Append-only. One entry per work session (human or AI). Newest at the top. This is
how async and shared work stays coherent: read the top entries to know where we
are. Format:

```
## YYYY-MM-DD HH:MM - <name or agent> - <lane>
- did: <what changed, files/PRs>
- next: <the single next task>
- blockers: <none | what + who can unblock>
- interfaces touched: <none | which, and the change>
```

---

## 2026-07-24 13:20 - Claude Code (CryptoVictor) - docs
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

## 2026-07-24 13:32 - Codex (Leunam) - tooling
- did: installed the `ethskills` Codex skill from
  `austintgriffith/ethskills` root `SKILL.md` into
  `/home/inteli/.codex/skills/ethskills` and verified the installed metadata.
  No AEGIS product task was started.
- next: freeze interfaces in docs/interfaces.md with the team (first Shared
  task in TASKS.md), then create a GitHub remote and push.
- blockers: none.
- interfaces touched: none.

## 2026-07-24 - Claude Code (CryptoVictor) - setup
- did: executed SETUP.md end to end per PLAYBOOK.md - merged scaffold-hbar
  (Hedera-wired scaffold-eth-2, submodules included) into the repo root, cloned
  0g-compute-ts-starter-kit into services/decision-verifier, wrote the
  services/cosigner skeleton, moved the architecture doc to
  docs/AEGIS_ARQUITETURA_REFATORADA_V3_FINAL.md, prepended the "start here"
  block to AGENTS.md/CLAUDE.md (and added an AEGIS-specific section to
  CLAUDE.md), extended .gitignore (.env, .next, foundry out/cache/broadcast),
  ran yarn install + service npm installs, git init on `main`, first commit.
  No TASKS.md item was started - scope was setup only, per instructions.
- next: freeze interfaces in docs/interfaces.md with the team (first Shared
  task in TASKS.md), then create a GitHub remote and push.
- blockers: none. Foundry deploy and dashboard dev server were not run -
  deploying needs a funded Hedera testnet key, left for whoever owns that step.
- interfaces touched: none.

## 2026-07-24 20:43 - Claude Code (Rodrigo) - dashboard
- did: first two AEGIS screens from Rodrigo's wireframe, on branch `front`.
  Replaced the scaffold landing in `packages/nextjs/app/page.tsx` with the
  AEGIS screen (title + "Connect your Wallet" opening the RainbowKit modal),
  added `packages/nextjs/app/dashboard/page.tsx` ("Dashboard starts here" +
  Back), set the app metadata title to AEGIS in `app/layout.tsx`. Connecting
  from the landing pushes to `/dashboard`; the redirect only fires for a
  connect started on that screen (tracked with a ref) so Back from the
  dashboard doesn't bounce straight back. When already connected the landing
  button reads "Enter Dashboard". Added `.claude/launch.json` so agents can
  boot the dashboard preview. `yarn install` had to be run first (no
  node_modules in this clone); `yarn next:build` passes, `/` and `/dashboard`
  both prerender static.
- next: dashboard shell proper - replace the scaffold Header branding and the
  Debug/Block Explorer nav with AEGIS nav, then the protect-agent / policy
  form screens. Note this is Leunam's lane in PLAYBOOK.md ownership; Rodrigo
  said in-session he is taking front end too, worth a verbal sync before
  either of us touches `packages/nextjs` further.
- blockers: none for the code. Could not visually confirm in the browser -
  the in-app browser refused to navigate to http://localhost:3000 twice
  ("navigation denied or failed"); the dev server itself is up and returning
  200 (`preview_logs`). Verification so far is the build only.
- interfaces touched: none.
