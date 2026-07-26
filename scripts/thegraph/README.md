# Local The Graph workflow

The scripts keep Hedera and 0G independently runnable with the network argument `hedera`,
`0g`, or `all`. A missing Hedera registry artifact therefore does not block validating the
known 0G deployment.

1. `install.sh` installs the pinned Graph CLI, graph-ts, and Matchstick dependencies.
2. `preflight.sh --network <network>` validates chain identity, required RPC methods, public
   artifacts, latest bytecode, and known public evidence. Historical-state gaps are surfaced as
   warnings; event-only mappings still require a successful real sync.
3. `up.sh` starts the private-by-default Graph Node, dedicated PostgreSQL, and IPFS services.
4. `generate.sh`, `codegen.sh`, `build.sh`, `test.sh`, and `lint.sh` prepare and validate a
   selected Subgraph. No executable manifest is generated with a zero or placeholder address.
5. `create.sh` prepares names; each explicit deploy script reruns its network preflight and only
   submits after that gate succeeds.
6. `status.sh` is the synchronization gate; deployment alone is never reported as synced.
7. `smoke.sh` requires `_meta` without indexing errors and a protocol summary produced by at
   least one real indexed event.

Safe data sources are discovered from sanitized registry events. This cannot reconstruct Safe
history before the first registry event that names a Safe. The Safe `payment` event field is a
refund/payment value defined by Safe itself and is indexed as `refundPayment`; it is not exposed
as an AEGIS provider payment. No current event proves a separate AEGIS payment entity.

Before a real registry deployment exists, Hedera codegen and unit tests use an ignored,
unaddressed manifest under `subgraphs/aegis-hedera/.thegraph/`. It contains no fake address and
the deploy script never accepts it. `generate.sh hedera` and live deployment still fail closed
until the public artifact supplies the real address and start block.

The 0G source starts at the independently verified Agentic ID contract deployment block
`23,544,364`. The deployment transaction and source/runtime provenance are recorded in
`subgraphs/aegis-0g/config/agentic-id.json`; the known AEGIS token `102` mint remains a separate
smoke-test anchor. A historical `eth_getCode` missing-trie response is reported as a warning,
while repeated deployment receipt checks and a successful Graph Node sync are mandatory gates.

Graph Node process health and chain indexability are separate. `status.sh` requires an ingested
chain-head observation for the selected network in addition to Subgraph sync, but does not call
that single metric proof of provider consistency; `preflight.sh` is that separate gate. The Compose topology
routes Hedera only through the pinned self-hosted Hiero JSON-RPC Relay; it never falls back to
Hashio. A relay backed by the public Testnet Mirror Node still returned transactions in blocks
while repeated `eth_getTransactionByHash` and receipt reads returned `null`, so it is not yet a
Graph-Node-compatible archive path. `preflight.sh` ends explicitly in
`HEDERA_GRAPH_RPC_READY` or `HEDERA_GRAPH_RPC_BLOCKED` after repeated block, transaction,
receipt, log, and contract-history checks. The required production path is a dedicated current
Mirror Node feeding the pinned relay, then Graph Node. The independently deployable 0G workflow
remains usable; no retry or fallback masks Hedera inconsistency.

Use of the self-hosted Graph Node for this project is a human-confirmed architecture decision.
It is not a claim that either Subgraph is published to The Graph Network.
