# AEGIS Current Scope

This is the active implementation and architecture source for the current
AEGIS branch. It supersedes conflicting historical notes.

## Product Boundary

AEGIS is a pre-transaction safety layer. It creates the agent, creates the
agent's Hedera wallet, registers its 0G Agentic ID, evaluates deterministic and
semantic policy gates, and prepares evidence for later authorization.

Hedera is the operational blockchain. Operational funds remain in the Safe.
The agent's Hedera wallet proposes or participates in the flow but cannot move
Safe funds alone. The verdict signer and execution signers are separate
responsibilities.

The Graph will later index sanitized public audit data for the dashboard. This
branch does not implement indexing, final DecisionReceipt signing, Safe
signatures, or Hedera execution.

The legacy `create-wallets` implementation still accepts a recovery-guardian
parameter and deploys a fixed two-of-three Safe. That behavior predates this
scope, is not the normative wallet configuration, and is not invoked by the
TeeML flow. A separate wallet-configuration task must remove the guardian
concept and make the owner threshold explicit before the standalone creation
path is treated as production-compliant.

## Implemented Stages

### Policy Engine Level 1

Level 1 is complete. It verifies:

- authenticated agent ownership;
- active agent and protected wallet state;
- active operator-signed Policy;
- Hedera testnet network identity;
- action type and normalized destination;
- native HBAR or registered fungible HTS asset;
- integer base-unit amount and limits;
- deadline;
- monotonic nonce;
- deterministic action hash;
- daily amount/action quota;
- UsageHold;
- idempotency.

Its only functional outcomes are:

```text
PENDING_TEEML
DENY_PRECHECK
```

Level 1 never returns final authorization.

The strict v2 precheck body is:

```json
{
  "actionType": "HEDERA_HBAR_TRANSFER",
  "destination": {
    "kind": "HEDERA_ACCOUNT_ID",
    "value": "0.0.123456"
  },
  "assetId": "hedera:testnet:hbar",
  "amount": "100000000",
  "actionDeadline": 1784900300
}
```

`reason`, `detailedReason`, `agentReason`, and `semanticContext` are unknown
properties and are rejected. New action rows persist only the normalized
financial action and the `aegis.action.level1.v2` commitment. The historical
`semantic_context_hash` column is nullable and unused by new rows.

### 0G Semantic Verification

The semantic verifier starts only from a durable `PENDING_TEEML` request and
verifies:

- compatibility with operator-defined semantic rules;
- whether the trusted service/product purpose is authorized;
- compatibility with registered Agentic ID capabilities;
- semantic conflicts between Policy, agent capability, service, and action;
- prompt-injection content;
- whether sufficient trusted context exists.

It cannot change limits, financial fields, destination, asset, amount, or
deadline. It cannot override `DENY_PRECHECK`, execute a transaction, request
Safe signatures, or sign a final receipt.

## Trusted Semantic Sources

The transient context is reconstructed entirely by the backend:

1. `semanticRules` come from the immutable Policy version and are bound to its
   backend-calculated `policyHash` and operator EIP-712 signature.
2. Agent capabilities come from backend-derived Agent Profile `toolNames`,
   captured when the real 0G Agentic ID registration succeeds, atomically
   stored in `aegis_agent_semantic_profiles`, and accepted only when
   `aegis_agentic_id_registrations.status` is `COMPLETED`.
3. The financial action comes from the structured Level 1 v2 action commitment.
4. Service/product metadata comes from exactly one
   `TRUSTED_SERVICE_DESCRIPTOR_V1` inside the signed Policy.

No task subsystem exists, so no operator task is required or accepted.

The TeeML endpoint accepts only:

```json
{
  "serviceId": "service-id",
  "productId": "optional-product-id"
}
```

The caller supplies references, never semantic plaintext.

## Commitments

`semanticContextHash` hashes a canonical normalized context containing:

- request, agent, and Agentic ID identity;
- registered capability IDs;
- Policy identity, version, hash, and bounded semantic statements;
- Level 1 action hash and normalized financial fields;
- the matched trusted service descriptor.

Arrays with set semantics are sorted and deduplicated. IDs, hashes, whitespace,
amounts, destinations, and optional fields are normalized. Mutable audit
timestamps, status, provider/model selection, model output, and logs are
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

It does not replace or mutate the Level 1 `actionHash`.

Immediately before transient context construction, the service recomputes the
stored Policy and Level 1 action commitments from their durable normalized
inputs. Any mismatch is `TEEML_CONFLICT`, releases the hold, and prevents the
0G call. A migrated action without the v2 commitment also fails before
inference with `TEEML_TRUSTED_CONTEXT_MISSING`; missing values are never
fabricated.

After the 0G inference, the service reacquires the request lock, resolves
all trusted sources again, rebuilds the context, and recomputes the context and
request hashes. Policy commitment or semantic-payload drift, action commitment
drift, Agentic profile drift, service-descriptor drift, or hold drift cannot be
finalized against a stale model result. Policy lifecycle state is deliberately
left to the future final deterministic recheck.

## 0G Integration

The backend implements two explicit security profiles. The default and only
production profile is `production-private-teeml`: it uses the mainnet Router,
requires `X-0G-Provider-Trust-Mode: private`, selects only TeeML providers, and
records `sealedInference: true`. The temporary hackathon profile is
`hackathon-testnet-teetls`: it is rejected outside the exact testnet Router,
uses `X-0G-Provider-Trust-Mode: verified`, selects only TeeTLS providers, and
records `sealedInference: false`.

TeeTLS verifies the broker TEE, response signature, and exact signed content,
but the upstream centralized model may process plaintext. It is real 0G
inference and verifiable execution evidence for the testnet demo; it is not
Private/TeeML and is never represented as production-ready. Profile selection
is explicit through `ZG_TEEML_SECURITY_PROFILE`. There is no automatic
downgrade from Private/TeeML to TeeTLS.

Both profiles pin one eligible provider and force:

```http
X-0G-Provider-Address: <selected-provider>
X-0G-Provider-Allow-Fallbacks: false
```

The body requests `verify_tee: true`, `stream: false`, deterministic
temperature, bounded output, and JSON object mode when the selected provider
advertises support.

The profile-specific trust-mode header is sent on every request. The adapter
validates the live provider catalog, exact provider/model mapping,
`x_0g_trace.tee_verified === true`, Router request ID, response ID, usage, and
the signed-response reference. The installed official
`@0gfoundation/0g-compute-ts-sdk@0.9.0` independently resolves the on-chain
provider on the paired network with an explicit chain ID, compares signed
content exactly, and verifies the
signature. There is no automatic retry, provider fallback, or security-profile
fallback.

All Router and signature HTTP requests reject redirects and use bounded
streaming response reads. Provider signature egress uses a fresh HTTPS
connection with a validated and pinned public DNS answer. On-chain resolution
and signature download are deadline-bounded. The verifier accepts separated
TEE targets only for decentralized providers with an explicit
`TargetTeeAddress` in production. The hackathon TeeTLS profile accepts the
acknowledged broker `teeSignerAddress` for the testnet centralized-provider
shape used by SDK `0.9.0`. That exception is rejected by the production
profile. The verifier does not use the SDK path that performs indirect
multi-model discovery against a provider URL. The configured timeout is shared
across catalog, completion, and signed-response verification.

## Strict Verdict

The only model output is:

```ts
type TeeMlSemanticVerdict = {
  schemaVersion: "1.0";
  verdict: "ALLOW" | "DENY";
  reasonCode:
    | "SEMANTIC_POLICY_MATCH"
    | "ACTION_OUTSIDE_SEMANTIC_POLICY"
    | "ACTION_OUTSIDE_AGENT_CAPABILITIES"
    | "SERVICE_PURPOSE_MISMATCH"
    | "TRUSTED_METADATA_MISMATCH"
    | "INSUFFICIENT_TRUSTED_CONTEXT"
    | "POTENTIAL_PROMPT_INJECTION";
  requestId: string;
  policyHash: `0x${string}`;
  actionHash: `0x${string}`;
  semanticContextHash: `0x${string}`;
  teemlRequestHash: `0x${string}`;
};
```

Zod strict parsing rejects extra fields, prose, Markdown, chain-of-thought,
invalid enums, malformed JSON, and commitment mismatches. Technical failures
use AEGIS reason codes and are never represented as a model `DENY`.

## State And UsageHold

```text
PENDING_TEEML
-> TEEML_PROCESSING
-> TEEML_ALLOWED
 | TEETLS_HACKATHON_ALLOWED
 | TEEML_DENIED
 | TEEML_FAILED
```

- production Private/TeeML ALLOW uses `TEEML_ALLOWED`, stores a sanitized
  artifact, and keeps the UsageHold `HELD`.
- hackathon TeeTLS ALLOW uses the distinct `TEETLS_HACKATHON_ALLOWED` action,
  verification, response, and audit state and releases the UsageHold. Database
  constraints and handoff triggers prevent this demo state from becoming
  `TEEML_ALLOWED`. Final verification artifacts are immutable, and every final
  audit row must match its linked verification and action tuple.
- ALLOW finalization locks and confirms that the hold is still `HELD` and
  unexpired using PostgreSQL's clock; a concurrent expiry fails closed.
- `TEEML_DENIED` stores a sanitized artifact and releases the UsageHold.
- `TEEML_FAILED` releases the UsageHold and stores a sanitized technical code
  when a verification was claimed.
- missing trusted evidence fails before inference and records a sanitized audit
  event without fabricating model evidence.

Only `TEEML_ALLOWED` is eligible for the future production handoff, and it is
still not final authorization. The UsageHold may become
`COMMITTED` only after later confirmed Safe/Hedera execution.

PostgreSQL advisory locks and unique constraints enforce one verification claim
and one final result per request. A concurrent request observes
`TEEML_PROCESSING`; a restart replays the persisted result; changed trusted
context returns `TEEML_CONFLICT`.

The processing lease is longer than the configured 0G network budget. A caller
retry after the lease performs no new inference: it marks the original result
`TEEML_UNKNOWN_RESULT`, transitions the action to `TEEML_FAILED`, and releases
the UsageHold. Operational reconciliation of any possible Router charge is
manual, and a new attempt requires a new Level 1 action request.

## Persistence

Current tables include:

- `aegis_agents`;
- `aegis_wallets`;
- `aegis_policies`;
- `aegis_asset_catalog`;
- `aegis_wallet_nonces`;
- `aegis_action_requests`;
- `aegis_precheck_records`;
- `aegis_usage_holds`;
- `aegis_audit_events`;
- `aegis_agent_semantic_profiles`;
- `aegis_agentic_id_registrations`;
- `aegis_teeml_verifications`;
- `aegis_teeml_audit_events`.

TeeML persistence contains commitments, enum outcomes, provider/model
identifiers, the exact `securityProfile`, `trustMode`, `verificationMode`,
`sealedInference`, `teeVerified`, response/trace hashes, optional response ID,
sanitized token counts, latency, and timestamps. The database accepts only the
production Private/TeeML tuple or the hackathon testnet TeeTLS tuple.

It does not contain agent justification, prompt, messages, duplicated semantic
rules, duplicated capabilities, service description, raw model output, raw
trace, or signature response.

## HTTP

Implemented routes include:

```http
POST /policies
GET /policies/:policyId
GET /policies/:policyId/versions
PATCH /policies/:policyId
POST /policies/:policyId/activate
POST /policies/:policyId/revoke
GET /agents/:agentId/wallets/:walletId/policies/active
POST /agents/:agentId/wallets/:walletId/actions/precheck
POST /agents/:agentId/register-agentic-id
POST /actions/:requestId/teeml/verify
```

Precheck, Agentic ID registration, and TeeML require agent authentication. The
standalone service uses `AEGIS_AGENT_AUTH_TOKENS_JSON`, mapping agent IDs to
unique random bearer tokens of at least 32 characters; without it these routes
fail closed with `503`. The internal Next Agentic ID route separately requires
the same `AEGIS_AGENTIC_ID_INTERNAL_TOKEN` configured in both services. TeeML
technical errors use `application/problem+json`.

The env authenticator is for pre-provisioned IDs or integration deployments.
The legacy in-memory `create-agents` store neither provisions a matching bearer
credential nor rehydrates profiles after restart. A real standalone deployment
therefore still needs an external agent-credential provisioner and a durable
Agent Profile adapter; this branch does not fabricate either one.

Agentic ID registration currently commits an explicit pre-policy marker because
agent registration precedes Policy creation. TeeML does not use that marker as
a Policy binding; it recomputes and trusts only the operator-signed Policy from
PostgreSQL. A future versioned Agentic ID update flow is required before the
on-chain Agentic profile can claim a live Policy commitment.

## Remaining Handoff

After TeeML approval, a future branch must:

1. rerun the deterministic Policy with a fresh usage snapshot;
2. build the final DecisionReceipt;
3. sign only that receipt with a dedicated `agentVerifierSigner`;
4. bind it to the exact Safe transaction;
5. collect the Safe's configured owner threshold;
6. execute the already implemented Hedera action;
7. persist the real network receipt;
8. commit the UsageHold only after execution confirmation;
9. expose sanitized public audit records through The Graph.

The current branch stops before all of those steps.
The future handoff must reject every artifact except
`production-private-teeml` with `sealedInference: true`. A hackathon TeeTLS
ALLOW remains demonstration evidence and can never authorize a DecisionReceipt,
Safe transaction, or Hedera execution.

## Operational Status

Unit tests, coverage, typecheck, build, migrations, and PostgreSQL integration
are the local acceptance path. The two opt-in real commands are:

```bash
npm run test:0g:teeml
npm run test:0g:teetls:hackathon
```

The production command requires one real ALLOW and DENY through mainnet
Private/TeeML and writes only `docs/evidence/0g-teeml-verification.json`. The
hackathon command requires the same two real cases through testnet TeeTLS and
writes only `docs/evidence/0g-teetls-hackathon-verification.json`, explicitly
marked `productionReady: false` and `sealedInference: false`.

At the current checkpoint, the funded hackathon request reached the selected
testnet TeeTLS provider and dispatched a completion. The provider's subsequent
signed-response endpoint returned HTTP `400`, so AEGIS failed closed with
`TEEML_NOT_VERIFIED / SIGNATURE_UNAVAILABLE`. The client did not retry or
accept an unsigned verdict. No ALLOW or DENY evidence file was generated, and
the real test remains blocked on provider signed-response availability. The
production Private/TeeML path also remains live-unproven; it is preserved as
the default production profile and is not replaced or commented out.
