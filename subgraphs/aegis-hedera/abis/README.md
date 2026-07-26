# ABI provenance

`AegisTeeValidationRegistry.json` is exported atomically from the real Foundry compiler artifact
by `scripts/thegraph/export-registry-abi.mjs`. The exporter validates the exact
`TeeMLValidationRecorded` event before writing. The manifest generator can additionally verify
an `abiPath` from a public deployment artifact, but compile output is the canonical ABI source
and address/start-block generation remains independently blocked until a real deployment
artifact exists.

`Safe.json` is a minimal event ABI derived from the official
`@safe-global/safe-deployments@1.37.60` package at
`src/assets/v1.4.1/safe.json`. The AEGIS Hedera configuration uses that artifact's canonical
Safe v1.4.1 singleton address. Only the exact events consumed by the event-only dynamic data
source are retained: `AddedOwner`, `RemovedOwner`, `ChangedThreshold`, `ExecutionSuccess`, and
`ExecutionFailure`.

The Safe template is created only when the first `TeeMLValidationRecorded` event names a Safe.
It therefore indexes execution and configuration-change facts emitted after that discovery; it
does not recover `SafeSetup` or any earlier Safe history. Owner and threshold changes are stored
as immutable observed facts. The schema intentionally does not infer a current owner set or
current threshold from a partial event window.

The mapping makes no contract calls and does not interpret Safe's `payment` event field as an
AEGIS provider payment; it is exposed as `refundPayment`. These Safe events do not establish
business-payment asset, destination, amount, fee, policy lifecycle, or application execution
semantics.
