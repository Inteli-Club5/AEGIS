import { BigInt, DataSourceContext, log } from "@graphprotocol/graph-ts";
import { TeeMLValidationRecorded } from "../generated/AegisTeeValidationRegistry/AegisTeeValidationRegistry";
import { SafeAccount } from "../generated/templates";
import {
  AgentOnchainSummary,
  AgentPolicyReference,
  PolicyReference,
  SafeOnchainSummary,
  TeeMLValidation,
} from "../generated/schema";
import {
  eventId,
  getOrCreateAgent,
  getOrCreateAgentPolicy,
  getOrCreateDailyMetric,
  getOrCreatePolicy,
  getOrCreateProtocol,
  getOrCreateSafe,
} from "./store";

const VERDICT_ALLOW = 1;
const VERDICT_DENY = 2;

export function handleTeeMLValidationRecorded(event: TeeMLValidationRecorded): void {
  const isAllow = event.params.verdict == VERDICT_ALLOW;
  const isDeny = event.params.verdict == VERDICT_DENY;
  if (!isAllow && !isDeny) {
    log.error("Ignored TeeML validation with unsupported verdict code {} in transaction {}", [
      event.params.verdict.toString(),
      event.transaction.hash.toHexString(),
    ]);
    return;
  }

  const existingAgent = AgentOnchainSummary.load(event.params.agentIdHash);
  const existingPolicy = PolicyReference.load(event.params.policyHash);
  const existingSafe = SafeOnchainSummary.load(event.params.safe);
  const agentPolicyId = event.params.agentIdHash.concat(event.params.policyHash);
  const existingAgentPolicy = AgentPolicyReference.load(agentPolicyId);

  const agent = getOrCreateAgent(
    event.params.agentIdHash,
    event.params.safe,
    event.params.agenticIdTokenId,
    event.block.timestamp,
  );
  agent.validationCount = agent.validationCount.plus(BigInt.fromI32(1));
  if (isAllow) {
    agent.allowCount = agent.allowCount.plus(BigInt.fromI32(1));
  } else {
    agent.denyCount = agent.denyCount.plus(BigInt.fromI32(1));
  }
  if (existingAgentPolicy == null) {
    agent.policyCount = agent.policyCount.plus(BigInt.fromI32(1));
  }
  agent.save();

  const policy = getOrCreatePolicy(event.params.policyHash, event.block.timestamp);
  policy.validationCount = policy.validationCount.plus(BigInt.fromI32(1));
  if (isAllow) {
    policy.allowCount = policy.allowCount.plus(BigInt.fromI32(1));
  } else {
    policy.denyCount = policy.denyCount.plus(BigInt.fromI32(1));
  }
  policy.save();

  const agentPolicy = getOrCreateAgentPolicy(
    event.params.agentIdHash,
    event.params.policyHash,
    event.block.timestamp,
  );
  agentPolicy.validationCount = agentPolicy.validationCount.plus(BigInt.fromI32(1));
  agentPolicy.save();

  const safeSummary = getOrCreateSafe(
    event.params.safe,
    event.params.agentIdHash,
    event.block.timestamp,
  );
  safeSummary.validationCount = safeSummary.validationCount.plus(BigInt.fromI32(1));
  safeSummary.save();

  if (existingSafe == null) {
    const context = new DataSourceContext();
    context.setBytes("agentIdHash", event.params.agentIdHash);
    SafeAccount.createWithContext(event.params.safe, context);
  }

  const metric = getOrCreateDailyMetric(event.params.agentIdHash, event.block.timestamp);
  metric.validationCount = metric.validationCount.plus(BigInt.fromI32(1));
  if (isAllow) {
    metric.allowCount = metric.allowCount.plus(BigInt.fromI32(1));
  } else {
    metric.denyCount = metric.denyCount.plus(BigInt.fromI32(1));
  }
  metric.save();

  const protocol = getOrCreateProtocol(event.block.timestamp);
  if (existingAgent == null) {
    protocol.totalAgents = protocol.totalAgents.plus(BigInt.fromI32(1));
  }
  if (existingPolicy == null) {
    protocol.totalPolicies = protocol.totalPolicies.plus(BigInt.fromI32(1));
  }
  protocol.totalValidations = protocol.totalValidations.plus(BigInt.fromI32(1));
  if (isAllow) {
    protocol.totalAllow = protocol.totalAllow.plus(BigInt.fromI32(1));
  } else {
    protocol.totalDeny = protocol.totalDeny.plus(BigInt.fromI32(1));
  }
  protocol.save();

  const validation = new TeeMLValidation(eventId(event.transaction.hash, event.logIndex));
  validation.requestId = event.params.requestId;
  validation.agentIdHash = event.params.agentIdHash;
  validation.agenticIdTokenId = event.params.agenticIdTokenId;
  validation.safe = event.params.safe;
  validation.policyHash = event.params.policyHash;
  validation.actionHash = event.params.actionHash;
  validation.semanticContextHash = event.params.semanticContextHash;
  validation.teemlRequestHash = event.params.teemlRequestHash;
  validation.artifactHash = event.params.artifactHash;
  validation.modelIdHash = event.params.modelIdHash;
  validation.verdict = isAllow ? "ALLOW" : "DENY";
  validation.reasonCodeHash = event.params.reasonCodeHash;
  validation.recorder = event.params.recorder;
  validation.schemaVersion = event.params.schemaVersion;
  validation.transactionHash = event.transaction.hash;
  validation.blockNumber = event.block.number;
  validation.blockTimestamp = event.block.timestamp;
  validation.logIndex = event.logIndex;
  validation.agent = agent.id;
  validation.policy = policy.id;
  validation.safeSummary = safeSummary.id;
  validation.save();
}
