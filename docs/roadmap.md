# AEGIS — Roadmap

## 1. How this roadmap is built

Every phase below closes a specific, already-documented gap — a bottleneck
from `docs/AEGIS_ARCHITECTURE.md` §9 or a solution already proposed in
`docs/aegis_financial_model.md` — not an open wishlist. Where an item has no
prior source in the repo, it's marked **Proposed** and says so explicitly.
This roadmap describes product and business milestones, not implementation
status — it does not track specific code, files, or in-progress work, since
that's being actively built and would go stale immediately.

Guiding principles for sequencing:

1. Prove the core mechanism (policy → 0G verdict → co-signature → execution)
   on the narrowest possible scope before generalizing it.
2. Expand *catalog* — chains, assets, action types, agent sources — in waves,
   before expanding *platform* — new surfaces, new monetization lines, new
   user segments.
3. Each phase closes a bottleneck that's already named in the architecture or
   financial docs. If a phase doesn't map to one, it doesn't belong this
   early.
4. Anything that resembles a reward or stake for early users/agents (a token,
   revenue share, equity-like mechanism) is a late-stage question, gated on
   proven traction — not a phase-1 decision.

---

## 2. Phase overview

| Phase | Focus | Status |
|---|---|---|
| 0 | Hackathon MVP — single chain, user-supplied agent | In progress |
| 1 | Private beta, capped users, production hardening | Planned |
| 2 | Chain and asset expansion | Planned |
| 3 | Agent-provider partnerships | Proposed |
| 4 | Monetization expansion | Planned |

---

## 3. Phase 0 — Hackathon MVP (24-26/jul)

Scope: Hedera testnet only, the user's own agent wrapped in a Safe 2-of-3
protected wallet, policy gate, verified 0G/TeeML result (with no local-verdict
fallback), AEGIS co-signature, HBAR execution, The Graph indexing. Full
definition of done in `PLAYBOOK.md` ("Definition of done — hackathon core").

This phase is not "finished" — several pieces are still incomplete:

- The co-signer does not yet perform real policy or identity verification,
  and does not yet issue Accepted/Denied receipts.
- The 0G Agentic ID registration flow has no authentication/session layer
  yet.
- No persistence layer — the Agentic ID registration result isn't stored
  anywhere after a successful call.
- `docs/interfaces.md` was never frozen, despite being required by
  `PLAYBOOK.md` since day one.

Phase 1 exists to close these before anyone outside the team touches the
product.

---

## 4. Phase 1 — Private beta, capped users

**Goal (explicit product want):** run AEGIS in the market in a beta phase
with a hard limit on the number of users, so the co-signer and 0G verifier
aren't overloaded before they're hardened.

This is the phase where AEGIS stops being a hackathon demo and starts being a
system a stranger's funds can pass through, even at small scale. Everything
here is already named as a requirement somewhere in the architecture doc —
this phase is where it gets built, not invented.

**Access control for the beta:**

- Waitlist / invite-only onboarding, with an explicit active-agent cap
  enforced server-side (not just a UI suggestion).
- A kill switch to stop accepting new agent registrations without taking the
  product down for existing beta users.

**Security and reliability hardening (closes `docs/AEGIS_ARCHITECTURE.md` §9):**

- Implement real co-signer verification: confirm the Decision Receipt came
  from the 0G TEE, re-check the policy (destination, token, amount, deadline,
  nonce), verify agent identity, and issue Accepted or Denied receipts
  (§4.4, §9.2).
- Safe Guard/Module requiring a verifiable on-chain 0G attestation before
  execution — closes the gap where a compromised co-signer key could sign
  offline without the policy check ever running (§9.2, `docs/decisions.md`).
- Move the AEGIS co-signer key off a local demo key onto local HSM/MPC/TEE
  custody (§7, §9.2).
- Build and test the break-glass recovery flow: guardian co-signs to reach
  2-of-3 when the agent signer or AEGIS co-signer is stuck, with
  timelock/2FA, not just documented as a requirement (§2.5, §3.3, §9.3).
- Deploy the subgraph for real (policy, Safe execution, and Decision Receipt
  events) and point the dashboard at it, with the optimistic "pending" →
  reconciled pattern from §9.7.
- Add the authentication/session layer the Agentic ID registration flow is
  missing today.
- Add the persistence layer for Agentic ID registrations and decision
  receipts.
- Monitoring/alerting on co-signer and 0G verifier availability — the direct
  operational reason a user cap matters: know before users do when the
  system is degraded.

---

## 5. Phase 2 — Chain and asset expansion

This is AEGIS's equivalent of "generalize the catalog before the platform."
Each item below is already named as a later step in the architecture doc or
decisions log.

- **Hedera mainnet**, once testnet has run clean through Phase 1.
- **x402 / HTS / escrow / SLA-backed payments** on top of plain HBAR transfer
  (`docs/AEGIS_ARCHITECTURE.md` §5.2, §7).
- **More token/asset types** beyond HBAR and USDC, and more policy action
  types beyond payment/API-call/transfer.

---

## 6. Phase 3 — Agent-provider partnerships

**Goal (explicit product want):** partner with companies that provide
agents, so AEGIS becomes the safety/policy layer those agents run through by
default — instead of relying only on individual users registering their own
agent through the AEGIS UI one at a time.

- An integration SDK/plugin surface for external agent frameworks to call
  into AEGIS's policy gate and co-signature flow without going through the
  AEGIS-native onboarding form.
- Reusable policy templates per integration, so a partner's agents start
  with sane defaults instead of every user hand-writing a policy.
- A revenue model for this that reuses the fee structure already defined in
  `docs/aegis_financial_model.md` §3.3 (Provider/network fee): a partner
  bringing agent demand to AEGIS is structurally the same relationship as
  the "provider" role already priced there, so no new fee category should be
  needed — just a new counterparty type.

---

## 7. Phase 4 — Monetization expansion

Everything here is already named as a future direction in the architecture
or financial-model docs; this phase is where each gets built.

- **Enterprise/custom pricing** for high-value flows above the current
  US$2.00 execution-fee cap (`docs/aegis_financial_model.md` §4, §6).
- **Micro-transaction mode**: batching of sub-US$1 actions and periodic
  settlement, so the US$0.01 fee floor stops being a double-digit effective
  rate on cent-level transactions (`docs/aegis_financial_model.md` §4, §6).

---

## 8. Financial roadmap

`docs/aegis_financial_model.md` §5 models exactly two scenarios: **Short
term** and **Medium term**.

Assumed volume behind both scenarios (300 tx/agent/month = 10/day × 30 days):

| Scenario | Active agents | Tx/agent/month | Total tx/month | Fixed cost |
|---|---:|---:|---:|---:|
| Short term | 50 | 300 | 15,000 | US$100/month |
| Medium term | 200 | 300 | 60,000 | US$300/month |

Monthly result by pricing mix (Conservative / Base / Upside — mix
definitions in `docs/aegis_financial_model.md` §5):

| Scenario | Mix | Total revenue | Variable cost | Fixed cost | Estimated result |
|---|---|---:|---:|---:|---:|
| Short term | Conservative | US$452.50 | US$37.50 | US$100 | US$315.00 |
| Short term | Base | US$966.25 | US$37.50 | US$100 | US$828.75 |
| Short term | Upside | US$2,905.00 | US$37.50 | US$100 | US$2,767.50 |
| Medium term | Conservative | US$1,810.00 | US$150 | US$300 | US$1,360.00 |
| Medium term | Base | US$3,865.00 | US$150 | US$300 | US$3,415.00 |
| Medium term | Upside | US$11,620.00 | US$150 | US$300 | US$11,170.00 |

Result is before salaries, taxes, formal audit, legal expenses, or
substantial support costs (`docs/aegis_financial_model.md` §5, footnote).

**Directional mapping to this roadmap** (approximate, not a commitment to
specific months): Short term is roughly the scale a capped Phase 1 beta
should target — 50 agents is a plausible beta cap. Medium term is roughly
the scale Phase 2 chain/asset expansion should be sized for — 200 agents is
past what a single-chain beta cap would allow. Neither scenario has a time
axis attached in the source doc, so treat this as a capacity mapping, not a
month-1/month-6 schedule.
