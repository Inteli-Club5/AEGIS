# AEGIS Playbook

Single source of truth for how we build AEGIS at ETHGlobal Lisbon. Humans and AI
agents both follow it. Keep it short; if a rule stops helping, change it here.

---

## For AI agents - read this first, every session

1. **Read** `PLAYBOOK.md` (this file), then `TASKS.md`, then the newest entry at
   the bottom of `DEVLOG.md`. On `feat/policy-engine-level-1`, also read
   `docs/aegis-current-scope.md` and treat it as the branch scope override for
   older architecture, bounty, demo, and implementation notes. Read the relevant
   lane's code before editing.
2. **Work** only inside the current owner's lane (see Ownership). Do not refactor
   another lane without a note in `TASKS.md`.
3. **Commit small and often** with the convention below. ETHGlobal judges the
   git history - no giant single commits.
4. **At the end of the session, ALWAYS append a `DEVLOG.md` entry** (format below)
   and update `TASKS.md` (check off done items, set the new top task).
5. If you changed a **shared interface** (receipt schema, an API contract, an
   ABI, a deployed address), say so loudly in the DEVLOG entry and update the
   active scope/interface document for the branch.
6. Never print or commit private keys. `.env` only, `.env.example` for shape.
7. Write repository documentation, DEVLOG entries, PR descriptions, and
   agent-authored notes in English. Do not add Portuguese project docs unless a
   human explicitly requests a localized artifact.

---

## Repo map

```
packages/nextjs         dashboard (Next.js + RainbowKit + wagmi)   -> Leunam
packages/foundry        contracts (TeeML registry; Safe ABIs)      -> Victor
services/agent-service  policy engine + verified TeeML writer port -> Victor/Leunam
services/cosigner       policy re-check + co-signature (Safe SDK)  -> Victor
docs/                   architecture, interfaces, decisions
```

## Ownership (parallel lanes, each a single ordered path)

Three people work at once, but inside each lane there is exactly one "current
task" - no ambiguous parallel blocks. Your top TASKS.md item is your focus.

- **Victor - web3 core & contracts.** Foundry contracts, Safe 2-of-3
  (agent signer + AEGIS co-signer + recovery guardian), payment executor,
  ABIs, cosigner signing logic, deploy scripts.
- **Leunam - dashboard & integration.** Next.js UI (connect, protect agent,
  policy form, audit log), wagmi hooks, wiring the two services into the flow.
- **Rodrigo - product, pitch & demo.** Demo script, bounty checklists (Hedera,
  0G), sponsor relations, docs, the 3-min video, judging table narrative.

## Interfaces - freeze these first so lanes don't block each other

Define the active contracts before splitting up. They are the contracts between
people; once frozen, each lane can build against them independently.

For `feat/policy-engine-level-1`, the frozen contracts are the offchain Policy
Engine Level 1 interfaces:

1. Policy schema, lifecycle, canonicalization, and `policyHash` input.
2. Create/update/activate/revoke Policy request and response shapes.
3. Action Precheck request shape and idempotency behavior.
4. `PASS_TO_TEEML` and `DENY_PRECHECK` response shapes.
5. `PrecheckRecord`, `UsageHold`, sanitized audit event, and stable denial
   codes.

The Level 1 branch does not define a final `ALLOW`, signed final
`DecisionReceipt`, TeeML/0G call, Safe execution, contract ABI, deployment, fee,
or onchain event interface.

If an interface must change, change the active scope/interface document first,
ping the other lane, then implement.

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
- [ ] shared interface change documented in the active scope/interface document
- [ ] DEVLOG entry added
- [ ] no secrets committed

---

## Documentation protocol

- **DEVLOG.md** - append-only in chronological order. One entry per work session
  per person (or per AI session). New entries go at the bottom. Use English
  AM/PM timestamps in the format `YYYY-MM-DD hh:mm AM/PM`. This is what makes
  shared, async work possible: the next person (or agent) reads the last entries
  and knows exactly where things stand.
- **Language** - repository documentation, DEVLOG entries, PR descriptions, and
  agent-authored notes are written in English by default.
- **docs/decisions.md** - one line per hard-to-reverse decision (ADR-lite).
  Example seeded: "All EVM contracts on Hedera testnet (single-chain MVP)."
- **docs/aegis-current-scope.md** - current branch scope overlay. On
  `feat/policy-engine-level-1`, it is also the single frozen interface and
  handoff document for the branch.
- Keep `README.md` runnable. Outdated docs are worse than none.

### DEVLOG entry format
```
## YYYY-MM-DD hh:mm AM/PM - <name or agent> - <lane>
- did: <what changed, files/PRs>
- next: <the single next task>
- blockers: <none | what + who can unblock>
- interfaces touched: <none | which, and the change>
```

---

## Demo north star (this is what we're building toward)

Every task should move one of these six steps forward. Owner in brackets.

1. Create/register agent, AEGIS-created on Hedera [Leunam UI / Victor profile]
2. Sign mandate/policy with on-chain commitment [Victor contract + Leunam UI]
3. Approved action passes the gate -> proposed through the real Safe/Hedera flow
   [Victor + Leunam]
4. Live gate block on a disallowed action [Victor + Leunam]
5. Verified TeeML ALLOW/DENY is recorded only after the real private/TEE/hash
   checks; technical failures remain offchain [Victor]
6. Dashboard shows confirmed public facts only through The Graph GraphQL
   [Leunam]

Plus: 0G verifier produces a TEE-signed verdict feeding steps 3-5, and the
3-min video (Rodrigo).

## Definition of done - hackathon core (arch doc 12)

Connect wallet - register/protect agent - create/link agent wallet (Safe
2-of-3) - create policy - verified 0G/TeeML result (fail closed if unavailable) - decision receipt
- Accepted/Denied receipt - co-signature model - action allowed - action
blocked - audit logs - HBAR transfer on Hedera testnet. Everything else is
stretch.

## Bounty targets (confirmed)

- **Hedera ($6k):** real HBAR transfer to a service/API provider, triggered by
  the approved flow (not a manual button). Logs in the dashboard.
- **0G ($6k):** real inference through 0G Compute with TeeML verification; show
  the signed verdict in the demo video.
