# The Graph source register

Consulted on **July 25, 2026**. Current official documentation takes precedence over copied examples, historical AEGIS notes, and the locally cloned skills.

## Official documentation and repositories

| Source | URL | Decision or fact used |
| --- | --- | --- |
| AI overview | https://thegraph.com/docs/en/ai-overview/ | The Graph can provide indexed, queryable onchain context to AI systems; it is not an execution or policy-enforcement engine. |
| Subgraphs overview | https://thegraph.com/docs/en/subgraphs/overview/ | Subgraphs provide a typed GraphQL API over indexed blockchain data. |
| Starting a Subgraph | https://thegraph.com/docs/en/subgraphs/developing/creating/starting-your-subgraph/ | Project layout and the schema/manifest/mapping workflow. |
| Graph CLI installation | https://thegraph.com/docs/en/subgraphs/developing/creating/install-the-cli/ | The CLI is project-local and version-pinned instead of relying on an untracked global installation. |
| `graph-ts` reference | https://thegraph.com/docs/en/subgraphs/developing/creating/graph-ts/README/ | Mapping types and deterministic AssemblyScript APIs. |
| Subgraph skills | https://thegraph.com/docs/en/subgraphs/tooling/skills/ | Recommended development, optimization, and testing skill package. |
| Subgraph MCP | https://thegraph.com/docs/en/subgraphs/tooling/subgraph-mcp/introduction/ | Future schema discovery and read-only querying for deployments published to The Graph Network. It is not assumed to support this repository's local Graph Node. |
| Subgraph Linter | https://thegraph.com/docs/en/subgraphs/tooling/subgraph-linter/ | Static checks are part of the completion gate; suppressions must be local and justified. |
| Supported Networks | https://thegraph.com/docs/en/supported-networks/ | Neither Hedera nor 0G/Galileo is listed for Network/Studio deployment on the consultation date. The official guidance allows a local Graph Node for an EVM-compatible network. |
| Subgraph manifest | https://thegraph.com/docs/en/subgraphs/developing/creating/subgraph-manifest/ | One Subgraph indexes one network. Manifests use an explicit address and start block and prefer event handlers over contract calls. |
| GraphQL schema | https://thegraph.com/docs/en/subgraphs/developing/creating/ql-schema/ | Immutable facts, `Bytes` for addresses/hashes, and derived relationships. |
| AssemblyScript mappings | https://thegraph.com/docs/en/subgraphs/developing/creating/assemblyscript-mappings/ | Deterministic event handling without HTTP or application-database access. |
| Querying | https://thegraph.com/docs/en/subgraphs/querying/introduction/ | Static GraphQL documents and variables are the dashboard boundary. |
| Query best practices | https://thegraph.com/docs/en/subgraphs/querying/best-practices/ | Bounded pagination, deterministic ordering, and avoiding unbounded result sets. |
| Advanced Subgraphs | https://thegraph.com/docs/en/subgraphs/developing/creating/advanced/ | `_meta`, indexing errors, timeseries, and aggregation trade-offs. |
| Matchstick | https://thegraph.com/docs/en/subgraphs/developing/creating/unit-testing-framework/ | Mapping unit tests complement, but do not replace, a real Graph Node indexing test. |
| Matchstick repository | https://github.com/LimeChain/matchstick | Officially referenced Matchstick implementation and releases. |
| Graph Node repository | https://github.com/graphprotocol/graph-node | Canonical self-hosted indexer implementation. |
| Graph Node Docker guide | https://github.com/graphprotocol/graph-node/blob/master/docker/README.md | Container topology and service ports for Graph Node, PostgreSQL, and IPFS. |
| Graph tooling repository | https://github.com/graphprotocol/graph-tooling | Canonical Graph CLI source and release history. |
| Subgraph Linter repository | https://github.com/graphprotocol/subgraph-linter | Canonical linter source and installation workflow. |
| Graph Node `v0.44.0` | https://github.com/graphprotocol/graph-node/releases/tag/v0.44.0 | Pinned self-hosted indexer version used by Compose. |
| Hiero JSON-RPC Relay | https://github.com/hiero-ledger/hiero-json-rpc-relay | Official Ethereum JSON-RPC compatibility layer for Hedera. |
| Hiero JSON-RPC Relay `v0.78.1` | https://github.com/hiero-ledger/hiero-json-rpc-relay/releases/tag/v0.78.1 | Pinned read-only relay version used by Compose and the dedicated-Mirror handoff. |
| Relay configuration | https://github.com/hiero-ledger/hiero-json-rpc-relay/blob/v0.78.1/docs/configuration.md | `CHAIN_ID`, `HEDERA_NETWORK`, Mirror REST/Web3 endpoints, read-only mode, and server-port configuration. |
| Hiero Mirror Node | https://github.com/hiero-ledger/hiero-mirror-node | Official archive/data stack that imports signed Hedera stream data and serves REST/Web3 APIs. |
| Hiero Mirror Node `v0.159.1` | https://github.com/hiero-ledger/hiero-mirror-node/releases/tag/v0.159.1 | Selected dedicated Testnet Mirror Node version for `TG-HEDERA-RPC-001`. |
| Mirror Node installation | https://github.com/hiero-ledger/hiero-mirror-node/blob/v0.159.1/docs/installation.md | Official Docker Compose procedure, persistent database, public-network configuration, and health verification. |
| `hedera-the-graph` `v0.1.1` | https://github.com/hashgraph/hedera-the-graph/releases/tag/v0.1.1 | Reviewed historical Hedera Helm packaging; not treated as a substitute for a consistent source or strict preflight. |
| Agentic ID source | https://github.com/0gfoundation/agenticID-examples/tree/fd3c58306bf45c42888d4acda949bac0d3d64522/examples/01-mint-and-manage | Verified source revision used to compile and compare the live runtime and derive the event ABI. |

## Selected toolchain

| Tool | Selected version or revision | Installation scope |
| --- | --- | --- |
| Graph Node | `v0.44.0` | Pinned container image in `compose.thegraph.yaml`. |
| Hiero JSON-RPC Relay | `v0.78.1` | Pinned read-only container in `compose.thegraph.yaml`. |
| Hiero Mirror Node | `v0.159.1` | Selected dedicated Testnet data-source release for the external infrastructure handoff. It is not yet part of this repository's Compose stack. |
| Graph CLI | `0.98.1` | Project development dependency used by the Subgraph scripts. |
| `graph-ts` | `0.38.0` | Project dependency used by both Subgraphs. |
| Matchstick | `0.6.0` | Development dependency used by both Subgraphs. |
| Subgraph Linter | commit `9c7260e0de75860f1e41f6c098975ee4f48a9618` | Ignored repository-local source build at `.thegraph/subgraph-linter`; development-only and never a dashboard runtime dependency. |
| Subgraph skills | commit `7b3499af5018d19c55daabf8272aaa265df928b3` | Ignored local context at `.agent-skills/thegraph-subgraphs`; it is not a runtime dependency. |

The exact resolved package versions above were verified from the generated lockfiles and command output. A documentation version is never used as a substitute for the installed version.

## Skills read

The recommended repository was cloned from `https://github.com/PaulieB14/subgraphs-skills` and its origin and commit were verified before use. Every discovered `SKILL.md` was read:

- `skills/subgraph-dev/SKILL.md`
- `skills/subgraph-optimization/SKILL.md`
- `skills/subgraph-testing/SKILL.md`
- `openclaw/subgraph-dev/SKILL.md`
- `openclaw/subgraph-optimization/SKILL.md`
- `openclaw/subgraph-testing/SKILL.md`

The skills informed immutable fact entities, byte identifiers, `@derivedFrom`, pruning, avoidance of `eth_call`, deterministic Matchstick fixtures, and linter gates. Current official documentation remains authoritative where examples or versions differ.

## Network and deployment decision

Hedera Testnet (`chainId 296`) and 0G Galileo (`chainId 16602`) are EVM-compatible, but neither was present in The Graph's supported-network list on the consultation date. This branch therefore uses two deployments on a **self-hosted Graph Node**:

- `aegis-hedera` connects only to Hedera Testnet;
- `aegis-0g` connects only to 0G Galileo;
- each has a distinct GraphQL endpoint and independent indexing status;
- PostgreSQL used internally by Graph Node is isolated from the AEGIS operational database.

No unsupported network name is sent to Subgraph Studio and no Network deployment is claimed. If one network becomes officially supported, that Subgraph may move to Studio/Network independently while the other remains self-hosted. The dashboard already treats the endpoints separately.

The project team has confirmed this deployment mode for the project. The frozen status is:

> **Graph Node self-hosted eligibility: HUMAN-CONFIRMED / RESOLVED**

This resolves the project decision; it does not turn a self-hosted deployment into a The Graph Network publication.

## Why Subgraphs, not Substreams

The relevant source data consists of EVM contract events, and AEGIS needs a typed GraphQL read API with deterministic entity mappings. Subgraphs provide the shortest auditable path and work with a self-hosted Graph Node for the currently unsupported networks. No throughput, decoding, or transformation requirement found in the repository requires Substreams. Adding Substreams would increase operational scope without solving a demonstrated problem.

## Subgraph MCP boundary

Subgraph MCP is reserved for the phase after a Subgraph is published to The Graph Network. It can then discover schemas and execute constrained, read-only queries against those Network deployments. During the self-hosted phase, the live Audit Copilot uses direct internal read-only GraphQL tooling with static operations. The dashboard has no Subgraph MCP runtime dependency, and this project does not claim that Subgraph MCP queries the local node.

## Hedera source-stack finding

The official Hiero relay `v0.78.1` was run in read-only mode against the public Testnet Mirror endpoints. Its readiness endpoint was healthy, but repeated block/transaction/receipt probes still failed: a transaction listed in a block could be unavailable by hash, so Graph Node could not establish trustworthy provenance. Hashio exhibited the same class of receipt/block inconsistency. A process-health check or retry cannot correct missing source facts.

The selected remediation is a dedicated Hiero Mirror Node `v0.159.1`, configured for live Testnet stream ingestion, feeding the official read-only relay `v0.78.1`, which then feeds Graph Node `v0.44.0`. The exact continuation gate is recorded under `TG-HEDERA-RPC-001`. The repository does not claim this external stack is running until the strict preflight prints `HEDERA_GRAPH_RPC_READY` and Graph Node sync evidence exists.

`hedera-the-graph` `v0.1.1` was reviewed as historical Hedera deployment packaging. It is an older Helm wrapper with Hashio-oriented defaults, not evidence that the tested source is consistent and not a replacement for the strict preflight.

## 0G Agentic ID provenance

The prior ABI/start-block gap was resolved from official source and chain evidence:

- contract `0x2700F6A3e505402C9daB154C5c6ab9cAEC98EF1F`;
- creation transaction `0xbdd5f9d5c4f3086c814e02be0757650f553a02a46f0341e6dea96d1eed2f7557`;
- deployment block `23544364`, block hash `0x4607e55df9cf6928f80545bcbdc1b7e195b772c2babcb6c499fdbef4a498d49f`;
- deployer `0xaD8518cF3510eB2EBb843Eb51D209A5f98B768D2`;
- source commit `fd3c58306bf45c42888d4acda949bac0d3d64522`.

The metadata-stripped compiled runtime matches the live runtime. `subgraphs/aegis-0g/config/agentic-id.json` records source, ABI, and runtime hashes. The Subgraph uses a minimal fixed-width event ABI for the verified `Transfer`, `UsageAuthorized`, `UsageRevoked`, and `DelegateAccessSet` events. It intentionally excludes the dynamic-string `IntelligentDataSet` surface and never fetches private/decrypted metadata. `TG-AGENTIC-ID-001` is complete.

## Repository source gaps found during consultation

- `docs/interfaces.md` does not exist.
- `docs/handoffs/POLICY_ENGINE_LEVEL1_COMPLETE.md` does not exist.
- `subgraphs/aegis-0g/abis/AgenticID.json` is deliberately a verified minimal event ABI, not the complete callable ABI. This is a scope boundary, not missing provenance.
- The TeeML component has no verified AEGIS ALLOW/DENY artifact schema or integration with the Policy Engine.
- No AEGIS payment, policy, fee, or execution contract events exist yet.

These remaining gaps map to `TG-TEEML-E2E-001` and `TG-EVENTS-001`. The previously missing Agentic ID deployment provenance maps to completed task `TG-AGENTIC-ID-001`.

These gaps are recorded rather than replaced with inferred events or fake runtime data.
