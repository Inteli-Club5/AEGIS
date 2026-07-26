import {
  afterEach,
  assert,
  clearStore,
  describe,
  test,
  newMockEvent,
} from "matchstick-as/assembly/index";
import { Address, BigInt, Bytes, crypto, ethereum } from "@graphprotocol/graph-ts";
import {
  DelegateAccessSet,
  Transfer,
  UsageAuthorized,
  UsageRevoked,
} from "../generated/AgenticID/AgenticID";
import {
  handleDelegateAccessSet,
  handleTransfer,
  handleUsageAuthorized,
  handleUsageRevoked,
} from "../src/agentic-id";

const CONTRACT = "0x2700F6A3e505402C9daB154C5c6ab9cAEC98EF1F";
const OWNER_A = "0x7F9FD465790184955cc9B8bf3B5e0AAabdfD8c97";
const OWNER_B = "0x1111111111111111111111111111111111111111";
const ZERO = "0x0000000000000000000000000000000000000000";
const TX_A = "0x9f132d14dd4071eea5b7bb29eee83d76631b00c0aab8234c3fefddf093a69a51";
const TX_B = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const TX_C = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const TX_D = "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";
const TX_E = "0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd";

describe("0G Agentic ID Transfer mapping", () => {
  afterEach(() => {
    clearStore();
  });

  test("indexes the independently verified mint and exact protocol totals", () => {
    handleTransfer(createTransfer(ZERO, OWNER_A, 102, TX_A, 45_806_767, 1_750_000_000, 0));

    const id = identityId(CONTRACT, "102");
    const changeId = eventId(TX_A, 0);
    assert.entityCount("AgenticIdentity", 1);
    assert.entityCount("AgenticIdentityOwnerChange", 1);
    assert.fieldEquals("AgenticIdentity", id, "contract", CONTRACT.toLowerCase());
    assert.fieldEquals("AgenticIdentity", id, "tokenId", "102");
    assert.fieldEquals("AgenticIdentity", id, "owner", OWNER_A.toLowerCase());
    assert.fieldEquals("AgenticIdentity", id, "status", "ACTIVE");
    assert.fieldEquals("AgenticIdentity", id, "seenMint", "true");
    assert.fieldEquals("AgenticIdentity", id, "mintTransactionHash", TX_A);
    assert.fieldEquals("AgenticIdentity", id, "blockNumber", "45806767");
    assert.fieldEquals("AgenticIdentity", id, "currentAuthorizationCount", "0");
    assert.fieldEquals("AgenticIdentity", id, "totalAuthorizationEvents", "0");
    assert.fieldEquals("AgenticIdentityOwnerChange", changeId, "changeType", "MINT");
    assert.fieldEquals("AgenticIdentityOwnerChange", changeId, "identity", id);
    assert.fieldEquals("AgentIdentitySummary", OWNER_A.toLowerCase(), "currentIdentityCount", "1");
    assert.fieldEquals("AgentIdentitySummary", OWNER_A.toLowerCase(), "mintReceivedCount", "1");
    assert.fieldEquals("ZeroGProtocolSummary", "global", "distinctIdentityCount", "1");
    assert.fieldEquals("ZeroGProtocolSummary", "global", "mintEventCount", "1");
    assert.fieldEquals("ZeroGProtocolSummary", "global", "currentIdentityCount", "1");
    assert.fieldEquals("ZeroGProtocolSummary", "global", "totalOwnerChanges", "1");
    assert.fieldEquals("ZeroGProtocolSummary", "global", "authorizationGrantedEventCount", "0");
    assert.fieldEquals("ZeroGProtocolSummary", "global", "delegationSetEventCount", "0");
  });

  test("updates owners and summaries for transfer then burn", () => {
    handleTransfer(createTransfer(ZERO, OWNER_A, 102, TX_A, 45_806_767, 1_750_000_000, 0));
    handleTransfer(createTransfer(OWNER_A, OWNER_B, 102, TX_B, 45_806_768, 1_750_000_010, 1));
    handleTransfer(createTransfer(OWNER_B, ZERO, 102, TX_C, 45_806_769, 1_750_000_020, 2));

    const id = identityId(CONTRACT, "102");
    assert.fieldEquals("AgenticIdentity", id, "owner", ZERO);
    assert.fieldEquals("AgenticIdentity", id, "status", "BURNED");
    assert.fieldEquals("AgenticIdentity", id, "transactionHash", TX_C);
    assert.fieldEquals("AgentIdentitySummary", OWNER_A.toLowerCase(), "currentIdentityCount", "0");
    assert.fieldEquals("AgentIdentitySummary", OWNER_A.toLowerCase(), "transferOutCount", "1");
    assert.fieldEquals("AgentIdentitySummary", OWNER_B, "currentIdentityCount", "0");
    assert.fieldEquals("AgentIdentitySummary", OWNER_B, "transferInCount", "1");
    assert.fieldEquals("AgentIdentitySummary", OWNER_B, "burnCount", "1");
    assert.fieldEquals("ZeroGProtocolSummary", "global", "distinctIdentityCount", "1");
    assert.fieldEquals("ZeroGProtocolSummary", "global", "transferEventCount", "1");
    assert.fieldEquals("ZeroGProtocolSummary", "global", "burnEventCount", "1");
    assert.fieldEquals("ZeroGProtocolSummary", "global", "currentIdentityCount", "0");
    assert.fieldEquals("ZeroGProtocolSummary", "global", "totalOwnerChanges", "3");
  });

  test("creates a partial active identity when indexing begins after its mint", () => {
    handleTransfer(createTransfer(OWNER_A, OWNER_B, 999, TX_B, 45_806_768, 1_750_000_010, 4));

    const id = identityId(CONTRACT, "999");
    assert.fieldEquals("AgenticIdentity", id, "seenMint", "false");
    assert.fieldEquals("AgenticIdentity", id, "status", "ACTIVE");
    assert.fieldEquals("AgenticIdentity", id, "owner", OWNER_B);
    assert.fieldEquals("ZeroGProtocolSummary", "global", "distinctIdentityCount", "1");
    assert.fieldEquals("ZeroGProtocolSummary", "global", "currentIdentityCount", "1");
  });

  test("indexes authorization facts and maintains current authorization state", () => {
    handleTransfer(createTransfer(ZERO, OWNER_A, 102, TX_A, 45_806_767, 1_750_000_000, 0));
    handleUsageAuthorized(createUsageAuthorized(102, OWNER_B, TX_B, 45_806_768, 1_750_000_010, 1));

    const identity = identityId(CONTRACT, "102");
    const grantId = eventId(TX_B, 1);
    const stateId = authorizationStateId(CONTRACT, "102", OWNER_B);
    assert.entityCount("AgenticIdentityAuthorization", 1);
    assert.entityCount("AgenticIdentityAuthorizationState", 1);
    assert.fieldEquals("AgenticIdentityAuthorization", grantId, "identity", identity);
    assert.fieldEquals("AgenticIdentityAuthorization", grantId, "action", "AUTHORIZE");
    assert.fieldEquals("AgenticIdentityAuthorization", grantId, "authorized", "true");
    assert.fieldEquals("AgenticIdentityAuthorizationState", stateId, "authorized", "true");
    assert.fieldEquals("AgenticIdentityAuthorizationState", stateId, "lastAction", "AUTHORIZE");
    assert.fieldEquals("AgenticIdentity", identity, "currentAuthorizationCount", "1");
    assert.fieldEquals("AgenticIdentity", identity, "totalAuthorizationEvents", "1");
    assert.fieldEquals("ZeroGProtocolSummary", "global", "authorizationGrantedEventCount", "1");

    handleUsageRevoked(createUsageRevoked(102, OWNER_B, TX_C, 45_806_769, 1_750_000_020, 2));

    const revokeId = eventId(TX_C, 2);
    assert.entityCount("AgenticIdentityAuthorization", 2);
    assert.fieldEquals("AgenticIdentityAuthorization", revokeId, "action", "REVOKE");
    assert.fieldEquals("AgenticIdentityAuthorization", revokeId, "authorized", "false");
    assert.fieldEquals("AgenticIdentityAuthorizationState", stateId, "authorized", "false");
    assert.fieldEquals("AgenticIdentityAuthorizationState", stateId, "lastAction", "REVOKE");
    assert.fieldEquals("AgenticIdentity", identity, "currentAuthorizationCount", "0");
    assert.fieldEquals("AgenticIdentity", identity, "totalAuthorizationEvents", "2");
    assert.fieldEquals("ZeroGProtocolSummary", "global", "authorizationRevokedEventCount", "1");
  });

  test("indexes delegate set and revoke events without private metadata", () => {
    handleDelegateAccessSet(createDelegateAccessSet(OWNER_A, OWNER_B, TX_D, 30_363_451, 1_740_000_000, 0));

    const setId = eventId(TX_D, 0);
    assert.entityCount("AgenticIdentityDelegation", 1);
    assert.fieldEquals("AgenticIdentityDelegation", setId, "owner", OWNER_A.toLowerCase());
    assert.fieldEquals("AgenticIdentityDelegation", setId, "assistant", OWNER_B);
    assert.fieldEquals("AgenticIdentityDelegation", setId, "action", "SET");
    assert.fieldEquals("AgenticIdentityDelegation", setId, "active", "true");
    assert.fieldEquals("AgentIdentitySummary", OWNER_A.toLowerCase(), "delegatedAssistant", OWNER_B);
    assert.fieldEquals("AgentIdentitySummary", OWNER_A.toLowerCase(), "delegationActive", "true");
    assert.fieldEquals("AgentIdentitySummary", OWNER_A.toLowerCase(), "delegationEventCount", "1");
    assert.fieldEquals("ZeroGProtocolSummary", "global", "delegationSetEventCount", "1");

    handleDelegateAccessSet(createDelegateAccessSet(OWNER_A, ZERO, TX_E, 31_258_157, 1_740_000_010, 1));

    const revokeId = eventId(TX_E, 1);
    assert.entityCount("AgenticIdentityDelegation", 2);
    assert.fieldEquals("AgenticIdentityDelegation", revokeId, "action", "REVOKE");
    assert.fieldEquals("AgenticIdentityDelegation", revokeId, "active", "false");
    assert.fieldEquals("AgentIdentitySummary", OWNER_A.toLowerCase(), "delegatedAssistant", ZERO);
    assert.fieldEquals("AgentIdentitySummary", OWNER_A.toLowerCase(), "delegationActive", "false");
    assert.fieldEquals("AgentIdentitySummary", OWNER_A.toLowerCase(), "delegationEventCount", "2");
    assert.fieldEquals("ZeroGProtocolSummary", "global", "delegationRevokedEventCount", "1");
  });
});

function createTransfer(
  from: string,
  to: string,
  tokenId: i32,
  transactionHash: string,
  blockNumber: i32,
  blockTimestamp: i32,
  logIndex: i32,
): Transfer {
  const event = changetype<Transfer>(newMockEvent());
  event.address = Address.fromString(CONTRACT);
  event.transaction.hash = Bytes.fromHexString(transactionHash);
  event.block.number = BigInt.fromI32(blockNumber);
  event.block.timestamp = BigInt.fromI32(blockTimestamp);
  event.logIndex = BigInt.fromI32(logIndex);
  event.parameters = new Array<ethereum.EventParam>();
  event.parameters.push(
    new ethereum.EventParam("from", ethereum.Value.fromAddress(Address.fromString(from))),
  );
  event.parameters.push(
    new ethereum.EventParam("to", ethereum.Value.fromAddress(Address.fromString(to))),
  );
  event.parameters.push(
    new ethereum.EventParam("tokenId", ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(tokenId))),
  );
  return event;
}

function createUsageAuthorized(
  tokenId: i32,
  user: string,
  transactionHash: string,
  blockNumber: i32,
  blockTimestamp: i32,
  logIndex: i32,
): UsageAuthorized {
  const event = changetype<UsageAuthorized>(newMockEvent());
  setEventMetadata(event, transactionHash, blockNumber, blockTimestamp, logIndex);
  event.parameters = new Array<ethereum.EventParam>();
  event.parameters.push(
    new ethereum.EventParam("tokenId", ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(tokenId))),
  );
  event.parameters.push(
    new ethereum.EventParam("user", ethereum.Value.fromAddress(Address.fromString(user))),
  );
  return event;
}

function createUsageRevoked(
  tokenId: i32,
  user: string,
  transactionHash: string,
  blockNumber: i32,
  blockTimestamp: i32,
  logIndex: i32,
): UsageRevoked {
  const event = changetype<UsageRevoked>(newMockEvent());
  setEventMetadata(event, transactionHash, blockNumber, blockTimestamp, logIndex);
  event.parameters = new Array<ethereum.EventParam>();
  event.parameters.push(
    new ethereum.EventParam("tokenId", ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(tokenId))),
  );
  event.parameters.push(
    new ethereum.EventParam("user", ethereum.Value.fromAddress(Address.fromString(user))),
  );
  return event;
}

function createDelegateAccessSet(
  owner: string,
  assistant: string,
  transactionHash: string,
  blockNumber: i32,
  blockTimestamp: i32,
  logIndex: i32,
): DelegateAccessSet {
  const event = changetype<DelegateAccessSet>(newMockEvent());
  setEventMetadata(event, transactionHash, blockNumber, blockTimestamp, logIndex);
  event.parameters = new Array<ethereum.EventParam>();
  event.parameters.push(
    new ethereum.EventParam("owner", ethereum.Value.fromAddress(Address.fromString(owner))),
  );
  event.parameters.push(
    new ethereum.EventParam("assistant", ethereum.Value.fromAddress(Address.fromString(assistant))),
  );
  return event;
}

function setEventMetadata(
  event: ethereum.Event,
  transactionHash: string,
  blockNumber: i32,
  blockTimestamp: i32,
  logIndex: i32,
): void {
  event.address = Address.fromString(CONTRACT);
  event.transaction.hash = Bytes.fromHexString(transactionHash);
  event.block.number = BigInt.fromI32(blockNumber);
  event.block.timestamp = BigInt.fromI32(blockTimestamp);
  event.logIndex = BigInt.fromI32(logIndex);
}

function identityId(contractAddress: string, tokenId: string): string {
  const input = Bytes.fromUTF8(Address.fromString(contractAddress).toHexString() + ":" + tokenId);
  return Bytes.fromByteArray(crypto.keccak256(input)).toHexString();
}

function eventId(transactionHash: string, logIndex: i32): string {
  return Bytes.fromHexString(transactionHash).concatI32(logIndex).toHexString();
}

function authorizationStateId(contractAddress: string, tokenId: string, user: string): string {
  const input = Bytes.fromUTF8(
    Address.fromString(contractAddress).toHexString() +
      ":" +
      tokenId +
      ":" +
      Address.fromString(user).toHexString(),
  );
  return Bytes.fromByteArray(crypto.keccak256(input)).toHexString();
}
