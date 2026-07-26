# AEGIS Current Interfaces

This document describes the implemented Policy Engine Level 1 and 0G semantic
verification interfaces. Current code and `docs/aegis-current-scope.md`
supersede historical interface notes when they conflict.

## Authentication

Policy lifecycle writes require the operator EIP-712 headers:

```http
X-AEGIS-Operator-Address: 0x...
X-AEGIS-Operator-Signature: 0x...
```

Precheck, Agentic ID registration, and TeeML verification use the agent
authenticator. The standalone service loads the current adapter from
`AEGIS_AGENT_AUTH_TOKENS_JSON`, a JSON object mapping each agent ID to a unique
random bearer token of 32 to 512 characters. Missing configuration returns
`503`; invalid credentials return `401`. The authenticated agent must match the
route/action owner. The application does not accept an agent identity from a
request body as authentication.

The env map supports pre-provisioned agents. The current in-memory
`create-agents` route does not add new random IDs to that map and does not
rehydrate Agent Profiles after restart. Production embedding must inject a
credential provisioner/authenticator and durable Agent Profile adapter; absent
that integration, the standalone flow remains fail closed.

The agent service calls the internal Next Agentic ID route with
`AEGIS_AGENTIC_ID_INTERNAL_TOKEN`, which must be the same random 32+ character
secret in both services. The route also requires the backend-calculated
registration commitment header.

Configuration bounds are strict: `AEGIS_AGENTIC_ID_REGISTRATION_TIMEOUT_MS`
accepts 1 through 900,000 ms, `ZG_TEEML_TIMEOUT_MS` accepts 3 through 300,000
ms, and `ZG_TEEML_MAX_OUTPUT_TOKENS` accepts 1 through 256.

## Agentic ID Registration

```http
POST /agents/:agentId/register-agentic-id
Authorization: Bearer <agent-specific-token>
```

The body is empty; any body property is rejected with `400 unknown_property`.
The backend resolves the agent, owner, Safe, expected 0G
chain/contract, and capabilities. Before mint it creates a durable registration
claim keyed by a canonical hash. The internal adapter validates the expected
chain and contract before upload/mint and re-reads owner, token URI, and
intelligent data from the Agentic ID contract. The backend independently
reconstructs the canonical metadata and commitments before atomically marking
the registration `COMPLETED`.

`PROCESSING` or `UNKNOWN` registrations are never reminted automatically.
Ambiguous outcomes require manual on-chain reconciliation. No profile
description, metadata body, or capability array is duplicated in the
registration ledger.

## Policy Semantic Source

`semanticRules` are part of the canonical Policy payload and therefore part of
the backend-calculated `policyHash` authenticated by the operator signature.
The implemented trusted service/product source is:

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

It is supplied as one Policy semantic rule:

```json
{
  "ruleId": "trusted-storage-service",
  "kind": "TRUSTED_SERVICE_DESCRIPTOR_V1",
  "params": {
    "schemaVersion": "1.0",
    "providerId": "provider-id",
    "serviceId": "service-id",
    "productId": "product-id",
    "networkId": "hedera:testnet",
    "destinationIds": ["0.0.123456"],
    "categoryIds": ["storage"],
    "capabilityIds": ["purchase-storage"],
    "metadataHash": "0x0000000000000000000000000000000000000000000000000000000000000000",
    "shortDescription": "Bounded plain text controlled by the signed Policy"
  }
}
```

The descriptor is strict. It limits set-like arrays to 20 items and strings to
256 characters, normalizes identifiers and destinations, and rejects HTML,
Markdown, and instruction-shaped `shortDescription` content. A TeeML request
selects a descriptor only by reference; it cannot supply or override its
semantic content.

## Level 1 Precheck

```http
POST /agents/:agentId/wallets/:walletId/actions/precheck
Authorization: Bearer <agent-specific-token>
Idempotency-Key: caller-stable-key
Content-Type: application/json
```

Strict request:

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
properties and cause a `400 unknown_property` response. They are not silently
ignored.

Level 1 pass returns `202 Accepted`:

```json
{
  "requestId": "request-id",
  "precheckId": "precheck-id",
  "status": "PENDING_TEEML",
  "policyId": "policy-id",
  "policyVersion": 1,
  "policyHash": "0x...",
  "actionHash": "0x...",
  "aegisNonce": "1",
  "usageHoldId": "hold-id",
  "usageHoldExpiresAt": 1784900200,
  "evaluatedAt": 1784900000
}
```

A deterministic denial returns `200 OK` with `status: "DENY_PRECHECK"` and a
controlled Level 1 `code`. TeeML cannot be called for that action.

## TeeML Verification

Omitting `ZG_TEEML_SECURITY_PROFILE` selects
`production-private-teeml`, which requires the mainnet Router. The temporary
`hackathon-testnet-teetls` profile must be selected explicitly and requires the
testnet Router. A profile/network mismatch is a startup configuration error.

```http
POST /actions/:requestId/teeml/verify
Authorization: Bearer <agent-specific-token>
Content-Type: application/json
```

Strict request:

```json
{
  "serviceId": "service-id",
  "productId": "optional-product-id"
}
```

Only `serviceId` and optional `productId` are accepted. In particular,
`reason`, `detailedReason`, `agentReason`, semantic plaintext, capability
lists, Policy rules, and service descriptions are rejected as unknown
properties. The backend resolves all trusted content from durable records.

An already claimed concurrent request returns `202 Accepted`:

```json
{
  "requestId": "request-id",
  "status": "TEEML_PROCESSING",
  "semanticContextHash": "0x...",
  "teemlRequestHash": "0x..."
}
```

A verified semantic allow returns `200 OK`:

```json
{
  "requestId": "request-id",
  "status": "TEEML_ALLOWED",
  "verdict": "ALLOW",
  "reasonCode": "SEMANTIC_POLICY_MATCH",
  "policyHash": "0x...",
  "actionHash": "0x...",
  "semanticContextHash": "0x...",
  "teemlRequestHash": "0x...",
  "teeVerified": true,
  "securityProfile": "production-private-teeml",
  "trustMode": "private",
  "verificationMode": "TeeML",
  "sealedInference": true,
  "modelId": "configured-private-model",
  "evaluatedAt": 1784900000
}
```

For the explicitly selected hackathon profile, the same response contract
truthfully reports:

```json
{
  "status": "TEETLS_HACKATHON_ALLOWED",
  "verdict": "ALLOW",
  "securityProfile": "hackathon-testnet-teetls",
  "trustMode": "verified",
  "verificationMode": "TeeTLS",
  "sealedInference": false,
  "teeVerified": true
}
```

`teeVerified: true` in that tuple means the Router and AEGIS verified the
broker TEE response signature. It does not claim sealed model inference or
Private/TeeML. The hackathon profile is testnet-only, is never selected as a
fallback, releases its UsageHold after the demo verdict, and must not be
accepted by the future production signer. PostgreSQL uses the same distinct
state for the verification, action, and sanitized audit event, and a trigger
prevents relabeling it as `TEEML_ALLOWED`. Final verification artifacts are
immutable. A second trigger requires every final audit event to match the
linked verification and action across identifiers, commitments, reason code,
status, and security profile; final audit commitments are explicitly non-null.

A verified semantic denial has the same shape with
`status: "TEEML_DENIED"`, `verdict: "DENY"`, and one allowed semantic reason
code.

Technical failures use `application/problem+json`:

```json
{
  "type": "about:blank",
  "title": "TeeML verification failed",
  "status": 502,
  "code": "TEEML_NOT_VERIFIED"
}
```

Technical failures never become model denials or allows. The supported
technical codes are:

```text
TEEML_CONFIG_ERROR
TEEML_PROVIDER_ERROR
TEEML_TIMEOUT
TEEML_OUTPUT_INVALID
TEEML_HASH_MISMATCH
TEEML_NOT_PRIVATE
TEEML_NOT_VERIFIED
TEEML_TRUSTED_CONTEXT_MISSING
TEEML_CONFLICT
TEEML_UNKNOWN_RESULT
```

`TEEML_NOT_PRIVATE` identifies a production Private/TeeML mismatch.
Hackathon profile or TeeTLS verification mismatches use
`TEEML_NOT_VERIFIED`; neither is converted into a semantic verdict.

## Transient Semantic Contract

The backend builds a strict normalized `TrustedSemanticContext` containing:

- request, agent, and Agentic ID identity;
- capability IDs captured from backend-owned Agent Profile tools at successful
  Agentic ID registration whose durable ledger status is `COMPLETED`;
- the selected immutable Policy version, Policy hash, and semantic rules;
- the structured Level 1 financial action and unchanged action hash;
- one matching trusted service descriptor from the signed Policy.

No operator task subsystem currently exists, so the API does not accept
`operatorTaskId` or transient task plaintext.

The full context and assembled messages exist only in process memory for the
selected 0G inference lifetime. They are not stored in PostgreSQL, audit
events, logs, telemetry, blockchain records, or evidence files. Testnet TeeTLS
does not provide the production privacy guarantee: its upstream model may
process plaintext even though the broker transport and signed response are
TEE-verified.

## Hash Contracts

`semanticContextHash` is the hash of the canonical normalized trusted context.
Set-like arrays are normalized, sorted, and deduplicated. Mutable audit fields,
provider/model selection, status, output, and logs are excluded.

`teemlRequestHash` commits to:

```text
schemaVersion
requestId
agentId
agenticId
policyHash
actionHash
semanticContextHash
```

The TeeML verdict must echo `requestId`, `policyHash`, `actionHash`,
`semanticContextHash`, and `teemlRequestHash` exactly.

## Persistence And State

The state machine is:

```text
PENDING_TEEML
-> TEEML_PROCESSING
-> TEEML_ALLOWED | TEETLS_HACKATHON_ALLOWED | TEEML_DENIED | TEEML_FAILED
```

`TEEML_ALLOWED` retains the UsageHold as `HELD`. `TEEML_DENIED` and
`TEEML_FAILED` release it. `TEETLS_HACKATHON_ALLOWED` is demo-only and also
releases the hold because it cannot enter production execution. No state in
this branch signs a DecisionReceipt, authorizes a Safe transaction, or executes
Hedera.

The future production handoff must start only from `TEEML_ALLOWED` and must
additionally require `securityProfile: "production-private-teeml"` and
`sealedInference: true`. Hackathon TeeTLS ALLOW is demonstration evidence only.

Before inference, the service recomputes both `policyHash` and the Level 1
`actionHash` from their durable normalized inputs. An `ALLOW` is finalized only
after locking, re-resolving all trusted sources, recomputing the TeeML hashes,
and rechecking that the UsageHold remains `HELD` and unexpired using the
PostgreSQL clock. Commitment/context drift or a hold that expires during
inference fails closed.
Migrated actions without the v2 action commitment become `TEEML_FAILED`,
release their hold, and never call 0G.

A `TEEML_PROCESSING` claim has a lease longer than the configured 0G network
budget. Before lease expiry, another request receives `202`. After lease
expiry, the same endpoint performs local reconciliation only: it records
`TEEML_UNKNOWN_RESULT`, changes the action to `TEEML_FAILED`, releases the
hold, and does not send another 0G request. The original action cannot be
retried automatically.

The persisted TeeML artifact contains identifiers, commitments, controlled
outcome codes, provider/model identity, the exact `securityProfile`,
`trustMode`, `verificationMode`, `sealedInference`, and `teeVerified` tuple,
response and trace hashes, optional response ID, sanitized token counts,
latency, and timestamps.
It contains no agent justification, raw prompt, messages, raw model output,
raw trace, raw signature response, or duplicated semantic plaintext.

Only these finalized security tuples are valid:

```text
production-private-teeml + private + TeeML + sealedInference=true
hackathon-testnet-teetls + verified + TeeTLS + sealedInference=false
```
