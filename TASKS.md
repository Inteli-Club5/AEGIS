# AEGIS Tasks

Branch task list for `feat/integration-full` (branched from `main` after PR #12
merged `feat/payment`; supersedes the stale `feat/thegraph-aegis-onchain-data-layer`
reference below, which has since merged). Keep the top unchecked item as the
current focus for the next agent session.

> On `feat/policy-engine-level-1` (now merged), `docs/aegis-current-scope.md`
> overrode older architecture, bounty, demo, and implementation notes when they
> conflicted with Policy Engine Level 1 scope; it remains the best reference for
> that subsystem's design.

## Current Focus - dashboard payment-flow integration

The precheck -> 0G TeeML verify -> Safe co-signed execute flow (previously
backend-only, verified live by the team via curl/scripts) is now wired into the
Next.js dashboard for the first time: Agentic ID registration and a new
"Actions" tab (`features/agents/components/ActionsPanel.tsx`) on the agent
detail page. Getting there required two structural additions beyond plain
wiring, both flagged loudly per the playbook:

1. A dynamic per-agent bearer token bridge (`services/agent-service/src/store.ts`,
   `policy-engine/agent-auth.ts`, new `GET /internal/agents/:agentId/auth-token`)
   since the existing `AEGIS_AGENT_AUTH_TOKENS_JSON` static env map can't cover
   agents created dynamically through onboarding (random UUID agentId).
2. An EIP-712 `AgentActionAuthorization` operator-ownership check
   (`packages/nextjs/lib/policy/action-auth.ts`,
   `lib/server/agentService.ts::verifyAgentActionAuthorization`) in front of all
   four new agent-bearer proxy routes. This was **not in the original
   implementation** - a code review (grumpy-carlos-code-reviewer) caught that
   without it, anyone who knew an agent's ID (not a secret - visible in the URL,
   returned by the unauthenticated `GET /agents/:agentId`) could fetch that
   agent's real bearer token through the dashboard's proxy and trigger a real
   Hedera testnet payment from its Safe, up to the policy's own limits, with
   zero wallet signature. Fixed before merging; do not remove this check when
   touching these routes.

- [x] 2026-08-06: Wired the Actions tab's precheck -> 0G TeeML verify -> Safe
  co-signed execute flow into the UI itself - `lib/api/actions.ts` already
  signed the EIP-712 `AgentActionAuthorization` commitment correctly, but
  nothing in the app called it, so the flow was curl-only. New
  `RunActionCard` in `ActionsPanel.tsx` (state machine: form -> precheck ->
  TeeML verify -> execute, both ALLOW/DENY paths at each stage) plus a new
  `lib/policy/actionForm.ts` parsing module. A `grumpy-carlos-code-reviewer`
  pass confirmed operator-wallet binding is solid and fixed two real gaps it
  found (missing in-flight double-submit guards; an unchecked runtime cast on
  the trusted-service semantic rule). See DEVLOG for detail.
- [ ] Manual real-browser QA of the new Actions tab and Agentic ID registration
  button (register -> precheck -> TeeML verify -> execute, both an ALLOW and a
  DENY path) - the UI now exists and is built/typechecked/linted clean, but
  still needs an actual browser click-through (same gap pattern as the
  onboarding flow before its own manual QA pass) - no live browser session
  available this session.
- [ ] Carlos's minor (non-blocking) review findings, not yet addressed:
  - `AEGIS_DASHBOARD_INTERNAL_TOKEN`'s check in
    `services/agent-service/src/index.ts` only tests truthiness, not the
    32+ character minimum the sibling `AEGIS_AGENTIC_ID_INTERNAL_TOKEN` pattern
    enforces (`app/api/0g/agentic-id/route.ts`).
  - `computeTrustedServiceMetadataHash` (`packages/nextjs/lib/policy/hash.ts`)
    is client-computed and never independently re-verified server-side
    (`trusted-service-descriptor.ts`'s `normalizedHex32` only checks format) -
    harmless today since it's bound inside the operator-signed `policyHash`,
    but either verify it or document plainly that it's a non-verified/reserved
    field.
- [ ] A full live Hedera+0G run (real testnet execute) through the new UI has
  not been performed this session - the underlying precheck/TeeML/execute logic
  itself is unchanged and was already verified live by the team (see the
  "payment execution phase" DEVLOG entry); only the new UI/auth-bridge layer on
  top of it is unverified live end-to-end.
- [x] Stood up the local Graph Node stack and deployed the 0G subgraph
  locally (`docker compose -f compose.thegraph.yaml`, query port remapped to
  18000 locally since 8000 was already held by an unrelated container on this
  machine) - build hash `QmaVs13eKCFLV9MAoZNkb4S5oqZ7ToV2nyVPu6kGHQqbY9` matches
  the team's previously-verified deployment exactly. `THEGRAPH_0G_SUBGRAPH_URL`
  is now set; the dashboard's 0G-backed views work (indexing catches up over
  time in the background). `THEGRAPH_HEDERA_SUBGRAPH_URL` remains intentionally
  unset - see `TG-DEPLOY-001`/`TG-HEDERA-RPC-001` below, unchanged blockers.
- [x] 2026-08-06: Fixed a real bug the user hit directly: the dashboard's
  "Your agents" list was sourced entirely from browser `localStorage`
  (`lib/onboarding/localAgentDraftStore.ts`), written once at agent-creation
  time - switching browser or device silently wiped it, making real,
  backend-persisted agents (including ones with an already-deployed Safe)
  disappear from the dashboard with no recovery path. The deeper gap:
  `services/agent-service` had **no endpoint or repository method at all**
  capable of listing agents by owner address, even though its Postgres
  `aegis_agents` table already had an (until now unindexed) `owner_address`
  column. Added `PolicyRepository.listAgentsByOwner` (in-memory + Postgres +
  the existing `UnconfiguredPolicyRepository` 503 fail-closed path), a
  composite `(owner_address, created_at)` index + migration
  (`drizzle/0014_colossal_madame_hydra.sql` - **run `npm run db:migrate`
  against the real Postgres instance before this is live**), and a new
  `GET /agents?owner=` route, proxied through a new same-origin
  `GET /api/agent-service/agents` handler and a new `listAgentIdsByOwner()`
  (`lib/api/onboarding.ts`). The dashboard's agent-listing effect now calls
  that, then `getAgentDetail()` per id (already existed, previously only used
  by the single-agent detail page) via `Promise.allSettled` so one flaky
  agent can't blank out the others. A `grumpy-carlos-code-reviewer` pass
  caught two real issues in the first draft, both fixed: (1) the initial
  version had the new route return full `AgentProfile[]` objects (Safe
  address, the full 2-of-3 owner set, description, toolNames, agenticId) in
  bulk, keyed only on a public owner wallet address - a materially bigger
  unauthenticated enumeration surface than the existing single-agent
  `GET /agents/:agentId` (which at least requires already knowing a specific
  agentId); narrowed the route to return only `agentIds`, with each id's full
  profile still fetched individually the existing way. (2) the first version
  silently dropped an agent from the list whenever its in-memory profile was
  missing (e.g. after a service restart - `store.ts`'s profile map is a
  `// TODO(aegis): replace with a real database` in-memory `Map`), making a
  restart-related gap indistinguishable from "this owner truly has zero
  agents"; fixed by having the list route read only from the durable Postgres
  index (always accurate) and letting a missing in-memory profile surface as
  the existing, already-handled per-agent 404 on the follow-up detail fetch
  instead. Documented the enumeration-surface tradeoff and the new
  `DATABASE_URL`-required consequence (every environment without Postgres
  configured now shows a load-error banner instead of a stale local cache) in
  `docs/decisions.md`. New `services/agent-service/src/agentsListByOwner.test.ts`
  (5 cases: owner scoping, no bulk profile leakage, survives an empty
  in-memory store, malformed/missing owner param, 503 when unconfigured).
  `tsc --noEmit`, `next lint`, and the full unit suites pass on both packages
  (agent-service: 250/251, one pre-existing unrelated failure in
  `walletCreation.test.ts` confirmed present before this change too; nextjs:
  109/109).

## The Graph continuation (older, still open)

Canonical continuation details, exact commands, evidence requirements, and
acceptance criteria live in
`docs/handoffs/THEGRAPH_INTEGRATION_CONTINUATION.md`. Do not reopen decisions
recorded there.

- [ ] **TG-DEPLOY-001:** provide the ignored exact root file
  `tee-smartcontract-validation`, then perform and verify the singleton Hedera
  Testnet registry deployment.
- [ ] **TG-HEDERA-RPC-001:** operate the documented dedicated Mirror Node ->
  Hiero JSON-RPC Relay -> Graph Node path until the strict repeated-read
  preflight ends in `HEDERA_GRAPH_RPC_READY`, then synchronize `aegis-hedera`.
- [ ] **TG-TEEML-E2E-001:** connect an eligible production-private, sealed and
  byte-for-byte verified 0G TeeML artifact to the registry writer, then prove
  TeeML -> registry -> Hedera Subgraph -> GraphQL -> dashboard end to end. The
  live hackathon TeeTLS profile is explicitly not production-authorizing.
- [ ] **TG-EVENTS-001:** add the documented sanitized business execution/payment
  producer event before enabling those dashboard views.
- [ ] **TG-AUDIT-COPILOT-001:** add Hedera-backed constrained intents after their
  live indexed entities exist; keep the working 0G-only minimum read-only.
- [x] **TG-AGENTIC-ID-001:** recovered and verified the Agentic ID deployment,
  source/runtime provenance, deployment block, and fixed-width event ABI.
- [x] **Self-hosted Graph Node eligibility:** HUMAN-CONFIRMED / RESOLVED.

## TeeML Follow-up Decisions

- [ ] Decide whether AEGIS should accept any agent/user free-text description
  of intent into the TeeML flow. Today it deliberately does not: the
  precheck v2 body and the TeeML verify body both reject `reason` /
  `agentReason` / `semanticContext` as unknown properties, and the system
  prompt instructs the model not to trust or request agent justification
  (`POTENTIAL_PROMPT_INJECTION` on anything that tries). Four options were
  laid out 2026-07-25, from safest to riskiest: (1) keep as-is, no free text
  at all; (2) accept a declared-intent field for audit/dashboard display
  only, never sent to the model or used in the verdict (recommended); (3)
  reintroduce a bounded free-text field into the model prompt, sandboxed as
  untrusted data per the existing prompt-injection guard, but with real
  residual risk; (4) let free text genuinely influence the verdict (not
  recommended - reopens the exact social-engineering-the-verifier risk the
  current design was hardened against). No decision made yet; nothing
  implemented for this.

- [ ] Decide whether to invest in reverse-engineering the hackathon TeeTLS
  provider's undocumented signed-response commitment scheme (`text` field is
  `<hash>:<hash>:provider_type:provider_identity:tls_fingerprint`, not raw
  content - discovered 2026-07-25, exact hash inputs unknown) to close the
  byte-for-byte content-verification gap in `zero-g-direct-inference.ts`, or
  accept the current `processResponse` signature-validity check (proves a
  genuine signature from the acknowledged TEE signer exists for the exact
  chat ID, not that it matches this content byte-for-byte) as sufficient for
  this explicitly non-production, hackathon-only profile. Neither choice
  blocks the demo. (Optional/courtesy, unrelated) report the confirmed
  testnet Router `chat_id_not_found` bug to 0G/Integrate Network support.
  Separately: decide whether `production-private-teeml` (mainnet) should
  also move to Direct mode before that path is ever exercised for real.

## Done

- [x] 2026-07-25: Root-caused the hackathon TeeTLS `chat_id_not_found` block to
  a bug in the testnet Router's completion proxy (confirmed independent of
  agent identity and of `verify_tee` via live diagnosis and an A/B test), then
  fixed it by moving the `hackathon-testnet-teetls` profile to the official
  SDK's Direct broker mode (bypasses the Router; talks to the pinned provider
  directly with a funded ledger, acknowledged TEE signer, and
  `processResponse` verification). Also fixed a separate, previously-unhit bug:
  `ZG_TEEML_MAX_OUTPUT_TOKENS` defaulted/ceilinged at 256, which silently
  truncates the real verdict schema's four hex hashes mid-JSON; raised to 768
  everywhere. A code review then caught that `processResponse` alone doesn't
  prove signed content matches the trusted verdict text (it checks signature
  validity, not a content commitment); attempting the suggested fix (reusing
  the Router path's byte-for-byte verifier) failed closed on every real
  response because the provider's actual signed response is an undocumented
  hash commitment, not raw text - confirmed by live debugging, not fixable
  without provider documentation. Reverted to `processResponse` with this
  limitation explicitly disclosed in code comments and both 0G docs, rather
  than silently overstating the verification. `npm run test:0g:teetls:hackathon`
  now produces a real signed ALLOW/DENY evidence pair (twice, including a
  second full fresh run from Hedera account creation), and a full real HTTP
  flow (Hedera account, Safe, 0G Agentic ID, Policy, Level 1 precheck, TeeML
  verify) completes with `TEETLS_HACKATHON_ALLOWED`. Production
  `production-private-teeml` (mainnet, Router-based) is untouched and still
  unproven.

- [x] 2026-07-25: Implemented explicit 0G semantic-verification security
  profiles: mainnet-only Private/TeeML for production and testnet-only TeeTLS
  for the hackathon, with provider pinning, no Router or application fallback,
  strict TEE/signature/content verification, honest persistence labels, profile
  isolation, separate demo-only ALLOW state, PostgreSQL constraints and handoff
  triggers, immutable final artifacts, audit-to-verification binding,
  documentation, and full local tests. Router testnet funding is now
  available and the real request reaches the provider; live evidence remains
  externally blocked because its signed-response endpoint returns HTTP 400.
## Deferred Existing Frontend QA


- [x] 2026-07-26: Implemented and verified the full post-TeeML payment
  handoff end to end on real Hedera testnet: execution fee calculation,
  signed `DecisionReceipt` (dedicated `agentVerifierSigner` key), a real
  `cosigner` service that independently re-verifies before co-signing, and
  `POST /actions/:requestId/execute` (rerun Level 1 -> receipt -> agent
  signs -> cosigner verifies+co-signs -> execute -> commit UsageHold only
  after confirmed execution), gated behind the explicit
  `AEGIS_ALLOW_HACKATHON_EXECUTION` opt-in. Along the way, found and fixed a
  genuine Hedera EVM incompatibility: Safe's `execTransaction` reverted with
  `GS013` on every attempt to move native HBAR, root-caused via an isolated
  minimal-proxy repro (no Safe code involved) to Hedera unconditionally
  rejecting a native value transfer performed by code executing via
  `DELEGATECALL` - exactly how every Safe `execTransaction` runs its inner
  call, confirmed across two different JSON-RPC relays and independent of
  MultiSend, destination address form, gas stipend, or target type. Fixed by
  routing the payment through Hedera's HTS `cryptoTransfer` system-contract
  precompile (`0x167`, `value: 0`) instead of a plain value-carrying `CALL` -
  which also collapses the old two-leg MultiSend batch into one atomic call.
  Documented the finding in `docs/decisions.md` and
  `docs/aegis-current-scope.md` so it isn't silently re-broken later. Full
  fresh run confirmed via the Hedera mirror node: `result: SUCCESS`,
  destination and fee-recipient balances moved by the exact expected
  amounts. `tsc --noEmit` and the full unit suite (25 tests) pass clean on
  both `agent-service` and `cosigner`.

- [ ] Manual real-browser / real-MetaMask QA pass - everything below was
  built and verified via `check-types`/`lint`/unit tests only, since it all
  sits behind `ConnectGate` and headless Chrome has no injected wallet
  provider to click through it with:
  - [ ] `/onboarding` with a genuinely unfinished draft in `localStorage`
    shows "Continue setting up X?" instead of silently resuming into
    "Create version v2"; "Protect a different agent" lands on a clean
    step-0 form.
  - [ ] "Fund this wallet" (onboarding success screen, and the agent detail
    page's Wallet tab): connect, enter an amount, confirm, and confirm the
    Safe's live balance updates afterward.
  - [ ] Logo click routes to `/dashboard` once connected (from any app
    page, including mid-onboarding) and to `/` otherwise; clicking the
    connected-wallet pill in the app topbar opens the wallet modal;
    "Launch the app" on the landing page skips the modal and goes straight
    to `/dashboard` when already connected.
  - [ ] "Delete agent" (agent detail page, Danger zone): deletes cleanly,
    redirects to the dashboard, the agent no longer appears there, and a
    second delete of an already-deleted agent doesn't error (DELETE is
    idempotent by design). The HTTP round trip is now confirmed working via
    curl end to end (backend directly and through the Next.js proxy both
    return a clean `204`), after fixing two bugs: a stale `agent-service`
    dev process that hadn't picked up the new route, and
    `lib/server/agentService.ts` crashing while trying to attach a JSON
    body to a `204` response. Only the actual button-click UI flow in a
    browser is still unverified.
  - [ ] Disconnect fully clears the session: connect with one wallet,
    disconnect, connect with a different one, disconnect again, reload -
    confirm nothing auto-reconnects and no stale account/balance from an
    earlier connection ever reappears (`ConnectWalletProvider.tsx`'s
    `disconnect()` now tears down every active connection via
    `useConnections()`, not just the "current" one).

## Done

- [x] 2026-07-25: Completed the The Graph onchain read-layer core on
  `feat/thegraph-aegis-onchain-data-layer`: singleton sanitized TeeML registry
  contract and crash-safe exclusive-env deployment workflow; separate Hedera
  and 0G Subgraphs; self-hosted Graph Node stack; typed GraphQL-only dashboard
  reads, filters, pagination, freshness, cross-chain partial joins, and live
  0G Audit Copilot intents. The real 0G deployment is healthy/synced; all
  remaining external dependencies and exact continuation commands are in
  `docs/handoffs/THEGRAPH_INTEGRATION_CONTINUATION.md`. Removed runtime fixture,
  direct-RPC read, placeholder Agentic-ID policy, and unused starter-service
  paths. Added durable cross-replica Safe creation checkpoints and migrations.
- [x] 2026-07-25: Fixed a stale-wallet-after-disconnect bug: a specific real
  address with a `0.0` HBAR balance kept resurfacing after disconnect, even
  though it wasn't the user's actual connected account. Root cause (found
  via wagmi's docs, not guesswork): a bare `disconnectAsync()` only tears
  down "the current connection" - since this session tested MetaMask,
  WalletConnect, and Coinbase in the same browser while debugging
  `findConnector()`, each left its own persisted entry in wagmi's
  `localStorage`-backed store, and `WagmiProvider`'s `reconnectOnMount`
  (default `true`) auto-reconnects to whatever's left there on the next
  mount. Fixed by having `disconnect()` enumerate every active connection
  via `useConnections()` and disconnect each one, instead of only the
  implicit "current" one. `check-types` and `lint` pass clean.
- [x] 2026-07-25: Added an agent delete action, scoped intentionally to
  AEGIS's own off-chain records only - the user explicitly asked to leave
  on-chain state (the Hedera account, any deployed Safe) untouched. New
  `DELETE /agents/:agentId` in `services/agent-service` removes the
  in-memory profile (`store.ts`) and, when Postgres is configured, cascades
  through `aegis_wallet_nonces` -> `aegis_wallets` -> `aegis_policies` ->
  `aegis_agents` in one transaction (`PostgresPolicyRepository.deleteAgent`,
  new on the `PolicyRepository` interface, so `InMemoryPolicyRepository` and
  `UnconfiguredPolicyRepository` both got a matching implementation too -
  the compiler enforced covering every implementer). Frontend: a "Delete
  agent" button in a new Danger zone section on the agent detail page,
  behind a confirm dialog reusing the existing `ConfirmDialog`, calling a
  new `deleteAgent()` (`lib/api/agents.ts`) that hits the backend then clears
  the agent from the local onboarding draft cache (`lib/onboarding/localAgentDraftStore.ts`) and
  redirects to `/dashboard`. `check-types`, `lint`, and all 60
  `services/agent-service` unit tests pass.
- [x] 2026-07-25: Fixed three navigation papercuts the user hit while testing
  the onboarding flow: (1) `AppTopbar`'s logo always linked to `/` (the
  landing page) regardless of connection state, so there was no one-click
  way back to the dashboard while mid-onboarding - it now links to
  `/dashboard` once connected (and still to `/` otherwise), matching how
  `features/landing/components/Nav.tsx` already treated its own connected
  pill. (2) The connected-wallet address pill in `AppTopbar` was a plain,
  non-interactive `<span>` - clicking it did nothing; it's now a button that
  opens the wallet modal (`openModal()`), consistent with what "click the
  wallet" already does everywhere else in the app. (3) The landing page's
  "Launch the app" button always opened the connect modal, even for an
  already-connected wallet; it now checks `status` first and routes straight
  to `/dashboard`, only opening the modal when not yet connected.
  `check-types` and `lint` pass clean.
- [x] 2026-07-25: Found the actual root cause of the recurring "v2" bug the
  earlier `handleAgentCreated` fix didn't cover: `/onboarding` silently
  resumes ANY unfinished draft from `localStorage` (`features/onboarding/
  draft.ts`) on a fresh page load, with no indication to the user that
  they're not starting fresh. If a previous agent was registered and a
  policy draft was created but the wizard was ever abandoned before
  activating (closed tab, navigated away - anything short of the wizard's
  own Cancel/Discard, which is the only place that already called
  `clearDraft()` mid-flow), the next visit to `/onboarding` drops straight
  into that old agent's `StepCreatePolicy`/`StepActivate`, correctly showing
  "Create version v2" for what really is a second version of that OLD
  agent's policy - but with nothing distinguishing this from a fresh
  session, a user who intends to register a genuinely new agent has no way
  to tell they've been handed someone else's in-progress state instead.
  Fixed in `app/onboarding/page.tsx`: when the draft is past step 0, show an
  explicit "Continue setting up {agent}?" prompt with a "Protect a different
  agent" option that calls `clearDraft()` and forces a clean step-0 start,
  instead of ever silently choosing for the user. `check-types` and `lint`
  pass clean; this couldn't be clicked through headlessly since the whole
  page sits behind `ConnectGate` - see Current Focus.
- [x] 2026-07-25: Made the new "Fund this wallet" action reachable right from
  the onboarding success screen (`SuccessScreen.tsx`), not just the agent
  detail page - reused `FundWalletCard` directly there, since a Safe with a
  zero balance and no easy way to find it again (without a trip through the
  dashboard) made the feature hard to verify. Threaded `wallet` into
  `SuccessScreen` (`OnboardingWizard.tsx`'s completion guard is now
  `done && agent && wallet`, safe since `StepActivate` can't render without
  a wallet already set) and replaced "Go to dashboard" with "Go to agent",
  linking straight to `/agents/:id` per explicit request. `check-types` and
  `lint` pass clean.
- [x] 2026-07-25: Added a "Fund this wallet" action to the agent detail
  page's Wallet tab so the operator can send native HBAR from their already-
  connected MetaMask straight to the agent's Safe address
  (`FundWalletCard.tsx`, new file). Uses wagmi's `useSendTransaction` +
  an imperative `waitForTransactionReceipt` (not the reactive hook, to avoid
  a `useEffect` keyed on an unstable query-result object) and viem's
  `parseEther`/`formatUnits` at 18 decimals, matching Hedera testnet's
  EVM-facing `nativeCurrency.decimals` - a different unit system from the
  Policy Engine's own 8-decimal tinybar accounting (`lib/policy/amount.ts`)
  that must not be conflated with it. Also replaced the Wallet tab's static,
  always-stale `agent.balanceHbar` display with a live `useBalance` query on
  the Safe's address, since a stale balance next to a working funding action
  would be actively misleading. Initially built a "wallet not connected"
  fallback inside the card, then removed it after tracing
  `app/agents/[id]/page.tsx`: that page renders behind a `ConnectGate` and
  only mounts `AgentDetailView` once a wallet is already connected, so the
  fallback was dead code for a state the page architecture already rules
  out. `check-types` and `lint` pass clean; a headless-Chrome smoke test
  confirmed the (wallet-agnostic) dashboard renders with no console/runtime
  errors, but the connected-wallet path itself needs a real browser
  extension to click through - see Current Focus above.
- [x] 2026-07-25: The user manually walked the full onboarding flow (register
  agent -> create policy -> activate) in a real browser with a real MetaMask
  session and confirmed it works end to end - this closed the one
  verification gap every prior session had deferred (previous passes only
  used scripted/curl signing with a throwaway private key, never an actual
  browser extension). While repeating the walkthrough for a second agent,
  found a real bug: creating a brand-new agent showed "Create version v2"
  instead of "Create policy v1". Root cause: `OnboardingWizard.tsx`'s
  `handleAgentCreated()` set the new agent into state but never cleared
  `policy`/`wallet`, so a policy left over from a previously
  registered-but-never-activated agent (wizard opened, agent created, then
  abandoned) leaked into the next, genuinely new agent's context. Fixed by
  explicitly resetting `setPolicy(undefined)` and `setWallet(undefined)`
  alongside `setStep(1)` in `handleAgentCreated`.
- [x] 2026-07-25: Exposed the recovery guardian address as a user choice in
  `StepCreatePolicy.tsx` (shown only on an agent's first policy version, since
  that's when the wallet is actually created) - "use the AEGIS-configured
  default" or "use a specific wallet", normalizing any custom address to its
  correct EIP-55 checksum before sending (`lib/policy/form.ts`) so a
  miscased user-entered address can't trigger the same class of failure the
  checksum bug below did. Verified live: a fresh, arbitrary, randomly
  generated address was successfully set as a real deployed Safe's recovery
  guardian end to end. Added 2 unit tests (checksum normalization + rejection
  of a malformed address) alongside the existing `lib/policy/form.test.ts`
  suite; all pass.
- [x] 2026-07-25: Re-reviewed the fixed Policy Engine frontend integration end
  to end (real EIP-712-signed create + activate against a live service,
  Postgres-backed) after the previous review's blockers were fixed. Found and
  fixed one remaining real bug: `AEGIS_RECOVERY_GUARDIAN_ADDRESS` in
  `services/agent-service/.env` had an invalid EIP-55 checksum
  (`...aE61` instead of `...AE61`), which made every wallet creation fail
  whenever the frontend didn't supply its own guardian address - i.e. always,
  today. `check-types`, `lint`, and all 60 backend unit tests pass; a live
  signed create -> activate -> re-activate (retry-safety) round trip succeeded
  end to end after the fix.
- [x] 2026-07-25: Reviewed the uncommitted Policy Engine frontend integration
  against the Level 1 contract, confirmed frontend/backend policy hash and
  EIP-712 signature parity, and recorded the remaining integration blockers.
- [x] 2026-07-25: Policy Engine Level 1 PR #7 was merged into `main`.
- [x] 2026-07-25: Round -1 and Round 0 scope/audit findings were consolidated
  into `docs/aegis-current-scope.md`.
- [x] 2026-07-25: Round 1 implemented Policy Engine Level 1 Policy data
  contracts and lifecycle in `services/agent-service`, including strict schema
  validation, deterministic `policyHash`, operator signature authorization,
  PostgreSQL/Drizzle schema and migration, concrete Policy HTTP routes, API
  documentation, and service tests.
- [x] 2026-07-25: Phase 1.5 added local PostgreSQL Docker setup, applied the
  real Drizzle migration against a clean PostgreSQL database, added PostgreSQL
  integration tests, audited/corrected operator signatures to EIP-712
  `PolicyCommitment`, and reviewed the diff for Round 1 scope hygiene.
- [x] 2026-07-25: Phase 2 implemented the pure deterministic evaluator with
  `PASS_TO_TEEML`/`DENY_PRECHECK`, stable reason codes, explicit `now`, bigint
  amount handling, and unit tests for deterministic and side-effect-free
  behavior.
- [x] 2026-07-25: Phase 3 implemented durable precheck orchestration with
  PostgreSQL-backed idempotency, monotonic wallet nonces, action requests,
  precheck records, UsageHolds, sanitized audit events, real HTTP routing, and
  PostgreSQL integration tests for concurrency and rollback.
- [x] 2026-07-25: Hardened precheck semantic-context privacy by replacing the
  legacy action `reason` path with required `semanticContext`, removing
  persisted private payload storage, adding an idempotent cleanup migration,
  persisting only `semanticContextHash`, and documenting the future TeeML
  persistence allowlist.
- [x] 2026-07-25: Completed guided Policy Engine Level 1 validation and coverage
  hardening, adding regression coverage for lifecycle validation, operator auth,
  canonical hashing, evaluator URL handling, precheck idempotency/privacy,
  HTTP errors, PostgreSQL conflict mapping, and legacy migration upgrade
  behavior.
- [x] 2026-07-25: Completed Step 8 PR-readiness cleanup by fixing Drizzle
  migration metadata hygiene, making `db:generate` a clean no-op, preserving
  runtime migration behavior, and rerunning the full release validation suite.
