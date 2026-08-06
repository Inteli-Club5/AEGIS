#!/usr/bin/env node
// Finishes onboarding for an already-created agent purely from the CLI: creates its
// protected wallet, then creates+activates an empty/simple Level 1 policy (HBAR, no
// destination allowlist, no amount/count limits). Signs the two required EIP-712
// PolicyCommitment operations (packages/nextjs/lib/policy/hash.ts) with the operator
// private key -- same signature scheme the dashboard's onboarding wizard uses via
// the connected wallet.
//
// Usage:
//   AEGIS_PRIVATE_KEY=0x... AEGIS_AGENT_ID=<agentId> node scripts/aegis-protect-agent.mjs
import { keccak256, stringToHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const BASE_URL = process.env.AEGIS_BASE_URL ?? "http://localhost:3000";
const PRIVATE_KEY = requireEnv("AEGIS_PRIVATE_KEY");
const AGENT_ID = requireEnv("AEGIS_AGENT_ID");

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required env var ${name}`);
    process.exit(1);
  }
  return value;
}

// --- exact mirror of packages/nextjs/lib/policy/hash.ts ---
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
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean")
    return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(item => stringifyCanonical(item)).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map(key => `${JSON.stringify(key)}:${stringifyCanonical(value[key])}`)
    .join(",")}}`;
}

function stableStringify(value) {
  return stringifyCanonical(toCanonicalValue(value, "value"));
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

async function signCommitment(operation, params) {
  const commitment = buildPolicyCommitment({ operatorAddress, ...params, operation });
  return account.signTypedData({
    domain: POLICY_COMMITMENT_DOMAIN,
    types: POLICY_COMMITMENT_TYPES,
    primaryType: "PolicyCommitment",
    message: commitment,
  });
}

async function call(path, { method = "GET", body, headers = {} } = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${method} ${path} -> ${response.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

async function main() {
  console.log(`Operator address: ${operatorAddress}`);
  console.log(`Agent: ${AGENT_ID}`);

  console.log("\nCreating protected wallet...");
  const wallet = await call(`/api/agent-service/agents/${encodeURIComponent(AGENT_ID)}/wallet`, {
    method: "POST",
    body: {},
  });
  console.log(`Wallet: ${wallet.walletId} (Safe ${wallet.safeAddress})`);

  const rules = {
    allowedActionTypes: ["HEDERA_HBAR_TRANSFER"],
    allowedDestinations: [],
    allowedAssets: [{ kind: "NATIVE", chainId: HEDERA_TESTNET_CHAIN_ID, assetId: "hbar", decimals: 8 }],
    amount: { min: null, max: null, dailyLimit: null },
    actionCount: { dailyLimit: null },
  };
  const semanticRules = [];
  const validFrom = Math.floor(Date.now() / 1000);
  const validUntil = null;
  const policyVersion = 1;
  const policyHash = computePolicyHash({
    agentId: AGENT_ID,
    walletId: wallet.walletId,
    policyVersion,
    validFrom,
    validUntil,
    rules,
    semanticRules,
  });
  const policyId = createPolicyIdFromHash(policyHash);

  console.log(`\nCreating empty/simple policy ${policyId}...`);
  const createSignature = await signCommitment("CREATE_POLICY", {
    agentId: AGENT_ID,
    walletId: wallet.walletId,
    policyId,
    sourcePolicyId: undefined,
    policyVersion,
    policyHash,
    validFrom,
    validUntil,
  });
  const { policy } = await call("/api/agent-service/policies", {
    method: "POST",
    body: { agentId: AGENT_ID, walletId: wallet.walletId, validFrom, validUntil, rules, semanticRules },
    headers: { "x-aegis-operator-address": operatorAddress, "x-aegis-operator-signature": createSignature },
  });
  console.log(`Policy created: ${policy.policyId} v${policy.policyVersion} (${policy.status})`);

  console.log("\nActivating policy...");
  const activateSignature = await signCommitment("ACTIVATE_POLICY", {
    agentId: policy.agentId,
    walletId: policy.walletId,
    policyId: policy.policyId,
    sourcePolicyId: undefined,
    policyVersion: policy.policyVersion,
    policyHash: policy.policyHash,
    validFrom: policy.validFrom,
    validUntil: policy.validUntil,
  });
  const { policy: activePolicy } = await call(
    `/api/agent-service/policies/${encodeURIComponent(policy.policyId)}/activate`,
    {
      method: "POST",
      body: { expectedPolicyVersion: policy.policyVersion, expectedPolicyHash: policy.policyHash },
      headers: { "x-aegis-operator-address": operatorAddress, "x-aegis-operator-signature": activateSignature },
    },
  );
  console.log(`Policy status: ${activePolicy.status}`);
  console.log("\nDone. This agent is now protected with an empty/simple policy.");
}

main().catch(error => {
  console.error("\nFAILED:", error.message);
  process.exit(1);
});
