import { lstatSync, readFileSync, statSync } from "node:fs";
import { parse as parseDotenv } from "dotenv";
import { utils } from "ethers";
import {
  HEDERA_TESTNET_CHAIN_ID,
  TEE_VALIDATION_ENV_PATH,
} from "./constants.js";

export const TEE_VALIDATION_ENV_KEYS = Object.freeze([
  "TEE_VALIDATION_HEDERA_RPC_URL",
  "TEE_VALIDATION_HEDERA_CHAIN_ID",
  "TEE_VALIDATION_DEPLOYER_PRIVATE_KEY",
  "TEE_VALIDATION_ADMIN_ADDRESS",
  "TEE_VALIDATION_RECORDER_ADDRESS",
  "TEE_VALIDATION_CONFIRMATIONS",
]);

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const PRIVATE_KEY_PATTERN = /^0x[0-9a-fA-F]{64}$/;

export function loadTeeSmartContractValidationEnv() {
  return loadTeeSmartContractValidationEnvFromPath(TEE_VALIDATION_ENV_PATH);
}

function loadTeeSmartContractValidationEnvFromPath(filePath) {
  assertDedicatedEnvFileIsSecure(filePath);

  let contents;
  try {
    contents = readFileSync(filePath, "utf8");
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      throw new Error(
        "Missing repository-root tee-smartcontract-validation file. No .env fallback is permitted."
      );
    }
    throw new Error(
      "Unable to read repository-root tee-smartcontract-validation file."
    );
  }

  return parseTeeSmartContractValidationEnv(contents);
}

function assertDedicatedEnvFileIsSecure(filePath) {
  let linkMetadata;
  try {
    linkMetadata = lstatSync(filePath);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      throw new Error(
        "Missing repository-root tee-smartcontract-validation file. No .env fallback is permitted."
      );
    }
    throw new Error(
      "Unable to inspect repository-root tee-smartcontract-validation file."
    );
  }

  if (linkMetadata.isSymbolicLink()) {
    throw new Error(
      "Repository-root tee-smartcontract-validation must not be a symbolic link."
    );
  }

  let fileMetadata;
  try {
    fileMetadata = statSync(filePath);
  } catch {
    throw new Error(
      "Unable to inspect repository-root tee-smartcontract-validation file."
    );
  }

  if (!fileMetadata.isFile()) {
    throw new Error(
      "Repository-root tee-smartcontract-validation must be a regular file."
    );
  }

  if ((fileMetadata.mode & 0o077) !== 0) {
    throw new Error(
      "Repository-root tee-smartcontract-validation must not grant permissions to group or other users. Run chmod 600 tee-smartcontract-validation."
    );
  }
}

export const teeSmartContractValidationEnvTestApi = Object.freeze({
  loadFromPath(filePath) {
    return loadTeeSmartContractValidationEnvFromPath(filePath);
  },
});

export function parseTeeSmartContractValidationEnv(contents) {
  assertStrictAssignmentLines(contents);
  const parsed = parseDotenv(contents);
  const unknownKeys = Object.keys(parsed).filter(
    (key) => !TEE_VALIDATION_ENV_KEYS.includes(key)
  );
  if (unknownKeys.length > 0) {
    throw new Error(
      `tee-smartcontract-validation contains non-whitelisted variables: ${unknownKeys
        .sort()
        .join(", ")}`
    );
  }

  for (const key of TEE_VALIDATION_ENV_KEYS) {
    if (typeof parsed[key] !== "string" || parsed[key].trim() === "") {
      throw new Error(`${key} is required in tee-smartcontract-validation.`);
    }
  }

  const rpcUrl = validateRpcUrl(parsed.TEE_VALIDATION_HEDERA_RPC_URL);
  const chainId = parseStrictInteger(
    parsed.TEE_VALIDATION_HEDERA_CHAIN_ID,
    "TEE_VALIDATION_HEDERA_CHAIN_ID"
  );
  if (chainId !== HEDERA_TESTNET_CHAIN_ID) {
    throw new Error(
      `TEE_VALIDATION_HEDERA_CHAIN_ID must be ${HEDERA_TESTNET_CHAIN_ID}.`
    );
  }

  const privateKey = normalizePrivateKey(
    parsed.TEE_VALIDATION_DEPLOYER_PRIVATE_KEY
  );
  const adminAddress = validateNonZeroAddress(
    parsed.TEE_VALIDATION_ADMIN_ADDRESS,
    "TEE_VALIDATION_ADMIN_ADDRESS"
  );
  const recorderAddress = validateNonZeroAddress(
    parsed.TEE_VALIDATION_RECORDER_ADDRESS,
    "TEE_VALIDATION_RECORDER_ADDRESS"
  );
  const confirmations = parseStrictInteger(
    parsed.TEE_VALIDATION_CONFIRMATIONS,
    "TEE_VALIDATION_CONFIRMATIONS"
  );
  if (confirmations < 1 || confirmations > 64) {
    throw new Error(
      "TEE_VALIDATION_CONFIRMATIONS must be an integer from 1 through 64."
    );
  }

  return Object.freeze({
    TEE_VALIDATION_HEDERA_RPC_URL: rpcUrl,
    TEE_VALIDATION_HEDERA_CHAIN_ID: chainId,
    TEE_VALIDATION_DEPLOYER_PRIVATE_KEY: privateKey,
    TEE_VALIDATION_ADMIN_ADDRESS: adminAddress,
    TEE_VALIDATION_RECORDER_ADDRESS: recorderAddress,
    TEE_VALIDATION_CONFIRMATIONS: confirmations,
  });
}

function assertStrictAssignmentLines(contents) {
  const seenKeys = new Set();
  for (const [index, line] of contents.split(/\r?\n/).entries()) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;

    const assignment = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(
      trimmed
    );
    if (!assignment) {
      throw new Error(
        `tee-smartcontract-validation contains an invalid assignment on line ${
          index + 1
        }.`
      );
    }
    const key = assignment[1];
    if (seenKeys.has(key)) {
      throw new Error(
        `tee-smartcontract-validation contains duplicate variable ${key}.`
      );
    }
    seenKeys.add(key);
  }
}

function validateRpcUrl(value) {
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error(
      "TEE_VALIDATION_HEDERA_RPC_URL must be a valid HTTP(S) URL."
    );
  }
  if (
    (url.protocol !== "https:" && url.protocol !== "http:") ||
    url.username ||
    url.password
  ) {
    throw new Error(
      "TEE_VALIDATION_HEDERA_RPC_URL must be an HTTP(S) URL without embedded credentials."
    );
  }
  return url.toString().replace(/\/$/, "");
}

function normalizePrivateKey(value) {
  const privateKey = value.trim().startsWith("0x")
    ? value.trim()
    : `0x${value.trim()}`;
  if (!PRIVATE_KEY_PATTERN.test(privateKey) || /^0x0{64}$/i.test(privateKey)) {
    throw new Error(
      "TEE_VALIDATION_DEPLOYER_PRIVATE_KEY must be a non-zero 32-byte hex private key."
    );
  }
  return privateKey;
}

function validateNonZeroAddress(value, name) {
  let address;
  try {
    address = utils.getAddress(value.trim());
  } catch {
    throw new Error(`${name} must be a valid EVM address.`);
  }
  if (address === ZERO_ADDRESS) {
    throw new Error(`${name} must not be the zero address.`);
  }
  return address;
}

function parseStrictInteger(value, name) {
  if (!/^[0-9]+$/.test(value.trim())) {
    throw new Error(`${name} must be a base-10 integer.`);
  }
  const parsed = Number(value.trim());
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`${name} is outside the supported integer range.`);
  }
  return parsed;
}
