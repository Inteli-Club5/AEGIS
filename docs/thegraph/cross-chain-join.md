# Cross-chain join contract

## Principle

The Hedera and 0G Subgraphs are independent read models. They do not claim native cross-chain relationships, call each other, or read private application state. The dashboard aggregator correlates candidates only through documented public keys and retains source provenance.

## Canonical keys

Ordered by confidence:

1. **Agent hash**: `keccak256(UTF-8(trim(agentId)))`. This is the existing `aegisAgentId` intelligent-data commitment used by the 0G integration. No lowercasing, JSON wrapping, or domain prefix is added.
2. **Agentic identity**: `(chainId=16602, agenticIdContractAddress, agenticIdTokenId)`. The Hedera registry supplies the token ID; the configured 0G deployment supplies network and contract.
3. **Safe address**: checksummed or lowercase-normalized EVM bytes for equality only. A Safe links registry validations and future Safe execution events on Hedera.
4. **Wallet/address evidence**: used only when it is explicitly emitted by both sources. Similar-looking addresses are never treated as proof by themselves.

The verified 0G `Transfer`, `UsageAuthorized`, `UsageRevoked`, and `DelegateAccessSet` events do not emit the AEGIS `agentIdHash`. Consequently the token tuple is the strongest fully indexable bridge currently available. An offchain private profile may help the UI locate a candidate, but it cannot upgrade the confidence of an onchain correlation or become GraphQL evidence.

The 0G Subgraph starts at the verified registry deployment block and therefore indexes registry-wide facts. It does not claim that every indexed Agentic ID is an AEGIS agent. Only a documented token tuple or stronger explicit key creates an AEGIS correlation.

## Normalization

- EVM addresses compare case-insensitively after strict 20-byte validation.
- Token IDs compare as canonical unsigned decimal integers; leading-zero string variants are normalized.
- Hashes compare as strict 32-byte hexadecimal values.
- UUID strings are trimmed before hashing and otherwise preserved byte-for-byte.
- Network and contract address are always part of an Agentic-ID key; token ID alone is insufficient.

## Result states

| State | Meaning | UI behavior |
| --- | --- | --- |
| `complete` | One unambiguous 0G identity and Hedera validation/Safe projection share a documented key. | Display both sources and the exact join evidence. |
| `zero-g-only` | Identity events exist without a Hedera validation candidate. | Keep the agent visible and mark Hedera evidence missing. |
| `hedera-only` | Registry/Safe facts exist without a 0G identity candidate. | Keep the agent visible and mark 0G evidence missing. |
| `mismatch` | Supplied hash/token/Safe keys disagree. | Do not merge; expose the conflicting keys and sources. |
| `ambiguous` | More than one candidate matches a non-unique key. | Do not choose automatically; return candidates with provenance. |
| `stale` | A source is behind or has indexing errors. | Preserve the partial result and show source freshness. |

Missing data never blocks the entire list and never causes a fabricated relationship.

## Deterministic aggregation procedure

1. Validate and normalize every source field without mutating its displayed raw value.
2. Index 0G candidates by the full Agentic-ID tuple and, only when genuinely indexed, by agent hash.
3. Index Hedera validations by token tuple, agent hash, and Safe address.
4. Accept a join only when a highest-confidence key has exactly one candidate on each side and no stronger key conflicts.
5. Return unmatched and ambiguous records as partial states.
6. Attach per-source `_meta` freshness; never hide a mismatch merely because one source is stale.

Usage authorization and delegation facts remain attached to their native 0G identities/owners. They do not create a Hedera relation by themselves.

## Duplicate handling

The registry prevents a second final record for the same request, but entity IDs remain `transactionHash + logIndex` to preserve event identity and reorg behavior. Duplicate join candidates can still arise across token transfers, configuration mistakes, or multiple deployments. The aggregator returns `ambiguous`; it does not select the newest record or overwrite a prior candidate silently.

## Test matrix

The client test suite covers a complete agent, 0G-only, Hedera-only, conflicting token/hash keys, duplicate candidates, and stale/indexing-error sources. Runtime fixtures are forbidden; test-only objects stay inside unit tests. A real full correlation cannot be claimed until `TG-DEPLOY-001` and `TG-HEDERA-RPC-001` produce live Hedera entities.
