import { readFileSync } from "node:fs";
import { Contract, constants, utils } from "ethers";
import {
  HEDERA_TESTNET_CHAIN_ID,
  HEDERA_TESTNET_NETWORK,
  PUBLIC_ABI_PATH,
  REGISTRY_SCHEMA_VERSION,
} from "./constants.js";
import {
  readPublicDeploymentArtifact,
  validatePublicDeploymentArtifact,
} from "./deployment.js";

export const AUTHORIZED_TEST_RECORD_LABEL =
  "AUTHORIZED CONTRACT/INDEXING TEST RECORD";
const TEST_DOMAIN = "AEGIS:AUTHORIZED_CONTRACT_INDEXING_TEST_RECORD:v1";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export function parseAuthorizedTestRecordArguments(args) {
  const values = new Map();
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (
      !["--test-id", "--verdict", "--safe", "--agentic-id-token-id"].includes(
        argument
      )
    ) {
      throw new Error(`Unknown authorized test record argument: ${argument}`);
    }
    const value = args[index + 1];
    if (!value || value.startsWith("--") || values.has(argument)) {
      throw new Error(`Missing or duplicate value for ${argument}.`);
    }
    values.set(argument, value);
    index += 1;
  }

  const testId = values.get("--test-id");
  if (!testId || !/^[A-Za-z0-9._:-]{1,96}$/.test(testId)) {
    throw new Error(
      "--test-id must contain 1-96 public identifier characters."
    );
  }
  const verdictName = values.get("--verdict");
  if (verdictName !== "ALLOW" && verdictName !== "DENY") {
    throw new Error("--verdict must be exactly ALLOW or DENY.");
  }
  const safe = validateNonZeroAddress(values.get("--safe"), "--safe");
  const tokenIdInput = values.get("--agentic-id-token-id") ?? "0";
  if (!/^(0|[1-9][0-9]*)$/.test(tokenIdInput)) {
    throw new Error(
      "--agentic-id-token-id must be an unsigned base-10 integer."
    );
  }
  let agenticIdTokenId;
  try {
    agenticIdTokenId = utils.parseUnits(tokenIdInput, 0);
  } catch {
    throw new Error("--agentic-id-token-id exceeds uint256.");
  }
  if (agenticIdTokenId.gt(constants.MaxUint256)) {
    throw new Error("--agentic-id-token-id exceeds uint256.");
  }

  return Object.freeze({
    testId,
    verdictName,
    safe,
    agenticIdTokenId,
  });
}

export function buildAuthorizedContractIndexingTestRecord({
  testId,
  verdictName,
  safe,
  agenticIdTokenId,
}) {
  const hash = (field) =>
    utils.keccak256(utils.toUtf8Bytes(`${TEST_DOMAIN}:${testId}:${field}`));
  return Object.freeze({
    requestId: hash("request-id"),
    agentIdHash: hash("agent-id"),
    actionHash: hash("action"),
    policyHash: hash("policy"),
    semanticContextHash: hash("semantic-context"),
    teemlRequestHash: hash("teeml-request"),
    artifactHash: hash("artifact"),
    modelIdHash: hash("non-teeml-plumbing-test-model"),
    reasonCodeHash: hash("authorized-contract-indexing-test-record"),
    safe: validateNonZeroAddress(safe, "safe"),
    agenticIdTokenId,
    verdict: verdictName === "ALLOW" ? 1 : 2,
    schemaVersion: REGISTRY_SCHEMA_VERSION,
  });
}

export async function prepareAuthorizedContractIndexingTest(parsedArguments) {
  const artifact = readPublicDeploymentArtifact();
  if (!artifact) {
    throw new Error(
      "Missing deployments/hedera-testnet/tee-validation-registry.json."
    );
  }
  const abi = JSON.parse(readFileSync(PUBLIC_ABI_PATH, "utf8"));
  return buildPreparedEvidence({ artifact, abi, parsedArguments });
}

export async function submitAuthorizedContractIndexingTest({
  recorderSigner,
  artifact,
  abi,
  parsedArguments,
  confirmations,
}) {
  if (!recorderSigner?.provider) {
    throw new Error(
      "The authorized test driver requires a provider-connected recorder signer."
    );
  }
  validatePublicDeploymentArtifact(artifact);
  if (
    !Number.isSafeInteger(confirmations) ||
    confirmations < 1 ||
    confirmations > 64
  ) {
    throw new Error(
      "Invalid authorized test driver confirmation configuration."
    );
  }
  const network = await recorderSigner.provider.getNetwork();
  if (
    network.chainId !== HEDERA_TESTNET_CHAIN_ID ||
    artifact.chainId !== HEDERA_TESTNET_CHAIN_ID
  ) {
    throw new Error(
      `Authorized test driver requires chain ${HEDERA_TESTNET_CHAIN_ID}.`
    );
  }
  const recorderAddress = utils.getAddress(await recorderSigner.getAddress());
  if (recorderAddress !== utils.getAddress(artifact.recorderAddress)) {
    throw new Error(
      "The supplied signer is not the configured registry recorder."
    );
  }
  const runtimeCode = await recorderSigner.provider.getCode(artifact.address);
  if (isEmptyCode(runtimeCode)) {
    throw new Error(
      "No registry bytecode exists at the deployment artifact address."
    );
  }
  if (utils.keccak256(runtimeCode) !== artifact.bytecodeHash) {
    throw new Error(
      "Registry runtime bytecode does not match the deployment artifact."
    );
  }
  const record = buildAuthorizedContractIndexingTestRecord(parsedArguments);
  const evidence = buildPreparedEvidence({ artifact, abi, parsedArguments });
  const contract = new Contract(artifact.address, abi, recorderSigner);
  const recorderRole = await contract.RECORDER_ROLE();
  if (!(await contract.hasRole(recorderRole, recorderAddress))) {
    throw new Error(
      "The configured signer does not currently hold RECORDER_ROLE."
    );
  }
  const existingRecordHash = await contract.recordHashes(record.requestId);
  if (existingRecordHash.toLowerCase() !== constants.HashZero.toLowerCase()) {
    throw new Error("This authorized test record requestId already exists.");
  }

  const expectedRecordHash = await contract.callStatic.recordTeeMLValidation(
    record
  );
  const [estimatedGas, gasPrice] = await Promise.all([
    contract.estimateGas.recordTeeMLValidation(record),
    recorderSigner.provider.getGasPrice(),
  ]);
  const transaction = await contract.recordTeeMLValidation(record, {
    gasLimit: estimatedGas.mul(120).div(100),
    gasPrice,
    type: 0,
  });
  const receipt = await transaction.wait(confirmations);
  if (
    !receipt ||
    receipt.status !== 1 ||
    !receipt.blockNumber ||
    receipt.transactionHash !== transaction.hash
  ) {
    throw new Error(
      "Authorized contract/indexing test record transaction failed."
    );
  }
  const storedRecordHash = await contract.recordHashes(record.requestId);
  if (storedRecordHash.toLowerCase() !== expectedRecordHash.toLowerCase()) {
    throw new Error("Authorized test record hash was not stored as expected.");
  }
  const event = receipt.events?.find(
    (candidate) => candidate.event === "TeeMLValidationRecorded"
  );
  if (
    !event ||
    utils.getAddress(event.address) !== utils.getAddress(artifact.address) ||
    !authorizedTestEventMatches(event.args, record, recorderAddress)
  ) {
    throw new Error(
      "Authorized test record receipt is missing the expected event."
    );
  }

  return Object.freeze({
    ...evidence,
    broadcast: true,
    transactionHash: receipt.transactionHash,
    blockNumber: receipt.blockNumber,
    recorder: recorderAddress,
    recordHash: storedRecordHash,
  });
}

function authorizedTestEventMatches(args, record, recorderAddress) {
  if (!args) return false;
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
    if (
      typeof args[field] !== "string" ||
      args[field].toLowerCase() !== record[field].toLowerCase()
    ) {
      return false;
    }
  }
  return (
    utils.getAddress(args.safe) === record.safe &&
    args.agenticIdTokenId.eq(record.agenticIdTokenId) &&
    args.verdict === record.verdict &&
    utils.getAddress(args.recorder) === recorderAddress &&
    args.schemaVersion === record.schemaVersion
  );
}

function buildPreparedEvidence({ artifact, abi, parsedArguments }) {
  const record = buildAuthorizedContractIndexingTestRecord(parsedArguments);
  const calldata = new utils.Interface(abi).encodeFunctionData(
    "recordTeeMLValidation",
    [record]
  );
  return Object.freeze({
    classification: AUTHORIZED_TEST_RECORD_LABEL,
    realTeeMlVerdict: false,
    broadcast: false,
    network: HEDERA_TESTNET_NETWORK,
    chainId: HEDERA_TESTNET_CHAIN_ID,
    contractAddress: artifact.address,
    testId: parsedArguments.testId,
    requestId: record.requestId,
    verdict: parsedArguments.verdictName,
    safe: record.safe,
    agenticIdTokenId: record.agenticIdTokenId.toString(),
    calldata,
    calldataHash: utils.keccak256(calldata),
    nextAction:
      "Submit this calldata through the separately secured configured RECORDER_ROLE signer, then save only the sanitized receipt evidence.",
  });
}

function validateNonZeroAddress(value, field) {
  let address;
  try {
    address = utils.getAddress(value);
  } catch {
    throw new Error(`${field} must be a valid EVM address.`);
  }
  if (address === ZERO_ADDRESS) {
    throw new Error(`${field} must not be the zero address.`);
  }
  return address;
}

function isEmptyCode(value) {
  if (typeof value !== "string") return true;
  return /^0x0*$/i.test(value);
}
