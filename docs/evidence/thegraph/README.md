# Sanitized The Graph evidence

This directory contains public, reproducible evidence only. It must not contain private RPC credentials, deployer/recorder keys, Gateway keys, TeeML prompts or raw output, semantic plaintext, private metadata, authentication tokens, or application-database records.

## Evidence policy

- `*.sanitized.json` files are safe to review and version.
- `private/` is ignored and is not an acceptable source for committed evidence.
- A missing deployment, synchronization, or E2E artifact is reported as missing; no placeholder hash, address, response, or verdict is substituted.
- Contract deployment evidence is generated only by the dedicated deploy script after a real receipt and bytecode/role verification.
- GraphQL samples are captured only from a real deployed Subgraph endpoint.

## Current files

- `agentic-id-event.sanitized.json`: verified Agentic ID contract deployment/source provenance and independently re-read public 0G event evidence for the existing AEGIS token.
- `rpc-preflight.sanitized.json`: read-only capability observations used to design the Graph Node preflight.
- `graph-node-health.sanitized.json`: container health and private-by-default port exposure for the real local stack.
- `zero-g-subgraph.sanitized.json`: real full-registry local deployment, synchronization status, `_meta`, summaries, authorization/delegation events, and known AEGIS token query result.
- `dashboard-graphql.sanitized.json`: real production-dashboard API responses backed by the local 0G Subgraph, including an honest partial-source Hedera failure.
- `audit-copilot.sanitized.json`: six real allowlisted HTTP analyses backed by the live 0G Subgraph, with indexed entity/transaction/block citations and an unsupported-question rejection.
- `hedera-indexing-blocker.sanitized.json`: the real transaction/receipt inconsistency observed through the self-hosted Hiero Relay when backed by the public Testnet Mirror Node.

Registry deployment, Hedera Subgraph synchronization, TeeML-to-registry E2E, and cross-chain E2E evidence are intentionally absent because those commands have not succeeded. No placeholder is substituted for them.
