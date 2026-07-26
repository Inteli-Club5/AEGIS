import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { BigNumber, Wallet, utils } from "ethers";
import {
  ACKNOWLEDGE_FAILED_FLAG,
  parseAcknowledgementArguments,
} from "./acknowledgeFailed.js";
import { assertConclusiveFailedDeploymentEvidence } from "./acknowledgeFailedDeployment.js";
import {
  assertConfirmedFailureRetryAllowed,
  buildPublicDeploymentArtifact,
} from "./deployment.js";
import {
  FAILED_DEPLOYMENT_CLASSIFICATION,
  buildFailedDeploymentArchive,
  readFailedDeploymentArchive,
  readLatestFailedDeploymentArchive,
  validateFailedDeploymentArchive,
  writeFailedDeploymentArchiveAtomically,
} from "./failedDeployment.js";
import { buildPendingDeploymentJournal } from "./pendingDeployment.js";

const wallet = new Wallet(`0x${"11".repeat(32)}`);
const adminAddress = "0x00000000000000000000000000000000000000A1";
const recorderAddress = "0x00000000000000000000000000000000000000b2";
const creationData = "0x600060005560016000f3";
const runtimeBytecode = "0x60016000f3";
const deployTxHash = `0x${"ab".repeat(32)}`;
const blockHash = `0x${"cd".repeat(32)}`;

function journal(overrides = {}) {
  return buildPendingDeploymentJournal({
    deployTxHash,
    predictedAddress: utils.getContractAddress({
      from: wallet.address,
      nonce: 7,
    }),
    deployerAddress: wallet.address,
    adminAddress,
    recorderAddress,
    nonce: 7,
    gasLimit: "1234567",
    gasPrice: "8000000000",
    creationData,
    expectedRuntimeBytecode: runtimeBytecode,
    preparedAt: "2026-07-25T12:00:00.000Z",
    ...overrides,
  });
}

function receipt(overrides = {}) {
  return {
    status: 0,
    transactionHash: deployTxHash,
    blockNumber: 123456,
    blockHash,
    transactionIndex: 2,
    contractAddress: null,
    ...overrides,
  };
}

function snapshot(overrides = {}) {
  const minedReceipt = receipt(overrides.receipt);
  const transaction = {
    hash: deployTxHash,
    to: null,
    nonce: 7,
    from: wallet.address,
    chainId: 296,
    gasLimit: BigNumber.from("1234567"),
    gasPrice: BigNumber.from("8000000000"),
    data: creationData,
    blockNumber: minedReceipt.blockNumber,
    blockHash: minedReceipt.blockHash,
    ...overrides.transaction,
  };
  const block = {
    number: minedReceipt.blockNumber,
    hash: minedReceipt.blockHash,
    transactions: [deployTxHash],
  };
  return {
    transaction,
    receipt: minedReceipt,
    blockByNumber: { ...block, ...overrides.blockByNumber },
    blockByHash: { ...block, ...overrides.blockByHash },
    latestBlockNumber: overrides.latestBlockNumber ?? 123458,
  };
}

function conclusiveEvidence(overrides = {}) {
  return {
    journal: journal(),
    approvedTxHash: deployTxHash,
    snapshots: [snapshot(), snapshot(), snapshot()],
    latestNonce: 8,
    runtimeCode: "0x",
    requiredConfirmations: 1,
    ...overrides,
  };
}

describe("confirmed failed TeeML registry deployment acknowledgement", () => {
  it("requires the exact long human-acknowledgement flag and transaction hash", () => {
    assert.equal(
      parseAcknowledgementArguments([ACKNOWLEDGE_FAILED_FLAG, deployTxHash]),
      deployTxHash
    );
    for (const args of [
      [],
      [deployTxHash],
      ["--force", deployTxHash],
      [ACKNOWLEDGE_FAILED_FLAG, "not-a-hash"],
      [ACKNOWLEDGE_FAILED_FLAG, deployTxHash, "extra"],
    ]) {
      assert.throws(() => parseAcknowledgementArguments(args));
    }
  });

  it("accepts only repeated, confirmed, status-zero, nonce-consuming evidence", () => {
    assert.doesNotThrow(() =>
      assertConclusiveFailedDeploymentEvidence(conclusiveEvidence())
    );
  });

  it("rejects pending, missing, successful, or inconsistent receipt states", () => {
    assert.throws(
      () =>
        assertConclusiveFailedDeploymentEvidence(
          conclusiveEvidence({ snapshots: [snapshot(), snapshot()] })
        ),
      /repeated failure evidence/
    );
    assert.throws(
      () =>
        assertConclusiveFailedDeploymentEvidence(
          conclusiveEvidence({
            snapshots: [
              snapshot(),
              snapshot({ receipt: { status: 1 } }),
              snapshot(),
            ],
          })
        ),
      /status-0/
    );
    assert.throws(
      () =>
        assertConclusiveFailedDeploymentEvidence(
          conclusiveEvidence({
            snapshots: [
              snapshot(),
              snapshot({
                receipt: {
                  blockNumber: 123457,
                  blockHash: `0x${"ef".repeat(32)}`,
                },
              }),
              snapshot(),
            ],
          })
        ),
      /inconsistent/
    );
  });

  it("rejects any transaction, block, chain, or CREATE provenance mismatch", () => {
    const mismatches = [
      { transaction: { to: recorderAddress } },
      { transaction: { nonce: 8 } },
      { transaction: { chainId: 295 } },
      { transaction: { data: "0x6000" } },
      { blockByNumber: { transactions: [] } },
      { blockByHash: { hash: `0x${"ee".repeat(32)}` } },
      { receipt: { contractAddress: recorderAddress } },
    ];
    for (const mismatch of mismatches) {
      assert.throws(() =>
        assertConclusiveFailedDeploymentEvidence(
          conclusiveEvidence({
            snapshots: [snapshot(mismatch), snapshot(), snapshot()],
          })
        )
      );
    }
  });

  it("rejects ambiguous confirmation, nonce, bytecode, approval, and predicted-address states", () => {
    assert.throws(() =>
      assertConclusiveFailedDeploymentEvidence(
        conclusiveEvidence({ latestNonce: 7 })
      )
    );
    assert.throws(() =>
      assertConclusiveFailedDeploymentEvidence(
        conclusiveEvidence({ runtimeCode: runtimeBytecode })
      )
    );
    assert.throws(() =>
      assertConclusiveFailedDeploymentEvidence(
        conclusiveEvidence({ approvedTxHash: `0x${"99".repeat(32)}` })
      )
    );
    assert.throws(() =>
      assertConclusiveFailedDeploymentEvidence(
        conclusiveEvidence({
          snapshots: [
            snapshot({ latestBlockNumber: 123456 }),
            snapshot({ latestBlockNumber: 123456 }),
            snapshot({ latestBlockNumber: 123456 }),
          ],
          requiredConfirmations: 2,
        })
      )
    );
    assert.throws(() =>
      assertConclusiveFailedDeploymentEvidence(
        conclusiveEvidence({
          journal: journal({
            predictedAddress: "0x00000000000000000000000000000000000000C3",
          }),
        })
      )
    );
  });

  it("archives only sanitized status-zero evidence atomically and idempotently", () => {
    const directory = mkdtempSync(join(tmpdir(), "aegis-failed-deploy-test-"));
    const archive = buildFailedDeploymentArchive({
      journal: journal(),
      receipt: receipt(),
      acknowledgedAt: "2026-07-25T12:30:00.000Z",
    });
    const written = writeFailedDeploymentArchiveAtomically(archive, directory);
    const loaded = readFailedDeploymentArchive(deployTxHash, directory);

    assert.deepEqual(written, archive);
    assert.deepEqual(loaded, archive);
    assert.equal(archive.classification, FAILED_DEPLOYMENT_CLASSIFICATION);
    assert.equal(archive.receiptStatus, 0);
    assert.equal(JSON.stringify(archive).includes("privateKey"), false);
    assert.equal(JSON.stringify(archive).includes("signedTransaction"), false);
    assert.equal(JSON.stringify(archive).includes("rpc"), false);
    const files = readFileSync(
      new URL("./failedDeployment.js", import.meta.url),
      "utf8"
    );
    assert.equal(files.includes("rawTransaction"), false);
    const archivePath = join(
      directory,
      `tee-validation-registry.${deployTxHash.slice(2)}.failed.json`
    );
    assert.equal(existsSync(archivePath), true);
    assert.equal(statSync(archivePath).mode & 0o777, 0o600);

    const sameFailureLater = buildFailedDeploymentArchive({
      journal: journal(),
      receipt: receipt(),
      acknowledgedAt: "2026-07-25T12:35:00.000Z",
    });
    assert.deepEqual(
      writeFailedDeploymentArchiveAtomically(sameFailureLater, directory),
      archive
    );
  });

  it("rejects secret fields, successful receipts, and malformed archives", () => {
    const archive = buildFailedDeploymentArchive({
      journal: journal(),
      receipt: receipt(),
    });
    assert.throws(
      () =>
        validateFailedDeploymentArchive({
          ...archive,
          privateKey: `0x${"11".repeat(32)}`,
        }),
      /Invalid failed deployment archive keys/
    );
    assert.throws(
      () => validateFailedDeploymentArchive({ ...archive, receiptStatus: 1 }),
      /must be zero/
    );
  });

  it("requires a hash-bound explicit retry after the latest archived failure", () => {
    const archive = buildFailedDeploymentArchive({
      journal: journal(),
      receipt: receipt(),
    });
    assert.throws(() =>
      assertConfirmedFailureRetryAllowed({
        existingArtifact: null,
        latestFailedArchive: archive,
      })
    );
    assert.throws(() =>
      assertConfirmedFailureRetryAllowed({
        existingArtifact: null,
        latestFailedArchive: archive,
        approvedFailedTxHash: `0x${"99".repeat(32)}`,
      })
    );
    assert.doesNotThrow(() =>
      assertConfirmedFailureRetryAllowed({
        existingArtifact: null,
        latestFailedArchive: archive,
        approvedFailedTxHash: deployTxHash,
      })
    );

    const successfulLater = buildPublicDeploymentArtifact({
      address: recorderAddress,
      receipt: {
        transactionHash: `0x${"77".repeat(32)}`,
        blockNumber: archive.receiptBlockNumber + 1,
      },
      deployerAddress: wallet.address,
      adminAddress,
      recorderAddress,
      runtimeCode: runtimeBytecode,
    });
    assert.doesNotThrow(() =>
      assertConfirmedFailureRetryAllowed({
        existingArtifact: successfulLater,
        latestFailedArchive: archive,
      })
    );
  });

  it("uses the exact env loader, never broadcasts, and archives before clearing", () => {
    const cliSource = readFileSync(
      new URL("./acknowledgeFailed.js", import.meta.url),
      "utf8"
    );
    const source = readFileSync(
      new URL("./acknowledgeFailedDeployment.js", import.meta.url),
      "utf8"
    );
    assert.match(cliSource, /loadTeeSmartContractValidationEnv/);
    assert.equal(cliSource.includes("dotenv.config"), false);
    assert.equal(cliSource.includes("process.env"), false);
    assert.equal(source.includes("sendTransaction"), false);
    const archiveIndex = source.indexOf(
      "writeFailedDeploymentArchiveAtomically(archive)"
    );
    const clearIndex = source.indexOf("clearPendingDeploymentJournal()");
    assert.ok(archiveIndex >= 0 && clearIndex > archiveIndex);
  });

  it("selects the highest-block sanitized failed archive", () => {
    const directory = mkdtempSync(join(tmpdir(), "aegis-failed-deploy-test-"));
    const first = buildFailedDeploymentArchive({
      journal: journal(),
      receipt: receipt(),
    });
    const secondTxHash = `0x${"ef".repeat(32)}`;
    const second = buildFailedDeploymentArchive({
      journal: journal({ deployTxHash: secondTxHash, nonce: 8 }),
      receipt: receipt({
        transactionHash: secondTxHash,
        blockNumber: 123460,
      }),
    });
    writeFailedDeploymentArchiveAtomically(first, directory);
    writeFailedDeploymentArchiveAtomically(second, directory);
    assert.equal(
      readLatestFailedDeploymentArchive(directory).deployTxHash,
      secondTxHash
    );
  });
});
