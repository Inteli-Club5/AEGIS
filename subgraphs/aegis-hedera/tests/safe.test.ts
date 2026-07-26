import {
  afterEach,
  assert,
  clearStore,
  dataSourceMock,
  describe,
  test,
} from "matchstick-as/assembly/index";
import { Bytes, DataSourceContext } from "@graphprotocol/graph-ts";
import { handleTeeMLValidationRecorded } from "../src/registry";
import {
  handleAddedOwner,
  handleChangedThreshold,
  handleExecutionFailure,
  handleExecutionSuccess,
  handleRemovedOwner,
} from "../src/safe";
import {
  AGENT,
  SAFE,
  createAddedOwnerEvent,
  createChangedThresholdEvent,
  createFailureEvent,
  createRemovedOwnerEvent,
  createSuccessEvent,
  createValidationEvent,
  dailyMetricId,
  eventId,
} from "./helpers";

const REQUEST = "0x1111111111111111111111111111111111111111111111111111111111111111";
const POLICY = "0x4444444444444444444444444444444444444444444444444444444444444444";
const REGISTRY_TX = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const SUCCESS_TX = "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";
const FAILURE_TX = "0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd";
const SUCCESS_SAFE_TX = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
const FAILURE_SAFE_TX = "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
const ADDED_OWNER = "0x1111111111111111111111111111111111111111";
const REMOVED_OWNER = "0x2222222222222222222222222222222222222222";
const ADDED_OWNER_TX = "0x1212121212121212121212121212121212121212121212121212121212121212";
const REMOVED_OWNER_TX = "0x1313131313131313131313131313131313131313131313131313131313131313";
const THRESHOLD_TX = "0x1414141414141414141414141414141414141414141414141414141414141414";
const TIMESTAMP = 1_750_000_000;

describe("Hedera Safe dynamic data source mapping", () => {
  afterEach(() => {
    dataSourceMock.resetValues();
    clearStore();
  });

  test("indexes Safe success and failure with exact IDs and aggregate updates", () => {
    handleTeeMLValidationRecorded(
      createValidationEvent(REQUEST, POLICY, 1, REGISTRY_TX, 0, 100, TIMESTAMP),
    );
    const context = new DataSourceContext();
    context.setBytes("agentIdHash", Bytes.fromHexString(AGENT));
    dataSourceMock.setAddressAndContext(SAFE, context);

    handleExecutionSuccess(
      createSuccessEvent(SUCCESS_SAFE_TX, 11, SUCCESS_TX, 3, 101, TIMESTAMP + 10),
    );
    handleExecutionFailure(
      createFailureEvent(FAILURE_SAFE_TX, 12, FAILURE_TX, 4, 102, TIMESTAMP + 20),
    );

    const successId = eventId(SUCCESS_TX, 3);
    const failureId = eventId(FAILURE_TX, 4);
    assert.entityCount("SafeExecution", 2);
    assert.fieldEquals("SafeExecution", successId, "safe", SAFE);
    assert.fieldEquals("SafeExecution", successId, "agentIdHash", AGENT);
    assert.fieldEquals("SafeExecution", successId, "safeTxHash", SUCCESS_SAFE_TX);
    assert.fieldEquals("SafeExecution", successId, "success", "true");
    assert.fieldEquals("SafeExecution", successId, "refundPayment", "11");
    assert.fieldEquals("SafeExecution", successId, "transactionHash", SUCCESS_TX);
    assert.fieldEquals("SafeExecution", successId, "blockNumber", "101");
    assert.fieldEquals("SafeExecution", successId, "blockTimestamp", (TIMESTAMP + 10).toString());
    assert.fieldEquals("SafeExecution", successId, "logIndex", "3");
    assert.fieldEquals("SafeExecution", successId, "agent", AGENT);
    assert.fieldEquals("SafeExecution", successId, "safeSummary", SAFE);

    assert.fieldEquals("SafeExecution", failureId, "safeTxHash", FAILURE_SAFE_TX);
    assert.fieldEquals("SafeExecution", failureId, "success", "false");
    assert.fieldEquals("SafeExecution", failureId, "refundPayment", "12");
    assert.fieldEquals("SafeOnchainSummary", SAFE, "executionCount", "2");
    assert.fieldEquals("SafeOnchainSummary", SAFE, "executionSuccessCount", "1");
    assert.fieldEquals("SafeOnchainSummary", SAFE, "executionFailureCount", "1");
    assert.fieldEquals("AgentOnchainSummary", AGENT, "executionCount", "2");
    assert.fieldEquals("AgentOnchainSummary", AGENT, "executionSuccessCount", "1");
    assert.fieldEquals("AgentOnchainSummary", AGENT, "executionFailureCount", "1");
    assert.fieldEquals("DailyAgentMetric", dailyMetricId(TIMESTAMP), "executionCount", "2");
    assert.fieldEquals("DailyAgentMetric", dailyMetricId(TIMESTAMP), "executionSuccessCount", "1");
    assert.fieldEquals("DailyAgentMetric", dailyMetricId(TIMESTAMP), "executionFailureCount", "1");
    assert.fieldEquals("HederaProtocolSummary", "global", "totalExecutions", "2");
    assert.fieldEquals("HederaProtocolSummary", "global", "totalExecutionSuccess", "1");
    assert.fieldEquals("HederaProtocolSummary", "global", "totalExecutionFailure", "1");
  });

  test("indexes post-discovery owner and threshold changes as immutable facts", () => {
    handleTeeMLValidationRecorded(
      createValidationEvent(REQUEST, POLICY, 1, REGISTRY_TX, 0, 100, TIMESTAMP),
    );
    const context = new DataSourceContext();
    context.setBytes("agentIdHash", Bytes.fromHexString(AGENT));
    dataSourceMock.setAddressAndContext(SAFE, context);

    handleAddedOwner(createAddedOwnerEvent(ADDED_OWNER, ADDED_OWNER_TX, 5, 103, TIMESTAMP + 30));
    handleRemovedOwner(
      createRemovedOwnerEvent(REMOVED_OWNER, REMOVED_OWNER_TX, 6, 104, TIMESTAMP + 40),
    );
    handleChangedThreshold(
      createChangedThresholdEvent(3, THRESHOLD_TX, 7, 105, TIMESTAMP + 50),
    );

    const addedId = eventId(ADDED_OWNER_TX, 5);
    const removedId = eventId(REMOVED_OWNER_TX, 6);
    const thresholdId = eventId(THRESHOLD_TX, 7);
    assert.entityCount("SafeConfigurationChange", 3);

    assert.fieldEquals("SafeConfigurationChange", addedId, "safe", SAFE);
    assert.fieldEquals("SafeConfigurationChange", addedId, "kind", "OWNER_ADDED");
    assert.fieldEquals("SafeConfigurationChange", addedId, "owner", ADDED_OWNER);
    assert.fieldEquals("SafeConfigurationChange", addedId, "transactionHash", ADDED_OWNER_TX);
    assert.fieldEquals("SafeConfigurationChange", addedId, "blockNumber", "103");
    assert.fieldEquals(
      "SafeConfigurationChange",
      addedId,
      "blockTimestamp",
      (TIMESTAMP + 30).toString(),
    );
    assert.fieldEquals("SafeConfigurationChange", addedId, "logIndex", "5");
    assert.fieldEquals("SafeConfigurationChange", addedId, "safeSummary", SAFE);

    assert.fieldEquals("SafeConfigurationChange", removedId, "kind", "OWNER_REMOVED");
    assert.fieldEquals("SafeConfigurationChange", removedId, "owner", REMOVED_OWNER);
    assert.fieldEquals("SafeConfigurationChange", removedId, "blockNumber", "104");

    assert.fieldEquals("SafeConfigurationChange", thresholdId, "kind", "THRESHOLD_CHANGED");
    assert.fieldEquals("SafeConfigurationChange", thresholdId, "threshold", "3");
    assert.fieldEquals("SafeConfigurationChange", thresholdId, "blockNumber", "105");
    assert.fieldEquals("SafeOnchainSummary", SAFE, "lastActivityAt", (TIMESTAMP + 50).toString());
  });
});
