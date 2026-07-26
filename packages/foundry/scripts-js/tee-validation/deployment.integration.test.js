import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { Contract, Wallet, providers, utils } from "ethers";
import {
  FAILED_DEPLOYMENT_ARCHIVE_DIRECTORY,
  PENDING_DEPLOYMENT_JOURNAL_PATH,
  PUBLIC_ABI_PATH,
  PUBLIC_DEPLOYMENT_ARTIFACT_PATH,
  TEE_VALIDATION_ENV_PATH,
} from "./constants.js";
import {
  deployTeeValidationRegistry,
  verifyTeeValidationRegistryDeployment,
} from "./deployment.js";
import {
  AUTHORIZED_TEST_RECORD_LABEL,
  buildAuthorizedContractIndexingTestRecord,
  parseAuthorizedTestRecordArguments,
  submitAuthorizedContractIndexingTest,
} from "./authorizedTestRecord.js";

// Anvil's documented deterministic development mnemonic and first account.
// These credentials are test-only, never loaded by production code, and have
// no authority or funds outside this ephemeral process.
const TEST_MNEMONIC =
  "test test test test test test test test test test test junk";
const TEST_DEPLOYER_PRIVATE_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const TEST_ADMIN_PRIVATE_KEY = Wallet.fromMnemonic(
  TEST_MNEMONIC,
  "m/44'/60'/0'/0/1"
).privateKey;
const TEST_RECORDER_PRIVATE_KEY = Wallet.fromMnemonic(
  TEST_MNEMONIC,
  "m/44'/60'/0'/0/2"
).privateKey;
const TEST_DEPLOYER_ADDRESS = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const TEST_ADMIN_ADDRESS = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const TEST_RECORDER_ADDRESS = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";

const PROTECTED_DEPLOYMENT_PATHS = [
  PUBLIC_DEPLOYMENT_ARTIFACT_PATH,
  PUBLIC_ABI_PATH,
  PENDING_DEPLOYMENT_JOURNAL_PATH,
  FAILED_DEPLOYMENT_ARCHIVE_DIRECTORY,
];

test(
  "deploys, verifies, and records on isolated chains without touching the deploy env or public deployment/journal state",
  { timeout: 120_000 },
  async () => {
    const protectedBefore = snapshotPublicDeploymentState();
    const dedicatedEnvBefore = snapshotFileMetadata(TEE_VALIDATION_ENV_PATH);
    const temporaryRoot = mkdtempSync(
      join(tmpdir(), "aegis-tee-validation-integration-")
    );
    let anvil;
    let wrongChainAnvil;
    let anvilStartupFailed = false;
    let wrongChainAnvilStartupFailed = false;

    try {
      const port = await reserveLoopbackPort();
      anvil = spawn(
        "anvil",
        [
          "--silent",
          "--host",
          "127.0.0.1",
          "--port",
          String(port),
          "--chain-id",
          "296",
          "--mnemonic",
          TEST_MNEMONIC,
        ],
        {
          env: buildAnvilEnvironment(),
          stdio: "ignore",
        }
      );
      anvil.once("error", () => {
        anvilStartupFailed = true;
      });

      const rpcUrl = `http://127.0.0.1:${port}`;
      await waitForAnvil(rpcUrl, anvil, () => anvilStartupFailed, 296);

      const storagePaths = Object.freeze({
        publicDeploymentArtifactPath: join(
          temporaryRoot,
          "deployments/hedera-testnet/tee-validation-registry.json"
        ),
        publicAbiPath: join(
          temporaryRoot,
          "deployments/hedera-testnet/tee-validation-registry.abi.json"
        ),
        pendingDeploymentJournalPath: join(
          temporaryRoot,
          ".thegraph/deployments/hedera-testnet/tee-validation-registry.pending.json"
        ),
      });
      const config = Object.freeze({
        TEE_VALIDATION_HEDERA_RPC_URL: rpcUrl,
        TEE_VALIDATION_HEDERA_CHAIN_ID: 296,
        TEE_VALIDATION_DEPLOYER_PRIVATE_KEY: TEST_DEPLOYER_PRIVATE_KEY,
        TEE_VALIDATION_ADMIN_ADDRESS: TEST_ADMIN_ADDRESS,
        TEE_VALIDATION_RECORDER_ADDRESS: TEST_RECORDER_ADDRESS,
        TEE_VALIDATION_CONFIRMATIONS: 1,
      });
      const systemEnvironment = Object.freeze({
        HOME: process.env.HOME,
        LANG: process.env.LANG,
        PATH: process.env.PATH,
        TMPDIR: process.env.TMPDIR,
      });

      const artifact = await deployTeeValidationRegistry(config, {
        storagePaths,
        systemEnvironment,
      });

      assert.equal(artifact.chainId, 296);
      assert.equal(artifact.network, "hedera-testnet");
      assert.equal(artifact.deployerAddress, TEST_DEPLOYER_ADDRESS);
      assert.equal(artifact.adminAddress, TEST_ADMIN_ADDRESS);
      assert.equal(artifact.recorderAddress, TEST_RECORDER_ADDRESS);
      assert.equal(existsSync(storagePaths.publicDeploymentArtifactPath), true);
      assert.equal(existsSync(storagePaths.publicAbiPath), true);
      assert.equal(
        existsSync(storagePaths.pendingDeploymentJournalPath),
        false
      );

      const provider = new providers.JsonRpcProvider(rpcUrl, {
        chainId: 296,
        name: "isolated-hedera-testnet-shape",
      });
      const receipt = await provider.getTransactionReceipt(
        artifact.deployTxHash
      );
      assert.ok(receipt, "the local deployment receipt must exist");
      assert.equal(receipt.status, 1);
      assert.equal(receipt.blockNumber, artifact.deployBlock);
      assert.equal(
        utils.getAddress(receipt.contractAddress),
        utils.getAddress(artifact.address)
      );

      const runtimeCode = await provider.getCode(artifact.address);
      assert.notEqual(runtimeCode, "0x");
      assert.equal(utils.keccak256(runtimeCode), artifact.bytecodeHash);

      const abi = JSON.parse(readFileSync(storagePaths.publicAbiPath, "utf8"));
      const registry = new Contract(artifact.address, abi, provider);
      const adminRole = await registry.DEFAULT_ADMIN_ROLE();
      const recorderRole = await registry.RECORDER_ROLE();
      assert.equal(await registry.hasRole(adminRole, TEST_ADMIN_ADDRESS), true);
      assert.equal(
        await registry.hasRole(recorderRole, TEST_RECORDER_ADDRESS),
        true
      );
      assert.equal(
        await registry.hasRole(adminRole, TEST_DEPLOYER_ADDRESS),
        false
      );
      assert.equal(
        await registry.hasRole(recorderRole, TEST_DEPLOYER_ADDRESS),
        false
      );

      const verified = await verifyTeeValidationRegistryDeployment(config, {
        storagePaths,
        systemEnvironment,
      });
      assert.deepEqual(verified, artifact);

      const recorderSigner = new Wallet(TEST_RECORDER_PRIVATE_KEY, provider);
      const parsedArguments = authorizedTestArguments(
        "local-indexing-record-allow",
        "ALLOW"
      );
      const expectedRecord =
        buildAuthorizedContractIndexingTestRecord(parsedArguments);
      const evidence = await submitAuthorizedContractIndexingTest({
        recorderSigner,
        artifact,
        abi,
        parsedArguments,
        confirmations: 1,
      });
      assert.equal(evidence.classification, AUTHORIZED_TEST_RECORD_LABEL);
      assert.equal(evidence.realTeeMlVerdict, false);
      assert.equal(evidence.broadcast, true);
      assert.equal(evidence.chainId, 296);
      assert.equal(evidence.contractAddress, artifact.address);
      assert.equal(evidence.requestId, expectedRecord.requestId);
      assert.equal(evidence.recorder, TEST_RECORDER_ADDRESS);

      const recordReceipt = await provider.getTransactionReceipt(
        evidence.transactionHash
      );
      assert.ok(recordReceipt, "the authorized record receipt must exist");
      assert.equal(recordReceipt.status, 1);
      assert.equal(recordReceipt.blockNumber, evidence.blockNumber);
      const recordedEvent = findValidationEvent(recordReceipt, abi);
      assert.equal(
        utils.getAddress(recordedEvent.address),
        utils.getAddress(artifact.address)
      );
      assertAuthorizedEventFields(
        recordedEvent.parsed.args,
        expectedRecord,
        TEST_RECORDER_ADDRESS
      );

      await assert.rejects(
        submitAuthorizedContractIndexingTest({
          recorderSigner: new Wallet(TEST_RECORDER_PRIVATE_KEY),
          artifact,
          abi,
          parsedArguments: authorizedTestArguments(
            "local-indexing-no-provider",
            "DENY"
          ),
          confirmations: 1,
        }),
        /provider-connected recorder signer/
      );

      const wrongChainPort = await reserveLoopbackPort();
      wrongChainAnvil = spawn(
        "anvil",
        [
          "--silent",
          "--host",
          "127.0.0.1",
          "--port",
          String(wrongChainPort),
          "--chain-id",
          "297",
          "--mnemonic",
          TEST_MNEMONIC,
        ],
        { env: buildAnvilEnvironment(), stdio: "ignore" }
      );
      wrongChainAnvil.once("error", () => {
        wrongChainAnvilStartupFailed = true;
      });
      const wrongChainRpcUrl = `http://127.0.0.1:${wrongChainPort}`;
      await waitForAnvil(
        wrongChainRpcUrl,
        wrongChainAnvil,
        () => wrongChainAnvilStartupFailed,
        297
      );
      const wrongChainProvider = new providers.JsonRpcProvider(
        wrongChainRpcUrl,
        { chainId: 297, name: "wrong-isolated-chain" }
      );
      const wrongChainRecorder = new Wallet(
        TEST_RECORDER_PRIVATE_KEY,
        wrongChainProvider
      );
      await assert.rejects(
        submitAuthorizedContractIndexingTest({
          recorderSigner: wrongChainRecorder,
          artifact,
          abi,
          parsedArguments: authorizedTestArguments(
            "local-indexing-wrong-chain",
            "DENY"
          ),
          confirmations: 1,
        }),
        /requires chain 296/
      );
      assert.equal(
        await wrongChainProvider.getTransactionCount(TEST_RECORDER_ADDRESS),
        0,
        "a wrong-chain rejection must happen before broadcast"
      );

      const recorderNonceBeforeRejections = await provider.getTransactionCount(
        TEST_RECORDER_ADDRESS
      );
      await assert.rejects(
        submitAuthorizedContractIndexingTest({
          recorderSigner,
          artifact: { ...artifact, address: TEST_ADMIN_ADDRESS },
          abi,
          parsedArguments: authorizedTestArguments(
            "local-indexing-missing-code",
            "DENY"
          ),
          confirmations: 1,
        }),
        /No registry bytecode exists/
      );
      await assert.rejects(
        submitAuthorizedContractIndexingTest({
          recorderSigner,
          artifact: {
            ...artifact,
            bytecodeHash: utils.keccak256("0x6000"),
          },
          abi,
          parsedArguments: authorizedTestArguments(
            "local-indexing-code-mismatch",
            "DENY"
          ),
          confirmations: 1,
        }),
        /bytecode does not match/
      );
      assert.equal(
        await provider.getTransactionCount(TEST_RECORDER_ADDRESS),
        recorderNonceBeforeRejections,
        "code validation must happen before broadcast"
      );

      const adminSigner = new Wallet(TEST_ADMIN_PRIVATE_KEY, provider);
      const revoke = await registry
        .connect(adminSigner)
        .revokeRole(recorderRole, TEST_RECORDER_ADDRESS);
      await revoke.wait(1);
      await assert.rejects(
        submitAuthorizedContractIndexingTest({
          recorderSigner,
          artifact,
          abi,
          parsedArguments: authorizedTestArguments(
            "local-indexing-role-revoked",
            "DENY"
          ),
          confirmations: 1,
        }),
        /does not currently hold RECORDER_ROLE/
      );
      assert.equal(
        await provider.getTransactionCount(TEST_RECORDER_ADDRESS),
        recorderNonceBeforeRejections,
        "role validation must happen before broadcast"
      );

      const serializedArtifact = readFileSync(
        storagePaths.publicDeploymentArtifactPath,
        "utf8"
      );
      assert.equal(
        serializedArtifact.includes(TEST_DEPLOYER_PRIVATE_KEY),
        false
      );
      assert.equal(serializedArtifact.includes(TEST_MNEMONIC), false);
      assert.equal(serializedArtifact.includes("RPC_URL"), false);
      assert.equal(
        statSync(storagePaths.publicDeploymentArtifactPath).mode & 0o777,
        0o644
      );
    } finally {
      await stopAnvil(wrongChainAnvil);
      await stopAnvil(anvil);
      rmSync(temporaryRoot, { recursive: true, force: true });
      assert.deepEqual(
        snapshotFileMetadata(TEE_VALIDATION_ENV_PATH),
        dedicatedEnvBefore,
        "the dedicated production env file must not be created or removed"
      );
      assertPublicDeploymentStateUnchanged(protectedBefore);
    }
  }
);

function snapshotPublicDeploymentState() {
  return new Map(
    PROTECTED_DEPLOYMENT_PATHS.map((path) => {
      const exists = existsSync(path);
      return [path, { exists, contents: exists ? readFileSync(path) : null }];
    })
  );
}

function snapshotFileMetadata(path) {
  if (!existsSync(path)) return null;
  const metadata = statSync(path, { bigint: true });
  return {
    device: metadata.dev,
    inode: metadata.ino,
    mode: metadata.mode,
    size: metadata.size,
    modifiedAtNanoseconds: metadata.mtimeNs,
  };
}

function assertPublicDeploymentStateUnchanged(before) {
  for (const [path, snapshot] of before) {
    assert.equal(
      existsSync(path),
      snapshot.exists,
      `protected deployment path changed: ${path}`
    );
    if (snapshot.exists) {
      assert.deepEqual(readFileSync(path), snapshot.contents);
    }
  }
}

async function reserveLoopbackPort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const port = address.port;
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  return port;
}

async function waitForAnvil(rpcUrl, child, startupFailed, expectedChainId) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (startupFailed() || child.exitCode !== null) {
      throw new Error(
        "The isolated Anvil process exited before RPC readiness."
      );
    }
    try {
      const response = await fetch(rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_chainId",
          params: [],
        }),
      });
      const payload = await response.json();
      if (payload.result === utils.hexValue(expectedChainId)) return;
    } catch {
      // The loopback listener is not ready yet.
    }
    await delay(50);
  }
  throw new Error("The isolated Anvil RPC did not become ready in time.");
}

async function stopAnvil(child) {
  if (!child || !child.pid || child.exitCode !== null) return;
  const exited = once(child, "exit");
  child.kill("SIGTERM");
  const stopped = await Promise.race([
    exited.then(() => true),
    delay(3_000).then(() => false),
  ]);
  if (!stopped && child.exitCode === null) {
    const killed = once(child, "exit");
    child.kill("SIGKILL");
    await killed;
  }
}

function buildAnvilEnvironment() {
  const environment = {};
  for (const key of ["HOME", "LANG", "LC_ALL", "PATH", "TMPDIR"]) {
    if (typeof process.env[key] === "string" && process.env[key] !== "") {
      environment[key] = process.env[key];
    }
  }
  return environment;
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function authorizedTestArguments(testId, verdict) {
  return parseAuthorizedTestRecordArguments([
    "--test-id",
    testId,
    "--verdict",
    verdict,
    "--safe",
    TEST_ADMIN_ADDRESS,
    "--agentic-id-token-id",
    "102",
  ]);
}

function findValidationEvent(receipt, abi) {
  const contractInterface = new utils.Interface(abi);
  for (const log of receipt.logs) {
    try {
      const parsed = contractInterface.parseLog(log);
      if (parsed.name === "TeeMLValidationRecorded") {
        return { address: log.address, parsed };
      }
    } catch {
      // Ignore logs that do not belong to the registry ABI.
    }
  }
  assert.fail("the authorized record receipt must contain the registry event");
}

function assertAuthorizedEventFields(args, expected, recorder) {
  for (const field of [
    "requestId",
    "agentIdHash",
    "actionHash",
    "policyHash",
    "semanticContextHash",
    "teemlRequestHash",
    "artifactHash",
    "modelIdHash",
    "reasonCodeHash",
  ]) {
    assert.equal(args[field].toLowerCase(), expected[field].toLowerCase());
  }
  assert.equal(utils.getAddress(args.safe), expected.safe);
  assert.equal(args.agenticIdTokenId.toString(), "102");
  assert.equal(args.verdict, expected.verdict);
  assert.equal(utils.getAddress(args.recorder), utils.getAddress(recorder));
  assert.equal(args.schemaVersion, expected.schemaVersion);
}
