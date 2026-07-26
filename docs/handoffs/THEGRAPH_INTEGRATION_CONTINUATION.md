# The Graph integration continuation handoff

## Authority and frozen decisions

This is the canonical continuation source for branch `feat/thegraph-aegis-onchain-data-layer`. Resume on this branch, preserve all uncommitted implementation work, and do not commit without human approval.

Do not reopen these decisions:

- The Graph is the canonical confirmed/historical onchain read layer for the dashboard.
- The read path is self-hosted Graph Node -> Subgraph GraphQL -> dashboard.
- **Graph Node self-hosted eligibility: HUMAN-CONFIRMED / RESOLVED.**
- This is a self-hosted deployment over live testnet data, not a The Graph Network publication.
- Hedera and 0G remain separate Subgraphs; cross-chain joining occurs in the client.
- The Graph is not in enforcement, policy checking, TeeML, signing, or Safe execution.
- Private AEGIS/TeeML data stays offchain and out of Subgraphs/Copilot.
- No direct RPC, Mirror Node, explorer, private-database, or fixture fallback may replace GraphQL for confirmed history.
- No event, address, receipt, ABI claim, TeeML verdict, or cross-chain relationship may be fabricated.

## Branch state and architecture

The core implementation is present as uncommitted work. Do not reset, clean, destructively stash, rebase, or switch in a way that discards it.

```text
0G Agentic ID -> aegis-0g Subgraph ----\
                                         -> typed GraphQL clients -> aggregator/dashboard/Audit Copilot
Hedera registry + discovered Safes -> aegis-hedera Subgraph ----/
```

The self-hosted stack is `compose.thegraph.yaml`: Graph Node `v0.44.0`, isolated PostgreSQL, IPFS, and read-only Hiero JSON-RPC Relay `v0.78.1`, with persistent volumes and loopback service ports. The refreshed 0G Subgraph is live, healthy, and synchronized as CID `QmaVs13eKCFLV9MAoZNkb4S5oqZ7ToV2nyVPu6kGHQqbY9`; its full configured-registry history starts at the verified deployment block. Hedera needs a dedicated Mirror backing stack because public-Mirror-backed relay responses fail provenance consistency.

## Completion map

### Complete core

- singleton, immutable `AegisTeeValidationRegistry` contract, roles, idempotency, event, record hash, privacy and gas tests;
- exact-file exclusive loader, example, deploy/verify workflow, redeploy guard, atomic sanitized artifact writer;
- verification-gated `VerifiedTeeMlRegistryWriter` port and Hedera adapter;
- Hedera schema/mappings/Matchstick for registry facts, summaries/metrics, and verified Safe v1.4.1 event surface;
- official 0G contract provenance, verified deployment block/source/runtime, minimal fixed-width event ABI, mappings, and tests;
- Graph Node Compose, strict repeated RPC preflight, independent deployment/status/smoke/E2E scripts;
- static GraphQL clients, filters, exact search, bounded cursor pagination, `_meta` freshness, partial cross-chain states, and no-direct-RPC boundary test;
- dashboard views and honest unsupported/partial states;
- read-only 0G Audit Copilot with six allowlisted static GraphQL intents and citations;
- documentation and sanitized-evidence framework.

### Partially complete because of external dependencies

- real registry deployment and Hedera manifest (`TG-DEPLOY-001`);
- Graph-compatible live Hedera source/sync (`TG-HEDERA-RPC-001`);
- real verified TeeML completion path (`TG-TEEML-E2E-001`);
- business payment/execution/policy producer events (`TG-EVENTS-001`);
- Hedera-backed Audit Copilot intents (`TG-AUDIT-COPILOT-001`).

The previously missing Agentic ID deployment provenance/full history question is resolved as `TG-AGENTIC-ID-001`; it is not a blocker.

## Task registry

### TG-DEPLOY-001 — deploy the singleton registry

**Status:** `WAITING_FOR_SECRET`

**Dependency:** a locally supplied repository-root file named exactly `tee-smartcontract-validation` and a funded dedicated Hedera Testnet deployer. The file is absent at the current handoff. Never create a key, request it in chat, or print it.

**Files and functions:**

- `tee-smartcontract-validation.example`;
- `.gitignore`;
- `packages/foundry/scripts-js/tee-validation/loadTeeSmartContractValidationEnv.js` -> `loadTeeSmartContractValidationEnv()`;
- `packages/foundry/scripts-js/tee-validation/deploy.js`;
- `packages/foundry/scripts-js/tee-validation/recover.js`;
- `packages/foundry/scripts-js/tee-validation/pendingDeployment.js`;
- `packages/foundry/scripts-js/tee-validation/acknowledgeFailed.js`;
- `packages/foundry/scripts-js/tee-validation/acknowledgeFailedDeployment.js`;
- `packages/foundry/scripts-js/tee-validation/failedDeployment.js`;
- `packages/foundry/scripts-js/tee-validation/recordAuthorizedTest.js`;
- `packages/foundry/scripts-js/tee-validation/verify.js`;
- `packages/foundry/scripts-js/tee-validation/deployment.js` -> `deployTeeValidationRegistry()` and `verifyTeeValidationRegistryDeployment()`;
- output `deployments/hedera-testnet/tee-validation-registry.json` and ABI beside it;
- `scripts/thegraph/generate-manifests.mjs`.

**Required variables:**

```text
TEE_VALIDATION_HEDERA_RPC_URL=
TEE_VALIDATION_HEDERA_CHAIN_ID=296
TEE_VALIDATION_DEPLOYER_PRIVATE_KEY=
TEE_VALIDATION_ADMIN_ADDRESS=
TEE_VALIDATION_RECORDER_ADDRESS=
TEE_VALIDATION_CONFIRMATIONS=1
```

**Exact next commands:**

```bash
rtk cp tee-smartcontract-validation.example tee-smartcontract-validation
rtk chmod 600 tee-smartcontract-validation
# Fill the file locally without displaying it.
rtk yarn contracts:test:tee-validation
rtk yarn contracts:deploy:tee-validation
rtk yarn contracts:recover:tee-validation # only when the deploy reports an unresolved pending journal
rtk yarn workspace @sh/foundry verify:tee-validation
rtk jq . deployments/hedera-testnet/tee-validation-registry.json
rtk node scripts/thegraph/generate-manifests.mjs --network hedera
```

Do not execute the deploy command until the file is present, mode `600`, complete, and locally reviewed. The deploy script refuses a second deployment by default. `--redeploy` is emergency/manual authority and requires explicit human approval.

The exclusive loader checks the path with `lstat` and `stat` before reading it. It rejects symbolic links, non-regular files, and any group/other permission bit (`mode & 0o077 !== 0`) without falling back to `.env` or ambient variables. On POSIX systems and WSL, keep the file at mode `0600`. Because native Windows ACLs are not faithfully expressed by POSIX mode bits, resume this deployment from Linux/WSL and restrict the file ACL to the authorized operator; never bypass the fail-closed check.

The deploy command persists an ignored, owner-only, sanitized pending journal before broadcast. If the process exits after that point, every deploy invocation fails closed, even with `--redeploy`. Run `contracts:recover:tee-validation`; it reconstructs and verifies the exact original signed transaction and may only rebroadcast that same nonce/hash/CREATE address. It never stores the replay-capable raw transaction or any secret. Do not delete the pending journal manually.

If recovery proves the exact journal transaction was mined with status `0`, a human may release the failed journal only with `rtk yarn contracts:acknowledge-failed:tee-validation --acknowledge-confirmed-failed-deployment 0xExactPendingDeployTransactionHash`. The command loads only the dedicated environment and requires three consistent transaction/receipt/block reads, confirmations, matching chain/deployer/nonce/gas/data/CREATE address, consumed nonce, and no code. It atomically writes ignored sanitized evidence under `.thegraph/deployments/hedera-testnet/failed/` before clearing the journal. Every ambiguous, pending, missing, successful, or inconsistent state remains fail-closed.

The next attempt must be explicitly tied to the archive with `rtk yarn contracts:deploy:tee-validation --after-confirmed-failure 0xExactPendingDeployTransactionHash`; add `--redeploy` as well only when an older successful registry artifact still exists. Neither flag can bypass an unresolved journal. Never remove or edit deployment journals or failure archives manually.

**Acceptance criteria:**

1. chain ID is 296, deployer balance covers estimated deployment, and final admin/recorder are valid;
2. one successful deployment receipt and non-empty matching runtime code exist;
3. configured admin has `DEFAULT_ADMIN_ROLE`, configured recorder has `RECORDER_ROLE`, and an unrelated deployer retains no authority;
4. public artifact has only validated public fields, including address, transaction, block, public role addresses, ABI path, bytecode hash, schema version, and timestamp;
5. post-deploy verifier passes and the generated Hedera manifest uses exactly the artifact address/block;
6. no secret/environment value appears in logs, artifact, evidence, or Git.

**Expected sanitized evidence:** deployment artifact, transaction hash, block, bytecode hash, role verification, artifact/ABI/manifest consistency. An authorized record used only for plumbing must be labelled `AUTHORIZED CONTRACT/INDEXING TEST RECORD`, never `REAL 0G TEEML VERDICT`. After the dedicated verifier passes, prepare deterministic calldata from the public artifact/ABI with `rtk yarn contracts:prepare-test-record:tee-validation --test-id graph-smoke-001 --verdict ALLOW --safe 0xYourSafeAddress --agentic-id-token-id 102`, then submit it through the separately secured configured recorder. Before broadcast, `submitAuthorizedContractIndexingTest()` validates the connected provider, actual chain ID 296, non-empty registry bytecode, artifact bytecode hash, configured recorder address, and live `RECORDER_ROLE`; after broadcast it validates the receipt, stored record hash, and all event fields. The preparation command neither loads `tee-smartcontract-validation` nor broadcasts, and the recorder private key must never be added to the dedicated deploy file.

**Risk:** deploying before `TG-HEDERA-RPC-001` is resolved can produce a real registry that the current Graph Node source cannot index. Deployment is valid independently, but do not claim Hedera read-layer completion until both tasks pass.

### TG-HEDERA-RPC-001 — provide a consistent Hedera source stack

**Status:** `WAITING_FOR_RPC_STACK`

**Observed failure:** official Hiero relay `v0.78.1` backed by the public Testnet Mirror endpoint is process-healthy but repeatedly exposes a block transaction that is unavailable by hash or lacks stable matching receipt provenance. Public Hashio showed the same unsafe class. This is not repaired by retrying or disabling checks.

**Required topology:**

```text
Hedera Testnet streams
  -> dedicated Hiero Mirror Node v0.159.1 (PostgreSQL/importer/REST/Web3)
  -> read-only Hiero JSON-RPC Relay v0.78.1
  -> Graph Node v0.44.0
```

**Official sources:**

- `https://github.com/hiero-ledger/hiero-mirror-node/releases/tag/v0.159.1`;
- `https://github.com/hiero-ledger/hiero-mirror-node/blob/v0.159.1/docs/installation.md`;
- `https://github.com/hiero-ledger/hiero-json-rpc-relay/releases/tag/v0.78.1`;
- `https://github.com/hiero-ledger/hiero-json-rpc-relay/blob/v0.78.1/docs/configuration.md`.

**External infrastructure variables:** Mirror Node `TESTNET` network, requester-pays S3/GCP access configured outside this repository, durable Mirror PostgreSQL, and REST/Web3 endpoints reachable from the relay. Repository variables are:

```text
THEGRAPH_HEDERA_MIRROR_NODE_URL=http://<dedicated-mirror-host>:5551
THEGRAPH_HEDERA_MIRROR_NODE_WEB3_URL=http://<dedicated-mirror-host>:8545
THEGRAPH_HEDERA_GRAPH_NODE_RPC_URL=http://hedera-json-rpc-relay:7546
THEGRAPH_HEDERA_RPC_URL=http://127.0.0.1:7546
```

**Exact infrastructure bootstrap:**

```bash
rtk git clone --depth 1 --branch v0.159.1 https://github.com/hiero-ledger/hiero-mirror-node.git ../hiero-mirror-node-v0.159.1
# In that checkout, configure docker-compose.yml app-config for TESTNET and requester-pays access.
rtk docker compose -f ../hiero-mirror-node-v0.159.1/docker-compose.yml up -d db redis importer rest web3 api-proxy
rtk docker compose -f ../hiero-mirror-node-v0.159.1/docker-compose.yml ps
```

Then recreate the repository relay/Graph Node with the dedicated REST/Web3 variables present in the operator shell and run:

```bash
rtk yarn thegraph:up
rtk bash scripts/thegraph/preflight.sh --network hedera
```

**Preflight coverage:** chain ID; latest/repeated block; transaction by hash; receipt by hash; three identical transaction/receipt reads; receipt hash/number against source block; exact-block and historical range logs; registry code; deployment transaction/receipt; history from the artifact start block.

**Acceptance criteria:**

1. strict preflight ends `HEDERA_GRAPH_RPC_READY`, never merely relay healthy;
2. no Hashio or public-Mirror fallback remains in the Graph Node source path;
3. `aegis-hedera` deploys, its chain-ingestor head advances, status is healthy/synced, `_meta.hasIndexingErrors` is false, and a real event query succeeds;
4. evidence records versions/endpoints by role without requester-pays credentials or private URLs containing secrets.

**Expected sanitized evidence:** relay health, preflight marker and sampled public hashes/blocks, Graph Node chain head/indexing status, `_meta`, GraphQL response.

**Risk:** the official Mirror Compose defaults to demo data. It must be explicitly configured for live Testnet and its existing demo database must not be misreported as Testnet evidence.

### TG-TEEML-E2E-001 — wire the real verified TeeML artifact

**Status:** `WAITING_FOR_TEEML`

**Dependency:** the real verifier module is now merged in `services/agent-service/src/teeml/`. Its live hackathon TeeTLS profile is explicitly demo-only, non-private, non-sealed, and does not independently prove the signed provider commitment matches the selected content byte-for-byte. It must never call the registry writer. Completion requires production-private, sealed, TEE-verified and byte-for-byte verified evidence with every hash already compared to the original AEGIS precheck. No fallback model or synthetic verdict qualifies.

**Files and functions:**

- verified completion point: `services/agent-service/src/teeml/service.ts` immediately after the sanitized `VerifiedTeeMlArtifact` is durably completed;
- port: `services/agent-service/src/teeml-registry/types.ts` -> `VerifiedTeeMlRegistryWriter.recordVerifiedVerdict(input)`;
- adapter: `services/agent-service/src/teeml-registry/adapter.ts` -> `HederaTeeValidationRegistryAdapter.recordVerifiedVerdict()`;
- tests: `services/agent-service/src/teeml-registry/adapter.test.ts` plus the future TeeML completion integration test.

**Required typed input:** request and agent IDs; Agentic ID token; Safe; non-zero policy/action/semantic-context/TeeML-request/artifact/model/reason-code hashes; `ALLOW` or `DENY`; schema version; and true verification flags for private routing, TEE, schema, every hash, artifact, model, and reason code.

**State transition:**

1. before: Level 1 produced `PENDING_TEEML`, the sanitized precheck and usage hold exist, and the plaintext semantic context remains in memory only;
2. TeeML completion module verifies private routing, TEE evidence, schema, verdict, and all commitments against the precheck;
3. call `recordVerifiedVerdict()`; the adapter revalidates gates and fixed-size inputs, writes `recordTeeMLValidation`, waits for a successful receipt, and reads the immutable `recordHash`;
4. persist the public registry transaction/block/record hash in the sanitized audit record at the new completion boundary;
5. after: continue the existing ALLOW/DENY workflow. A technical TeeML failure remains offchain and is not written as a verdict.

**Exact validation commands after production-private credentials, an eligible model/provider, and the deployed runtime recorder are configured:**

```bash
rtk yarn agent-service:test
rtk yarn agent-service:test:integration
rtk bash scripts/thegraph/status.sh hedera
rtk bash scripts/thegraph/smoke.sh hedera
rtk bash scripts/thegraph/e2e.sh hedera
```

**Acceptance criteria:** one real verified ALLOW or DENY follows the exact state transition; the receipt succeeds; GraphQL returns the matching request/action/policy/artifact hashes and transaction/block; the dashboard displays it; no runtime RPC read is used; failure/fallback cases never call the driver. Remove the TODO only after this real E2E passes.

**Expected sanitized evidence:** precheck/request IDs as hashes, verification-gate result codes, registry transaction/block/entity, `_meta`, and dashboard/API result. Never store the prompt, semantic rules/plaintext, detailed reason, raw response/proof, or model internal output.

### TG-AGENTIC-ID-001 — verified Agentic ID provenance

**Status:** `COMPLETE`

**Recovered facts:**

- contract `0x2700F6A3e505402C9daB154C5c6ab9cAEC98EF1F`;
- creation transaction `0xbdd5f9d5c4f3086c814e02be0757650f553a02a46f0341e6dea96d1eed2f7557`;
- deployment block `23544364`, block hash `0x4607e55df9cf6928f80545bcbdc1b7e195b772c2babcb6c499fdbef4a498d49f`;
- deployer `0xaD8518cF3510eB2EBb843Eb51D209A5f98B768D2`;
- official source commit `fd3c58306bf45c42888d4acda949bac0d3d64522`;
- metadata-stripped compiled and live runtime match;
- known AEGIS token `102` mint remains separate correlation/smoke evidence.

The refreshed self-hosted deployment was healthy/synced with `_meta.hasIndexingErrors=false` at indexed block sample `45993590`. It returned 117 identities, 117 mints, 16 transfers, 133 owner-change facts, 13 authorization grants, 1 authorization revocation, 2 delegation sets, and 0 delegation revocations. These are point-in-time full configured-registry counts, not a claim that every indexed identity is an AEGIS agent.

`subgraphs/aegis-0g/config/agentic-id.json` contains provenance and SHA-256 hashes. `subgraphs/aegis-0g/abis/AgenticID.json` is explicitly a minimal fixed-width event ABI for `Transfer`, `UsageAuthorized`, `UsageRevoked`, and `DelegateAccessSet`; it is not labelled full ABI. Dynamic `IntelligentDataSet` strings are intentionally excluded.

**Regression commands:**

```bash
rtk bash scripts/thegraph/preflight.sh --network 0g
rtk bash scripts/thegraph/test.sh 0g
rtk yarn thegraph:deploy:0g
rtk bash scripts/thegraph/status.sh 0g
rtk bash scripts/thegraph/smoke.sh 0g
rtk bash scripts/thegraph/e2e.sh 0g
```

Do not reopen deployment-block recovery unless new contradictory primary evidence appears. Do not infer that every registry identity is AEGIS-linked.

### TG-EVENTS-001 — add sanitized business event producers

**Status:** `WAITING_FOR_EVENT_PRODUCER`

**Current fact:** no current AEGIS Hedera contract emits enough public data to prove a business payment, fee, full execution, or policy lifecycle. Safe protocol execution events expose execution hash/status and Safe reimbursement, not business asset/destination/amount. The dashboard intentionally reports this capability as unsupported.

**Natural producer:** the existing Hedera execution/co-signing module that finalizes an approved Safe operation, not the TeeML registry and not a new contract that duplicates private policy state.

**Sanitized event design inputs:** versioned fixed-size request/agent/action/policy hashes; Safe address; execution/Safe transaction hash; public destination and asset identifiers only when already public and representable without private metadata; integer amount in base units; structured success/failure code; schema version. The design must omit free-text reasons, private policy rules, prompts, semantic context, raw calldata when it leaks private intent, and database identifiers that are not public commitments.

**Integration points:**

- producer contract/module in the existing Hedera execution path;
- new real event ABI/data source handler in `subgraphs/aegis-hedera/`;
- immutable event entity and only justified summary projections;
- static operations in `packages/nextjs/lib/onchain-data/queries.ts`;
- current unsupported marker in `UNSUPPORTED_ONCHAIN_QUERIES.paymentsByAgent`;
- `packages/nextjs/app/dashboard/payments/page.tsx`.

**Required tests:** contract event fields/privacy/idempotency as appropriate; mapping IDs/timestamps/all fields; linter/build; live event/indexing/GraphQL; filter/search/pagination; UI empty/error/source labels; no-direct-RPC and no-database fallback.

**Acceptance criteria:** a real sanitized producer event exists and is emitted by the natural execution flow, the Hedera Subgraph indexes it, static GraphQL returns it, the dashboard exposes it with provenance, and the TODO is removed. A decoded guess, Safe reimbursement relabel, private API result, fixture, or direct RPC query does not qualify.

### TG-AUDIT-COPILOT-001 — extend live analysis to Hedera

**Status:** 0G MVP `COMPLETE`; Hedera extension `READY_NOT_DEPLOYED`

**Current implementation:** `packages/nextjs/lib/onchain-data/auditCopilot.ts`, static queries, server route, and dashboard page support six 0G intents: registry summary, recent identities, owner activity, ownership changes, usage authorizations, and delegations. Input is strictly bounded; every answer requires indexed entity/transaction/block citations and `_meta` freshness. A live HTTP smoke against CID `QmaVs13eKCFLV9MAoZNkb4S5oqZ7ToV2nyVPu6kGHQqbY9` returned HTTP 200 with citations/freshness for all six intents and HTTP 400 for a private TeeML-prompt question. Evidence: `docs/evidence/thegraph/audit-copilot.sanitized.json`.

**Remaining files/functions:** extend `AUDIT_COPILOT_INTENTS`, classifier, static query catalog, result validators/citations, tests, and UI presets only after live Hedera entities exist.

**Preconditions:** `TG-DEPLOY-001` and `TG-HEDERA-RPC-001`; payment/spending/provider questions also require `TG-EVENTS-001`. `TG-TEEML-E2E-001` is required before an answer is described as real TeeML evidence, although an authorized contract/indexing test record may exercise plumbing with an explicit label.

**Target Hedera intents:** DENYs by time range, denied validations by policy hash, actions by model hash, and Safe executions without correlated validations. Business payment/spending/provider intents remain excluded until their event producer exists.

**Acceptance commands:**

```bash
rtk yarn next:test
rtk yarn next:check-types
rtk yarn next:lint
rtk yarn next:build
rtk bash scripts/thegraph/e2e.sh hedera
```

**Acceptance criteria:** at least one live Hedera intent uses a static bounded GraphQL operation, handles stale/error/no-evidence states, returns entity/transaction/block/source citations, rejects invalid questions/limits, and passes the no-RPC/no-private-DB boundary test. Remove the TODO only then.

After genuine The Graph Network publication, Subgraph MCP may replace the GraphQL adapter for that allowlisted deployment. Do not claim MCP support for the self-hosted node.

## Exact future execution order

1. Reconfirm branch and preserve worktree with the three Git read-only commands in `docs/thegraph/runbook.md`.
2. Run all offline core tests; fix internal regressions before external work.
3. Keep/regress the independently runnable 0G live deployment and Audit Copilot evidence.
4. Provision the dedicated Mirror Node and point the read-only relay at its REST/Web3 endpoints (`TG-HEDERA-RPC-001`).
5. Locally create and validate the exact exclusive deploy file; deploy the singleton once and verify its public artifact (`TG-DEPLOY-001`).
6. Run strict Hedera preflight; proceed only on `HEDERA_GRAPH_RPC_READY`.
7. Generate, build, lint, deploy, sync, and smoke-test `aegis-hedera`; record `_meta` and a real indexed event.
8. Configure/wire an eligible production-private verified TeeML completion and prove TeeML -> registry -> GraphQL -> dashboard (`TG-TEEML-E2E-001`); never substitute the live demo-only TeeTLS profile.
9. Add natural sanitized business producer events and update Subgraph/client/UI (`TG-EVENTS-001`).
10. Add live Hedera Audit Copilot intents and cited acceptance evidence (`TG-AUDIT-COPILOT-001`).
11. Run the full validation matrix, update `integration-status.md`, append `DEVLOG.md`, and request human review. Do not commit automatically.

## Resume checklist for another chat

Read, in order: `AGENTS.md`, `PLAYBOOK.md`, `TASKS.md`, bottom of `DEVLOG.md`, `docs/aegis-current-scope.md`, `docs/thegraph/integration-status.md`, this handoff, and the task's referenced files. Then run:

```bash
rtk git branch --show-current
rtk git status --short --untracked-files=all
rtk git diff --stat
```

Use the status table rather than repeating discovery. Do not reclassify human-confirmed self-hosted eligibility as a blocker. Do not call the Layer complete until both live Subgraphs, the real TeeML chain, and the required real Audit evidence satisfy their gates. External absence alone is not an internal-core blocker.

## Cross-cutting risks

- **Source inconsistency:** a healthy relay may still be unsafe; strict repeated provenance is the gate.
- **Mirror configuration:** the official Docker Compose defaults to demo data; Testnet requester-pays ingestion must be explicit.
- **Authority leakage:** the exclusive deploy key must never reach runtime or documentation.
- **False product semantics:** Safe reimbursement is not a business payment, and a contract/indexing test record is not real TeeML.
- **Cross-chain overclaim:** contract-wide 0G identities are not all AEGIS agents; only explicit keys justify correlation.
- **Privacy:** dynamic metadata, private semantic context, raw proof/output, detailed reason, tokens, and private database rows stay out.
- **Staleness:** process health and deployment success are insufficient; `_meta` and indexing status must remain visible.
- **Technology-label inflation:** self-hosted GraphQL is not The Graph Network and not Subgraph MCP.
