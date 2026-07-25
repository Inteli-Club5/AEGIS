# 0G Semantic Verifier: Private/TeeML And Hackathon TeeTLS

## Branch Status

The semantic-verification implementation has two explicit, non-fallback
profiles:

```text
production-private-teeml -> mainnet + private + TeeML + sealedInference=true
hackathon-testnet-teetls -> testnet + verified + TeeTLS + sealedInference=false
```

The production profile is the default when `ZG_TEEML_SECURITY_PROFILE` is
omitted and is enforced on mainnet. The hackathon profile must be selected
explicitly and is rejected outside testnet. It is real 0G TeeTLS verification,
but its upstream centralized model may process plaintext; it is not
Private/TeeML and cannot become production execution authorization.

The latest real hackathon run reached the selected testnet provider with funded
Router credit. Completion dispatch succeeded, but the subsequent provider
signed-response request returned HTTP `400`, so AEGIS failed closed with
`TEEML_NOT_VERIFIED / SIGNATURE_UNAVAILABLE`. No retry or evidence file was
produced. The branch remains operationally blocked until a real ALLOW and DENY
complete. Mainnet and testnet keys, balances, and deposits are separate.

No local inference fallback, standard-provider fallback, automatic profile
downgrade, DecisionReceipt signer, Safe execution, or Hedera execution was
added.

## Level 1 And TeeML

Level 1 remains the deterministic financial gate. It validates the agent,
wallet, active policy, Hedera network, action type, destination, asset, amount,
limits, deadline, nonce, action hash, quota, UsageHold, and idempotency. Its only
functional outcomes are `PENDING_TEEML` and `DENY_PRECHECK`.

TeeML begins only from `PENDING_TEEML`. It compares:

- semantic rules authenticated by the operator-signed Policy;
- capabilities captured from the backend-created Agent Profile when its real
  0G Agentic ID registration succeeds;
- the structured financial action already committed by Level 1;
- the exact `TRUSTED_SERVICE_DESCRIPTOR_V1` embedded in the signed Policy.

TeeML cannot change financial fields, override `DENY_PRECHECK`, authorize a
forbidden destination, execute a transfer, sign a Safe transaction, or produce
final authorization. Production `TEEML_ALLOWED` is an intermediate state only;
hackathon ALLOW is isolated as `TEETLS_HACKATHON_ALLOWED` and is never a
production handoff state.

## Trusted Service Descriptor

The minimal trusted catalog is Policy data, not a marketplace:

```ts
type TrustedServiceDescriptorV1 = {
  schemaVersion: "1.0";
  providerId: string;
  serviceId: string;
  productId?: string;
  networkId: "hedera:testnet";
  destinationIds: string[];
  categoryIds: string[];
  capabilityIds: string[];
  metadataHash: `0x${string}`;
  shortDescription?: string;
};
```

It is stored inside `semanticRules` with kind
`TRUSTED_SERVICE_DESCRIPTOR_V1`. Policy canonicalization includes it in
`policyHash`, and the existing EIP-712 operator commitment authenticates that
hash. The verifier requires exactly one descriptor matching the requested
service/product and the persisted Level 1 destination.

Identifiers, hashes, destinations, and unordered sets are normalized. Policy
semantic data is limited to 20 rules, 20 values per descriptor set, 256
characters per string, and 16 KiB total canonical payload. Optional
`shortDescription` rejects HTML, Markdown, and instruction-shaped content.

No task subsystem was introduced. `trustedOperatorTask` is absent.

## Agent Capabilities

Capabilities do not come from a TeeML request. The existing agent creator
derives `toolNames` on the backend. On successful real Agentic ID registration,
the backend:

1. authenticates the agent at the agent-service route and authenticates the
   backend to the internal Next route with a separate bearer secret;
2. commits the expected 0G chain, Agentic ID contract, agent, owner, Safe,
   profile fields, explicit pre-policy marker hash, and normalized capabilities
   before dispatch;
3. makes an advisory-locked durable claim in
   `aegis_agentic_id_registrations` before the irreversible mint;
4. requires the Next adapter to reject chain/contract drift before upload or
   mint, then re-read `ownerOf`, `tokenURI`, and `getIntelligentDatas` on-chain;
5. reconstructs the expected metadata and eight intelligent-data commitments
   through the shared versioned canonical module and validates the returned
   agent, owner, final owner, Safe, chain, contract, metadata, and hashes;
6. atomically stores the sanitized semantic profile and marks the registration
   `COMPLETED`.

Descriptions, Agentic ID metadata prose, and caller-supplied capability text are
not persisted in the ledger or semantic-profile table. TeeML joins a profile
only when its registration ledger is `COMPLETED`; `PROCESSING`, `UNKNOWN`, and
legacy profiles without a ledger fail as missing trusted context.

Sequential and concurrent registration retries do not mint again. An ambiguous
outcome remains `UNKNOWN` and requires manual on-chain reconciliation; it is
never reclaimed automatically. The internal Next mint route is not an
independent public idempotent API and must be reachable only through the
authenticated agent-service coordinator. The registration request uses the
bounded `AEGIS_AGENTIC_ID_REGISTRATION_TIMEOUT_MS` budget (300,000 ms by
default); a timeout after dispatch is treated as an ambiguous `UNKNOWN`
outcome, not retried. The current in-memory agent store is not reconstructed
after a process restart, although an already completed semantic profile remains
available to TeeML from PostgreSQL.

The pre-policy marker is not a live Policy commitment and is never used as
TeeML evidence. TeeML resolves and recomputes the operator-signed Policy from
PostgreSQL. Binding an Agentic ID to a later Policy requires a separate,
versioned on-chain update flow.

## Privacy Boundary

The Level 1 precheck request no longer accepts `semanticContext`, `reason`,
`detailedReason`, or `agentReason`. Strict validation rejects them as unknown
properties. The v2 action commitment persists only the normalized action type,
destination, asset, amount, deadline, and action-hash schema version. The
historical `semantic_context_hash` column remains nullable for migration
compatibility and new rows write `NULL`.

The remaining `reason` search results are classified as follows: controlled
`reasonCode` enums are retained; the existing operator-authenticated Policy
revocation reason belongs to Policy lifecycle rather than an agent action;
legacy migration fixtures contain private reason markers only to prove that the
columns and values are removed; and request tests contain the prohibited field
only to prove strict rejection. None becomes TeeML input or action evidence.

Full semantic plaintext exists only in this lifetime:

```text
trusted database records
-> validated in-process context
-> one bounded 0G request under the explicit security profile
-> strict response validation
-> references released
```

JavaScript does not provide guaranteed physical memory erasure. The guarantee is
that the implementation does not persist or log the prompt, messages, semantic
rules duplicated from the Policy, capabilities duplicated from the profile,
service description, raw response, raw signature response, or raw trace.
This is an AEGIS persistence guarantee. In the hackathon TeeTLS profile, the
upstream centralized model may still process plaintext under its own policy;
only production Private/TeeML provides the intended sealed-inference boundary.
This guarantee is scoped to the Level 1 and TeeML path. The legacy
`propose-actions`/Groq workflow is outside this semantic-verifier boundary and
retains its own existing data-handling contract.

## Commitments

`semanticContextHash` hashes a canonical normalized
`TrustedSemanticContext`. Set-like arrays are sorted and deduplicated. Mutable
audit timestamps, selected provider/model, status, model output, and logs are
excluded.

`teemlRequestHash` binds:

```text
schemaVersion
requestId
agentId
agenticId
policyHash
actionHash
semanticContextHash
```

The Level 1 `actionHash` is not changed by TeeML. Golden tests cover
normalization, array reordering, policy rules, agent capabilities, service
metadata, `policyHash`, and `actionHash` changes.

Before building the context, the TeeML service recomputes the durable
`policyHash` from the stored Policy payload and the Level 1 `actionHash` from
the stored normalized action, nonce, network, and Policy commitment. A mismatch
fails before inference with `TEEML_CONFLICT`, releases the UsageHold, and does
not create a model artifact. Migrated actions without the v2 commitment fail
the same way with `TEEML_TRUSTED_CONTEXT_MISSING`; no missing fields or hashes
are fabricated.

After inference and while holding the final request lock, the service resolves
the durable sources again, rebuilds the context, and recomputes both TeeML
hashes. Policy commitment or semantic-payload drift, action commitment drift,
Agentic profile drift, service-descriptor drift, or hold drift fails closed.
Policy lifecycle state is reserved for the future final deterministic recheck.
PostgreSQL's own clock is authoritative for the final ALLOW UsageHold expiry
check.

## 0G Security Profiles And Request

The profile is selected by `ZG_TEEML_SECURITY_PROFILE`; omission defaults to
`production-private-teeml`. The two exact contracts are:

| Profile | Network | Trust header | Catalog mode | Sealed inference |
| --- | --- | --- | --- | --- |
| `production-private-teeml` | mainnet | `private` | `TeeML` | `true` |
| `hackathon-testnet-teetls` | testnet | `verified` | `TeeTLS` | `false` |

Only the allowlisted mainnet and testnet Router URLs are accepted, and each is
paired with its Compute RPC and chain ID. The profile must match that network.
Inference credentials must begin with `sk-`; management keys and wallet-shaped
secrets fail locally before network use.

Every request includes:

```http
Authorization: Bearer <ZG_ROUTER_API_KEY>
Content-Type: application/json
X-0G-Provider-Address: <catalog-selected-provider>
X-0G-Provider-Allow-Fallbacks: false
X-0G-Provider-Trust-Mode: <private-or-verified>
```

The body uses `stream: false`, `temperature: 0`, `verify_tee: true`, and bounded
`max_tokens`. JSON object mode is sent only when every eligible provider for the
active profile advertises it. Strict local JSON parsing remains mandatory. The
request contains one static system prompt and one bounded canonical JSON data
message, with no tools, browsing, code execution, conversation history, or
automatic retries.

AEGIS requests the complete provider catalog and filters locally by exact
canonical model, chatbot type, healthy state, catalog verification mode,
attested TEE, and acknowledged TEE. Production additionally requires catalog
`trust_mode: private`. The current testnet TeeTLS catalog omits `trust_mode`, so
the hackathon profile accepts only an absent value or `verified`; it never
invents a private claim. The selected address is pinned in the request and must
equal `x_0g_trace.provider` in the response.

After inference, the adapter requires successful HTTP status, exact model,
`x_0g_trace.request_id`, the pinned provider, `x_0g_trace.tee_verified === true`,
strict usage fields, and `ZG-Res-Key` or the documented response-ID fallback.
`tee_verified` confirms TEE signature verification for both TeeTLS and TeeML;
it does not alone establish sealed inference.

The installed official SDK
`@0gfoundation/0g-compute-ts-sdk@0.9.0` independently resolves the exact
on-chain provider, downloads the signature response once, compares its signed
text byte-for-byte with the Router completion, and verifies the signature. The
production profile accepts a separated signer only for a decentralized
provider with an explicit `TargetTeeAddress`. The hackathon profile accepts the
acknowledged broker `teeSignerAddress` for the current centralized TeeTLS
provider shape; production rejects that exception.

Provider resolution and signature download share their assigned deadline. SDK
multi-model discovery is not used because it performs another
provider-controlled request. Router catalog, completion, and signature
responses reject redirects and are read with byte limits. Provider signature
egress uses a fresh HTTPS connection with a validated and pinned public DNS
answer. Private, loopback, link-local, multicast, and mixed public/private
answers fail closed. Persisted latency covers the complete gateway flow.

## Strict Output

The model may return only:

```ts
type TeeMlSemanticVerdict = {
  schemaVersion: "1.0";
  verdict: "ALLOW" | "DENY";
  reasonCode: TeeMlSemanticReasonCode;
  requestId: string;
  policyHash: `0x${string}`;
  actionHash: `0x${string}`;
  semanticContextHash: `0x${string}`;
  teemlRequestHash: `0x${string}`;
};
```

Local Zod parsing is strict. Markdown, prose, extra properties, invalid reason
codes, chain-of-thought fields, malformed JSON, oversized output, and any hash
or request-ID mismatch fail closed. Output is never repaired by another model.

## Persistence And States

Sanitized records are stored in:

- `aegis_agentic_id_registrations`;
- `aegis_agent_semantic_profiles`;
- `aegis_teeml_verifications`;
- `aegis_teeml_audit_events`.

There are no columns for agent reason, prompt, messages, semantic plaintext,
raw output, raw trace, or raw signature. A final artifact stores commitments,
verdict enum, reason code enum, provider/model identifiers, the exact
`securityProfile`, `trustMode`, `verificationMode`, `sealedInference`, and
`teeVerified` tuple, response and trace hashes, optional response ID, sanitized
token usage, latency, and evaluation time.

State transitions are:

```text
PENDING_TEEML
-> TEEML_PROCESSING
-> TEEML_ALLOWED
 | TEETLS_HACKATHON_ALLOWED
 | TEEML_DENIED
 | TEEML_FAILED
```

- production Private/TeeML `ALLOW`: persist the sanitized artifact as
  `TEEML_ALLOWED` and keep the UsageHold `HELD`.
- hackathon TeeTLS `ALLOW`: persist the honestly labeled artifact as
  `TEETLS_HACKATHON_ALLOWED` and release the UsageHold because demo evidence
  cannot proceed to execution.
- production `ALLOW` finalization locks and rechecks that the UsageHold is
  still `HELD` and unexpired using the PostgreSQL clock, and re-resolves all
  trusted sources; drift or concurrent expiry becomes `TEEML_CONFLICT` and
  `TEEML_FAILED`.
- `DENY`: persist the sanitized artifact and set the UsageHold to `RELEASED`.
  A valid DENY is still persisted when a previously held UsageHold became
  `EXPIRED` during inference.
- technical failure: persist a technical code when a verification was claimed,
  set the action to `TEEML_FAILED`, and release the UsageHold.
- missing trusted context before a claim: store a sanitized failure audit event
  without fabricating semantic hashes or a model artifact.

A PostgreSQL advisory transaction lock and unique request/precheck constraints
allow at most one paid inference claim and one final verification per action.
Production and hackathon ALLOW use distinct verification, action, response,
and audit states. A database trigger permits `TEEML_ALLOWED` only when the
linked artifact is exact production Private/TeeML, and permits
`TEETLS_HACKATHON_ALLOWED` only for the exact testnet TeeTLS tuple. Retries
return the persisted result or `TEEML_PROCESSING`; a changed trusted context
returns `TEEML_CONFLICT`. Final verification rows are immutable. The database
also rejects a final audit row unless its request, precheck, agent,
Policy/action commitments, semantic commitments, reason code, outcome, action
status, and security profile match the linked verification exactly.

`TEEML_PROCESSING` has a lease longer than the configured 0G network budget. A
caller-initiated retry after that lease does not dispatch another inference. It
atomically marks the original verification `FAILED` with
`TEEML_UNKNOWN_RESULT`, changes the action to `TEEML_FAILED`, releases the
UsageHold, and returns a technical problem response. The original request is
never retried automatically. An operator must reconcile any possible Router
charge from sanitized identifiers before deciding whether to create a new
Level 1 action request.

## API

```http
POST /actions/:requestId/teeml/verify
Content-Type: application/json

{
  "serviceId": "service-id",
  "productId": "optional-product-id"
}
```

The route uses the agent authenticator. The standalone service constructs the
current adapter from `AEGIS_AGENT_AUTH_TOKENS_JSON`, a JSON map of agent IDs to
unique random bearer tokens of at least 32 characters. Missing configuration
remains a fail-closed `503`; the authenticated agent must own the action.
Technical errors use `application/problem+json` and are never converted into
model `DENY`.

This env adapter supports pre-provisioned agent IDs; it does not provision a
credential for the random ID returned by the legacy in-memory `create-agents`
route. That store is also not rehydrated after restart. A deployment that uses
the standalone HTTP flow must provide external credential provisioning and a
durable/recoverable Agent Profile adapter. Those pre-existing service
limitations are not replaced with a fake local identity flow in this branch.

## Future Handoff

After `TEEML_ALLOWED`, the implementation stops. Future work must:

- rerun the deterministic policy with a fresh usage snapshot;
- build and sign the final DecisionReceipt with a dedicated
  `agentVerifierSigner`, never the raw model output;
- keep verdict signing separate from execution signing;
- bind the receipt to the exact Safe transaction;
- collect the configured Safe threshold;
- execute the existing Hedera action and persist its real receipt;
- commit the UsageHold only after confirmed execution;
- expose sanitized public audit data through The Graph.

Before any of those steps, the future handoff must require action and
verification status `TEEML_ALLOWED`, security profile
`production-private-teeml`, and `sealedInference: true`. A
`TEETLS_HACKATHON_ALLOWED` result is demonstration evidence only, has no active
UsageHold, and must never be signed as a production DecisionReceipt or
authorize Safe/Hedera execution.

## Commands

```bash
npm --prefix services/agent-service test
npm --prefix services/agent-service run test:coverage
npm --prefix services/agent-service run test:integration
npm --prefix services/agent-service run typecheck
npm --prefix services/agent-service run lint
npm --prefix services/agent-service run build
npm run test:0g:teeml
npm run test:0g:teetls:hackathon
```

The production command writes `docs/evidence/0g-teeml-verification.json` only
after a real Private/TeeML ALLOW and DENY pass. The hackathon command writes
`docs/evidence/0g-teetls-hackathon-verification.json` only after real TeeTLS
ALLOW and DENY pass, and labels it `productionReady: false` and
`sealedInference: false`. Neither file contains semantic plaintext, raw prompt,
raw response, signature, or API key. The Router-only test uses an explicit
Agentic ID fixture and does not claim another on-chain mint.

The latest hackathon command selected the real testnet TeeTLS chatbot and
dispatched its first completion with funded Router credit. The provider's
`/v1/proxy/signature/{chatId}` request then returned HTTP `400`, producing the
sanitized diagnostic `TEEML_NOT_VERIFIED / SIGNATURE_UNAVAILABLE`. It made no
automatic retry, did not accept an unsigned verdict, and did not create
evidence. Provider signed-response availability is the remaining operational
input for the two-case hackathon run. Production Private/TeeML evidence remains
separately pending on mainnet.
