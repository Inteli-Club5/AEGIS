import { BigInt, Bytes, dataSource, log } from "@graphprotocol/graph-ts";
import {
  AddedOwner,
  ChangedThreshold,
  ExecutionFailure,
  ExecutionSuccess,
  RemovedOwner,
} from "../generated/templates/SafeAccount/Safe";
import {
  AgentOnchainSummary,
  SafeConfigurationChange,
  SafeExecution,
  SafeOnchainSummary,
} from "../generated/schema";
import { eventId, getOrCreateDailyMetric, getOrCreateProtocol } from "./store";

const OWNER_ADDED = "OWNER_ADDED";
const OWNER_REMOVED = "OWNER_REMOVED";
const THRESHOLD_CHANGED = "THRESHOLD_CHANGED";

export function handleAddedOwner(event: AddedOwner): void {
  const change = prepareConfigurationChange(
    event.transaction.hash,
    event.logIndex,
    event.block.number,
    event.block.timestamp,
    OWNER_ADDED,
  );
  if (change == null) return;
  change.owner = event.params.owner;
  change.save();
}

export function handleRemovedOwner(event: RemovedOwner): void {
  const change = prepareConfigurationChange(
    event.transaction.hash,
    event.logIndex,
    event.block.number,
    event.block.timestamp,
    OWNER_REMOVED,
  );
  if (change == null) return;
  change.owner = event.params.owner;
  change.save();
}

export function handleChangedThreshold(event: ChangedThreshold): void {
  const change = prepareConfigurationChange(
    event.transaction.hash,
    event.logIndex,
    event.block.number,
    event.block.timestamp,
    THRESHOLD_CHANGED,
  );
  if (change == null) return;
  change.threshold = event.params.threshold;
  change.save();
}

export function handleExecutionSuccess(event: ExecutionSuccess): void {
  recordExecution(
    event.transaction.hash,
    event.logIndex,
    event.block.number,
    event.block.timestamp,
    event.params.txHash,
    event.params.payment,
    true,
  );
}

export function handleExecutionFailure(event: ExecutionFailure): void {
  recordExecution(
    event.transaction.hash,
    event.logIndex,
    event.block.number,
    event.block.timestamp,
    event.params.txHash,
    event.params.payment,
    false,
  );
}

function prepareConfigurationChange(
  transactionHash: Bytes,
  logIndex: BigInt,
  blockNumber: BigInt,
  blockTimestamp: BigInt,
  kind: string,
): SafeConfigurationChange | null {
  const safeAddress = dataSource.address();
  const safeSummary = SafeOnchainSummary.load(safeAddress);
  if (safeSummary == null) {
    log.error("Ignored Safe configuration change because summary {} is absent", [
      safeAddress.toHexString(),
    ]);
    return null;
  }

  safeSummary.lastActivityAt = blockTimestamp;
  safeSummary.save();

  const change = new SafeConfigurationChange(eventId(transactionHash, logIndex));
  change.safe = safeAddress;
  change.kind = kind;
  change.transactionHash = transactionHash;
  change.blockNumber = blockNumber;
  change.blockTimestamp = blockTimestamp;
  change.logIndex = logIndex;
  change.safeSummary = safeSummary.id;
  return change;
}

function recordExecution(
  transactionHash: Bytes,
  logIndex: BigInt,
  blockNumber: BigInt,
  blockTimestamp: BigInt,
  safeTxHash: Bytes,
  refundPayment: BigInt,
  success: boolean,
): void {
  const safeAddress = dataSource.address();
  const safeSummary = SafeOnchainSummary.load(safeAddress);
  if (safeSummary == null) {
    log.error("Ignored Safe execution because summary {} is absent", [safeAddress.toHexString()]);
    return;
  }

  safeSummary.executionCount = safeSummary.executionCount.plus(BigInt.fromI32(1));
  if (success) {
    safeSummary.executionSuccessCount = safeSummary.executionSuccessCount.plus(BigInt.fromI32(1));
  } else {
    safeSummary.executionFailureCount = safeSummary.executionFailureCount.plus(BigInt.fromI32(1));
  }
  safeSummary.lastActivityAt = blockTimestamp;
  safeSummary.save();

  const execution = new SafeExecution(eventId(transactionHash, logIndex));
  execution.safe = safeAddress;
  execution.safeTxHash = safeTxHash;
  execution.success = success;
  execution.refundPayment = refundPayment;
  execution.transactionHash = transactionHash;
  execution.blockNumber = blockNumber;
  execution.blockTimestamp = blockTimestamp;
  execution.logIndex = logIndex;
  execution.safeSummary = safeSummary.id;

  if (!safeSummary.agentLinkConflict) {
    const contextAgentIdHash = dataSource.context().getBytes("agentIdHash");
    const agent = AgentOnchainSummary.load(contextAgentIdHash);
    if (agent != null) {
      execution.agentIdHash = contextAgentIdHash;
      execution.agent = agent.id;
      agent.executionCount = agent.executionCount.plus(BigInt.fromI32(1));
      if (success) {
        agent.executionSuccessCount = agent.executionSuccessCount.plus(BigInt.fromI32(1));
      } else {
        agent.executionFailureCount = agent.executionFailureCount.plus(BigInt.fromI32(1));
      }
      agent.lastActivityAt = blockTimestamp;
      agent.save();

      const metric = getOrCreateDailyMetric(contextAgentIdHash, blockTimestamp);
      metric.executionCount = metric.executionCount.plus(BigInt.fromI32(1));
      if (success) {
        metric.executionSuccessCount = metric.executionSuccessCount.plus(BigInt.fromI32(1));
      } else {
        metric.executionFailureCount = metric.executionFailureCount.plus(BigInt.fromI32(1));
      }
      metric.save();
    } else {
      log.warning("Safe execution has no matching agent summary for context {}", [
        contextAgentIdHash.toHexString(),
      ]);
    }
  }
  execution.save();

  const protocol = getOrCreateProtocol(blockTimestamp);
  protocol.totalExecutions = protocol.totalExecutions.plus(BigInt.fromI32(1));
  if (success) {
    protocol.totalExecutionSuccess = protocol.totalExecutionSuccess.plus(BigInt.fromI32(1));
  } else {
    protocol.totalExecutionFailure = protocol.totalExecutionFailure.plus(BigInt.fromI32(1));
  }
  protocol.save();
}
