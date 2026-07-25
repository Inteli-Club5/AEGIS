# AEGIS Tasks

Branch task list for `feat/policy-engine-level-1`. Keep the top unchecked item as
the current focus for the next agent session.

> On this branch, `docs/aegis-current-scope.md` overrides older architecture,
> bounty, demo, and implementation notes when they conflict with Policy Engine
> Level 1 scope.

## Current Focus

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
  the agent from the local dashboard cache (`lib/fixtures/store.ts`) and
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
