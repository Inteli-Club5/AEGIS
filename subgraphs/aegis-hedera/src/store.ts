import { BigInt, Bytes } from "@graphprotocol/graph-ts";
import {
  AgentOnchainSummary,
  AgentPolicyReference,
  DailyAgentMetric,
  HederaProtocolSummary,
  PolicyReference,
  SafeOnchainSummary,
} from "../generated/schema";

const DAY_SECONDS = BigInt.fromI32(86_400);
const PROTOCOL_ID = "global";

export function eventId(transactionHash: Bytes, logIndex: BigInt): Bytes {
  return transactionHash.concatI32(logIndex.toI32());
}

export function getOrCreateProtocol(timestamp: BigInt): HederaProtocolSummary {
  let protocol = HederaProtocolSummary.load(PROTOCOL_ID);
  if (protocol == null) {
    protocol = new HederaProtocolSummary(PROTOCOL_ID);
    protocol.totalAgents = BigInt.zero();
    protocol.totalValidations = BigInt.zero();
    protocol.totalAllow = BigInt.zero();
    protocol.totalDeny = BigInt.zero();
    protocol.totalExecutions = BigInt.zero();
    protocol.totalExecutionSuccess = BigInt.zero();
    protocol.totalExecutionFailure = BigInt.zero();
    protocol.totalPolicies = BigInt.zero();
    protocol.firstActivityAt = timestamp;
  }
  protocol.lastActivityAt = timestamp;
  return protocol;
}

export function getOrCreateAgent(
  agentIdHash: Bytes,
  safe: Bytes,
  agenticIdTokenId: BigInt,
  timestamp: BigInt,
): AgentOnchainSummary {
  let agent = AgentOnchainSummary.load(agentIdHash);
  if (agent == null) {
    agent = new AgentOnchainSummary(agentIdHash);
    agent.agentIdHash = agentIdHash;
    agent.validationCount = BigInt.zero();
    agent.allowCount = BigInt.zero();
    agent.denyCount = BigInt.zero();
    agent.executionCount = BigInt.zero();
    agent.executionSuccessCount = BigInt.zero();
    agent.executionFailureCount = BigInt.zero();
    agent.policyCount = BigInt.zero();
    agent.firstActivityAt = timestamp;
  }
  agent.safe = safe;
  agent.agenticIdTokenId = agenticIdTokenId;
  agent.lastActivityAt = timestamp;
  return agent;
}

export function getOrCreateSafe(
  safe: Bytes,
  agentIdHash: Bytes,
  timestamp: BigInt,
): SafeOnchainSummary {
  let safeSummary = SafeOnchainSummary.load(safe);
  if (safeSummary == null) {
    safeSummary = new SafeOnchainSummary(safe);
    safeSummary.safe = safe;
    safeSummary.agentIdHash = agentIdHash;
    safeSummary.agent = agentIdHash;
    safeSummary.agentLinkConflict = false;
    safeSummary.validationCount = BigInt.zero();
    safeSummary.executionCount = BigInt.zero();
    safeSummary.executionSuccessCount = BigInt.zero();
    safeSummary.executionFailureCount = BigInt.zero();
    safeSummary.firstActivityAt = timestamp;
  } else if (!safeSummary.agentIdHash.equals(agentIdHash)) {
    safeSummary.agentLinkConflict = true;
  }
  safeSummary.lastActivityAt = timestamp;
  return safeSummary;
}

export function getOrCreatePolicy(policyHash: Bytes, timestamp: BigInt): PolicyReference {
  let policy = PolicyReference.load(policyHash);
  if (policy == null) {
    policy = new PolicyReference(policyHash);
    policy.policyHash = policyHash;
    policy.validationCount = BigInt.zero();
    policy.allowCount = BigInt.zero();
    policy.denyCount = BigInt.zero();
    policy.firstReferencedAt = timestamp;
  }
  policy.lastReferencedAt = timestamp;
  return policy;
}

export function getOrCreateAgentPolicy(
  agentIdHash: Bytes,
  policyHash: Bytes,
  timestamp: BigInt,
): AgentPolicyReference {
  const id = agentIdHash.concat(policyHash);
  let reference = AgentPolicyReference.load(id);
  if (reference == null) {
    reference = new AgentPolicyReference(id);
    reference.agentIdHash = agentIdHash;
    reference.policyHash = policyHash;
    reference.validationCount = BigInt.zero();
    reference.firstReferencedAt = timestamp;
    reference.agent = agentIdHash;
    reference.policy = policyHash;
  }
  reference.lastReferencedAt = timestamp;
  return reference;
}

export function getOrCreateDailyMetric(
  agentIdHash: Bytes,
  timestamp: BigInt,
): DailyAgentMetric {
  const day = timestamp.div(DAY_SECONDS).times(DAY_SECONDS);
  const id = agentIdHash.concatI32(day.toI32());
  let metric = DailyAgentMetric.load(id);
  if (metric == null) {
    metric = new DailyAgentMetric(id);
    metric.day = day;
    metric.agentIdHash = agentIdHash;
    metric.validationCount = BigInt.zero();
    metric.allowCount = BigInt.zero();
    metric.denyCount = BigInt.zero();
    metric.executionCount = BigInt.zero();
    metric.executionSuccessCount = BigInt.zero();
    metric.executionFailureCount = BigInt.zero();
    metric.agent = agentIdHash;
  }
  return metric;
}
