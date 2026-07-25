# AEGIS — Screen Specification (front-end)

Front-end reference document. Describes **every screen** needed for the
system described in [`AEGIS_ARCHITECTURE.md`](AEGIS_ARCHITECTURE.md) to work,
what each one shows, which states it needs to cover, and which data it
consumes.

The data layer (`lib/api/*` + `lib/fixtures/*`) is local and self-contained
today, with the same function signatures the real backend calls will have —
see §4. TODO(backend): swap the body of each `lib/api/*` function for the
real call; the screens themselves don't change.

---

## 0. Assumptions and conventions

Decisions assumed here (change one and the rest of the doc follows):

- **UI language:** English. All product documentation is in English and the
  terms are domain vocabulary (`Protected Wallet`, `Decision Receipt`,
  `co-signature`).
- **Stack:** Next.js 16 (App Router, already installed), React 19,
  TypeScript, Tailwind v4. Recommend adding `shadcn/ui` — the table, dialog,
  form, tabs, and toast patterns cover almost everything here and save days.
- **Theme:** dark-first. It's a crypto security/infra product; light mode is
  a later adjustment.
- **Network:** Hedera testnet, single chain (see `decisions.md`). The network
  selector exists visually but only has one option.
- **Data layer:** `lib/fixtures/*` holds the fixtures; `lib/api/*` exposes
  async functions with simulated latency (200–800ms) and the ability to force
  an error. Screens only ever talk to `lib/api`. TODO(backend): replace each
  function's body with the real HTTP/RPC call.
- **Required states:** every data screen needs `loading`, `empty`, `error`,
  and `success`. They're listed per screen below because that's exactly what
  tends to be missing when a front end ships "done."

### 0.1 Status vocabulary (use across the whole UI)

| Status        | Where it shows up                                          | Color      |
| ------------- | ---------------------------------------------------------- | ---------- |
| `Protected`   | agent/wallet with an active policy and a healthy co-signer | green      |
| `Unprotected` | registered agent with no active policy                     | gray       |
| `Paused`      | protection suspended by the operator                       | amber      |
| `Compromised` | exposed key → break-glass triggered (arch §2.5)            | red        |
| `Allowed`     | receipt with an executed `ALLOW` verdict                   | green      |
| `Denied`      | receipt with a `DENY` verdict, or failed an AEGIS check    | red        |
| `Pending`     | proposal awaiting verification/co-signature                | blue       |
| `Indexing`    | executed on-chain, not yet indexed by the subgraph (§9.7)  | light blue |
| `Fallback`    | verdict generated without 0G, signed locally (§4.2)        | amber      |

The `Fallback` badge can **never** look visually identical to a real 0G
verdict — that's an explicit architecture requirement ("never present a
fallback verdict as a real 0G verdict").

---

## 1. Navigation map

```
/                             Landing + Connect Wallet
│
├── /onboarding               "Protect Agent" wizard (3 steps + success)
│
├── /dashboard                Overview + agent grid
│   └── /agents/[id]          Detail (tabs: Overview | Wallet | Policies | Activity | Settings)
│       └── /agents/[id]/wallet/migrate    Wallet migration (break-glass)
│
├── /policies                 Policy list
│   ├── /policies/new         Policy builder
│   └── /policies/[id]        Detail + versions + revocation
│
├── /activity                 Global audit log
│   └── /activity/[receiptId] Decision Receipt viewer
│
├── /approvals                Co-signature queue (pending)
├── /security                 Recovery / break-glass / signer rotation
├── /settings                 Operator, alerts, billing, API keys
└── /status                   Component health (0G, co-signer, subgraph, Hedera)
```

Global layout: fixed sidebar (Dashboard, Policies, Activity, Approvals,
Security, Settings) + topbar with network selector, system health badge,
notification bell, and connected account.

---

## 2. Screens

### S01 — Landing / Connect Wallet

**Route:** `/` · **Auth:** public

Entry point of the flow (arch §3.1, step 1 of the user-flow diagram).

- Hero: name, tagline ("A safety layer for agents that move value"), a
  3-bullet summary of what AEGIS does.
- Primary **Connect Wallet** button → opens a selection modal (MetaMask,
  WalletConnect, Coinbase — TODO(backend): wire to real connectors; any click
  currently "connects").
- Diagram/illustration of the protected flow, simplified version.
- Footer with links to docs and status.

**States:** disconnected (default) · connecting (spinner in the modal) ·
connection error (user "rejected") · already connected → redirects to
`/dashboard`.

---

### S02 — Wallet Connect Modal

**Global component**, not a route.

Wallet list, "connecting…" state, error with retry, and — once connected — a
summary with truncated address, HBAR balance, and a **Disconnect** button.
Reused in the topbar.

---

### S03 — Dashboard / Overview

**Route:** `/dashboard`

The screen step 6 of the user flow calls "Dashboard Ready."

- **KPIs:** protected agents · active policies · approved actions (24h/7d) ·
  blocked actions · volume moved (HBAR) · fees paid to AEGIS.
- **Health banner:** 0G online/fallback, co-signer up/down, subgraph lag.
  Only shows up when there's degradation; clickable → `/status`.
- **Agent list** (cards): name, type, status, protected wallet balance, last
  action, active policy.
- **Recent activity:** last 10 receipts (verdict, agent, destination, amount,
  time) → click goes to S14.
- **Chart:** approved vs. denied per day (7 days).

**States:**

- `empty` — **critical**: "No protected agents yet" + **+ Protect Agent** CTA.
  This is literally step 4 of onboarding in the architecture.
- `loading` — card skeletons.
- `error` — failed to read the subgraph, with a retry button and a note that
  execution doesn't depend on this read (§9.7).

---

### S04 — Wizard: Protect Agent (shell)

**Route:** `/onboarding`

3-step stepper, with persisted progress (if the user leaves and comes back,
it resumes). Each step is one of the screens below. **Cancel** button with
confirmation.

Steps: `Register Agent` → `Create Policy` → `Activate Protection`. No wallet
step — see the note in S06.

---

### S05 — Step 1: Register Agent

**Route:** `/onboarding?step=agent`

Form exactly as described in arch §3.2:

> **2026-07-24 revision (see `decisions.md`):** AEGIS doesn't create the
> agent. The user connects an agent that already runs elsewhere. This
> changes the fields below and removes the wizard's wallet-creation step —
> the wallet is now provisioned by the backend after activation, with no
> dedicated screen.

| Field          | Type       | Rules                                                                                                              |
| -------------- | ---------- | ------------------------------------------------------------------------------------------------------------------ |
| `Agent name`   | text       | required, 3–32 chars, e.g. `TreasuryBot`                                                                           |
| `Agent type`   | select     | Payment Agent · API Buyer · Treasury Agent · DeFi Agent · Custom                                                   |
| `Description`  | textarea   | optional, up to 280 chars                                                                                          |
| `Capabilities` | checkboxes | Pay service provider · Call API · Transfer tokens · Execute DeFi action · Request approval — at least one required |

Important copy: make clear the user is **connecting** an agent that already
exists, not that AEGIS is creating or hosting one. No endpoint or signer on
this screen — that's the responsibility of however the agent already runs
today, not of registering it inside AEGIS.

On submit: a short progress state ("Connecting agent…") and moving straight
to the next step — no intermediate recap screen.

**States:** per-field validation · duplicate name · connection failure with
retry.

---

### S06 — ~~Create Protected Wallet~~ (removed from the wizard)

Removed 2026-07-24: creating the protected wallet is no longer a UI step.
The backend provisions the 2-of-3 Safe after activation (arch §3.3). The
read-only screen showing owners/threshold/status still exists as part of S11
(Protected Wallet Detail) — it now only reads what the backend already
created, instead of triggering the creation.

---

### S07 — Step 2: Create Policy (Policy Builder)

**Route:** `/onboarding?step=policy`

> **Deliberate placeholder.** The policy's real schema (which fields, which
> types, which validation rules) hasn't been defined with the backend team
> yet. Instead of simulating a spec that could change, this screen has
> **5 generic fields with lorem-ipsum labels** — they exist so the form has
> shape, generates a `policyHash`, and gives devs an obvious place to swap in
> the real fields once the spec lands. This isn't the final S07; it's this
> screen's state until the policy has a defined contract.

Behavior: fill in the 5 fields → **Create policy** → generates a placeholder
`policyHash` from the filled content → moves straight to the next step. No
cross-field validation or side summary in this version — that comes back once
the real fields exist.

**States:** submission in progress · error.

---

### S08 — Step 3: Activate Protection + Success

**Route:** `/onboarding?step=activate`

Final review before turning on protection (§3.5):

- Summary cards: agent (name, type, capabilities) and policy (`policyHash`,
  number of filled fields). No wallet card — it doesn't exist yet at this
  point in the flow.
- Acknowledgment checkbox for the limits: AEGIS prevents unauthorized
  execution, it does **not** offer insurance or cover counterparty failure
  (§14).
- **Activate Protection** button.
- Success screen: large `Protected by AEGIS` badge, summary, and two CTAs —
  **Go to dashboard**, **Protect another agent**.

---

### S09 — ~~Agents (list)~~ (absorbed into S03)

Removed 2026-07-24: the dashboard **is** the agent grid. Search, status
filter, and sorting move into S03 itself once volume justifies it.

---

### S10 — Agent Detail

**Route:** `/agents/[id]` · internal tabs

**Header:** name, copyable `Agentic ID`, type, status, Safe address, balance,
**Pause protection** / **Propose transaction** / **Edit** buttons.

- **Overview tab** — metadata, endpoint, description, current policy with
  `policyHash`, mini-timeline of recent actions, agent KPIs.
- **Wallet tab** → S11.
- **Policies tab** — linked policies, versions, which one is active, **New
  policy** and **Revoke** buttons.
- **Activity tab** — audit log filtered to this agent (same component as
  S13).
- **Settings tab** — rename, change endpoint, pause, and the danger zone:
  deactivate protection / migrate wallet (leads to S12 with a strong
  confirmation).

---

### S11 — Protected Wallet Detail

**Route:** `/agents/[id]` (Wallet tab) — or `/agents/[id]/wallet`

- Safe address, network, link to the explorer.
- Balances per token.
- **Owners and threshold**, with each one's role and a permanent notice that
  the guardian only acts during recovery.
- AEGIS module/guard status (active/inactive).
- Wallet execution history.
- Actions: deposit (shows address + QR), **Rotate signer**, **Migrate funds**
  (→ S18).

**Special state:** if the wallet is `Compromised`, the whole screen gets a
red banner and the `Protected by AEGIS` badge **disappears** — the
architecture says the key's exposure alone drops that status (§2.5).

---

### S12 — Policies (list)

**Route:** `/policies`

Table: name/label, agent, action type, tokens, max per action, daily max,
deadline, status (`Active` / `Expired` / `Revoked` / `Draft`), truncated
`policyHash` + copy, version. Filters by agent and status. **New policy** CTA
(→ S07).

---

### S13 — Policy Detail

**Route:** `/policies/[id]`

- All fields in read-only mode, grouped as in the builder.
- Full `policyHash`, nonce, version, created at / by, deadline with a
  countdown.
- **Version history** with a diff between versions (what changed v1 → v2).
- Stats: how many actions this policy approved and blocked.
- Actions: **Duplicate**, **New version**, **Revoke** (confirmation dialog
  explaining that revoking blocks the agent's future executions).

---

### S14 — Activity / Audit Log

**Route:** `/activity`

The auditable log fed by the subgraph (§5.3). Likely the most-used screen
after the dashboard.

- Filters: agent, verdict (`ALLOW`/`DENY`), period, token, destination, mode
  (`0G` vs `fallback`), amount range.
- Columns: timestamp, agent, action type, destination, token, amount,
  verdict, verification mode, AEGIS fee, tx hash.
- Expandable row with the decision's reason.
- **CSV export** (the architecture asks for an "exportable audit log").
- Pagination/infinite scroll.
- Subgraph lag indicator: "Synced 12s ago" + `Indexing` items at the top,
  optimistic, before they show up indexed (§9.7).

**States:** empty ("No activity yet — your agents haven't proposed
anything") · loading · subgraph error · filter with no results.

---

### S15 — Decision Receipt Viewer

**Route:** `/activity/[receiptId]`

Key screen for auditing and for the demo. Renders the Decision Receipt from
§4.3 in a readable way, not as raw JSON:

- **Header:** large verdict (`ALLOW` green / `DENY` red) + reason.
- **Vertical flow timeline**, marking where it stopped:
  `Agent proposed` → `0G/TeeML verified` → `AEGIS checks` → `Co-signature` →
  `Safe executed` → `Hedera payment` → `Indexed by The Graph`.
  For denied cases, the step that failed turns red and the following ones
  turn gray.
- **Proof block:** provider, `mode: real | fallback` (with the amber notice
  when fallback), `receiptHash`, `proofRef`, timestamp, link to the raw log.
- **Action block:** agentId, wallet, destination, token, amount, nonce,
  deadline, `actionHash`, `policyHash` (link to the policy), chainId.
- **AEGIS checks block** (§4.4) as a checklist: identity, policyHash, amount,
  token, destination, deadline, nonce, actionHash, receipt signature, wallet
  status, fee — each item ✓ or ✗.
- **Execution block:** collected signatures (agent + AEGIS), Hedera tx hash
  with a link, AEGIS fee highlighted as part of the **same** batch (§4.4).
- Buttons: **Copy JSON**, **Download receipt**, **View on explorer**.

Variants: executed `ALLOW` · `DENY` from 0G · `DENY` from the AEGIS check (no
co-signature) · `Pending` · `Indexing`.

---

### S16 — Approvals / Pending Queue

**Route:** `/approvals`

Proposed transactions that haven't closed the cycle yet: waiting on 0G
verification, waiting on co-signature, or waiting on indexing.

Each card shows agent, proposed action, amount, applicable policy, wait time,
and the current step. Actions: view detail (S15), **Cancel proposal**, and —
where applicable to the operator — **Approve manually**.

**States:** empty ("Nothing waiting"), item stuck for a long time (alert that
the co-signer might be down, §9.2).

---

### S17 — ~~Transaction Simulator~~ (removed)

Removed from scope 2026-07-24. It only existed to trigger steps 7–15 of the
user flow without a backend — in the real product, the agent proposes
transactions, via the backend. See §6.

---

### S18 — Security / Recovery (break-glass)

**Route:** `/security`

Covers §2.5, §3.3, and §9.2/§9.3, which are requirements, not extras.

- Signer status: agent signer, AEGIS co-signer, recovery guardian — each with
  `healthy` / `unavailable` / `compromised`.
- **Rotate signer** — flow with confirmation and a displayed timelock.
- **Emergency migration** — migrate funds to another wallet using the
  guardian + the remaining signer; explicitly shows the pending
  timelock/2FA and a countdown.
- **Break-glass** — deactivates the current protected wallet and forces
  migration. Confirmation dialog requiring the agent's name to be typed, with
  an explanation of the consequences.
- Security event history.

---

### S19 — Settings

**Route:** `/settings`, with tabs

- **Account** — operator wallet, network, disconnect.
- **Alerts** — notification toggles for failed transactions, policy
  violations, system health, key events (the "Monitoring & Alerts" block from
  the architecture diagram). Channels: email / webhook.
- **Billing & fees** — fees paid to AEGIS per period, current rate, history;
  makes clear the fee is charged in the same batch as the execution (§8).
- **API keys** — keys for the agent/integrations (shown once, with a revoke
  button).
- **Danger zone** — disconnect all agents / close account.

---

### S20 — System Status

**Route:** `/status`

Health of each dependency: 0G/TeeML (online / degraded / fallback active),
AEGIS co-signer, Hedera testnet, subgraph (with lag in seconds), contracts
(`PolicyRegistry`, `AgentRegistry`, `ReceiptRegistry`) with address and link.
Recent incident history.

---

### S21 — Notifications

**Side panel (drawer) triggered by the topbar bell.**

Chronological list: blocked action, policy about to expire, daily limit
nearly reached, co-signer unavailable, pending migration. Mark as read, "see
all" → `/activity` with the filter applied.

---

### S22 — System / error screens

Small, but they need to exist in the delivery:

- **Not connected** — user tries to reach an internal route without a
  wallet: centered card with **Connect Wallet**.
- **Wrong network** — blocks the UI with a **Switch to Hedera testnet**
  button.
- **404** — nonexistent route.
- **500 / error boundary** — unexpected error with retry (`app/error.tsx`).
- **Global loading** — `app/loading.tsx`.

---

## 3. Shared components

Build these first; the screens are just assembly after that.

| Component                      | Use                                                      |
| ------------------------------ | -------------------------------------------------------- |
| `AppShell`                     | sidebar + topbar + content area                          |
| `StatusBadge`                  | §0.1 vocabulary, single source of truth for colors       |
| `VerdictBadge`                 | `ALLOW` / `DENY` / `Pending`, with a `fallback` variant  |
| `AddressChip`                  | truncated address + copy + explorer link                 |
| `AgentCard`                    | used on the dashboard and in the list                    |
| `PolicyCard` / `PolicySummary` | policy summary reused in the builder                     |
| `ReceiptTimeline`              | S15's 7-step timeline                                    |
| `CheckList`                    | AEGIS's objective checks (§4.4)                          |
| `OwnersDiagram`                | visual of the 2-of-3 Safe with roles                     |
| `DataTable`                    | table with filter, sort, pagination, empty, and skeleton |
| `EmptyState`                   | icon + title + description + CTA                         |
| `Stepper`                      | onboarding wizard                                        |
| `ConfirmDialog`                | destructive actions, with type-to-confirm                |
| `AmountDisplay`                | amount + token + optional fiat equivalent                |
| `SyncIndicator`                | subgraph's "Synced Xs ago"                               |
| `Toaster`                      | action feedback                                          |

---

## 4. Local data layer

```
lib/
├── types/          AgentProfile, ProtectedWallet, Policy, DecisionReceipt, Execution
├── fixtures/       fixtures: agents.ts, policies.ts, receipts.ts, activity.ts
└── api/            agents.ts, policies.ts, receipts.ts, system.ts
```

TODO(backend): this whole layer is a stand-in for the real backend. Rules
while it is:

1. Types **literally** mirror the JSONs in arch §4.1 and §4.3. If the field
   is called `proofRef.mode`, the type has `proofRef.mode`.
2. `lib/api/*` exports async functions (`listAgents()`, `getReceipt(id)`,
   `proposeTransaction(payload)`) with simulated latency. Swapping fixtures
   for a real `fetch` is changing the body of these functions, nothing more.
3. A `SIMULATED_LATENCY_MS` and a `SIMULATED_FAILURE_RATE`, configurable per
   env, so devs can see the loading/error states without hacks.
4. Mutation state (create agent, create policy, propose transaction) lives
   in memory/`localStorage` for the session, so the demo has continuity.
5. Minimal fixtures: 3 agents (one `Protected`, one `Unprotected`, one
   `Paused`), 4 policies (active, expired, revoked, draft), ~25 receipts
   mixing `ALLOW`, `DENY` from 0G, `DENY` from the AEGIS check, and one
   `fallback`.

---

## 5. Execution plan

The goal of this delivery is **a front end backend devs can plug into**:
every screen exists because there's an endpoint for it to consume. Nothing is
built to act out behavior the backend will produce.

| Phase | Delivery                                              | Screens                 | Status  |
| ----- | ----------------------------------------------------- | ----------------------- | ------- |
| 1     | Foundation — tokens, base components, types, fixtures | —                       | ✅      |
| 2     | Entry                                                 | S01, S02                | ✅      |
| 3     | Dashboard                                             | S03                     | ✅      |
| 4     | Onboarding / writes                                   | S04–S08                 | ✅      |
| 5     | Detail and management                                 | S10, S11, S12, S13      | pending |
| 6     | Audit                                                 | S14, S15, S16           | pending |
| 7     | Operations and system                                 | S18, S19, S20, S21, S22 | pending |

### 5.1 Per-screen contract

What each screen expects from the backend. This table is where the
integration conversation should happen — the signature lives in `lib/api/`,
and swapping fixtures for HTTP is changing the body of these functions.

| Screen  | Expected operation                                                                          |
| ------- | ------------------------------------------------------------------------------------------- |
| S03     | `listAgents()`, `listActivity({ limit })`                                                   |
| S05     | `createAgent(payload)` → `AgentProfile` (connects an existing agent, doesn't provision one) |
| S07     | `createPolicy(agentId, fields)` → `policyHash` (`fields` is a placeholder — schema TBD)     |
| S08     | `activateProtection(agentId, policyHash)`                                                   |
| S10     | `getAgent(id)`, `pauseAgent(id)`                                                            |
| S11     | `getWallet(agentId)`, `rotateSigner(...)`                                                   |
| S12/S13 | `listPolicies({ agentId })`, `getPolicy(id)`, `revokePolicy(id)`                            |
| S14     | `listActivity({ filters, cursor })`, `exportActivityCsv(filters)`                           |
| S15     | `getReceipt(id)` → full `DecisionReceipt` (§4.3)                                            |
| S16     | `listPendingApprovals()`, `cancelProposal(id)`                                              |
| S18     | `getSignerHealth()`, `startRecovery(...)`, `breakGlass(agentId)`                            |
| S20     | `getSystemHealth()` → 0G, co-signer, subgraph, contracts                                    |

---

## 6. Out of scope for this delivery

Recorded so it doesn't turn into an expectation:

- Real signing, Safe deployment. (Wallet connection is now real
  wagmi/RainbowKit as of 2026-07-25.)
- Calls to 0G, to the co-signer, or to Hedera.
- Real GraphQL queries against the subgraph.
- Server auth/session, multi-tenant, role-based permissions.
- "Bring your own agent" — roadmap, not this version (`decisions.md`).
- Internationalization and light mode.
- **Simulating a transaction proposal** (formerly S17). The agent proposes,
  via the backend. A screen that pretends to be the agent becomes dead code
  once integration happens — which is why S17 left the scope.

> **Criterion used to cut a screen.** A screen only leaves if it exists
> _only_ because the backend doesn't exist yet. Screens that render a future
> endpoint stay, even if they currently read from local fixtures — that's
> exactly what devs are going to plug into. By this criterion, S17 was the
> only one removed; S15 (Receipt Viewer) stays, because it's the UI for
> `getReceipt(id)`.

---

## 7. Points that need a team decision

1. **Who is the default recovery guardian?** A user address, or a service
   AEGIS manages? Changes S06 and S18.
2. **Can the operator manually approve** a transaction the policy denied?
   The architecture doesn't provide for this — if it can't, S16 loses the
   **Approve manually** button.
3. **Can an agent have several active policies at once**, or only one?
   Changes S12/S13 and S10's summary.
4. **AEGIS fee:** percentage or fixed? Needs to show up before execution and
   in S15's receipt.
