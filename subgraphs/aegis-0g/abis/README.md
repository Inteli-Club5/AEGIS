# Agentic ID ABI provenance

`AgenticID.json` is a minimal event ABI derived from the full compiler artifact
for the official 0G Agentic ID example deployment. It is not presented as the
contract's full callable ABI.

Provenance:

- Official Builder Hub deployment:
  <https://build.0g.ai/agentic-id>
- Official source repository:
  <https://github.com/0gfoundation/agenticID-examples>
- Audited source commit: `fd3c58306bf45c42888d4acda949bac0d3d64522`
- Contract source:
  `examples/01-mint-and-manage/contracts/AgenticID.sol`
- Compiler settings: Solidity `0.8.27`, Cancun EVM, optimizer enabled with
  `200` runs, as declared in the official `hardhat.config.ts`
- Full compiled ABI SHA-256 (canonical `JSON.stringify` form):
  `190563da5a4a847b5118415fbb587f939d96eb6cbcb29e86ed1734c48d9e9e83`
- This minimal event ABI SHA-256:
  `f32a9ef069db7e7f7d76c8db105d238f91fedc3d848b262aff7b0e6d2f598c19`

The official source was compiled locally with those settings. The resulting
runtime and the live Galileo runtime were both 14,442 bytes and matched exactly
after removing their 51-byte Solidity metadata trailers. The deployment
receipt independently resolves the same contract address. This establishes the
event layout used here without relying on the smaller frontend ABI, whose
`UsageAuthorized` and `UsageRevoked` indexed flags do not match the compiled
artifact.

Indexed event signatures:

- `Transfer(indexed address,indexed address,indexed uint256)`
- `UsageAuthorized(indexed uint256,indexed address)`
- `UsageRevoked(indexed uint256,indexed address)`
- `DelegateAccessSet(indexed address,indexed address)`

The contract's `IntelligentDataSet(uint256,(string,bytes32)[])` event is
deliberately absent. Its dynamic tuple contains `dataDescription` strings, and
AEGIS must not index or expose those descriptions. The Subgraph performs no
contract calls and never reconstructs that event's data. Other inherited or
administrative events remain outside the current AEGIS query surface.
