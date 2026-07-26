import { Address, BigInt, Bytes, crypto } from "@graphprotocol/graph-ts";
import {
  DelegateAccessSet,
  Transfer,
  UsageAuthorized,
  UsageRevoked,
} from "../generated/AgenticID/AgenticID";
import {
  AgenticIdentity,
  AgenticIdentityAuthorization,
  AgenticIdentityAuthorizationState,
  AgenticIdentityDelegation,
  AgenticIdentityOwnerChange,
  AgentIdentitySummary,
  ZeroGProtocolSummary,
} from "../generated/schema";

const PROTOCOL_ID = "global";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export function handleTransfer(event: Transfer): void {
  const mint = isZero(event.params.from);
  const burn = isZero(event.params.to);
  const id = identityId(event.address, event.params.tokenId);
  let identity = AgenticIdentity.load(id);
  const isNewIdentity = identity == null;
  const wasActive = identity != null && identity.status == "ACTIVE";

  if (identity == null) {
    identity = new AgenticIdentity(id);
    identity.contract = event.address;
    identity.tokenId = event.params.tokenId;
    identity.owner = event.params.to;
    identity.status = burn ? "BURNED" : "ACTIVE";
    identity.seenMint = false;
    identity.firstSeenAt = event.block.timestamp;
    identity.currentAuthorizationCount = BigInt.zero();
    identity.totalAuthorizationEvents = BigInt.zero();
  }

  if (mint) {
    identity.seenMint = true;
    identity.mintTransactionHash = event.transaction.hash;
    identity.mintBlockNumber = event.block.number;
    identity.mintBlockTimestamp = event.block.timestamp;
  }
  identity.owner = event.params.to;
  identity.status = burn ? "BURNED" : "ACTIVE";
  identity.transactionHash = event.transaction.hash;
  identity.blockNumber = event.block.number;
  identity.blockTimestamp = event.block.timestamp;
  identity.logIndex = event.logIndex;
  identity.lastUpdatedAt = event.block.timestamp;
  identity.save();

  const change = new AgenticIdentityOwnerChange(eventId(event.transaction.hash, event.logIndex));
  change.identity = identity.id;
  change.contract = event.address;
  change.tokenId = event.params.tokenId;
  change.previousOwner = event.params.from;
  change.newOwner = event.params.to;
  change.changeType = mint ? "MINT" : burn ? "BURN" : "TRANSFER";
  change.transactionHash = event.transaction.hash;
  change.blockNumber = event.block.number;
  change.blockTimestamp = event.block.timestamp;
  change.logIndex = event.logIndex;
  change.save();

  if (mint) {
    const recipient = getOrCreateOwner(event.params.to, event.block.timestamp);
    recipient.currentIdentityCount = recipient.currentIdentityCount.plus(BigInt.fromI32(1));
    recipient.mintReceivedCount = recipient.mintReceivedCount.plus(BigInt.fromI32(1));
    recipient.lastActivityAt = event.block.timestamp;
    recipient.save();
  } else if (burn) {
    const sender = getOrCreateOwner(event.params.from, event.block.timestamp);
    sender.currentIdentityCount = decrement(sender.currentIdentityCount);
    sender.burnCount = sender.burnCount.plus(BigInt.fromI32(1));
    sender.lastActivityAt = event.block.timestamp;
    sender.save();
  } else {
    const sender = getOrCreateOwner(event.params.from, event.block.timestamp);
    sender.currentIdentityCount = decrement(sender.currentIdentityCount);
    sender.transferOutCount = sender.transferOutCount.plus(BigInt.fromI32(1));
    sender.lastActivityAt = event.block.timestamp;
    sender.save();

    const recipient = getOrCreateOwner(event.params.to, event.block.timestamp);
    recipient.currentIdentityCount = recipient.currentIdentityCount.plus(BigInt.fromI32(1));
    recipient.transferInCount = recipient.transferInCount.plus(BigInt.fromI32(1));
    recipient.lastActivityAt = event.block.timestamp;
    recipient.save();
  }

  const protocol = getOrCreateProtocol(event.block.timestamp);
  if (isNewIdentity) {
    protocol.distinctIdentityCount = protocol.distinctIdentityCount.plus(BigInt.fromI32(1));
  }
  protocol.totalOwnerChanges = protocol.totalOwnerChanges.plus(BigInt.fromI32(1));
  if (mint) {
    protocol.mintEventCount = protocol.mintEventCount.plus(BigInt.fromI32(1));
  } else if (burn) {
    protocol.burnEventCount = protocol.burnEventCount.plus(BigInt.fromI32(1));
  } else {
    protocol.transferEventCount = protocol.transferEventCount.plus(BigInt.fromI32(1));
  }
  if (!wasActive && !burn) {
    protocol.currentIdentityCount = protocol.currentIdentityCount.plus(BigInt.fromI32(1));
  } else if (wasActive && burn) {
    protocol.currentIdentityCount = decrement(protocol.currentIdentityCount);
  }
  protocol.lastActivityAt = event.block.timestamp;
  protocol.save();
}

export function handleUsageAuthorized(event: UsageAuthorized): void {
  recordAuthorization(
    event.address,
    event.params.tokenId,
    event.params.user,
    true,
    event.transaction.hash,
    event.block.number,
    event.block.timestamp,
    event.logIndex,
  );
}

export function handleUsageRevoked(event: UsageRevoked): void {
  recordAuthorization(
    event.address,
    event.params.tokenId,
    event.params.user,
    false,
    event.transaction.hash,
    event.block.number,
    event.block.timestamp,
    event.logIndex,
  );
}

export function handleDelegateAccessSet(event: DelegateAccessSet): void {
  const active = !isZero(event.params.assistant);
  const ownerSummary = getOrCreateOwner(event.params.owner, event.block.timestamp);
  ownerSummary.delegatedAssistant = event.params.assistant;
  ownerSummary.delegationActive = active;
  ownerSummary.delegationEventCount = ownerSummary.delegationEventCount.plus(BigInt.fromI32(1));
  ownerSummary.lastActivityAt = event.block.timestamp;
  ownerSummary.save();

  const delegation = new AgenticIdentityDelegation(eventId(event.transaction.hash, event.logIndex));
  delegation.ownerSummary = ownerSummary.id;
  delegation.owner = event.params.owner;
  delegation.assistant = event.params.assistant;
  delegation.action = active ? "SET" : "REVOKE";
  delegation.active = active;
  delegation.transactionHash = event.transaction.hash;
  delegation.blockNumber = event.block.number;
  delegation.blockTimestamp = event.block.timestamp;
  delegation.logIndex = event.logIndex;
  delegation.save();

  const protocol = getOrCreateProtocol(event.block.timestamp);
  if (active) {
    protocol.delegationSetEventCount = protocol.delegationSetEventCount.plus(BigInt.fromI32(1));
  } else {
    protocol.delegationRevokedEventCount = protocol.delegationRevokedEventCount.plus(BigInt.fromI32(1));
  }
  protocol.lastActivityAt = event.block.timestamp;
  protocol.save();
}

function recordAuthorization(
  contractAddress: Address,
  tokenId: BigInt,
  user: Address,
  authorized: boolean,
  transactionHash: Bytes,
  blockNumber: BigInt,
  blockTimestamp: BigInt,
  logIndex: BigInt,
): void {
  const identity = AgenticIdentity.load(identityId(contractAddress, tokenId));
  const stateId = authorizationStateId(contractAddress, tokenId, user);
  let state = AgenticIdentityAuthorizationState.load(stateId);
  const wasAuthorized = state != null && state.authorized;

  const authorization = new AgenticIdentityAuthorization(eventId(transactionHash, logIndex));
  if (identity != null) {
    authorization.identity = identity.id;
  }
  authorization.contract = contractAddress;
  authorization.tokenId = tokenId;
  authorization.user = user;
  authorization.action = authorized ? "AUTHORIZE" : "REVOKE";
  authorization.authorized = authorized;
  authorization.transactionHash = transactionHash;
  authorization.blockNumber = blockNumber;
  authorization.blockTimestamp = blockTimestamp;
  authorization.logIndex = logIndex;
  authorization.save();

  if (state == null) {
    state = new AgenticIdentityAuthorizationState(stateId);
    state.contract = contractAddress;
    state.tokenId = tokenId;
    state.user = user;
  }
  if (identity != null) {
    state.identity = identity.id;
  }
  state.authorized = authorized;
  state.lastAction = authorized ? "AUTHORIZE" : "REVOKE";
  state.transactionHash = transactionHash;
  state.blockNumber = blockNumber;
  state.blockTimestamp = blockTimestamp;
  state.logIndex = logIndex;
  state.save();

  if (identity != null) {
    if (authorized && !wasAuthorized) {
      identity.currentAuthorizationCount = identity.currentAuthorizationCount.plus(BigInt.fromI32(1));
    } else if (!authorized && wasAuthorized) {
      identity.currentAuthorizationCount = decrement(identity.currentAuthorizationCount);
    }
    identity.totalAuthorizationEvents = identity.totalAuthorizationEvents.plus(BigInt.fromI32(1));
    identity.lastUpdatedAt = blockTimestamp;
    identity.save();
  }

  const protocol = getOrCreateProtocol(blockTimestamp);
  if (authorized) {
    protocol.authorizationGrantedEventCount = protocol.authorizationGrantedEventCount.plus(BigInt.fromI32(1));
  } else {
    protocol.authorizationRevokedEventCount = protocol.authorizationRevokedEventCount.plus(BigInt.fromI32(1));
  }
  protocol.lastActivityAt = blockTimestamp;
  protocol.save();
}

function identityId(contractAddress: Address, tokenId: BigInt): Bytes {
  const input = Bytes.fromUTF8(contractAddress.toHexString() + ":" + tokenId.toString());
  return Bytes.fromByteArray(crypto.keccak256(input));
}

function eventId(transactionHash: Bytes, logIndex: BigInt): Bytes {
  return transactionHash.concatI32(logIndex.toI32());
}

function authorizationStateId(contractAddress: Address, tokenId: BigInt, user: Address): Bytes {
  const input = Bytes.fromUTF8(
    contractAddress.toHexString() + ":" + tokenId.toString() + ":" + user.toHexString(),
  );
  return Bytes.fromByteArray(crypto.keccak256(input));
}

function isZero(address: Address): boolean {
  return address.toHexString() == ZERO_ADDRESS;
}

function decrement(value: BigInt): BigInt {
  return value.gt(BigInt.zero()) ? value.minus(BigInt.fromI32(1)) : BigInt.zero();
}

function getOrCreateOwner(owner: Address, timestamp: BigInt): AgentIdentitySummary {
  let summary = AgentIdentitySummary.load(owner);
  if (summary == null) {
    summary = new AgentIdentitySummary(owner);
    summary.owner = owner;
    summary.currentIdentityCount = BigInt.zero();
    summary.mintReceivedCount = BigInt.zero();
    summary.transferInCount = BigInt.zero();
    summary.transferOutCount = BigInt.zero();
    summary.burnCount = BigInt.zero();
    summary.delegationActive = false;
    summary.delegationEventCount = BigInt.zero();
    summary.firstActivityAt = timestamp;
  }
  summary.lastActivityAt = timestamp;
  return summary;
}

function getOrCreateProtocol(timestamp: BigInt): ZeroGProtocolSummary {
  let protocol = ZeroGProtocolSummary.load(PROTOCOL_ID);
  if (protocol == null) {
    protocol = new ZeroGProtocolSummary(PROTOCOL_ID);
    protocol.distinctIdentityCount = BigInt.zero();
    protocol.mintEventCount = BigInt.zero();
    protocol.transferEventCount = BigInt.zero();
    protocol.burnEventCount = BigInt.zero();
    protocol.currentIdentityCount = BigInt.zero();
    protocol.totalOwnerChanges = BigInt.zero();
    protocol.authorizationGrantedEventCount = BigInt.zero();
    protocol.authorizationRevokedEventCount = BigInt.zero();
    protocol.delegationSetEventCount = BigInt.zero();
    protocol.delegationRevokedEventCount = BigInt.zero();
    protocol.firstActivityAt = timestamp;
  }
  protocol.lastActivityAt = timestamp;
  return protocol;
}
