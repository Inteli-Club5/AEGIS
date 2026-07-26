import {
  existsSync,
  linkSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import { utils } from "ethers";
import {
  CONTRACT_NAME,
  HEDERA_TESTNET_CHAIN_ID,
  HEDERA_TESTNET_NETWORK,
  PENDING_DEPLOYMENT_JOURNAL_PATH,
  REGISTRY_SCHEMA_VERSION,
} from "./constants.js";

const JOURNAL_FORMAT_VERSION = 1;
const EXPECTED_JOURNAL_KEYS = Object.freeze([
  "formatVersion",
  "contractName",
  "chainId",
  "network",
  "deployTxHash",
  "predictedAddress",
  "deployerAddress",
  "adminAddress",
  "recorderAddress",
  "nonce",
  "gasLimit",
  "gasPrice",
  "creationDataHash",
  "expectedRuntimeBytecodeHash",
  "replacesDeployTxHash",
  "afterConfirmedFailureTxHash",
  "schemaVersion",
  "preparedAt",
]);

export function buildPendingDeploymentJournal({
  deployTxHash,
  predictedAddress,
  deployerAddress,
  adminAddress,
  recorderAddress,
  nonce,
  gasLimit,
  gasPrice,
  creationData,
  expectedRuntimeBytecode,
  replacesDeployTxHash = null,
  afterConfirmedFailureTxHash = null,
  preparedAt = new Date().toISOString(),
}) {
  const journal = {
    formatVersion: JOURNAL_FORMAT_VERSION,
    contractName: CONTRACT_NAME,
    chainId: HEDERA_TESTNET_CHAIN_ID,
    network: HEDERA_TESTNET_NETWORK,
    deployTxHash,
    predictedAddress: utils.getAddress(predictedAddress),
    deployerAddress: utils.getAddress(deployerAddress),
    adminAddress: utils.getAddress(adminAddress),
    recorderAddress: utils.getAddress(recorderAddress),
    nonce,
    gasLimit: gasLimit.toString(),
    gasPrice: gasPrice.toString(),
    creationDataHash: utils.keccak256(creationData),
    expectedRuntimeBytecodeHash: utils.keccak256(expectedRuntimeBytecode),
    replacesDeployTxHash,
    afterConfirmedFailureTxHash,
    schemaVersion: REGISTRY_SCHEMA_VERSION,
    preparedAt,
  };
  validatePendingDeploymentJournal(journal);
  return Object.freeze(journal);
}

export function validatePendingDeploymentJournal(journal) {
  if (!journal || typeof journal !== "object" || Array.isArray(journal)) {
    throw new Error(
      "TeeML registry pending deployment journal must be a JSON object."
    );
  }
  const unknownKeys = Object.keys(journal).filter(
    (key) => !EXPECTED_JOURNAL_KEYS.includes(key)
  );
  const missingKeys = EXPECTED_JOURNAL_KEYS.filter((key) => !(key in journal));
  if (unknownKeys.length > 0 || missingKeys.length > 0) {
    throw new Error(
      `Invalid pending deployment journal keys; unknown=[${unknownKeys.join(
        ","
      )}], ` + `missing=[${missingKeys.join(",")}].`
    );
  }
  if (journal.formatVersion !== JOURNAL_FORMAT_VERSION) {
    throw new Error("Unexpected pending deployment journal formatVersion.");
  }
  if (journal.contractName !== CONTRACT_NAME) {
    throw new Error("Unexpected pending deployment journal contractName.");
  }
  if (journal.chainId !== HEDERA_TESTNET_CHAIN_ID) {
    throw new Error("Unexpected pending deployment journal chainId.");
  }
  if (journal.network !== HEDERA_TESTNET_NETWORK) {
    throw new Error("Unexpected pending deployment journal network.");
  }
  if (journal.schemaVersion !== REGISTRY_SCHEMA_VERSION) {
    throw new Error("Unexpected pending deployment journal schemaVersion.");
  }
  for (const field of [
    "predictedAddress",
    "deployerAddress",
    "adminAddress",
    "recorderAddress",
  ]) {
    try {
      utils.getAddress(journal[field]);
    } catch {
      throw new Error(`Invalid pending deployment journal ${field}.`);
    }
  }
  for (const field of [
    "deployTxHash",
    "creationDataHash",
    "expectedRuntimeBytecodeHash",
  ]) {
    if (!/^0x[0-9a-fA-F]{64}$/.test(journal[field])) {
      throw new Error(`Invalid pending deployment journal ${field}.`);
    }
  }
  for (const field of ["replacesDeployTxHash", "afterConfirmedFailureTxHash"]) {
    if (
      journal[field] !== null &&
      (!/^0x[0-9a-fA-F]{64}$/.test(journal[field]) ||
        journal[field] === journal.deployTxHash)
    ) {
      throw new Error(`Invalid pending deployment journal ${field}.`);
    }
  }
  if (!Number.isSafeInteger(journal.nonce) || journal.nonce < 0) {
    throw new Error("Invalid pending deployment journal nonce.");
  }
  for (const field of ["gasLimit", "gasPrice"]) {
    if (!/^[1-9][0-9]*$/.test(journal[field])) {
      throw new Error(`Invalid pending deployment journal ${field}.`);
    }
  }
  if (
    typeof journal.preparedAt !== "string" ||
    Number.isNaN(Date.parse(journal.preparedAt))
  ) {
    throw new Error("Invalid pending deployment journal preparedAt.");
  }
  return journal;
}

export function readPendingDeploymentJournal(
  path = PENDING_DEPLOYMENT_JOURNAL_PATH
) {
  if (!existsSync(path)) return null;
  let journal;
  try {
    journal = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new Error(
      "Unable to parse the TeeML registry pending deployment journal."
    );
  }
  return validatePendingDeploymentJournal(journal);
}

export function writePendingDeploymentJournalAtomically(
  journal,
  path = PENDING_DEPLOYMENT_JOURNAL_PATH
) {
  validatePendingDeploymentJournal(journal);
  if (existsSync(path)) {
    throw new Error(
      "Refusing to overwrite an unresolved TeeML registry pending deployment journal."
    );
  }
  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.tmp`;
  try {
    writeFileSync(temporaryPath, `${JSON.stringify(journal, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });
    // Linking a complete owner-only staging inode creates the journal without
    // ever replacing a concurrently created journal.
    linkSync(temporaryPath, path);
  } finally {
    rmSync(temporaryPath, { force: true });
  }
}

export function clearPendingDeploymentJournal(
  path = PENDING_DEPLOYMENT_JOURNAL_PATH
) {
  rmSync(path, { force: true });
}

export function refuseUnresolvedPendingDeployment(journal, allowRedeploy) {
  if (!journal) return;
  validatePendingDeploymentJournal(journal);
  const redeployNote = allowRedeploy
    ? " The --redeploy flag cannot bypass an unresolved journal."
    : "";
  throw new Error(
    `Refusing to broadcast a registry deployment while transaction ${journal.deployTxHash} ` +
      `for predicted address ${journal.predictedAddress} is unresolved.${redeployNote} ` +
      "Run the dedicated recovery command."
  );
}
