import {
  afterEach,
  assert,
  clearStore,
  describe,
  test,
} from "matchstick-as/assembly/index";
import { handleTeeMLValidationRecorded } from "../src/registry";
import { AGENT, RECORDER, SAFE, createValidationEvent, dailyMetricId, eventId } from "./helpers";

const REQUEST_ALLOW = "0x1111111111111111111111111111111111111111111111111111111111111111";
const REQUEST_DENY = "0x1212121212121212121212121212121212121212121212121212121212121212";
const POLICY_ALLOW = "0x4444444444444444444444444444444444444444444444444444444444444444";
const POLICY_DENY = "0x4545454545454545454545454545454545454545454545454545454545454545";
const TX_ALLOW = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const TX_DENY = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const TIMESTAMP = 1_750_000_000;

describe("Hedera TeeML registry mapping", () => {
  afterEach(() => {
    clearStore();
  });

  test("indexes every ALLOW event field with deterministic IDs and summaries", () => {
    handleTeeMLValidationRecorded(
      createValidationEvent(REQUEST_ALLOW, POLICY_ALLOW, 1, TX_ALLOW, 7, 100, TIMESTAMP),
    );

    const id = eventId(TX_ALLOW, 7);
    assert.entityCount("TeeMLValidation", 1);
    assert.fieldEquals("TeeMLValidation", id, "requestId", REQUEST_ALLOW);
    assert.fieldEquals("TeeMLValidation", id, "agentIdHash", AGENT);
    assert.fieldEquals("TeeMLValidation", id, "agenticIdTokenId", "102");
    assert.fieldEquals("TeeMLValidation", id, "safe", SAFE);
    assert.fieldEquals("TeeMLValidation", id, "policyHash", POLICY_ALLOW);
    assert.fieldEquals(
      "TeeMLValidation",
      id,
      "actionHash",
      "0x3333333333333333333333333333333333333333333333333333333333333333",
    );
    assert.fieldEquals(
      "TeeMLValidation",
      id,
      "semanticContextHash",
      "0x5555555555555555555555555555555555555555555555555555555555555555",
    );
    assert.fieldEquals(
      "TeeMLValidation",
      id,
      "teemlRequestHash",
      "0x6666666666666666666666666666666666666666666666666666666666666666",
    );
    assert.fieldEquals(
      "TeeMLValidation",
      id,
      "artifactHash",
      "0x7777777777777777777777777777777777777777777777777777777777777777",
    );
    assert.fieldEquals(
      "TeeMLValidation",
      id,
      "modelIdHash",
      "0x8888888888888888888888888888888888888888888888888888888888888888",
    );
    assert.fieldEquals("TeeMLValidation", id, "verdict", "ALLOW");
    assert.fieldEquals(
      "TeeMLValidation",
      id,
      "reasonCodeHash",
      "0x9999999999999999999999999999999999999999999999999999999999999999",
    );
    assert.fieldEquals("TeeMLValidation", id, "recorder", RECORDER);
    assert.fieldEquals("TeeMLValidation", id, "schemaVersion", "1");
    assert.fieldEquals("TeeMLValidation", id, "transactionHash", TX_ALLOW);
    assert.fieldEquals("TeeMLValidation", id, "blockNumber", "100");
    assert.fieldEquals("TeeMLValidation", id, "blockTimestamp", TIMESTAMP.toString());
    assert.fieldEquals("TeeMLValidation", id, "logIndex", "7");
    assert.fieldEquals("TeeMLValidation", id, "agent", AGENT);
    assert.fieldEquals("TeeMLValidation", id, "policy", POLICY_ALLOW);
    assert.fieldEquals("TeeMLValidation", id, "safeSummary", SAFE);

    assert.fieldEquals("AgentOnchainSummary", AGENT, "validationCount", "1");
    assert.fieldEquals("AgentOnchainSummary", AGENT, "allowCount", "1");
    assert.fieldEquals("AgentOnchainSummary", AGENT, "denyCount", "0");
    assert.fieldEquals("AgentOnchainSummary", AGENT, "policyCount", "1");
    assert.fieldEquals("PolicyReference", POLICY_ALLOW, "validationCount", "1");
    assert.fieldEquals("SafeOnchainSummary", SAFE, "validationCount", "1");
    assert.fieldEquals("DailyAgentMetric", dailyMetricId(TIMESTAMP), "allowCount", "1");
    assert.fieldEquals("HederaProtocolSummary", "global", "totalAgents", "1");
    assert.fieldEquals("HederaProtocolSummary", "global", "totalValidations", "1");
    assert.fieldEquals("HederaProtocolSummary", "global", "totalAllow", "1");
    assert.fieldEquals("HederaProtocolSummary", "global", "totalPolicies", "1");
    assert.dataSourceCount("SafeAccount", 1);
    assert.dataSourceExists("SafeAccount", SAFE);
  });

  test("indexes DENY and two distinct requests without collapsing event IDs", () => {
    handleTeeMLValidationRecorded(
      createValidationEvent(REQUEST_ALLOW, POLICY_ALLOW, 1, TX_ALLOW, 7, 100, TIMESTAMP),
    );
    handleTeeMLValidationRecorded(
      createValidationEvent(REQUEST_DENY, POLICY_DENY, 2, TX_DENY, 8, 101, TIMESTAMP + 10),
    );

    const denyId = eventId(TX_DENY, 8);
    assert.entityCount("TeeMLValidation", 2);
    assert.fieldEquals("TeeMLValidation", denyId, "requestId", REQUEST_DENY);
    assert.fieldEquals("TeeMLValidation", denyId, "verdict", "DENY");
    assert.fieldEquals("AgentOnchainSummary", AGENT, "validationCount", "2");
    assert.fieldEquals("AgentOnchainSummary", AGENT, "allowCount", "1");
    assert.fieldEquals("AgentOnchainSummary", AGENT, "denyCount", "1");
    assert.fieldEquals("AgentOnchainSummary", AGENT, "policyCount", "2");
    assert.fieldEquals("PolicyReference", POLICY_DENY, "denyCount", "1");
    assert.fieldEquals("DailyAgentMetric", dailyMetricId(TIMESTAMP), "validationCount", "2");
    assert.fieldEquals("DailyAgentMetric", dailyMetricId(TIMESTAMP), "denyCount", "1");
    assert.fieldEquals("HederaProtocolSummary", "global", "totalValidations", "2");
    assert.fieldEquals("HederaProtocolSummary", "global", "totalAllow", "1");
    assert.fieldEquals("HederaProtocolSummary", "global", "totalDeny", "1");
    assert.fieldEquals("HederaProtocolSummary", "global", "totalPolicies", "2");
    assert.dataSourceCount("SafeAccount", 1);
  });
});
