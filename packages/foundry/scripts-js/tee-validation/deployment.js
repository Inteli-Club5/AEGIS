import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import {
  BigNumber,
  Contract,
  ContractFactory,
  Wallet,
  providers,
  utils,
} from "ethers";
import {
  COMPILED_ARTIFACT_REPOSITORY_PATH,
  COMPILED_CONTRACT_ARTIFACT_PATH,
  CONTRACT_NAME,
  FOUNDRY_ROOT,
  HEDERA_TESTNET_CHAIN_ID,
  HEDERA_TESTNET_NETWORK,
  PENDING_DEPLOYMENT_JOURNAL_PATH,
  PUBLIC_ABI_PATH,
  PUBLIC_ABI_REPOSITORY_PATH,
  PUBLIC_DEPLOYMENT_ARTIFACT_PATH,
  REGISTRY_SCHEMA_VERSION,
} from "./constants.js";
import {
  buildPendingDeploymentJournal,
  clearPendingDeploymentJournal,
  readPendingDeploymentJournal,
  refuseUnresolvedPendingDeployment,
  writePendingDeploymentJournalAtomically,
} from "./pendingDeployment.js";
import { readLatestFailedDeploymentArchive } from "./failedDeployment.js";

const EMPTY_CODE = new Set(["0x", "0x0", "0x00"]);
const CONTRACT_SOURCE_PATH = "contracts/AegisTeeValidationRegistry.sol";
const SYSTEM_ENV_KEYS = [
  "HOME",
  "LANG",
  "LC_ALL",
  "PATH",
  "SHELL",
  "TMPDIR",
  "USER",
];
const EXPECTED_ARTIFACT_KEYS = [
  "contractName",
  "address",
  "chainId",
  "network",
  "deployTxHash",
  "deployBlock",
  "deployerAddress",
  "adminAddress",
  "recorderAddress",
  "abiPath",
  "compiledArtifactPath",
  "bytecodeHash",
  "schemaVersion",
  "deployedAt",
];

const DEFAULT_DEPLOYMENT_STORAGE_PATHS = Object.freeze({
  publicDeploymentArtifactPath: PUBLIC_DEPLOYMENT_ARTIFACT_PATH,
  publicAbiPath: PUBLIC_ABI_PATH,
  pendingDeploymentJournalPath: PENDING_DEPLOYMENT_JOURNAL_PATH,
});

const DEPLOYMENT_STORAGE_PATH_KEYS = Object.freeze(
  Object.keys(DEFAULT_DEPLOYMENT_STORAGE_PATHS)
);

export async function deployTeeValidationRegistry(config, options = {}) {
  const storagePaths = resolveDeploymentStoragePaths(options.storagePaths);
  const provider = createProvider(config);
  const network = await provider.getNetwork();
  assertHederaTestnet(network.chainId, config.TEE_VALIDATION_HEDERA_CHAIN_ID);

  const pendingJournal = readPendingDeploymentJournal(
    storagePaths.pendingDeploymentJournalPath
  );
  refuseUnresolvedPendingDeployment(
    pendingJournal,
    options.allowRedeploy === true
  );

  const deployer = new Wallet(
    config.TEE_VALIDATION_DEPLOYER_PRIVATE_KEY,
    provider
  );
  const balance = await provider.getBalance(deployer.address);
  if (balance.lte(0)) {
    throw new Error(
      `TeeML registry deployer ${deployer.address} has no balance on Hedera testnet.`
    );
  }

  const existingArtifact = readPublicDeploymentArtifact(
    storagePaths.publicDeploymentArtifactPath
  );
  const latestFailedArchive = readLatestFailedDeploymentArchive(
    storagePaths.failedDeploymentArchiveDirectory
  );
  assertConfirmedFailureRetryAllowed({
    existingArtifact,
    latestFailedArchive,
    approvedFailedTxHash: options.afterConfirmedFailureTxHash,
  });
  if (existingArtifact) {
    const existingCode = await provider.getCode(existingArtifact.address);
    assertRedeployAllowed({
      allowRedeploy: options.allowRedeploy === true,
      existingArtifact,
      existingCode,
    });
  }

  compileTeeValidationRegistry(options.systemEnvironment);
  const compiled = readCompiledContractArtifact();
  const factory = new ContractFactory(
    compiled.abi,
    compiled.bytecode,
    deployer
  );
  const deployTransaction = factory.getDeployTransaction(
    config.TEE_VALIDATION_ADMIN_ADDRESS,
    config.TEE_VALIDATION_RECORDER_ADDRESS
  );
  const [estimatedGas, gasPrice] = await Promise.all([
    provider.estimateGas({ ...deployTransaction, from: deployer.address }),
    provider.getGasPrice(),
  ]);
  const gasLimit = estimatedGas.mul(120).div(100);
  const estimatedCost = gasLimit.mul(gasPrice);
  if (balance.lt(estimatedCost)) {
    throw new Error(
      "TeeML registry deployer balance is lower than the estimated deployment cost."
    );
  }
  const nonce = await provider.getTransactionCount(deployer.address, "pending");
  const prepared = await prepareSignedDeploymentTransaction({
    deployer,
    deployTransaction,
    chainId: HEDERA_TESTNET_CHAIN_ID,
    nonce,
    gasLimit,
    gasPrice,
  });
  const journal = buildPendingDeploymentJournal({
    deployTxHash: prepared.deployTxHash,
    predictedAddress: prepared.predictedAddress,
    deployerAddress: deployer.address,
    adminAddress: config.TEE_VALIDATION_ADMIN_ADDRESS,
    recorderAddress: config.TEE_VALIDATION_RECORDER_ADDRESS,
    nonce,
    gasLimit,
    gasPrice,
    creationData: deployTransaction.data,
    expectedRuntimeBytecode: compiled.deployedBytecode,
    replacesDeployTxHash:
      options.allowRedeploy === true && existingArtifact
        ? existingArtifact.deployTxHash
        : null,
    afterConfirmedFailureTxHash: options.afterConfirmedFailureTxHash ?? null,
  });

  // This journal is durable before the first network write. A crash after this
  // point can only recover/rebroadcast the exact same signed transaction.
  writePendingDeploymentJournalAtomically(
    journal,
    storagePaths.pendingDeploymentJournalPath
  );
  const transaction = await provider.sendTransaction(
    prepared.signedTransaction
  );
  if (transaction.hash !== journal.deployTxHash) {
    throw new Error(
      "RPC returned an unexpected TeeML registry deployment transaction hash."
    );
  }
  const receipt = await transaction.wait(config.TEE_VALIDATION_CONFIRMATIONS);
  return finalizePendingDeployment({
    config,
    provider,
    compiled,
    deployerAddress: deployer.address,
    journal,
    receipt,
    storagePaths,
  });
}

export async function recoverTeeValidationRegistryDeployment(
  config,
  options = {}
) {
  const storagePaths = resolveDeploymentStoragePaths(options.storagePaths);
  const journal = readPendingDeploymentJournal(
    storagePaths.pendingDeploymentJournalPath
  );
  if (!journal) {
    throw new Error("No TeeML registry pending deployment journal exists.");
  }

  const provider = createProvider(config);
  const network = await provider.getNetwork();
  assertHederaTestnet(network.chainId, config.TEE_VALIDATION_HEDERA_CHAIN_ID);
  const deployer = new Wallet(
    config.TEE_VALIDATION_DEPLOYER_PRIVATE_KEY,
    provider
  );
  assertPendingJournalMatchesConfig(journal, config, deployer.address);

  compileTeeValidationRegistry(options.systemEnvironment);
  const compiled = readCompiledContractArtifact();
  const existingArtifact = readPublicDeploymentArtifact(
    storagePaths.publicDeploymentArtifactPath
  );
  if (existingArtifact) {
    if (artifactMatchesPendingJournal(existingArtifact, journal)) {
      const verified = await verifyExistingDeployment({
        config,
        provider,
        compiled,
        artifact: existingArtifact,
      });
      clearPendingDeploymentJournal(storagePaths.pendingDeploymentJournalPath);
      return verified;
    }
    if (existingArtifact.deployTxHash !== journal.replacesDeployTxHash) {
      throw new Error(
        "Existing deployment artifact is unrelated to the pending journal."
      );
    }
  }

  const factory = new ContractFactory(
    compiled.abi,
    compiled.bytecode,
    deployer
  );
  const deployTransaction = factory.getDeployTransaction(
    config.TEE_VALIDATION_ADMIN_ADDRESS,
    config.TEE_VALIDATION_RECORDER_ADDRESS
  );
  const prepared = await prepareSignedDeploymentTransaction({
    deployer,
    deployTransaction,
    chainId: journal.chainId,
    nonce: journal.nonce,
    gasLimit: journal.gasLimit,
    gasPrice: journal.gasPrice,
  });
  assertPreparedTransactionMatchesJournal(
    prepared,
    deployTransaction.data,
    compiled.deployedBytecode,
    journal
  );

  let receipt = await provider.getTransactionReceipt(journal.deployTxHash);
  if (!receipt) {
    const observedTransaction = await provider.getTransaction(
      journal.deployTxHash
    );
    if (observedTransaction) {
      assertObservedTransactionMatchesJournal(observedTransaction, journal);
      receipt = await observedTransaction.wait(
        config.TEE_VALIDATION_CONFIRMATIONS
      );
    } else {
      // The process may have crashed after journaling but before broadcast.
      // Resending this locally reconstructed raw transaction preserves the
      // original nonce, signature, hash, and CREATE address.
      const rebroadcast = await provider.sendTransaction(
        prepared.signedTransaction
      );
      if (rebroadcast.hash !== journal.deployTxHash) {
        throw new Error(
          "RPC returned an unexpected recovered deployment transaction hash."
        );
      }
      receipt = await rebroadcast.wait(config.TEE_VALIDATION_CONFIRMATIONS);
    }
  } else {
    receipt = await provider.waitForTransaction(
      journal.deployTxHash,
      config.TEE_VALIDATION_CONFIRMATIONS
    );
  }

  return finalizePendingDeployment({
    config,
    provider,
    compiled,
    deployerAddress: deployer.address,
    journal,
    receipt,
    storagePaths,
  });
}

export async function verifyTeeValidationRegistryDeployment(
  config,
  options = {}
) {
  const storagePaths = resolveDeploymentStoragePaths(options.storagePaths);
  refuseUnresolvedPendingDeployment(
    readPendingDeploymentJournal(storagePaths.pendingDeploymentJournalPath),
    false
  );
  const artifact = readPublicDeploymentArtifact(
    storagePaths.publicDeploymentArtifactPath
  );
  if (!artifact) {
    throw new Error(
      "Missing deployments/hedera-testnet/tee-validation-registry.json."
    );
  }
  const provider = createProvider(config);
  const network = await provider.getNetwork();
  assertHederaTestnet(network.chainId, config.TEE_VALIDATION_HEDERA_CHAIN_ID);
  validatePublicDeploymentArtifact(artifact);
  compileTeeValidationRegistry(options.systemEnvironment);
  const compiled = readCompiledContractArtifact();
  return verifyExistingDeployment({ config, provider, compiled, artifact });
}

async function verifyExistingDeployment({
  config,
  provider,
  compiled,
  artifact,
}) {
  const runtimeCode = await provider.getCode(artifact.address);
  if (isEmptyCode(runtimeCode)) {
    throw new Error(
      `No contract bytecode exists at recorded registry address ${artifact.address}.`
    );
  }
  if (utils.keccak256(runtimeCode) !== artifact.bytecodeHash) {
    throw new Error(
      "Registry runtime bytecode does not match the sanitized deployment artifact."
    );
  }

  if (
    utils.keccak256(runtimeCode) !== utils.keccak256(compiled.deployedBytecode)
  ) {
    throw new Error(
      "Registry runtime bytecode does not match the compiled AegisTeeValidationRegistry contract."
    );
  }
  await verifyRoleState({
    provider,
    abi: compiled.abi,
    address: artifact.address,
    expectedAdmin: config.TEE_VALIDATION_ADMIN_ADDRESS,
    expectedRecorder: config.TEE_VALIDATION_RECORDER_ADDRESS,
    deployerAddress: artifact.deployerAddress,
  });
  if (
    utils.getAddress(artifact.adminAddress) !==
    config.TEE_VALIDATION_ADMIN_ADDRESS
  ) {
    throw new Error(
      "Configured final admin does not match the deployment artifact."
    );
  }
  if (
    utils.getAddress(artifact.recorderAddress) !==
    config.TEE_VALIDATION_RECORDER_ADDRESS
  ) {
    throw new Error(
      "Configured final recorder does not match the deployment artifact."
    );
  }
  return artifact;
}

export async function prepareSignedDeploymentTransaction({
  deployer,
  deployTransaction,
  chainId,
  nonce,
  gasLimit,
  gasPrice,
}) {
  if (!deployTransaction?.data || deployTransaction.to) {
    throw new Error(
      "TeeML registry deployment transaction must be contract creation data."
    );
  }
  const signedTransaction = await deployer.signTransaction({
    data: deployTransaction.data,
    chainId,
    nonce,
    gasLimit: BigNumber.from(gasLimit),
    gasPrice: BigNumber.from(gasPrice),
    type: 0,
  });
  return Object.freeze({
    signedTransaction,
    deployTxHash: utils.keccak256(signedTransaction),
    predictedAddress: utils.getContractAddress({
      from: deployer.address,
      nonce,
    }),
  });
}

function assertPendingJournalMatchesConfig(journal, config, deployerAddress) {
  const expected = {
    deployerAddress,
    adminAddress: config.TEE_VALIDATION_ADMIN_ADDRESS,
    recorderAddress: config.TEE_VALIDATION_RECORDER_ADDRESS,
  };
  for (const [field, value] of Object.entries(expected)) {
    if (utils.getAddress(journal[field]) !== utils.getAddress(value)) {
      throw new Error(
        `Pending deployment journal ${field} does not match the dedicated environment.`
      );
    }
  }
}

function assertPreparedTransactionMatchesJournal(
  prepared,
  creationData,
  expectedRuntimeBytecode,
  journal
) {
  if (
    prepared.deployTxHash !== journal.deployTxHash ||
    utils.getAddress(prepared.predictedAddress) !==
      utils.getAddress(journal.predictedAddress) ||
    utils.keccak256(creationData) !== journal.creationDataHash ||
    utils.keccak256(expectedRuntimeBytecode) !==
      journal.expectedRuntimeBytecodeHash
  ) {
    throw new Error(
      "Reconstructed registry deployment does not match the pending journal."
    );
  }
}

function assertObservedTransactionMatchesJournal(transaction, journal) {
  if (
    transaction.hash !== journal.deployTxHash ||
    transaction.to !== null ||
    transaction.nonce !== journal.nonce ||
    utils.getAddress(transaction.from) !==
      utils.getAddress(journal.deployerAddress) ||
    transaction.chainId !== journal.chainId ||
    transaction.gasLimit.toString() !== journal.gasLimit ||
    transaction.gasPrice?.toString() !== journal.gasPrice ||
    utils.keccak256(transaction.data) !== journal.creationDataHash
  ) {
    throw new Error(
      "Observed registry deployment transaction does not match the pending journal."
    );
  }
}

function artifactMatchesPendingJournal(artifact, journal) {
  return (
    artifact.deployTxHash === journal.deployTxHash &&
    utils.getAddress(artifact.address) ===
      utils.getAddress(journal.predictedAddress) &&
    utils.getAddress(artifact.deployerAddress) ===
      utils.getAddress(journal.deployerAddress) &&
    utils.getAddress(artifact.adminAddress) ===
      utils.getAddress(journal.adminAddress) &&
    utils.getAddress(artifact.recorderAddress) ===
      utils.getAddress(journal.recorderAddress)
  );
}

async function finalizePendingDeployment({
  config,
  provider,
  compiled,
  deployerAddress,
  journal,
  receipt,
  storagePaths,
}) {
  if (
    !receipt ||
    receipt.status !== 1 ||
    !receipt.blockNumber ||
    receipt.transactionHash !== journal.deployTxHash
  ) {
    throw new Error(
      "AegisTeeValidationRegistry deployment transaction did not succeed."
    );
  }
  if (
    receipt.contractAddress &&
    utils.getAddress(receipt.contractAddress) !==
      utils.getAddress(journal.predictedAddress)
  ) {
    throw new Error(
      "Deployment receipt contract address does not match the pending journal."
    );
  }

  const runtimeCode = await provider.getCode(journal.predictedAddress);
  if (isEmptyCode(runtimeCode)) {
    throw new Error(
      "AegisTeeValidationRegistry deployment receipt succeeded, but no runtime bytecode was found."
    );
  }
  if (
    utils.keccak256(runtimeCode) !== journal.expectedRuntimeBytecodeHash ||
    utils.keccak256(runtimeCode) !== utils.keccak256(compiled.deployedBytecode)
  ) {
    throw new Error(
      "Deployed registry bytecode does not match the pending journal and compiled contract."
    );
  }

  const roleState = await verifyRoleState({
    provider,
    abi: compiled.abi,
    address: journal.predictedAddress,
    expectedAdmin: config.TEE_VALIDATION_ADMIN_ADDRESS,
    expectedRecorder: config.TEE_VALIDATION_RECORDER_ADDRESS,
    deployerAddress,
  });
  const publicArtifact = buildPublicDeploymentArtifact({
    address: journal.predictedAddress,
    receipt,
    deployerAddress,
    adminAddress: roleState.adminAddress,
    recorderAddress: roleState.recorderAddress,
    runtimeCode,
  });
  writePublicArtifacts(publicArtifact, compiled.abi, storagePaths);
  clearPendingDeploymentJournal(storagePaths.pendingDeploymentJournalPath);
  return publicArtifact;
}

export function compileTeeValidationRegistry(systemEnvironment = process.env) {
  const stagingRoot = mkdtempSync(
    join(tmpdir(), "aegis-tee-validation-forge-")
  );
  try {
    copyFileSync(
      join(FOUNDRY_ROOT, "foundry.toml"),
      join(stagingRoot, "foundry.toml")
    );
    symlinkSync(
      join(FOUNDRY_ROOT, "contracts"),
      join(stagingRoot, "contracts"),
      "dir"
    );
    symlinkSync(join(FOUNDRY_ROOT, "lib"), join(stagingRoot, "lib"), "dir");

    const result = spawnSync("forge", ["build", CONTRACT_SOURCE_PATH], {
      cwd: stagingRoot,
      env: buildSafeChildEnvironment(systemEnvironment),
      stdio: "inherit",
    });
    if (result.error) {
      throw new Error(
        "Unable to execute forge build for AegisTeeValidationRegistry."
      );
    }
    if (result.status !== 0) {
      throw new Error(`forge build failed with exit code ${result.status}.`);
    }

    const stagedArtifact = join(
      stagingRoot,
      "out/AegisTeeValidationRegistry.sol/AegisTeeValidationRegistry.json"
    );
    if (!existsSync(stagedArtifact)) {
      throw new Error(
        "Sanitized Forge build did not produce the AegisTeeValidationRegistry artifact."
      );
    }
    mkdirSync(dirname(COMPILED_CONTRACT_ARTIFACT_PATH), { recursive: true });
    const temporaryArtifact = `${COMPILED_CONTRACT_ARTIFACT_PATH}.tmp`;
    copyFileSync(stagedArtifact, temporaryArtifact);
    renameSync(temporaryArtifact, COMPILED_CONTRACT_ARTIFACT_PATH);
  } finally {
    rmSync(stagingRoot, { recursive: true, force: true });
  }
}

export function buildSafeChildEnvironment(systemEnvironment = {}) {
  const childEnvironment = {};
  for (const key of SYSTEM_ENV_KEYS) {
    if (
      typeof systemEnvironment[key] === "string" &&
      systemEnvironment[key] !== ""
    ) {
      childEnvironment[key] = systemEnvironment[key];
    }
  }
  if (!childEnvironment.PATH) {
    childEnvironment.PATH = ["/usr/local/bin", "/usr/bin", "/bin"].join(
      delimiter
    );
  }
  return childEnvironment;
}

export function assertRedeployAllowed({
  allowRedeploy,
  existingArtifact,
  existingCode,
}) {
  validatePublicDeploymentArtifact(existingArtifact);
  const codeStatus = isEmptyCode(existingCode)
    ? "no bytecode"
    : "live bytecode";
  if (!allowRedeploy) {
    throw new Error(
      `Refusing to redeploy ${CONTRACT_NAME}: artifact ${existingArtifact.address} has ${codeStatus}. ` +
        "Pass --redeploy only after explicit human approval."
    );
  }
}

export function assertConfirmedFailureRetryAllowed({
  existingArtifact,
  latestFailedArchive,
  approvedFailedTxHash,
}) {
  const failureRequiresExplicitRetry =
    latestFailedArchive &&
    (!existingArtifact ||
      latestFailedArchive.receiptBlockNumber > existingArtifact.deployBlock ||
      (latestFailedArchive.receiptBlockNumber ===
        existingArtifact.deployBlock &&
        Date.parse(latestFailedArchive.acknowledgedAt) >=
          Date.parse(existingArtifact.deployedAt)));
  if (!failureRequiresExplicitRetry) {
    if (approvedFailedTxHash) {
      throw new Error(
        "No current confirmed failed deployment requires --after-confirmed-failure."
      );
    }
    return;
  }
  if (
    typeof approvedFailedTxHash !== "string" ||
    approvedFailedTxHash.toLowerCase() !==
      latestFailedArchive.deployTxHash.toLowerCase()
  ) {
    throw new Error(
      `A new registry deployment after confirmed failure requires --after-confirmed-failure ${latestFailedArchive.deployTxHash}.`
    );
  }
}

export function buildPublicDeploymentArtifact({
  address,
  receipt,
  deployerAddress,
  adminAddress,
  recorderAddress,
  runtimeCode,
  deployedAt = new Date().toISOString(),
}) {
  const artifact = {
    contractName: CONTRACT_NAME,
    address: utils.getAddress(address),
    chainId: HEDERA_TESTNET_CHAIN_ID,
    network: HEDERA_TESTNET_NETWORK,
    deployTxHash: receipt.transactionHash,
    deployBlock: receipt.blockNumber,
    deployerAddress: utils.getAddress(deployerAddress),
    adminAddress: utils.getAddress(adminAddress),
    recorderAddress: utils.getAddress(recorderAddress),
    abiPath: PUBLIC_ABI_REPOSITORY_PATH,
    compiledArtifactPath: COMPILED_ARTIFACT_REPOSITORY_PATH,
    bytecodeHash: utils.keccak256(runtimeCode),
    schemaVersion: REGISTRY_SCHEMA_VERSION,
    deployedAt,
  };
  validatePublicDeploymentArtifact(artifact);
  return Object.freeze(artifact);
}

export function validatePublicDeploymentArtifact(artifact) {
  if (!artifact || typeof artifact !== "object" || Array.isArray(artifact)) {
    throw new Error(
      "TeeML registry deployment artifact must be a JSON object."
    );
  }
  const unknownKeys = Object.keys(artifact).filter(
    (key) => !EXPECTED_ARTIFACT_KEYS.includes(key)
  );
  const missingKeys = EXPECTED_ARTIFACT_KEYS.filter(
    (key) => !(key in artifact)
  );
  if (unknownKeys.length > 0 || missingKeys.length > 0) {
    throw new Error(
      `Invalid TeeML registry deployment artifact keys; unknown=[${unknownKeys.join(
        ","
      )}], ` + `missing=[${missingKeys.join(",")}].`
    );
  }
  if (artifact.contractName !== CONTRACT_NAME)
    throw new Error("Unexpected deployment artifact contractName.");
  if (artifact.chainId !== HEDERA_TESTNET_CHAIN_ID)
    throw new Error("Unexpected deployment artifact chainId.");
  if (artifact.network !== HEDERA_TESTNET_NETWORK)
    throw new Error("Unexpected deployment artifact network.");
  if (artifact.schemaVersion !== REGISTRY_SCHEMA_VERSION) {
    throw new Error("Unexpected deployment artifact schemaVersion.");
  }
  for (const field of [
    "address",
    "deployerAddress",
    "adminAddress",
    "recorderAddress",
  ]) {
    try {
      utils.getAddress(artifact[field]);
    } catch {
      throw new Error(`Invalid deployment artifact ${field}.`);
    }
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(artifact.deployTxHash)) {
    throw new Error("Invalid deployment artifact deployTxHash.");
  }
  if (
    !Number.isSafeInteger(artifact.deployBlock) ||
    artifact.deployBlock <= 0
  ) {
    throw new Error("Invalid deployment artifact deployBlock.");
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(artifact.bytecodeHash)) {
    throw new Error("Invalid deployment artifact bytecodeHash.");
  }
  if (artifact.abiPath !== PUBLIC_ABI_REPOSITORY_PATH)
    throw new Error("Unexpected deployment artifact abiPath.");
  if (artifact.compiledArtifactPath !== COMPILED_ARTIFACT_REPOSITORY_PATH) {
    throw new Error("Unexpected deployment artifact compiledArtifactPath.");
  }
  if (
    typeof artifact.deployedAt !== "string" ||
    Number.isNaN(Date.parse(artifact.deployedAt))
  ) {
    throw new Error("Invalid deployment artifact deployedAt.");
  }
  return artifact;
}

function createProvider(config) {
  return new providers.JsonRpcProvider(config.TEE_VALIDATION_HEDERA_RPC_URL, {
    chainId: config.TEE_VALIDATION_HEDERA_CHAIN_ID,
    name: HEDERA_TESTNET_NETWORK,
  });
}

function assertHederaTestnet(actualChainId, configuredChainId) {
  if (
    configuredChainId !== HEDERA_TESTNET_CHAIN_ID ||
    actualChainId !== HEDERA_TESTNET_CHAIN_ID
  ) {
    throw new Error(
      `Refusing TeeML registry operation: configured chain ${configuredChainId}, RPC chain ${actualChainId}, ` +
        `required chain ${HEDERA_TESTNET_CHAIN_ID}.`
    );
  }
}

function readCompiledContractArtifact() {
  if (!existsSync(COMPILED_CONTRACT_ARTIFACT_PATH)) {
    throw new Error(
      `Missing compiled contract artifact ${COMPILED_ARTIFACT_REPOSITORY_PATH}.`
    );
  }
  let artifact;
  try {
    artifact = JSON.parse(
      readFileSync(COMPILED_CONTRACT_ARTIFACT_PATH, "utf8")
    );
  } catch {
    throw new Error(
      "Unable to parse compiled AegisTeeValidationRegistry artifact."
    );
  }
  const bytecodeObject = artifact?.bytecode?.object;
  const bytecode =
    typeof bytecodeObject === "string" && !bytecodeObject.startsWith("0x")
      ? `0x${bytecodeObject}`
      : bytecodeObject;
  const deployedBytecodeObject = artifact?.deployedBytecode?.object;
  const deployedBytecode =
    typeof deployedBytecodeObject === "string" &&
    !deployedBytecodeObject.startsWith("0x")
      ? `0x${deployedBytecodeObject}`
      : deployedBytecodeObject;
  if (
    !Array.isArray(artifact?.abi) ||
    typeof bytecode !== "string" ||
    isEmptyCode(bytecode) ||
    typeof deployedBytecode !== "string" ||
    isEmptyCode(deployedBytecode)
  ) {
    throw new Error(
      "Compiled AegisTeeValidationRegistry artifact is missing ABI, deployable bytecode, or runtime bytecode."
    );
  }
  return { abi: artifact.abi, bytecode, deployedBytecode };
}

export function readPublicDeploymentArtifact(
  path = PUBLIC_DEPLOYMENT_ARTIFACT_PATH
) {
  if (!existsSync(path)) return null;
  let artifact;
  try {
    artifact = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new Error(
      "Unable to parse deployments/hedera-testnet/tee-validation-registry.json."
    );
  }
  return validatePublicDeploymentArtifact(artifact);
}

async function verifyRoleState({
  provider,
  abi,
  address,
  expectedAdmin,
  expectedRecorder,
  deployerAddress,
}) {
  const contract = new Contract(address, abi, provider);
  const adminRole = await contract.DEFAULT_ADMIN_ROLE();
  const recorderRole = await contract.RECORDER_ROLE();
  if (!(await contract.hasRole(adminRole, expectedAdmin))) {
    throw new Error(
      "Final admin does not hold DEFAULT_ADMIN_ROLE after deployment."
    );
  }
  if (!(await contract.hasRole(recorderRole, expectedRecorder))) {
    throw new Error(
      "Final recorder does not hold RECORDER_ROLE after deployment."
    );
  }
  if (
    utils.getAddress(deployerAddress) !== utils.getAddress(expectedAdmin) &&
    (await contract.hasRole(adminRole, deployerAddress))
  ) {
    throw new Error(
      "Deployer retained unnecessary DEFAULT_ADMIN_ROLE authority."
    );
  }
  if (
    utils.getAddress(deployerAddress) !== utils.getAddress(expectedRecorder) &&
    (await contract.hasRole(recorderRole, deployerAddress))
  ) {
    throw new Error("Deployer retained unnecessary RECORDER_ROLE authority.");
  }
  return {
    adminAddress: utils.getAddress(expectedAdmin),
    recorderAddress: utils.getAddress(expectedRecorder),
  };
}

function writePublicArtifacts(artifact, abi, storagePaths) {
  mkdirSync(dirname(storagePaths.publicAbiPath), { recursive: true });
  mkdirSync(dirname(storagePaths.publicDeploymentArtifactPath), {
    recursive: true,
  });
  writeJsonAtomically(storagePaths.publicAbiPath, abi);
  writeJsonAtomically(storagePaths.publicDeploymentArtifactPath, artifact);
}

export function resolveDeploymentStoragePaths(overrides = {}) {
  if (!overrides || typeof overrides !== "object" || Array.isArray(overrides)) {
    throw new Error(
      "TeeML registry deployment storage paths must be an object."
    );
  }
  const unknownKeys = Object.keys(overrides).filter(
    (key) => !DEPLOYMENT_STORAGE_PATH_KEYS.includes(key)
  );
  if (unknownKeys.length > 0) {
    throw new Error(
      `Unknown TeeML registry deployment storage paths: ${unknownKeys
        .sort()
        .join(", ")}`
    );
  }
  const overrideKeys = Object.keys(overrides);
  if (
    overrideKeys.length > 0 &&
    DEPLOYMENT_STORAGE_PATH_KEYS.some((key) => !overrideKeys.includes(key))
  ) {
    throw new Error(
      "Isolated TeeML registry deployment storage must override artifact, ABI, and journal paths together."
    );
  }
  const paths = {
    ...DEFAULT_DEPLOYMENT_STORAGE_PATHS,
    ...overrides,
  };
  for (const [name, path] of Object.entries(paths)) {
    if (typeof path !== "string" || path.trim() === "") {
      throw new Error(
        `Invalid TeeML registry deployment storage path ${name}.`
      );
    }
  }
  return Object.freeze({
    ...paths,
    failedDeploymentArchiveDirectory: join(
      dirname(paths.pendingDeploymentJournalPath),
      "failed"
    ),
  });
}

function writeJsonAtomically(path, value) {
  const temporaryPath = `${path}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o644,
  });
  renameSync(temporaryPath, path);
}

function isEmptyCode(value) {
  if (typeof value !== "string") return true;
  const normalized = value.startsWith("0x") ? value : `0x${value}`;
  return EMPTY_CODE.has(normalized.toLowerCase());
}
