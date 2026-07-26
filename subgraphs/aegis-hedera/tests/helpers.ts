import { newMockEvent } from "matchstick-as/assembly/index";
import { Address, BigInt, Bytes, ethereum } from "@graphprotocol/graph-ts";
import { TeeMLValidationRecorded } from "../generated/AegisTeeValidationRegistry/AegisTeeValidationRegistry";
import {
  AddedOwner,
  ChangedThreshold,
  ExecutionFailure,
  ExecutionSuccess,
  RemovedOwner,
} from "../generated/templates/SafeAccount/Safe";

export const AGENT = "0x2222222222222222222222222222222222222222222222222222222222222222";
export const SAFE = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
export const RECORDER = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

export function createValidationEvent(
  requestId: string,
  policyHash: string,
  verdict: i32,
  transactionHash: string,
  logIndex: i32,
  blockNumber: i32,
  blockTimestamp: i32,
): TeeMLValidationRecorded {
  const event = changetype<TeeMLValidationRecorded>(newMockEvent());
  event.address = Address.fromString("0xcccccccccccccccccccccccccccccccccccccccc");
  setEventMetadata(event, transactionHash, logIndex, blockNumber, blockTimestamp);
  event.parameters = new Array<ethereum.EventParam>();
  event.parameters.push(bytesParam("requestId", requestId));
  event.parameters.push(bytesParam("agentIdHash", AGENT));
  event.parameters.push(
    bytesParam("actionHash", "0x3333333333333333333333333333333333333333333333333333333333333333"),
  );
  event.parameters.push(bytesParam("policyHash", policyHash));
  event.parameters.push(
    bytesParam(
      "semanticContextHash",
      "0x5555555555555555555555555555555555555555555555555555555555555555",
    ),
  );
  event.parameters.push(
    bytesParam(
      "teemlRequestHash",
      "0x6666666666666666666666666666666666666666666666666666666666666666",
    ),
  );
  event.parameters.push(
    bytesParam("artifactHash", "0x7777777777777777777777777777777777777777777777777777777777777777"),
  );
  event.parameters.push(
    bytesParam("modelIdHash", "0x8888888888888888888888888888888888888888888888888888888888888888"),
  );
  event.parameters.push(
    bytesParam(
      "reasonCodeHash",
      "0x9999999999999999999999999999999999999999999999999999999999999999",
    ),
  );
  event.parameters.push(
    new ethereum.EventParam("safe", ethereum.Value.fromAddress(Address.fromString(SAFE))),
  );
  event.parameters.push(
    new ethereum.EventParam(
      "agenticIdTokenId",
      ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(102)),
    ),
  );
  event.parameters.push(new ethereum.EventParam("verdict", ethereum.Value.fromI32(verdict)));
  event.parameters.push(
    new ethereum.EventParam("recorder", ethereum.Value.fromAddress(Address.fromString(RECORDER))),
  );
  event.parameters.push(new ethereum.EventParam("schemaVersion", ethereum.Value.fromI32(1)));
  return event;
}

export function createSuccessEvent(
  safeTxHash: string,
  payment: i32,
  transactionHash: string,
  logIndex: i32,
  blockNumber: i32,
  blockTimestamp: i32,
): ExecutionSuccess {
  const event = changetype<ExecutionSuccess>(newMockEvent());
  setEventMetadata(event, transactionHash, logIndex, blockNumber, blockTimestamp);
  event.parameters = safeParameters(safeTxHash, payment);
  return event;
}

export function createFailureEvent(
  safeTxHash: string,
  payment: i32,
  transactionHash: string,
  logIndex: i32,
  blockNumber: i32,
  blockTimestamp: i32,
): ExecutionFailure {
  const event = changetype<ExecutionFailure>(newMockEvent());
  setEventMetadata(event, transactionHash, logIndex, blockNumber, blockTimestamp);
  event.parameters = safeParameters(safeTxHash, payment);
  return event;
}

export function createAddedOwnerEvent(
  owner: string,
  transactionHash: string,
  logIndex: i32,
  blockNumber: i32,
  blockTimestamp: i32,
): AddedOwner {
  const event = changetype<AddedOwner>(newMockEvent());
  setEventMetadata(event, transactionHash, logIndex, blockNumber, blockTimestamp);
  event.parameters = ownerParameters(owner);
  return event;
}

export function createRemovedOwnerEvent(
  owner: string,
  transactionHash: string,
  logIndex: i32,
  blockNumber: i32,
  blockTimestamp: i32,
): RemovedOwner {
  const event = changetype<RemovedOwner>(newMockEvent());
  setEventMetadata(event, transactionHash, logIndex, blockNumber, blockTimestamp);
  event.parameters = ownerParameters(owner);
  return event;
}

export function createChangedThresholdEvent(
  threshold: i32,
  transactionHash: string,
  logIndex: i32,
  blockNumber: i32,
  blockTimestamp: i32,
): ChangedThreshold {
  const event = changetype<ChangedThreshold>(newMockEvent());
  setEventMetadata(event, transactionHash, logIndex, blockNumber, blockTimestamp);
  event.parameters = new Array<ethereum.EventParam>();
  event.parameters.push(
    new ethereum.EventParam(
      "threshold",
      ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(threshold)),
    ),
  );
  return event;
}

export function eventId(transactionHash: string, logIndex: i32): string {
  return Bytes.fromHexString(transactionHash).concatI32(logIndex).toHexString();
}

export function dailyMetricId(timestamp: i32): string {
  const day = BigInt.fromI32(timestamp)
    .div(BigInt.fromI32(86_400))
    .times(BigInt.fromI32(86_400));
  return Bytes.fromHexString(AGENT).concatI32(day.toI32()).toHexString();
}

function bytesParam(name: string, value: string): ethereum.EventParam {
  return new ethereum.EventParam(name, ethereum.Value.fromFixedBytes(Bytes.fromHexString(value)));
}

function safeParameters(safeTxHash: string, payment: i32): Array<ethereum.EventParam> {
  const parameters = new Array<ethereum.EventParam>();
  parameters.push(bytesParam("txHash", safeTxHash));
  parameters.push(
    new ethereum.EventParam("payment", ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(payment))),
  );
  return parameters;
}

function ownerParameters(owner: string): Array<ethereum.EventParam> {
  const parameters = new Array<ethereum.EventParam>();
  parameters.push(
    new ethereum.EventParam("owner", ethereum.Value.fromAddress(Address.fromString(owner))),
  );
  return parameters;
}

function setEventMetadata(
  event: ethereum.Event,
  transactionHash: string,
  logIndex: i32,
  blockNumber: i32,
  blockTimestamp: i32,
): void {
  event.transaction.hash = Bytes.fromHexString(transactionHash);
  event.logIndex = BigInt.fromI32(logIndex);
  event.block.number = BigInt.fromI32(blockNumber);
  event.block.timestamp = BigInt.fromI32(blockTimestamp);
}
