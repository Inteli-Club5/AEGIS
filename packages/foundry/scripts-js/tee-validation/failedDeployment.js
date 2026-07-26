import {
  existsSync,
  linkSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { utils } from "ethers";
import {
  CONTRACT_NAME,
  FAILED_DEPLOYMENT_ARCHIVE_DIRECTORY,
  HEDERA_TESTNET_CHAIN_ID,
  HEDERA_TESTNET_NETWORK,
  REGISTRY_SCHEMA_VERSION,
} from "./constants.js";
import { validatePendingDeploymentJournal } from "./pendingDeployment.js";

export const FAILED_DEPLOYMENT_CLASSIFICATION =
  "CONFIRMED FAILED TEE VALIDATION REGISTRY DEPLOYMENT";
const ARCHIVE_FORMAT_VERSION = 1;
const EXPECTED_ARCHIVE_KEYS = Object.freeze([
  "formatVersion",
  "classification",
  "contractName",
  "chainId",
  "network",
  "deployTxHash",
  "predictedAddress",
  "deployerAddress",
  "adminAddress",
  "recorderAddress",
  "nonce",
  "receiptStatus",
  "receiptBlockNumber",
  "receiptBlockHash",
  "transactionIndex",
  "creationDataHash",
  "expectedRuntimeBytecodeHash",
  "replacesDeployTxHash",
  "afterConfirmedFailureTxHash",
  "schemaVersion",
  "preparedAt",
  "acknowledgedAt",
]);

export function buildFailedDeploymentArchive({
  journal,
  receipt,
  acknowledgedAt = new Date().toISOString(),
}) {
  validatePendingDeploymentJournal(journal);
  const archive = {
    formatVersion: ARCHIVE_FORMAT_VERSION,
    classification: FAILED_DEPLOYMENT_CLASSIFICATION,
    contractName: CONTRACT_NAME,
    chainId: HEDERA_TESTNET_CHAIN_ID,
    network: HEDERA_TESTNET_NETWORK,
    deployTxHash: journal.deployTxHash,
    predictedAddress: journal.predictedAddress,
    deployerAddress: journal.deployerAddress,
    adminAddress: journal.adminAddress,
    recorderAddress: journal.recorderAddress,
    nonce: journal.nonce,
    receiptStatus: receipt.status,
    receiptBlockNumber: receipt.blockNumber,
    receiptBlockHash: receipt.blockHash,
    transactionIndex: receipt.transactionIndex,
    creationDataHash: journal.creationDataHash,
    expectedRuntimeBytecodeHash: journal.expectedRuntimeBytecodeHash,
    replacesDeployTxHash: journal.replacesDeployTxHash,
    afterConfirmedFailureTxHash: journal.afterConfirmedFailureTxHash,
    schemaVersion: REGISTRY_SCHEMA_VERSION,
    preparedAt: journal.preparedAt,
    acknowledgedAt,
  };
  validateFailedDeploymentArchive(archive);
  return Object.freeze(archive);
}

export function validateFailedDeploymentArchive(archive) {
  if (!archive || typeof archive !== "object" || Array.isArray(archive)) {
    throw new Error(
      "Failed registry deployment archive must be a JSON object."
    );
  }
  const unknownKeys = Object.keys(archive).filter(
    (key) => !EXPECTED_ARCHIVE_KEYS.includes(key)
  );
  const missingKeys = EXPECTED_ARCHIVE_KEYS.filter((key) => !(key in archive));
  if (unknownKeys.length > 0 || missingKeys.length > 0) {
    throw new Error(
      `Invalid failed deployment archive keys; unknown=[${unknownKeys.join(
        ","
      )}], ` + `missing=[${missingKeys.join(",")}].`
    );
  }
  if (
    archive.formatVersion !== ARCHIVE_FORMAT_VERSION ||
    archive.classification !== FAILED_DEPLOYMENT_CLASSIFICATION ||
    archive.contractName !== CONTRACT_NAME ||
    archive.chainId !== HEDERA_TESTNET_CHAIN_ID ||
    archive.network !== HEDERA_TESTNET_NETWORK ||
    archive.schemaVersion !== REGISTRY_SCHEMA_VERSION
  ) {
    throw new Error("Unexpected failed deployment archive identity.");
  }
  for (const field of [
    "predictedAddress",
    "deployerAddress",
    "adminAddress",
    "recorderAddress",
  ]) {
    try {
      utils.getAddress(archive[field]);
    } catch {
      throw new Error(`Invalid failed deployment archive ${field}.`);
    }
  }
  for (const field of [
    "deployTxHash",
    "receiptBlockHash",
    "creationDataHash",
    "expectedRuntimeBytecodeHash",
  ]) {
    if (!/^0x[0-9a-fA-F]{64}$/.test(archive[field])) {
      throw new Error(`Invalid failed deployment archive ${field}.`);
    }
  }
  for (const field of ["replacesDeployTxHash", "afterConfirmedFailureTxHash"]) {
    if (
      archive[field] !== null &&
      !/^0x[0-9a-fA-F]{64}$/.test(archive[field])
    ) {
      throw new Error(`Invalid failed deployment archive ${field}.`);
    }
  }
  if (archive.receiptStatus !== 0) {
    throw new Error("Failed deployment archive receiptStatus must be zero.");
  }
  for (const field of ["nonce", "receiptBlockNumber", "transactionIndex"]) {
    if (!Number.isSafeInteger(archive[field]) || archive[field] < 0) {
      throw new Error(`Invalid failed deployment archive ${field}.`);
    }
  }
  if (archive.receiptBlockNumber === 0) {
    throw new Error(
      "Failed deployment archive receiptBlockNumber must be positive."
    );
  }
  for (const field of ["preparedAt", "acknowledgedAt"]) {
    if (
      typeof archive[field] !== "string" ||
      Number.isNaN(Date.parse(archive[field]))
    ) {
      throw new Error(`Invalid failed deployment archive ${field}.`);
    }
  }
  return archive;
}

export function failedDeploymentArchivePath(
  deployTxHash,
  directory = FAILED_DEPLOYMENT_ARCHIVE_DIRECTORY
) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(deployTxHash)) {
    throw new Error("Invalid failed deployment archive transaction hash.");
  }
  return join(
    directory,
    `tee-validation-registry.${deployTxHash.slice(2).toLowerCase()}.failed.json`
  );
}

export function readFailedDeploymentArchive(
  deployTxHash,
  directory = FAILED_DEPLOYMENT_ARCHIVE_DIRECTORY
) {
  const path = failedDeploymentArchivePath(deployTxHash, directory);
  if (!existsSync(path)) return null;
  let archive;
  try {
    archive = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new Error("Unable to parse the failed registry deployment archive.");
  }
  validateFailedDeploymentArchive(archive);
  if (archive.deployTxHash.toLowerCase() !== deployTxHash.toLowerCase()) {
    throw new Error("Failed deployment archive filename/hash mismatch.");
  }
  return archive;
}

export function readLatestFailedDeploymentArchive(
  directory = FAILED_DEPLOYMENT_ARCHIVE_DIRECTORY
) {
  if (!existsSync(directory)) return null;
  const archives = readdirSync(directory)
    .filter((filename) =>
      /^tee-validation-registry\.[0-9a-f]{64}\.failed\.json$/.test(filename)
    )
    .map((filename) => {
      const hash = `0x${filename.split(".")[1]}`;
      return readFailedDeploymentArchive(hash, directory);
    })
    .sort((left, right) =>
      left.acknowledgedAt.localeCompare(right.acknowledgedAt)
    );
  return archives.at(-1) ?? null;
}

export function writeFailedDeploymentArchiveAtomically(
  archive,
  directory = FAILED_DEPLOYMENT_ARCHIVE_DIRECTORY
) {
  validateFailedDeploymentArchive(archive);
  const path = failedDeploymentArchivePath(archive.deployTxHash, directory);
  const existing = readFailedDeploymentArchive(archive.deployTxHash, directory);
  if (existing) {
    assertSameFailedDeployment(existing, archive);
    return existing;
  }
  mkdirSync(directory, { recursive: true });
  const temporaryPath = `${path}.${process.pid}.tmp`;
  try {
    writeFileSync(temporaryPath, `${JSON.stringify(archive, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });
    linkSync(temporaryPath, path);
  } finally {
    rmSync(temporaryPath, { force: true });
  }
  return archive;
}

function assertSameFailedDeployment(existing, candidate) {
  for (const key of EXPECTED_ARCHIVE_KEYS) {
    if (key === "acknowledgedAt") continue;
    if (existing[key] !== candidate[key]) {
      throw new Error(
        "Existing failed deployment archive does not match the validated failure."
      );
    }
  }
}
