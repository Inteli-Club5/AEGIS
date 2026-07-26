import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { utils } from "ethers";
import {
  assertRedeployAllowed,
  buildPublicDeploymentArtifact,
  buildSafeChildEnvironment,
  resolveDeploymentStoragePaths,
  validatePublicDeploymentArtifact,
} from "./deployment.js";
import {
  FAILED_DEPLOYMENT_ARCHIVE_DIRECTORY,
  PENDING_DEPLOYMENT_JOURNAL_PATH,
  PUBLIC_ABI_PATH,
  PUBLIC_DEPLOYMENT_ARTIFACT_PATH,
} from "./constants.js";
import {
  AFTER_CONFIRMED_FAILURE_FLAG,
  parseDeploymentArguments,
} from "./deploy.js";

const address = "0x00000000000000000000000000000000000000A1";
const deployerAddress = "0x00000000000000000000000000000000000000b2";
const adminAddress = "0x00000000000000000000000000000000000000C3";
const recorderAddress = "0x00000000000000000000000000000000000000d4";
const transactionHash = `0x${"ab".repeat(32)}`;

const artifact = () =>
  buildPublicDeploymentArtifact({
    address,
    receipt: { transactionHash, blockNumber: 123456 },
    deployerAddress,
    adminAddress,
    recorderAddress,
    runtimeCode: "0x60006000",
    deployedAt: "2026-07-25T12:00:00.000Z",
  });

describe("TeeML registry deployment safety", () => {
  it("does not print arbitrary provider errors from either CLI entrypoint", () => {
    for (const filename of [
      "deploy.js",
      "acknowledgeFailed.js",
      "recover.js",
      "recordAuthorizedTest.js",
      "verify.js",
    ]) {
      const source = readFileSync(
        new URL(`./${filename}`, import.meta.url),
        "utf8"
      );
      assert.equal(source.includes(["error", "message"].join(".")), false);
      assert.equal(source.includes(["console", "error"].join(".")), false);
      assert.match(source, /No provider or secret details were printed/);
    }
  });

  it("creates only the required sanitized public artifact fields", () => {
    const result = artifact();

    assert.equal(result.contractName, "AegisTeeValidationRegistry");
    assert.equal(result.chainId, 296);
    assert.equal(result.network, "hedera-testnet");
    assert.equal(result.deployTxHash, transactionHash);
    assert.equal(result.deployBlock, 123456);
    assert.equal(result.bytecodeHash, utils.keccak256("0x60006000"));
    assert.equal(JSON.stringify(result).includes("PRIVATE_KEY"), false);
    assert.equal(JSON.stringify(result).includes("RPC_URL"), false);
    assert.equal(Object.isFrozen(result), true);
  });

  it("rejects secret or unknown fields in an existing artifact", () => {
    assert.throws(
      () =>
        validatePublicDeploymentArtifact({
          ...artifact(),
          deployerPrivateKey: `0x${"11".repeat(32)}`,
        }),
      /Invalid TeeML registry deployment artifact keys/
    );
  });

  it("refuses redeployment by default whether recorded bytecode is live or missing", () => {
    assert.throws(
      () =>
        assertRedeployAllowed({
          allowRedeploy: false,
          existingArtifact: artifact(),
          existingCode: "0x6000",
        }),
      /Refusing to redeploy/
    );
    assert.throws(
      () =>
        assertRedeployAllowed({
          allowRedeploy: false,
          existingArtifact: artifact(),
          existingCode: "0x",
        }),
      /Refusing to redeploy/
    );
  });

  it("allows replacement only with the explicit redeploy flag", () => {
    assert.doesNotThrow(() =>
      assertRedeployAllowed({
        allowRedeploy: true,
        existingArtifact: artifact(),
        existingCode: "0x6000",
      })
    );
  });

  it("parses only explicit, hash-bound deployment retry authority", () => {
    assert.deepEqual(parseDeploymentArguments([]), {
      allowRedeploy: false,
      afterConfirmedFailureTxHash: undefined,
    });
    assert.deepEqual(
      parseDeploymentArguments([
        "--redeploy",
        AFTER_CONFIRMED_FAILURE_FLAG,
        transactionHash,
      ]),
      {
        allowRedeploy: true,
        afterConfirmedFailureTxHash: transactionHash,
      }
    );
    for (const args of [
      [AFTER_CONFIRMED_FAILURE_FLAG],
      [AFTER_CONFIRMED_FAILURE_FLAG, "not-a-hash"],
      [
        AFTER_CONFIRMED_FAILURE_FLAG,
        transactionHash,
        AFTER_CONFIRMED_FAILURE_FLAG,
        transactionHash,
      ],
      ["--force"],
      ["--redeploy", "--redeploy"],
    ]) {
      assert.throws(() => parseDeploymentArguments(args));
    }
  });

  it("passes only non-secret operating-system variables to forge", () => {
    const childEnvironment = buildSafeChildEnvironment({
      PATH: "/usr/bin",
      HOME: "/tmp/test-home",
      LANG: "C.UTF-8",
      DATABASE_URL: "postgres://must-not-pass",
      ZERO_G_PRIVATE_KEY: "must-not-pass",
      TEE_VALIDATION_DEPLOYER_PRIVATE_KEY: "must-not-pass",
      TEE_VALIDATION_HEDERA_RPC_URL: "must-not-pass",
    });

    assert.deepEqual(childEnvironment, {
      HOME: "/tmp/test-home",
      LANG: "C.UTF-8",
      PATH: "/usr/bin",
    });
  });

  it("uses a sanitized temporary Forge root so the package .env is never loaded by compilation", () => {
    const source = readFileSync(
      new URL("./deployment.js", import.meta.url),
      "utf8"
    );

    assert.match(
      source,
      /mkdtempSync\(\s*join\(tmpdir\(\),\s*"aegis-tee-validation-forge-"\)\s*\)/
    );
    assert.match(source, /cwd: stagingRoot/);
    assert.equal(source.includes("cwd: FOUNDRY_ROOT"), false);
  });

  it("keeps exact production storage defaults while permitting explicit deployment-storage isolation", () => {
    assert.deepEqual(resolveDeploymentStoragePaths(), {
      publicDeploymentArtifactPath: PUBLIC_DEPLOYMENT_ARTIFACT_PATH,
      publicAbiPath: PUBLIC_ABI_PATH,
      pendingDeploymentJournalPath: PENDING_DEPLOYMENT_JOURNAL_PATH,
      failedDeploymentArchiveDirectory: FAILED_DEPLOYMENT_ARCHIVE_DIRECTORY,
    });

    const isolated = resolveDeploymentStoragePaths({
      publicDeploymentArtifactPath: "/tmp/aegis-test/deployment.json",
      publicAbiPath: "/tmp/aegis-test/registry.abi.json",
      pendingDeploymentJournalPath: "/tmp/aegis-test/pending.json",
    });
    assert.equal(
      isolated.publicDeploymentArtifactPath,
      "/tmp/aegis-test/deployment.json"
    );
    assert.equal(
      isolated.failedDeploymentArchiveDirectory,
      "/tmp/aegis-test/failed"
    );
    assert.throws(
      () => resolveDeploymentStoragePaths({ genericEnvPath: "/tmp/.env" }),
      /Unknown TeeML registry deployment storage paths/
    );
    assert.throws(
      () =>
        resolveDeploymentStoragePaths({
          publicDeploymentArtifactPath: "/tmp/aegis-test/deployment.json",
        }),
      /must override artifact, ABI, and journal paths together/
    );
  });
});
