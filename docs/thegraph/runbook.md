# The Graph operational runbook

Run commands from the repository root on branch `feat/thegraph-aegis-onchain-data-layer`. This runbook never asks for or prints a private key. Do not commit `tee-smartcontract-validation`, external Mirror credentials, Gateway keys, or raw environment dumps.

## 1. Preserve and verify the worktree

```bash
rtk git branch --show-current
rtk git status --short --untracked-files=all
rtk git diff --stat
```

Stop if the branch differs. Preserve all implementation changes; do not reset, clean, stash destructively, rebase, or commit automatically.

## 2. Install and validate the offline core

```bash
rtk yarn install
rtk yarn contracts:test:tee-validation
rtk yarn thegraph:codegen
rtk yarn thegraph:build
rtk yarn thegraph:test
rtk yarn thegraph:lint
rtk yarn agent-service:test
rtk yarn agent-service:typecheck
rtk yarn next:test
rtk yarn next:check-types
rtk yarn next:lint
rtk yarn next:build
```

Hedera manifest generation may report the absent real registry artifact; the unit-test workflow uses an ignored, unaddressed test manifest and must never deploy it.

## 3. Run the live 0G workflow independently

The public provenance artifact is `subgraphs/aegis-0g/config/agentic-id.json`. It points to the verified deployment block and does not contain a secret.

```bash
rtk bash scripts/thegraph/preflight.sh --network 0g
rtk docker compose -f compose.thegraph.yaml config
rtk yarn thegraph:up
rtk bash scripts/thegraph/create.sh 0g
rtk yarn thegraph:deploy:0g
rtk bash scripts/thegraph/status.sh 0g
rtk bash scripts/thegraph/smoke.sh 0g
rtk bash scripts/thegraph/e2e.sh 0g
```

The deploy command reruns the 0G preflight immediately before submission; an
earlier successful run is not used as a cached readiness result.

Required result: the preflight succeeds; indexing status is healthy and synced; `_meta.hasIndexingErrors` is false; GraphQL returns real contract entities; the known token `102` mint can be proven; and no runtime fixture is involved. Save only a sanitized capture under `docs/evidence/thegraph/`.

Local endpoint:

```text
http://127.0.0.1:8000/subgraphs/name/aegis-0g
```

## 4. Prepare the exclusive registry deployment environment

Do this only on the authorized operator machine:

```bash
rtk cp tee-smartcontract-validation.example tee-smartcontract-validation
rtk chmod 600 tee-smartcontract-validation
# Fill tee-smartcontract-validation locally. Never paste it into chat or logs.
```

Required variables:

```text
TEE_VALIDATION_HEDERA_RPC_URL=
TEE_VALIDATION_HEDERA_CHAIN_ID=296
TEE_VALIDATION_DEPLOYER_PRIVATE_KEY=
TEE_VALIDATION_ADMIN_ADDRESS=
TEE_VALIDATION_RECORDER_ADDRESS=
TEE_VALIDATION_CONFIRMATIONS=1
```

The loader at `packages/foundry/scripts-js/tee-validation/loadTeeSmartContractValidationEnv.js` reads this exact repository-root file directly, rejects unknown/duplicate/missing keys, validates Testnet chain ID, private-key shape, addresses, confirmations, and an HTTP(S) RPC without embedded credentials, and returns only the allowlist. There is no `.env` fallback.

Before reading, the loader uses `lstat` and `stat` and fails closed unless the path is a regular file rather than a symbolic link. It also rejects every group/other permission bit (`mode & 0o077 !== 0`). On POSIX systems and WSL, use mode `0600` as shown above. Native Windows ACLs are not represented faithfully by POSIX mode bits; run this deployment workflow in Linux/WSL, keep the file ACL restricted to the authorized operator, and do not weaken or bypass the loader check.

Do not run the deploy command when that file is absent or invalid.

## 5. Deploy and verify the singleton registry

```bash
rtk yarn contracts:test:tee-validation
rtk yarn contracts:deploy:tee-validation
rtk yarn workspace @sh/foundry verify:tee-validation
rtk jq . deployments/hedera-testnet/tee-validation-registry.json
```

`contracts:test:tee-validation` includes an integration test that starts an
ephemeral Anvil chain with chain ID 296 and a documented test-only account. It
executes the real deploy and post-deploy verifier against temporary artifact and
journal paths, checks the receipt, runtime bytecode, final roles, and deployer
de-authorization, then submits an authorized contract/indexing record through a
separate `RECORDER_ROLE` signer and validates every emitted event field. The
same integration test proves that a missing provider, wrong chain, absent or
mismatched bytecode, and revoked recorder role all fail before broadcast. It then
removes the processes and temporary directory. It neither
loads nor creates the repository-root `tee-smartcontract-validation` file and
does not write the production deployment artifact. This local proof validates
the deploy workflow; it is not a Hedera Testnet deployment or evidence of one.
The sanitized Forge compilation may refresh the normal ignored
`packages/foundry/out/` build cache; that cache is not deployment evidence or
public deployment state.

The deployer validates the network, deployer balance, final admin and recorder, compiles the contract, refuses an existing real deployment by default, waits for configured confirmations, verifies runtime bytecode and roles, and writes the sanitized artifact atomically. Before its first network write it locally signs the CREATE transaction and atomically writes the owner-only, ignored `.thegraph/deployments/hedera-testnet/tee-validation-registry.pending.json` journal. The journal contains only public transaction/address/chain metadata and bytecode hashes; it never contains the raw signed transaction, a private key, or an RPC URL.

If deployment exits after that journal is written, do not run deploy again, including with `--redeploy`. Recover or rebroadcast only the deterministically reconstructed transaction with the original nonce, signature, hash, and CREATE address:

```bash
rtk yarn contracts:recover:tee-validation
rtk yarn workspace @sh/foundry verify:tee-validation
```

Recovery fails closed and preserves the journal when the receipt, bytecode, roles, environment, or reconstructed transaction does not match. A redeploy is allowed only by the deploy script's explicit opt-in flag and requires human approval; it cannot bypass an unresolved journal and must not be used in the normal flow.

If and only if recovery finds a transaction conclusively mined with receipt status `0`, preserve the journal and have a human verify the exact transaction hash before acknowledging it:

```bash
rtk yarn contracts:acknowledge-failed:tee-validation --acknowledge-confirmed-failed-deployment 0xExactPendingDeployTransactionHash
```

This command loads only `tee-smartcontract-validation` and performs three repeated reads of the transaction, receipt, block-by-number, and block-by-hash. It requires stable status `0` provenance, the configured chain and deployer, the journal nonce/gas/data hash, the predicted CREATE address, the configured confirmations, a consumed deployer nonce, and empty code at the predicted address. Missing, pending, successful, inconsistent, insufficiently confirmed, or otherwise ambiguous state leaves the journal untouched.

Only after those checks pass does the command atomically archive owner-only sanitized failure evidence under `.thegraph/deployments/hedera-testnet/failed/`, then clear the pending journal. The archive contains no raw transaction, RPC URL, key, or environment. A subsequent deployment remains blocked unless the human explicitly binds it to that archived failure:

```bash
rtk yarn contracts:deploy:tee-validation --after-confirmed-failure 0xExactPendingDeployTransactionHash
```

If a previous successful deployment artifact still exists because an explicitly approved replacement failed, the retry also requires `--redeploy`. Never delete or edit the journal/archive manually, and never use the acknowledgement command for a pending or missing receipt.

The artifact must contain only:

- contract name and address;
- chain ID/network;
- deployment transaction and block;
- deployer/admin/recorder public addresses;
- ABI path and bytecode hash;
- schema version and deployment time.

It must not contain a private key, RPC credential, raw environment, API token, or other unknown field.

## 6. Bring up a Graph-compatible Hedera data source

The public-Mirror-backed relay is an observed failure mode. `TG-HEDERA-RPC-001` requires a dedicated, current Mirror stack.

On the infrastructure host, fetch the reviewed official release:

```bash
rtk git clone --depth 1 --branch v0.159.1 https://github.com/hiero-ledger/hiero-mirror-node.git ../hiero-mirror-node-v0.159.1
```

In that external checkout, configure `configs.app-config.content` in `docker-compose.yml` for `TESTNET` and requester-pays S3/GCP access according to the official `docs/installation.md` and `docs/configuration.md`. Those credentials stay outside this repository. Then start only the required data services:

```bash
rtk docker compose -f ../hiero-mirror-node-v0.159.1/docker-compose.yml up -d db redis importer rest web3 api-proxy
rtk docker compose -f ../hiero-mirror-node-v0.159.1/docker-compose.yml ps
```

Required endpoints are the dedicated REST API (normally port `5551`) and Web3 API (normally port `8545`), reachable from the relay container. Point the repository relay at those endpoints through:

```text
THEGRAPH_HEDERA_MIRROR_NODE_URL=http://<dedicated-mirror-host>:5551
THEGRAPH_HEDERA_MIRROR_NODE_WEB3_URL=http://<dedicated-mirror-host>:8545
```

Start or recreate the repository stack with those variables set in the operator shell. The relay is pinned to `ghcr.io/hiero-ledger/hiero-json-rpc-relay:0.78.1`, `READ_ONLY=true`, Testnet chain ID `0x128`, and loopback port `7546`.

## 7. Run the strict Hedera gate

```bash
rtk bash scripts/thegraph/preflight.sh --network hedera
```

Do not proceed unless the final marker is exactly:

```text
HEDERA_GRAPH_RPC_READY
```

The gate proves repeated consistency for blocks, transactions, receipts, receipt block hashes/numbers, exact/range logs, registry bytecode, deployment transaction/receipt, and history from the artifact start block. `HEDERA_GRAPH_RPC_BLOCKED` is a hard failure for Hedera indexing, even when the relay health endpoint is green.

## 8. Generate, deploy, and synchronize Hedera

After both the real deployment artifact and `HEDERA_GRAPH_RPC_READY` exist:

```bash
rtk node scripts/thegraph/generate-manifests.mjs --network hedera
rtk bash scripts/thegraph/codegen.sh hedera
rtk bash scripts/thegraph/build.sh hedera
rtk bash scripts/thegraph/test.sh hedera
rtk bash scripts/thegraph/lint.sh hedera
rtk bash scripts/thegraph/create.sh hedera
rtk yarn thegraph:deploy:hedera
rtk bash scripts/thegraph/status.sh hedera
rtk bash scripts/thegraph/smoke.sh hedera
rtk bash scripts/thegraph/e2e.sh hedera
```

The Hedera deploy command also reruns the strict preflight and therefore fails
closed if source consistency changes between preparation and submission.

Local endpoint:

```text
http://127.0.0.1:8000/subgraphs/name/aegis-hedera
```

Deployment alone is not success. Require a chain-ingestor head, healthy/synced indexing status, `_meta` without errors, and a real entity query.

An explicitly authorized registry record may be used to prove contract/indexing plumbing only when it is labelled `AUTHORIZED CONTRACT/INDEXING TEST RECORD`. Prepare deterministic fixed-width calldata after deployment with:

```bash
rtk yarn contracts:prepare-test-record:tee-validation --test-id graph-smoke-001 --verdict ALLOW --safe 0xYourSafeAddress --agentic-id-token-id 102
```

Preparation reads only the sanitized public deployment artifact and ABI; it does not load `tee-smartcontract-validation`, sign, or broadcast. Run the dedicated post-deploy verifier first, then submit the returned calldata only through the separately secured runtime signer whose address holds `RECORDER_ROLE`. Never reuse or add that runtime recorder key to `tee-smartcontract-validation`. Before sending, the reusable driver `submitAuthorizedContractIndexingTest()` requires a provider-connected configured recorder, verifies RPC chain ID 296, requires non-empty registry bytecode whose hash matches the deployment artifact, and checks the live `RECORDER_ROLE`. It validates the successful receipt, stored record hash, and every emitted event field, and always returns sanitized evidence with `realTeeMlVerdict: false`. Never describe this record as a real 0G TeeML verdict. The real TeeML path remains `TG-TEEML-E2E-001`.

## 9. Verify dashboard and Audit Copilot

Set server-side endpoint variables without exposing a Gateway key in the browser bundle:

```text
THEGRAPH_HEDERA_SUBGRAPH_URL=http://127.0.0.1:8000/subgraphs/name/aegis-hedera
THEGRAPH_0G_SUBGRAPH_URL=http://127.0.0.1:8000/subgraphs/name/aegis-0g
THEGRAPH_GATEWAY_API_KEY=
```

Then run the production dashboard and exercise `/api/onchain/*` plus `POST /api/onchain/audit-copilot`. Confirm every onchain result has a source, transaction/block provenance, and `_meta` freshness. Confirm unavailable Hedera/business entities display an honest partial/unsupported state.

The Audit Copilot must return only allowlisted 0G GraphQL analyses with citations. Do not accept raw GraphQL, an endpoint in the request, or an evidence-free answer.

## 10. Stop services without deleting data

```bash
rtk yarn thegraph:down
```

This preserves persistent Graph Node/IPFS volumes. Do not add a volume-deletion flag to routine scripts.

## 11. Evidence checklist

Store only sanitized files under `docs/evidence/thegraph/`:

- deployment artifact/transaction/block and role verification;
- relay and Graph Node health;
- strict RPC preflight marker;
- indexing status and `_meta`;
- named GraphQL request/response with public variables;
- known 0G identity and any authorized registry test label;
- dashboard/API result proving partial-state behavior;
- Audit Copilot result with entity, transaction, block, and source citations.

Never store the exclusive environment file, private keys, raw env, requester-pays credentials, Gateway/API tokens, private TeeML context, raw prompts/model output, or detailed agent reasons.
