import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { Wallet, utils } from "ethers";
import { prepareSignedDeploymentTransaction } from "./deployment.js";
import {
  buildPendingDeploymentJournal,
  clearPendingDeploymentJournal,
  readPendingDeploymentJournal,
  refuseUnresolvedPendingDeployment,
  validatePendingDeploymentJournal,
  writePendingDeploymentJournalAtomically,
} from "./pendingDeployment.js";

const wallet = new Wallet(`0x${"11".repeat(32)}`);
const adminAddress = "0x00000000000000000000000000000000000000A1";
const recorderAddress = "0x00000000000000000000000000000000000000b2";
const creationData = "0x600060005560016000f3";
const runtimeBytecode = "0x60016000f3";

async function preparedDeployment() {
  return prepareSignedDeploymentTransaction({
    deployer: wallet,
    deployTransaction: { data: creationData },
    chainId: 296,
    nonce: 7,
    gasLimit: "1234567",
    gasPrice: "8000000000",
  });
}

async function journal() {
  const prepared = await preparedDeployment();
  return buildPendingDeploymentJournal({
    deployTxHash: prepared.deployTxHash,
    predictedAddress: prepared.predictedAddress,
    deployerAddress: wallet.address,
    adminAddress,
    recorderAddress,
    nonce: 7,
    gasLimit: "1234567",
    gasPrice: "8000000000",
    creationData,
    expectedRuntimeBytecode: runtimeBytecode,
    replacesDeployTxHash: null,
    preparedAt: "2026-07-25T12:00:00.000Z",
  });
}

describe("TeeML registry crash-safe deployment journal", () => {
  it("contains only sanitized public transaction and deployment metadata", async () => {
    const value = await journal();
    const serialized = JSON.stringify(value);

    assert.equal(value.contractName, "AegisTeeValidationRegistry");
    assert.equal(value.chainId, 296);
    assert.equal(value.nonce, 7);
    assert.equal(value.creationDataHash, utils.keccak256(creationData));
    assert.equal(value.replacesDeployTxHash, null);
    assert.equal(
      value.expectedRuntimeBytecodeHash,
      utils.keccak256(runtimeBytecode)
    );
    assert.equal(serialized.includes("privateKey"), false);
    assert.equal(serialized.includes("signedTransaction"), false);
    assert.equal(serialized.includes("RPC_URL"), false);
    assert.equal(serialized.includes(creationData), false);
    assert.equal(Object.isFrozen(value), true);
  });

  it("rejects raw signed transactions, secrets, and unknown fields", async () => {
    const value = await journal();
    for (const forbidden of [
      { signedTransaction: "0xdeadbeef" },
      { deployerPrivateKey: `0x${"22".repeat(32)}` },
      { rpcUrl: "https://example.invalid" },
    ]) {
      assert.throws(
        () => validatePendingDeploymentJournal({ ...value, ...forbidden }),
        /Invalid pending deployment journal keys/
      );
    }
  });

  it("records only a distinct public predecessor hash for explicit replacement recovery", async () => {
    const prepared = await preparedDeployment();
    const predecessor = `0x${"ab".repeat(32)}`;
    const replacement = buildPendingDeploymentJournal({
      deployTxHash: prepared.deployTxHash,
      predictedAddress: prepared.predictedAddress,
      deployerAddress: wallet.address,
      adminAddress,
      recorderAddress,
      nonce: 7,
      gasLimit: "1234567",
      gasPrice: "8000000000",
      creationData,
      expectedRuntimeBytecode: runtimeBytecode,
      replacesDeployTxHash: predecessor,
    });
    assert.equal(replacement.replacesDeployTxHash, predecessor);
    assert.throws(
      () =>
        validatePendingDeploymentJournal({
          ...replacement,
          replacesDeployTxHash: replacement.deployTxHash,
        }),
      /replacesDeployTxHash/
    );
  });

  it("writes atomically with owner-only permissions and refuses overwrite", async () => {
    const directory = mkdtempSync(join(tmpdir(), "aegis-pending-test-"));
    const path = join(directory, "pending.json");
    const value = await journal();

    writePendingDeploymentJournalAtomically(value, path);

    assert.deepEqual(readPendingDeploymentJournal(path), value);
    assert.equal(statSync(path).mode & 0o777, 0o600);
    assert.equal(
      existsSync(`${path}.${process.pid}.tmp`),
      false,
      "the atomic staging file must not survive a successful rename"
    );
    assert.throws(
      () => writePendingDeploymentJournalAtomically(value, path),
      /Refusing to overwrite/
    );
    clearPendingDeploymentJournal(path);
    assert.equal(existsSync(path), false);
  });

  it("fails closed on a truncated journal instead of treating it as absent", () => {
    const directory = mkdtempSync(join(tmpdir(), "aegis-pending-test-"));
    const path = join(directory, "pending.json");
    writeFileSync(path, '{"deployTxHash":', { mode: 0o600 });

    assert.throws(
      () => readPendingDeploymentJournal(path),
      /Unable to parse the TeeML registry pending deployment journal/
    );
    assert.equal(existsSync(path), true);
  });

  it("survives a simulated restart and reconstructs the exact signed transaction", async () => {
    const directory = mkdtempSync(join(tmpdir(), "aegis-pending-test-"));
    const path = join(directory, "pending.json");
    const beforeCrash = await journal();
    writePendingDeploymentJournalAtomically(beforeCrash, path);

    const afterRestart = readPendingDeploymentJournal(path);
    const reconstructed = await preparedDeployment();
    const parsed = utils.parseTransaction(reconstructed.signedTransaction);

    assert.equal(reconstructed.deployTxHash, afterRestart.deployTxHash);
    assert.equal(
      utils.getAddress(reconstructed.predictedAddress),
      utils.getAddress(afterRestart.predictedAddress)
    );
    assert.equal(parsed.hash, afterRestart.deployTxHash);
    assert.equal(parsed.nonce, afterRestart.nonce);
    assert.equal(parsed.chainId, afterRestart.chainId);
    assert.equal(parsed.to, null);
    assert.equal(parsed.data, creationData);
  });

  it("blocks every fresh broadcast while pending, including explicit redeploy", async () => {
    const value = await journal();
    assert.throws(
      () => refuseUnresolvedPendingDeployment(value, false),
      /dedicated recovery command/
    );
    assert.throws(
      () => refuseUnresolvedPendingDeployment(value, true),
      /--redeploy flag cannot bypass/
    );
  });

  it("persists the journal before broadcast and only clears it after public artifacts", () => {
    const source = readFileSync(
      new URL("./deployment.js", import.meta.url),
      "utf8"
    );
    const writeIndex = source.indexOf(
      "writePendingDeploymentJournalAtomically("
    );
    const firstBroadcastIndex = source.indexOf("provider.sendTransaction(");
    const artifactIndex = source.lastIndexOf(
      "writePublicArtifacts(publicArtifact, compiled.abi,"
    );
    const clearIndex = source.lastIndexOf("clearPendingDeploymentJournal(");

    assert.ok(writeIndex >= 0 && firstBroadcastIndex > writeIndex);
    assert.ok(artifactIndex >= 0 && clearIndex > artifactIndex);
    assert.equal(source.includes("factory.deploy("), false);
  });
});
