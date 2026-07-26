import { Wallet, providers, utils } from "ethers";
import {
  HEDERA_TESTNET_CHAIN_ID,
  HEDERA_TESTNET_NETWORK,
} from "./constants.js";
import {
  buildFailedDeploymentArchive,
  writeFailedDeploymentArchiveAtomically,
} from "./failedDeployment.js";
import {
  clearPendingDeploymentJournal,
  readPendingDeploymentJournal,
  validatePendingDeploymentJournal,
} from "./pendingDeployment.js";

const REQUIRED_CONSISTENT_READS = 3;
const EMPTY_CODE = new Set(["0x", "0x0", "0x00"]);

export async function acknowledgeConfirmedFailedDeployment(
  config,
  approvedTxHash
) {
  const journal = readPendingDeploymentJournal();
  if (!journal) {
    throw new Error("No TeeML registry pending deployment journal exists.");
  }
  if (
    !/^0x[0-9a-fA-F]{64}$/.test(approvedTxHash) ||
    approvedTxHash.toLowerCase() !== journal.deployTxHash.toLowerCase()
  ) {
    throw new Error(
      "Human-approved failed transaction hash does not match the pending journal."
    );
  }

  const provider = new providers.JsonRpcProvider(
    config.TEE_VALIDATION_HEDERA_RPC_URL,
    {
      chainId: config.TEE_VALIDATION_HEDERA_CHAIN_ID,
      name: HEDERA_TESTNET_NETWORK,
    }
  );
  const network = await provider.getNetwork();
  if (
    network.chainId !== HEDERA_TESTNET_CHAIN_ID ||
    config.TEE_VALIDATION_HEDERA_CHAIN_ID !== HEDERA_TESTNET_CHAIN_ID
  ) {
    throw new Error(
      "Refusing failed deployment acknowledgement outside Hedera Testnet."
    );
  }
  const deployerAddress = new Wallet(config.TEE_VALIDATION_DEPLOYER_PRIVATE_KEY)
    .address;
  assertJournalMatchesDedicatedEnvironment(journal, config, deployerAddress);

  const snapshots = [];
  for (let index = 0; index < REQUIRED_CONSISTENT_READS; index += 1) {
    const [transaction, receipt, latestBlockNumber] = await Promise.all([
      provider.getTransaction(journal.deployTxHash),
      provider.getTransactionReceipt(journal.deployTxHash),
      provider.getBlockNumber(),
    ]);
    if (!transaction || !receipt) {
      throw new Error(
        "Failed deployment state is not conclusively mined; pending journal preserved."
      );
    }
    const [blockByNumber, blockByHash] = await Promise.all([
      provider.getBlock(receipt.blockNumber),
      provider.getBlock(receipt.blockHash),
    ]);
    snapshots.push({
      transaction,
      receipt,
      blockByNumber,
      blockByHash,
      latestBlockNumber,
    });
  }
  const [latestNonce, runtimeCode] = await Promise.all([
    provider.getTransactionCount(journal.deployerAddress, "latest"),
    provider.getCode(journal.predictedAddress, "latest"),
  ]);
  assertConclusiveFailedDeploymentEvidence({
    journal,
    approvedTxHash,
    snapshots,
    latestNonce,
    runtimeCode,
    requiredConfirmations: config.TEE_VALIDATION_CONFIRMATIONS,
  });

  const archive = buildFailedDeploymentArchive({
    journal,
    receipt: snapshots[0].receipt,
  });
  const persistedArchive = writeFailedDeploymentArchiveAtomically(archive);
  // The unresolved guard is released only after the sanitized failure archive
  // is durably visible. A new deployment still requires an explicit hash-bound
  // --after-confirmed-failure flag.
  clearPendingDeploymentJournal();
  return persistedArchive;
}

export function assertConclusiveFailedDeploymentEvidence({
  journal,
  approvedTxHash,
  snapshots,
  latestNonce,
  runtimeCode,
  requiredConfirmations,
}) {
  validatePendingDeploymentJournal(journal);
  if (
    approvedTxHash.toLowerCase() !== journal.deployTxHash.toLowerCase() ||
    snapshots.length < REQUIRED_CONSISTENT_READS
  ) {
    throw new Error(
      "Insufficient human approval or repeated failure evidence."
    );
  }
  if (
    !Number.isSafeInteger(requiredConfirmations) ||
    requiredConfirmations < 1 ||
    requiredConfirmations > 64
  ) {
    throw new Error("Invalid failed deployment confirmation requirement.");
  }
  if (!Number.isSafeInteger(latestNonce) || latestNonce <= journal.nonce) {
    throw new Error("Failed deployment nonce is not conclusively consumed.");
  }
  if (!isEmptyCode(runtimeCode)) {
    throw new Error(
      "Predicted registry address contains bytecode; failure acknowledgement refused."
    );
  }
  const predictedAddress = utils.getContractAddress({
    from: journal.deployerAddress,
    nonce: journal.nonce,
  });
  if (
    utils.getAddress(predictedAddress) !==
    utils.getAddress(journal.predictedAddress)
  ) {
    throw new Error(
      "Pending journal CREATE address does not match deployer nonce."
    );
  }

  let stableFingerprint;
  for (const snapshot of snapshots) {
    const {
      transaction,
      receipt,
      blockByNumber,
      blockByHash,
      latestBlockNumber,
    } = snapshot;
    assertFailedTransactionMatchesJournal(transaction, journal);
    if (
      receipt.status !== 0 ||
      receipt.transactionHash.toLowerCase() !==
        journal.deployTxHash.toLowerCase() ||
      !Number.isSafeInteger(receipt.blockNumber) ||
      receipt.blockNumber <= 0 ||
      !/^0x[0-9a-fA-F]{64}$/.test(receipt.blockHash) ||
      !Number.isSafeInteger(receipt.transactionIndex) ||
      receipt.transactionIndex < 0
    ) {
      throw new Error(
        "Deployment receipt is not a conclusive status-0 mined receipt."
      );
    }
    if (
      receipt.contractAddress &&
      utils.getAddress(receipt.contractAddress) !==
        utils.getAddress(journal.predictedAddress)
    ) {
      throw new Error(
        "Failed receipt contract address does not match the predicted CREATE address."
      );
    }
    if (
      transaction.blockNumber !== receipt.blockNumber ||
      transaction.blockHash?.toLowerCase() !== receipt.blockHash.toLowerCase()
    ) {
      throw new Error(
        "Failed transaction and receipt block provenance disagree."
      );
    }
    assertBlockContainsFailedTransaction(
      blockByNumber,
      receipt,
      journal.deployTxHash
    );
    assertBlockContainsFailedTransaction(
      blockByHash,
      receipt,
      journal.deployTxHash
    );
    if (
      !Number.isSafeInteger(latestBlockNumber) ||
      latestBlockNumber - receipt.blockNumber + 1 < requiredConfirmations
    ) {
      throw new Error(
        "Failed deployment receipt lacks the required confirmations."
      );
    }

    const fingerprint = JSON.stringify({
      txHash: transaction.hash.toLowerCase(),
      nonce: transaction.nonce,
      blockNumber: receipt.blockNumber,
      blockHash: receipt.blockHash.toLowerCase(),
      transactionIndex: receipt.transactionIndex,
      status: receipt.status,
    });
    if (stableFingerprint && stableFingerprint !== fingerprint) {
      throw new Error("Repeated failed deployment reads are inconsistent.");
    }
    stableFingerprint = fingerprint;
  }
}

function assertJournalMatchesDedicatedEnvironment(
  journal,
  config,
  deployerAddress
) {
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

function assertFailedTransactionMatchesJournal(transaction, journal) {
  if (
    transaction.hash.toLowerCase() !== journal.deployTxHash.toLowerCase() ||
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
      "Mined failed transaction does not match the pending deployment journal."
    );
  }
}

function assertBlockContainsFailedTransaction(block, receipt, txHash) {
  if (
    !block ||
    block.number !== receipt.blockNumber ||
    block.hash?.toLowerCase() !== receipt.blockHash.toLowerCase() ||
    !block.transactions.some((transaction) => {
      const hash =
        typeof transaction === "string" ? transaction : transaction.hash;
      return hash?.toLowerCase() === txHash.toLowerCase();
    })
  ) {
    throw new Error(
      "Failed deployment block provenance is incomplete or inconsistent."
    );
  }
}

function isEmptyCode(value) {
  if (typeof value !== "string") return false;
  const normalized = value.startsWith("0x") ? value : `0x${value}`;
  return EMPTY_CODE.has(normalized.toLowerCase());
}
