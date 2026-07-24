# AEGIS Playbook

Single source of truth for how we build AEGIS at ETHGlobal Lisbon. Humans and AI
agents both follow it. Keep it short; if a rule stops helping, change it here.

---

## For AI agents - read this first, every session

1. **Read** `PLAYBOOK.md` (this file), then `TASKS.md`, then the newest entry in
   `DEVLOG.md`. Read the relevant lane's code before editing.
2. **Work** only inside the current owner's lane (see Ownership). Do not refactor
   another lane without a note in `TASKS.md`.
3. **Commit small and often** with the convention below. ETHGlobal judges the
   git history - no giant single commits.
4. **At the end of the session, ALWAYS append a `DEVLOG.md` entry** (format below)
   and update `TASKS.md` (check off done items, set the new top task).
5. If you changed a **shared interface** (receipt schema, an API contract, an
   ABI, a deployed address), say so loudly in the DEVLOG entry and update
   `docs/interfaces.md`.
6. Never print or commit private keys. `.env` only, `.env.example` for shape.

---

## Repo map

```
packages/nextjs         dashboard (Next.js + RainbowKit + wagmi)   -> Leunam
packages/foundry        contracts (PolicyRegistry, AgentVault...)  -> Victor
services/decision-verifier   0G TEE inference -> signed ALLOW/DENY -> Victor/Leunam
services/cosigner       policy re-check + co-signature (Safe SDK)  -> Victor
docs/                   architecture, interfaces, decisions
```

## Ownership (parallel lanes, each a single ordered path)

Three people work at once, but inside each lane there is exactly one "current
task" - no ambiguous parallel blocks. Your top TASKS.md item is your focus.

- **Victor - web3 core & contracts.** Foundry contracts, AgentVault 2-of-2,
  payment executor, ABIs, cosigner signing logic, deploy scripts.
- **Leunam - dashboard & integration.** Next.js UI (connect, protect agent,
  policy form, trust badge), wagmi hooks, wiring the two services into the flow.
- **Rodrigo - product, pitch & demo.** Demo script, bounty checklists (Hedera,
  0G), sponsor relations, docs, the 3-min video, judging table narrative.

## Interfaces - freeze these DAY 1 so lanes don't block each other

Define these in `docs/interfaces.md` before splitting up. They are the contracts
between people; once frozen, each lane can build against them independently.

1. **Decision Receipt** JSON schema (arch doc 4.3) - fields, hashing, signature.
2. **Verifier API** - `POST /verify` request/response (action in, signed
   ALLOW/DENY + proofRef out).
3. **Cosigner API** - `POST /cosign` request/response (Accepted/Denied receipt).
4. **Contract ABIs + addresses** - committed to `packages/nextjs/contracts` and a
   shared `deployments.json` so the UI always knows the current testnet addresses.

If an interface must change, change `docs/interfaces.md` first, ping the other
lane, then implement.

---

## Workflow

- **Branches:** `lane/short-desc` e.g. `contracts/policy-registry`,
  `web/protect-agent-form`, `verifier/tee-signature`.
- **Commits:** small, imperative, prefixed - `feat:`, `fix:`, `chore:`,
  `docs:`. One logical change each.
- **PRs:** small, one lane, self-review against the checklist below. In-person so
  a quick verbal review is fine; still open a PR for history.
- **TASKS.md:** each owner keeps a single priority-ordered list. Top item = doing
  now. Move finished items to Done with a date.

### PR / merge checklist
- [ ] builds locally (`yarn next:build` or `forge build`)
- [ ] didn't touch another lane's files without a note
- [ ] shared interface change documented in `docs/interfaces.md`
- [ ] DEVLOG entry added
- [ ] no secrets committed

---

## Documentation protocol

- **DEVLOG.md** - append-only. One entry per work session per person (or per AI
  session). This is what makes shared, async work possible: the next person (or
  agent) reads the last entries and knows exactly where things stand.
- **docs/decisions.md** - one line per hard-to-reverse decision (ADR-lite).
  Example seeded: "All EVM contracts on Hedera testnet (single-chain MVP)."
- **docs/interfaces.md** - the frozen contracts between lanes (see above).
- Keep `README.md` runnable. Outdated docs are worse than none.

### DEVLOG entry format
```
## YYYY-MM-DD HH:MM - <name or agent> - <lane>
- did: <what changed, files/PRs>
- next: <the single next task>
- blockers: <none | what + who can unblock>
- interfaces touched: <none | which, and the change>
```

---

## Demo north star (this is what we're building toward)

Every task should move one of these six steps forward. Owner in brackets.

1. Register agent (ENS + World ID optional) [Leunam UI / Victor profile]
2. Sign mandate/policy with on-chain commitment [Victor contract + Leunam UI]
3. Approved action passes the gate -> executed + HBAR paid [Victor + Leunam]
4. Live gate block on a disallowed action [Victor + Leunam]
5. Forced violation -> same-block payout / DeniedReceipt [Victor]
6. Dashboard shows green action, fee, blocked action, trust badge [Leunam]

Plus: 0G verifier produces a TEE-signed verdict feeding steps 3-5, and the
3-min video (Rodrigo).

## Definition of done - hackathon core (arch doc 13)

Connect wallet - register/protect agent - create/link agent wallet - create
policy - 0G verify (or declared fallback) - decision receipt - Accepted/Denied
receipt - co-signature model - action allowed - action blocked - trust badge /
audit logs - HBAR transfer on Hedera testnet. Everything else is stretch.

## Bounty targets (confirmed)

- **Hedera ($6k):** real HBAR transfer to a service/API provider, triggered by
  the approved flow (not a manual button). Logs in the dashboard.
- **0G ($6k):** real inference through 0G Compute with TeeML verification; show
  the signed verdict in the demo video.
