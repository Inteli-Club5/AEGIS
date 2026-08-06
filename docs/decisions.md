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
- 2026-07-25 — On `feat/thegraph-aegis-onchain-data-layer`, The Graph GraphQL
  endpoints are the canonical dashboard source for confirmed/historical
  onchain state. RPC, Mirror Node, explorer, fixture, and private-database
  fallbacks are prohibited for that read model; writes and transient receipt
  tracking remain outside this boundary. See `docs/thegraph/architecture.md`.
- 2026-07-25 — Hedera and 0G use separate Subgraphs because a Subgraph indexes
  one network. Both run on a reproducible local Graph Node while those networks
  remain unsupported by The Graph Network; each may migrate independently when
  official support exists. Cross-chain joins occur only in the typed client.
- 2026-07-25 — Verified TeeML results use one non-upgradeable Hedera
  `AegisTeeValidationRegistry`, with immutable one-record-per-request facts and
  separate admin/recorder roles. It stores only fixed-size sanitized fields.
  Technical TeeML failures are not onchain verdicts.
- 2026-07-25 — Supersedes the 2026-07-24 `PolicyRegistry`/`AgentVault` indexing
  assumption: no such AEGIS contracts are treated as deployed producers in this
  branch. The operational wallet is a real Safe; policies remain private/offchain;
  Subgraphs index only the verified Agentic ID, TeeML registry, and Safe events
  that actually exist. Missing business producers remain explicit gaps.
- 2026-07-25 — Cross-chain `agentIdHash` is exactly
  `keccak256(UTF-8(trim(agentId)))`, matching the existing 0G Agentic ID
  commitment. Registry UUID request IDs use the same explicitly documented
  string-to-bytes32 boundary rule. Neither conversion lowercases the input.
- 2026-07-25 — Substreams is not used for the event-based EVM MVP. Subgraphs
  directly provide the required typed GraphQL API with lower operational scope.
- 2026-08-06 — The dashboard's agent list is sourced from a new unauthenticated
  `GET /agents?owner=` (`services/agent-service`), keyed on the Postgres
  `aegis_agents.owner_address` index, replacing a browser-`localStorage` cache
  that lost real, backend-persisted agents on every browser/device switch.
  The route returns only `agentIds`, never full profiles, in bulk — an
  unauthenticated bulk profile dump (Safe address, 2-of-3 owner set,
  description) keyed on a public wallet address would be a materially bigger
  enumeration surface than the existing single-agent `GET /agents/:agentId`,
  which at least requires already knowing a specific agentId. Each id's full
  detail is still fetched individually via the existing route. Consequence:
  the dashboard now requires `DATABASE_URL` configured (Policy Engine
  Postgres) to list any agents at all; without it, every environment sees a
  load-error banner instead of a locally cached list.
