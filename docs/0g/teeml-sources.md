# 0G Semantic Verification Source Record

Consulted on 2026-07-25. Only official 0G documentation and official
`0gfoundation` repositories were used as external sources.

## Project Decision

The intended integration path is the 0G Compute Router because AEGIS is a
server-side service and must keep the Router API key outside the frontend. The
two runtime-allowlisted Router environments at consultation time are:

```text
mainnet: https://router-api.0g.ai/v1
testnet: https://router-api-testnet.integratenetwork.work/v1
```

The hackathon profile selects testnet because its 0G operational funds and
available chatbot are on testnet. The production profile selects mainnet and
Private/TeeML. Runtime accepts only those two exact Router URLs and derives the
matching Compute RPC and chain ID instead of accepting an independently
configured RPC:

```text
mainnet: https://evmrpc.0g.ai, chain ID 16661
testnet: https://evmrpc-testnet.0g.ai, chain ID 16602
```

The installed SDK receives the chain ID explicitly, so an unknown RPC network
cannot trigger the SDK's documented fallback to testnet contract addresses.

The current Builder Hub pages primarily show the mainnet Router URL. The
testnet hostname above is the endpoint exposed by the current official 0G
testnet Private Computer application; it is recorded as an observed operational
environment, not asserted to be a stable mainnet-equivalent API contract.

The runtime uses raw `fetch` access to preserve response headers, enforce a
client timeout, and avoid implicit retries. The installed official SDK used for
independent response verification is
`@0gfoundation/0g-compute-ts-sdk@0.9.0` with exact versions
`ethers@6.17.0` and `zod@3.25.76`.

In this package's actual Node 20 `tsx --test` execution path, the SDK ESM bundle
fails to instantiate because its generated `index.mjs` requests a minified
export that the adjacent bundle does not provide. AEGIS therefore loads the
same package and version through its official CommonJS export with
`createRequire`. The complete service test suite exercises that runtime path;
no legacy or alternate SDK is installed.

The deprecated `@0glabs/0g-serving-broker` package was not added.

## Required Router Requests

The documented request is `POST /v1/chat/completions` with:

```http
Authorization: Bearer <ZG_ROUTER_API_KEY>
Content-Type: application/json
X-0G-Provider-Address: <selected-provider>
X-0G-Provider-Allow-Fallbacks: false
```

The trust-mode header is profile-specific:

```text
production-private-teeml -> X-0G-Provider-Trust-Mode: private
hackathon-testnet-teetls -> X-0G-Provider-Trust-Mode: verified
```

Official routing documentation says `private` selects TeeML only, while
`verified` may select TeeTLS or TeeML. AEGIS removes that ambiguity by filtering
the live catalog for the exact configured verification mode, pinning the chosen
address, and rejecting any different provider in `x_0g_trace.provider`.

Router inference keys start with `sk-`. Management keys start with `mk-` and
cannot call inference endpoints. AEGIS rejects `mk-` values, wallet-shaped
64-hex secrets, and every other non-`sk-` value during client construction,
before catalog discovery or completion dispatch. Testnet keys must be created
in the testnet Private Computer console; Router mainnet and testnet keys,
balances, and deposits are separate.

Required body controls:

```json
{
  "stream": false,
  "verify_tee": true
}
```

The configured model must advertise TeeML for production or TeeTLS for the
hackathon profile. The adapter sends `temperature: 0` and the configured
`max_tokens`. It sends `response_format: {"type":"json_object"}` only when
every eligible provider advertises `response_format`; otherwise the static
prompt still requires JSON and local strict schema validation remains
mandatory. The Router documentation does not promise JSON Schema enforcement.

`private` restricts selection to TeeML providers. The hackathon profile's
`verified` header is not a runtime fallback: it is an explicit, testnet-only
configuration that accepts only a catalog entry classified as TeeTLS. AEGIS
sets Router fallbacks to `false` in both profiles and performs no automatic
application retry after dispatch.

## Documented Response Fields

Chat Completions returns the OpenAI-compatible fields:

- `id`;
- `object`;
- `created`;
- `model`;
- `choices`;
- `usage`.

The Router also documents:

- `x_0g_trace.request_id`;
- `x_0g_trace.provider`;
- `x_0g_trace.billing.input_cost`;
- `x_0g_trace.billing.output_cost`;
- `x_0g_trace.billing.total_cost`;
- `x_0g_trace.tee_verified`.

The raw response may include the `ZG-Res-Key` header. It is the preferred
`chatID` for independent verification; the JSON response `id` is the documented
fallback. Response IDs, Router request IDs, and `ZG-Res-Key` are limited to 512
visible ASCII characters before use or persistence. Token counters are capped
at PostgreSQL's signed integer maximum.

The Models documentation describes a `model` query. The implementation requests
`GET /providers` without a query and filters locally by exact `canonical_id`,
avoiding dependence on the testnet endpoint's observed query handling. Fields
used by the implementation are `address`, `model_id`, `canonical_id`,
`service_type`, `type`, `is_healthy`, `verifiability`, optional `trust_mode`,
`tee_attested`, `tee_acknowledged`, and optional `supported_parameters`.
`canonical_id` is matched to `ZG_TEEML_MODEL`; `model_id` is retained
transiently to resolve the exact on-chain provider model and signature
endpoint. It is not semantic input and is not persisted in the final artifact.
Both configured and provider-specific model identifiers must match the bounded
runtime model-ID grammar before any paid completion is sent.

The completion response does not echo the requested trust mode. The adapter
requires the exact configured model, chatbot type, healthy state,
`tee_attested: true`, and `tee_acknowledged: true`. Production additionally
requires `verifiability: "TeeML"` and `trust_mode: "private"`. The hackathon
profile requires `verifiability: "TeeTLS"`; the observed testnet catalog omits
`trust_mode`, so AEGIS does not invent it and accepts only an absent value or
the literal `verified` for that profile.

At consultation time, the unauthenticated live model catalog exposed
`0gm-1.0-35b-a3b` as TeeML with `response_format` support. Its matching provider
catalog entry was healthy and reported TeeML, private trust mode, acknowledged
and attested TEE status. Catalog state is dynamic and is not a versioned project
guarantee.

The testnet catalog consulted on 2026-07-25 exposed chatbot `qwen2.5-omni`
(`qwen/qwen2.5-omni-7b`) as healthy TeeTLS with attested and acknowledged TEE
state and `response_format` support. It did not expose `trust_mode`. The
provider address observed at consultation time was
`0xa48f01287233509FD694a22Bf840225062E67836`; catalog state is dynamic, so the
runtime discovers and pins the address instead of hardcoding it.

After the Router Payment Layer was funded, the explicit hackathon test reached
the selected provider's completion path. The subsequent provider
`/v1/proxy/signature/{chatId}` request returned HTTP `400`. The sanitized
diagnostic was `TEEML_NOT_VERIFIED / SIGNATURE_UNAVAILABLE`, with
`requestDispatched: true`. This confirms catalog selection, Router credential
acceptance, funded completion dispatch, and fail-closed signed-response
handling, but not a verified semantic result. The client did not retry and no
evidence file was produced.

## Verification Guarantees

With `verify_tee: true`, `x_0g_trace.tee_verified: true` means the Router says it
validated the provider's TEE signature. This applies to TeeTLS and TeeML; it
does not by itself prove sealed model inference. `false`, `null`, or an absent
field is not acceptable.

The official documentation explicitly states that this boolean still trusts
the Router and does not include the raw provider signature. SDK `0.9.0`
`processResponse(providerAddress, chatID, content)` verifies the fetched
signature, but its `content` parameter is used for fee accounting and it does
not compare the signed text with the Router completion. AEGIS instead uses the
SDK read-only broker to resolve on-chain provider/signer state, fetches the
signature response once with a bounded timeout, compares its `text`
byte-for-byte with the Router completion, and calls the SDK's
`InferenceVerifier.verifySignature`.

SDK multi-model discovery is not used. In SDK 0.9.0 that path performs an
indirect request to the provider URL, so AEGIS requires the exact on-chain
service model instead. Provider resolution and signature retrieval share their
assigned deadline. Redirects are disabled, trailing-dot hostnames are
normalized, and provider signature egress pins a validated public DNS answer
to the actual HTTPS connection. Private, loopback, link-local, multicast, and
mixed public/private DNS answers fail closed. Router catalog, completion, and
signature bodies are read with byte limits before parsing. A separated signer
target is accepted in production only when the provider is decentralized and
publishes a valid `TargetTeeAddress`. For the explicit hackathon profile, the
SDK `0.9.0` testnet centralized-provider shape uses the acknowledged broker
`teeSignerAddress`; that exception is unavailable to production.

`ZG_TEEML_TIMEOUT_MS` is the total network budget. Runtime divides it among
provider-catalog lookup, completion, and signed-response verification instead
of granting the full value independently to each phase. It accepts only an
integer from 3 through 300,000 ms. `ZG_TEEML_MAX_OUTPUT_TOKENS` accepts only an
integer from 1 through 256. Invalid values produce the same fail-closed
unconfigured gateway as missing credentials.

The model-generated JSON, including echoed hashes, is data rather than
attestation. A valid AEGIS result requires all of the following:

- the exact configured security profile confirmed from the actual provider
  identity;
- Router TEE verification equal to `true`;
- independent SDK signature and exact-content verification;
- exact request, policy, action, and semantic-context hash matches;
- strict local output-schema validation.

## Current API Limitations

- No trust-mode echo is documented in the completion response.
- No raw signature is returned by the Router completion response.
- The completion does not expose an independently verifiable trust-mode echo,
  full request commitment, or TLS-routing proof. AEGIS relies on provider
  pinning, the returned provider identity, independent signed-content
  verification, and its own echoed semantic commitments.
- No `proofId`, attestation reference, or enclave measurement is documented in
  the response. Proof ID is described as forthcoming and cannot be required.
- JSON object mode is documented; strict JSON Schema output is not.
- No Router idempotency key or completion-recovery endpoint is documented.
- Client timeout after request dispatch can be a charged, unknown result.
- The API provides no recovery primitive for a stale processing claim; AEGIS
  fails it as `TEEML_UNKNOWN_RESULT` without issuing another inference.
- The provider and model catalogs change over time.
- The current testnet chatbot is TeeTLS, not Private/TeeML. Its upstream model
  may process plaintext even though the broker response is TEE-verified.
- The testnet Router Payment Layer is funded, but the current hackathon live
  test remains blocked because the selected TeeTLS provider's signed-response
  endpoint returned HTTP `400` after completion dispatch.
- A successful TeeTLS hackathon test does not satisfy the production
  Private/TeeML proof requirement.
- Reasoning content may be returned by some models and must not be persisted.
- Router zero-data-retention applies to inference content, while billing and
  usage metadata are retained.

## Official Sources

- <https://docs.0g.ai/ai-context>
- <https://build.0g.ai/compute>
- <https://build.0g.ai/zero-coding>
- <https://docs.0g.ai/developer-hub/building-on-0g/compute-network/inference>
- <https://docs.0g.ai/developer-hub/building-on-0g/compute-network/router/overview>
- <https://docs.0g.ai/developer-hub/building-on-0g/compute-network/router/quickstart>
- <https://docs.0g.ai/developer-hub/building-on-0g/compute-network/router/features/chat-completions>
- <https://docs.0g.ai/developer-hub/building-on-0g/compute-network/router/features/verifiable-execution>
- <https://docs.0g.ai/developer-hub/building-on-0g/compute-network/router/routing>
- <https://docs.0g.ai/developer-hub/building-on-0g/compute-network/router/privacy>
- <https://docs.0g.ai/developer-hub/building-on-0g/compute-network/router/comparison>
- <https://pc.0g.ai/>
- <https://github.com/0gfoundation/0g-agent-skills>
- <https://github.com/0gfoundation/0g-compute-skills>
- <https://github.com/0gfoundation/0g-compute-ts-sdk>

## Local Skill Sources

- `.0g-skills/AGENTS.md`;
- `.0g-skills/skills/compute/provider-discovery/SKILL.md`;
- `.0g-skills/skills/compute/account-management/SKILL.md`;
- `.0g-skills/skills/compute/streaming-chat/SKILL.md`;
- `.0g-skills/patterns/COMPUTE.md`;
- `.0g-skills/patterns/SECURITY.md`;
- `.0g-skills/patterns/TESTING.md`;
- `~/.agents/skills/0g-compute/SKILL.md`;
- `~/.agents/skills/0g-compute/references/inference.md`;
- `~/.agents/skills/0g-compute/references/account-management.md`.

The local skills still contain legacy broker examples. Current official Router
documentation and the installed-version SDK source take precedence.
