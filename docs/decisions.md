# Decisions (ADR-lite)

One line per hard-to-reverse decision. Oldest first. If a decision changes,
add a new line noting the change and why — don't edit history away.

- 2026-07-24 — All EVM contracts on Hedera testnet (single-chain MVP).
- 2026-07-24 — Protected Agent Wallet (`AgentVault`) is a real Safe{Core}
  smart account, 2-of-2 (agent signer + AEGIS co-signer) — not a mock vault
  kept "for later." See `docs/AEGIS_ARCHITECTURE.md` §3.3, §8.
- 2026-07-24 — The Graph indexes `PolicyRegistry` + Safe execution + Decision
  Receipt events; the dashboard and audit log read from the subgraph, not raw
  RPC logs. Promoted from stretch to core. See
  `docs/AEGIS_ARCHITECTURE.md` §5.3.
- 2026-07-24 — AEGIS creates the AI agent itself, built on Hedera, as part of
  onboarding in this version — the user does not need to already have one.
  Connecting a user's own external agent ("bring your own agent") is a
  roadmap item, out of scope now. See `docs/AEGIS_ARCHITECTURE.md` §1.
- 2026-07-24 — Supersedes the 2-of-2 line above: the Protected Agent Wallet
  is Safe 2-of-3 (agent signer + AEGIS co-signer + recovery guardian), not
  plain 2-of-2. The guardian never signs routine transactions — only
  break-glass recovery if the agent signer or AEGIS co-signer is stuck. See
  `docs/AEGIS_ARCHITECTURE.md` §3.3, §9.3.
- 2026-07-24 — The AEGIS co-signer key is one institutional key operated by
  AEGIS across every deployment/user (like a custodian), not a distinct key
  per user or per instance. Accepted tradeoff: a leak has company-wide blast
  radius, not just one deployment's. Mitigated today by the 2-of-3 threshold
  (stealing this key alone isn't enough); the deeper fix — a Safe Guard/Module
  requiring an on-chain 0G attestation before execution — is a known TODO,
  blocked on 0G being wired into the cosign flow. See
  `docs/AEGIS_ARCHITECTURE.md` §9.2, `services/cosigner/src/index.ts`.
- 2026-07-25 — On `feat/policy-engine-level-1`,
  `docs/aegis-current-scope.md` is the single branch scope, interface, and
  handoff document. It overrides older architecture, bounty, demo, and
  implementation notes when they conflict with the Level 1 Policy Engine
  boundary.
- 2026-07-26 — Every Safe-executed HBAR payment on Hedera must move value by
  targeting the HTS system-contract precompile (`0x167`, `cryptoTransfer`)
  with `value: 0`, never by attaching native `value` to a plain `CALL` to the
  destination. Confirmed via an isolated minimal-proxy repro that Hedera's
  EVM (testnet, both the Hashio and thirdweb JSON-RPC relays) unconditionally
  rejects a native HBAR transfer performed by code executing via
  `DELEGATECALL` — exactly how every Safe `execTransaction` runs its inner
  call — regardless of gas stipend, target type (EOA or contract), or
  mechanism (`.call{value}` vs `.transfer()`). `cryptoTransfer` moves value
  through Hedera's native ledger logic instead, which is unaffected, and lets
  one call encode the whole split payment (destination + AEGIS fee) without
  MultiSend batching. See `services/agent-service/src/payment/hts.ts` and
  `services/agent-service/src/payment/safe-payment.ts`.
