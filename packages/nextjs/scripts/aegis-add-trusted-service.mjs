#!/usr/bin/env node
// Upgrades an already-protected agent's policy to v2: registers its 0G Agentic ID
// (required for TeeML to have agent capabilityIds) and adds one trusted-service
// semantic rule + a matching destination allowlist entry, so TeeML verify can reach
// a real ALLOW verdict and execute() can send a real Safe payment on Hedera testnet.
//
// Usage:
//   AEGIS_PRIVATE_KEY=0x... AEGIS_AGENT_ID=<agentId> node scripts/aegis-add-trusted-service.mjs

import { keccak256, stringToHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const BASE_URL = process.env.AEGIS_BASE_URL ?? "http://localhost:3000";
const PRIVATE_KEY = requireEnv("AEGIS_PRIVATE_KEY");
const AGENT_ID = requireEnv("AEGIS_AGENT_ID");
const SERVICE_ID = process.env.AEGIS_SERVICE_ID ?? "demo-service";
const PROVIDER_ID = process.env.AEGIS_PROVIDER_ID ?? "cli-test-provider";

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required env var ${name}`);
    process.exit(1);
  }
  return value;
}

function toCanonicalValue(value, path) {
  if (value === null) return null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`${path} must be a finite JSON number`);
    return value;
  }
  if (Array.isArray(value)) return value.map((item, index) => toCanonicalValue(item, `${path}[${index}]`));
  if (typeof value === "object") {
    const normalized = {};
    for (const key of Object.keys(value).sort()) {
      const child = value[key];
      if (child !== undefined) normalized[key] = toCanonicalValue(child, `${path}.${key}`);
    }
    return normalized;
  }
  throw new Error(`${path} contains a non-JSON value`);
}

function stringifyCanonical(value) {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(item => stringifyCanonical(item)).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map(key => `${JSON.stringify(key)}:${stringifyCanonical(value[key])}`)
    .join(",")}}`;
}

function stableStringify(value) {
  return stringifyCanonical(toCanonicalValue(value, "value"));
}

function hashActionContext(payload) {
  return keccak256(stringToHex(stableStringify(payload ?? {})));
}

function computeTrustedServiceMetadataHash(input) {
  return keccak256(stringToHex(stableStringify(input)));
}

const POLICY_HASH_SCHEMA = "aegis.policy.level1.v1";
const OPERATOR_MESSAGE_SCHEMA = "aegis.policy.commitment.v1";
const NETWORK_ID = "hedera:testnet";
const HEDERA_TESTNET_CHAIN_ID = 296;

function computePolicyHash(input) {
  const hashInput = {
    schema: POLICY_HASH_SCHEMA,
    agentId: input.agentId.trim().toLowerCase(),
    walletId: input.walletId.trim().toLowerCase(),
    policyVersion: input.policyVersion,
    validFrom: input.validFrom,
    validUntil: input.validUntil,
    rules: input.rules,
    semanticRules: input.semanticRules,
  };
  return keccak256(stringToHex(stableStringify(hashInput)));
}

function createPolicyIdFromHash(policyHash) {
  return `pol_${policyHash.slice(2, 34)}`.toLowerCase();
}

const POLICY_COMMITMENT_DOMAIN = { name: "AEGIS Policy Engine", version: "1", chainId: HEDERA_TESTNET_CHAIN_ID };
const POLICY_COMMITMENT_TYPES = {
  PolicyCommitment: [
    { name: "schema", type: "string" },
    { name: "operation", type: "string" },
    { name: "networkId", type: "string" },
    { name: "operatorAddress", type: "address" },
    { name: "agentId", type: "string" },
    { name: "walletId", type: "string" },
    { name: "policyId", type: "string" },
    { name: "sourcePolicyId", type: "string" },
    { name: "policyVersion", type: "uint256" },
    { name: "policyHash", type: "bytes32" },
    { name: "validFrom", type: "uint256" },
    { name: "validUntil", type: "uint256" },
    { name: "hasValidUntil", type: "bool" },
  ],
};

const AGENT_ACTION_AUTH_SCHEMA = "aegis.agent-action.v1";
const AGENT_ACTION_AUTH_DOMAIN = { name: "AEGIS Agent Action", version: "1", chainId: 296 };
const AGENT_ACTION_AUTH_TYPES = {
  AgentActionAuthorization: [
    { name: "schema", type: "string" },
    { name: "agentId", type: "string" },
    { name: "operatorAddress", type: "address" },
    { name: "action", type: "string" },
    { name: "contextHash", type: "bytes32" },
    { name: "issuedAt", type: "uint256" },
  ],
};

function buildPolicyCommitment(input) {
  return {
    schema: OPERATOR_MESSAGE_SCHEMA,
    operation: input.operation,
    networkId: NETWORK_ID,
    operatorAddress: input.operatorAddress,
    agentId: input.agentId.toLowerCase(),
    walletId: input.walletId.toLowerCase(),
    policyId: input.policyId.toLowerCase(),
    sourcePolicyId: input.sourcePolicyId?.toLowerCase() ?? "",
    policyVersion: BigInt(input.policyVersion),
    policyHash: input.policyHash,
    validFrom: BigInt(input.validFrom),
    validUntil: BigInt(input.validUntil ?? 0),
    hasValidUntil: input.validUntil !== null,
  };
}

const account = privateKeyToAccount(PRIVATE_KEY);
const operatorAddress = account.address;

async function signPolicyCommitment(operation, params) {
  const commitment = buildPolicyCommitment({ operatorAddress, ...params, operation });
  return account.signTypedData({
    domain: POLICY_COMMITMENT_DOMAIN,
    types: POLICY_COMMITMENT_TYPES,
    primaryType: "PolicyCommitment",
    message: commitment,
  });
}

async function authorizeAgentAction(agentId, action, contextHash) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const message = {
    schema: AGENT_ACTION_AUTH_SCHEMA,
    agentId: agentId.trim().toLowerCase(),
    operatorAddress: operatorAddress.toLowerCase(),
    action,
    contextHash,
    issuedAt: BigInt(issuedAt),
  };
  const signature = await account.signTypedData({
    domain: AGENT_ACTION_AUTH_DOMAIN,
    types: AGENT_ACTION_AUTH_TYPES,
    primaryType: "AgentActionAuthorization",
    message,
  });
  return {
    "x-aegis-operator-address": operatorAddress,
    "x-aegis-operator-signature": signature,
    "x-aegis-operator-issued-at": String(issuedAt),
  };
}

async function call(path, { method = "GET", body, headers = {} } = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, data };
}

async function main() {
  console.log(`Operator address: ${operatorAddress}`);
  console.log(`Agent: ${AGENT_ID}`);

  console.log("\nRegistering 0G Agentic ID...");
  const registerHeaders = await authorizeAgentAction(AGENT_ID, "REGISTER_AGENTIC_ID", hashActionContext({}));
  const registered = await call(`/api/agent-service/agents/${encodeURIComponent(AGENT_ID)}/register-agentic-id`, {
    method: "POST",
    headers: registerHeaders,
  });
  if (!registered.ok) {
    console.log(`Register response (${registered.status}):`, JSON.stringify(registered.data));
    console.log("Continuing -- this may just mean it's already registered.");
  } else {
    console.log("Agentic ID registered:", JSON.stringify(registered.data.agenticId ?? registered.data));
  }

  const agentResp = await call(`/api/agent-service/agents/${encodeURIComponent(AGENT_ID)}`);
  const walletId = agentResp.data?.wallet?.walletId;
  if (!walletId) throw new Error("Agent has no protected wallet yet -- run aegis-protect-agent.mjs first.");

  const activeResp = await call(
    `/api/agent-service/agents/${encodeURIComponent(AGENT_ID)}/wallets/${encodeURIComponent(walletId)}/policies/active`,
  );
  const current = activeResp.data?.policy;
  if (!current) throw new Error("Agent has no active policy yet -- run aegis-protect-agent.mjs first.");
  console.log(`\nCurrent active policy: ${current.policyId} v${current.policyVersion}`);

  const destinationValue = operatorAddress.toLowerCase();
  const metadataHash = computeTrustedServiceMetadataHash({ providerId: PROVIDER_ID, serviceId: SERVICE_ID });
  const descriptor = {
    schemaVersion: "1.0",
    providerId: PROVIDER_ID,
    serviceId: SERVICE_ID,
    networkId: NETWORK_ID,
    destinationIds: [destinationValue],
    categoryIds: ["test"],
    capabilityIds: ["transfer_hbar_tool"],
    metadataHash,
  };
  const semanticRules = [
    { ruleId: `trusted-service:${SERVICE_ID}`, kind: "TRUSTED_SERVICE_DESCRIPTOR_V1", params: descriptor },
  ];
  const rules = {
    allowedActionTypes: current.rules.allowedActionTypes,
    allowedDestinations: [{ kind: "EVM_ADDRESS", value: destinationValue, chainId: HEDERA_TESTNET_CHAIN_ID }],
    allowedAssets: current.rules.allowedAssets,
    amount: current.rules.amount,
    actionCount: current.rules.actionCount,
  };
  const validFrom = current.validFrom;
  const validUntil = current.validUntil;
  const policyVersion = current.policyVersion + 1;
  const policyHash = computePolicyHash({
    agentId: AGENT_ID,
    walletId,
    policyVersion,
    validFrom,
    validUntil,
    rules,
    semanticRules,
  });
  const policyId = createPolicyIdFromHash(policyHash);

  console.log(`\nUpdating to v${policyVersion} (${policyId}) with a trusted service + destination allowlist...`);
  const updateSignature = await signPolicyCommitment("UPDATE_POLICY", {
    agentId: AGENT_ID,
    walletId,
    policyId,
    sourcePolicyId: current.policyId,
    policyVersion,
    policyHash,
    validFrom,
    validUntil,
  });
  const updateResp = await call(`/api/agent-service/policies/${encodeURIComponent(current.policyId)}`, {
    method: "PATCH",
    body: { expectedPolicyVersion: current.policyVersion, validFrom, validUntil, rules, semanticRules },
    headers: { "x-aegis-operator-address": operatorAddress, "x-aegis-operator-signature": updateSignature },
  });
  if (!updateResp.ok) throw new Error(`PATCH policy failed (${updateResp.status}): ${JSON.stringify(updateResp.data)}`);
  const updated = updateResp.data.policy;
  console.log(`Created ${updated.policyId} v${updated.policyVersion} (${updated.status})`);

  console.log("\nActivating...");
  const activateSignature = await signPolicyCommitment("ACTIVATE_POLICY", {
    agentId: updated.agentId,
    walletId: updated.walletId,
    policyId: updated.policyId,
    sourcePolicyId: undefined,
    policyVersion: updated.policyVersion,
    policyHash: updated.policyHash,
    validFrom: updated.validFrom,
    validUntil: updated.validUntil,
  });
  const activateResp = await call(`/api/agent-service/policies/${encodeURIComponent(updated.policyId)}/activate`, {
    method: "POST",
    body: { expectedPolicyVersion: updated.policyVersion, expectedPolicyHash: updated.policyHash },
    headers: { "x-aegis-operator-address": operatorAddress, "x-aegis-operator-signature": activateSignature },
  });
  if (!activateResp.ok) throw new Error(`Activate failed (${activateResp.status}): ${JSON.stringify(activateResp.data)}`);
  console.log(`Policy status: ${activateResp.data.policy.status}`);
  console.log(`\nDone. Run the pass scenario now with AEGIS_SERVICE_ID=${SERVICE_ID} (already the script default).`);
}

main().catch(error => {
  console.error("\nFAILED:", error.message);
  process.exit(1);
});
