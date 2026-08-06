# AEGIS — Screen Specification (front-end)

Front-end reference document. Describes **every screen** needed for the
system described in [`AEGIS_ARCHITECTURE.md`](AEGIS_ARCHITECTURE.md) to work,
what each one shows, which states it needs to cover, and which data it
consumes.

Private workflow/profile data continues through the AEGIS API layer. Confirmed
and historical onchain data uses the server-only clients in
`lib/onchain-data/*`, with The Graph GraphQL endpoints as its canonical source.
Runtime fixtures and direct RPC/Mirror/explorer/database fallbacks are not valid
onchain sources.

---

## 0. Assumptions and conventions

Decisions assumed here (change one and the rest of the doc follows):

- **UI language:** English. All product documentation is in English and the
  terms are domain vocabulary (`Protected Wallet`, `Decision Receipt`,
  `co-signature`).
- **Stack:** Next.js 15 (App Router), React 19, TypeScript, Tailwind v4, and
  the existing Scaffold-HBAR/DaisyUI component system.
- **Theme:** dark-first. It's a crypto security/infra product; light mode is
  a later adjustment.
- **Networks:** Hedera Testnet is the operational chain and 0G Galileo is the
  Agentic ID source. Their Subgraphs remain independent and are joined only in
  the typed dashboard client.
- **Data layer:** static GraphQL documents plus variables query the Hedera and
  0G Subgraphs. Private/offchain fields come from the AEGIS API and must be
  labelled separately. Onchain loading, partial, stale, indexing-error, empty,
  and success states are first-class.
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

`TEEML_FAILED` is a technical offchain state, not a verified verdict. The
dashboard must never render a fallback or failed call as an onchain ALLOW/DENY.

---

## 1. Navigation map

```
/                             Landing + Connect Wallet
│
├── /onboarding               "Protect Agent" wizard (3 steps + success)
│
├── /dashboard                Overview + agent grid
│   └── /agents/[id]          Detail (tabs: Overview | Wallet | Policies | Activity | Settings)
│
├── /policies                 Policy list
│   ├── /policies/new         Policy builder
│   └── /policies/[id]        Detail + versions + revocation
│
├── /activity                 Global audit log
│   └── /activity/[receiptId] Decision Receipt viewer
│
├── /approvals                Co-signature queue (pending)
├── /settings                 Operator, alerts, billing, API keys
└── /status                   Component health (0G, co-signer, subgraph, Hedera)
```

Global layout: fixed sidebar (Dashboard, Policies, Activity, Approvals,
Settings) + topbar with network selector, system health badge,
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

- **KPIs:** Agentic IDs and other facts returned by the live 0G Subgraph;
  TeeML validation, Safe execution, and policy-reference counts only after the
  corresponding real Hedera events are indexed. Missing producer events render
  an honest unavailable state, never a fabricated zero or offchain substitute.
- **Health banner:** separate Hedera and 0G indexer freshness, lag, and indexing
  errors. There is no TeeML-verdict fallback state.
- **Agent list** (cards): canonical cross-chain join state, source labels, and
  public indexed references. Private/offchain profile fields remain API data.
- **Recent facts:** bounded Agentic ID, TeeML registry, and Safe event records
  returned by GraphQL, with transaction/block references when available.

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

Removed 2026-07-24: creating the protected wallet is no longer a separate UI
step. The policy workflow asks the backend to provision or recover the 2-of-3
Safe before the policy commitment is signed. The read-only S11 screen shows
the resulting owners, threshold, and status; it does not reconstruct Safe
history from a browser RPC.

---

### S07 — Step 2: Create Policy (Policy Builder)

**Route:** `/onboarding?step=policy`

This screen implements the Policy Engine Level 1 contract. It captures one
HBAR or fungible HTS asset, the corresponding transfer action, exact base-unit
amount limits, optional destination restrictions, usage limits, validity,
and the recovery guardian. The form normalizes and validates those values,
derives the canonical `policyHash`, obtains the operator's typed-data
signatures, and sends the versioned policy to the AEGIS API. Existing versions
remain immutable.

Behavior: configure the enforced rules → provision/recover the protected Safe
→ sign the policy commitment → activate the selected version. No fixture,
browser-generated verdict, or placeholder policy hash is accepted.

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

- Filters are limited to fields emitted by real indexed events: agent/join
  key, verdict, reason-code hash, policy/action/model hash, recorder, Safe,
  period, and transaction hash as applicable.
- Columns show source chain/Subgraph, timestamp, indexed hashes/codes, block,
  and transaction hash. Business amount/destination/fee columns stay
  unavailable until a sanitized producer event exists.
- Detail views show only sanitized public hashes and structured codes. They
  never expose a detailed agent reason, prompt, raw TeeML output, or private
  semantic context.
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
- **Proof block:** provider, verified evidence status, sanitized commitment,
  timestamp, and indexed transaction/block references. Technical TeeML
  failures stay offchain and never appear as a verified verdict.
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

### S18 — Security / Recovery (out of scope)

Recovery, signer rotation, break-glass, insurance, coverage, payout, and wallet
migration are explicitly outside the current product/branch scope. There is no
`/security` route or recovery API contract in this implementation. The Safe
guardian remains a configured owner for future recovery design only; the
dashboard must not imply that a recovery workflow exists.

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

Health of each live dependency: 0G and Hedera Subgraphs independently, indexed
block, observed chain head when available, lag, indexing errors, and last
refresh. Public contract references are limited to the verified Agentic ID
deployment and the singleton `AegisTeeValidationRegistry` after its real
artifact exists. No nonexistent registry contract or fallback verdict is shown.
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
| `VerdictBadge`                 | verified `ALLOW` / `DENY` or transient `Pending`         |
| `AddressChip`                  | truncated address + copy + explorer link                 |
| `OnchainAgentCard`             | partial/complete cross-chain entity with source labels   |
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

## 4. Data boundaries

```
lib/
├── api/            private AEGIS workflow clients and same-origin routes
├── onboarding/     non-authoritative browser draft continuity only
├── onchain-data/   static GraphQL operations, repositories, joins, freshness
├── policy/         Policy Engine Level 1 form/hash/workflow helpers
└── types/          public UI and private API response types
```

Confirmed and historical onchain state is read only through the two Subgraph
GraphQL endpoints. Private/offchain workflow state is read from the AEGIS API.
`localAgentDraftStore` preserves onboarding presentation metadata in the same
browser after successful API calls; it is neither canonical state nor an
onchain-history fallback. Runtime fixture datasets and simulated verdicts are
not part of either read path.

---

## 5. Execution plan

The goal of this delivery is **a front end backend devs can plug into**:
every screen exists because there's an endpoint for it to consume. Nothing is
built to act out behavior the backend will produce.

| Phase | Delivery                                                    | Screens                 | Status  |
| ----- | ----------------------------------------------------------- | ----------------------- | ------- |
| 1     | Foundation — tokens, base components, types, API boundaries | —                       | ✅      |
| 2     | Entry                                                       | S01, S02                | ✅      |
| 3     | Dashboard                                                   | S03                     | ✅      |
| 4     | Onboarding / writes                                         | S04–S08                 | ✅      |
| 5     | Detail and management                                       | S10, S11, S12, S13      | pending |
| 6     | Audit                                                       | S14, S15, S16           | pending |
| 7     | Operations and system                                       | S18, S19, S20, S21, S22 | pending |

### 5.1 Per-screen contract

What each screen expects from the read boundary. Confirmed onchain operations
are named GraphQL queries in `lib/onchain-data`; private workflow operations
remain in `lib/api`.

| Screen  | Expected operation                                                                             |
| ------- | ---------------------------------------------------------------------------------------------- |
| S03     | `getOnchainOverview()`, `listOnchainAgents({ first, cursor, filters })`, `_meta` freshness     |
| S05     | `createAgent(payload)` → `AgentProfile` (connects an existing agent, doesn't provision one)    |
| S07     | `createPolicy(agentId, ownerWallet, PolicyRules, signer, options)` → versioned `Policy` + Safe |
| S08     | `activateProtection(agentId, policyHash)`                                                      |
| S10     | `getCrossChainAgentView(id)`, plus private `getAgent(id)` enrichment when available            |
| S11     | `getWallet(agentId)`, `rotateSigner(...)`                                                      |
| S12/S13 | `listPolicies({ agentId })`, `getPolicy(id)`, `revokePolicy(id)`                               |
| S14     | `listTeeMLValidations({ filters, first, cursor })`                                             |
| S15     | `getTeeMLValidation(id)` with indexed transaction/block provenance                             |
| S16     | `listPendingApprovals()`, `cancelProposal(id)`                                                 |
| S18     | Out of scope — no recovery/break-glass API in this branch                                      |
| S20     | Subgraph `_meta`/indexing status for Hedera and 0G, with honest partial states                 |

---

## 6. Out of scope for the The Graph data-layer branch

Recorded so it doesn't turn into an expectation:

- Implementing the TeeML model call, co-signer, or Safe execution pipeline.
- Creating payment/policy/execution facts when no current contract emits them.
- Deploying unsupported networks to Subgraph Studio/The Graph Network.
- Generating arbitrary GraphQL or adding a general-purpose Audit Copilot
  chatbot. The implemented minimum accepts only six allowlisted 0G intents,
  runs static read-only GraphQL operations, and cites indexed entities,
  transactions, blocks, and freshness. Hedera-backed intents remain gated by
  live Hedera entities.
- Server auth/session, multi-tenant, role-based permissions.
- "Bring your own agent" — roadmap, not this version (`decisions.md`).
- Internationalization and light mode.
- **Simulating a transaction proposal** (formerly S17). The agent proposes,
  via the backend. A screen that pretends to be the agent becomes dead code
  once integration happens — which is why S17 left the scope.

> **Criterion used to cut a screen.** A screen only leaves if it exists
> _only_ because the backend doesn't exist yet. Runtime fixtures are not an
> accepted substitute for an unavailable backend or onchain event. A screen
> may remain only with an honest unavailable/empty state and a documented
> producer task. By this criterion, S17 was the only one removed; S15
> (Receipt Viewer) stays because it is backed by the typed GraphQL validation
> detail operation.

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
