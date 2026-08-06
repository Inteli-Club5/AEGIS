#!/usr/bin/env node
// CLI smoke test for the AEGIS action pipeline (precheck -> TeeML verify -> execute),
// driven straight through the same Next.js API routes the dashboard calls, using the
// same EIP-712 "AgentActionAuthorization" scheme as the browser
// (packages/nextjs/lib/policy/action-auth.ts). This lets you exercise a real agent's
// policy gate from the terminal instead of clicking through the UI.
//
// Usage:
//   AEGIS_PRIVATE_KEY=0x... AEGIS_AGENT_ID=<agentId> node scripts/aegis-test-action.mjs pass
//   AEGIS_PRIVATE_KEY=0x... AEGIS_AGENT_ID=<agentId> node scripts/aegis-test-action.mjs fail
//
// AEGIS_PRIVATE_KEY must be the private key of the operator wallet that owns the agent
// (the wallet connected in the dashboard when the agent was created/protected).
//
// Env vars:
//   AEGIS_PRIVATE_KEY   required. Operator wallet private key (0x-prefixed).
//   AEGIS_AGENT_ID       required. The agent's id, from the dashboard.
//   AEGIS_BASE_URL       optional. Default http://localhost:3000 (the Next.js dev server).
//   AEGIS_WALLET_ID      optional. Auto-resolved from the agent if omitted.
//   AEGIS_DESTINATION    optional. EVM address to pay. Defaults to the operator's own
//                        address (so you can see the transfer land back on an address
//                        you already control on Hashscan).
//   AEGIS_AMOUNT         optional. Base units (tinybar, 8 decimals). Default 100000000 (1 HBAR).
//   AEGIS_SERVICE_ID      optional. Only relevant if the active policy has a trusted
//   AEGIS_PRODUCT_ID      service configured -- required to get a TeeML ALLOW verdict.
//
// "pass" sets the action deadline 1 hour in the future; "fail" sets it 1 hour in the
// past, which the deterministic policy evaluator always denies with
// ACTION_DEADLINE_EXPIRED regardless of the policy's other rules -- so it works even
// against a completely empty/simple policy.
import { keccak256, stringToHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const mode = process.argv[2];
if (mode !== "pass" && mode !== "fail") {
  console.error("Usage: node aegis-test-action.mjs <pass|fail>");
  process.exit(1);
}

const BASE_URL = process.env.AEGIS_BASE_URL ?? "http://localhost:3000";
const PRIVATE_KEY = requireEnv("AEGIS_PRIVATE_KEY");
const AGENT_ID = requireEnv("AEGIS_AGENT_ID");
const AMOUNT = process.env.AEGIS_AMOUNT ?? "100000000";
const SERVICE_ID = process.env.AEGIS_SERVICE_ID ?? "demo-service";
const PRODUCT_ID = process.env.AEGIS_PRODUCT_ID;

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required env var ${name}`);
    process.exit(1);
  }
  return value;
}

// --- exact mirror of packages/nextjs/lib/policy/hash.ts stableStringify ---
// Must stay byte-for-byte identical to the client/server copy, or the signed
// contextHash won't match what the Next.js route recomputes from the request body.
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

function hashActionContext(payload) {
  return keccak256(stringToHex(stableStringify(payload ?? {})));
}

// --- exact mirror of packages/nextjs/lib/policy/action-auth.ts ---
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

const account = privateKeyToAccount(PRIVATE_KEY);
const operatorAddress = account.address;

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

function log(title, payload) {
  console.log(`\n=== ${title} ===`);
  console.log(JSON.stringify(payload, null, 2));
}

async function main() {
  console.log(`Operator address (derived from AEGIS_PRIVATE_KEY): ${operatorAddress}`);
  console.log(`Agent: ${AGENT_ID}`);
  console.log(`Mode: ${mode}`);

  const agentResp = await call(`/api/agent-service/agents/${encodeURIComponent(AGENT_ID)}`);
  if (!agentResp.ok) {
    log("FAILED to fetch agent", agentResp.data);
    process.exit(1);
  }
  const walletId = process.env.AEGIS_WALLET_ID ?? agentResp.data?.wallet?.walletId;
  if (!walletId) {
    console.error("Could not resolve walletId from the agent. Pass AEGIS_WALLET_ID explicitly.");
    process.exit(1);
  }
  console.log(`Wallet: ${walletId}`);

  const destination = process.env.AEGIS_DESTINATION ?? operatorAddress;
  const now = Math.floor(Date.now() / 1000);
  const actionDeadline = mode === "pass" ? now + 3600 : now - 3600;

  const precheckBody = {
    actionType: "HEDERA_HBAR_TRANSFER",
    destination: { kind: "EVM_ADDRESS", value: destination, chainId: 296 },
    assetId: "hedera:testnet:hbar",
    amount: AMOUNT,
    actionDeadline,
  };

  const precheckHeaders = await authorizeAgentAction(AGENT_ID, "PRECHECK", hashActionContext(precheckBody));
  const idempotencyKey = `cli-${mode}-${now}-${Math.random().toString(36).slice(2)}`;
  const precheck = await call(
    `/api/agent-service/agents/${encodeURIComponent(AGENT_ID)}/wallets/${encodeURIComponent(walletId)}/actions/precheck`,
    { method: "POST", body: precheckBody, headers: { ...precheckHeaders, "Idempotency-Key": idempotencyKey } },
  );
  log("PRECHECK", precheck.data);

  if (precheck.data?.status === "DENY_PRECHECK") {
    console.log(
      mode === "fail"
        ? "\nExpected: the policy gate denied this action at precheck (code: " + precheck.data.code + ")."
        : "\nThis action was denied but mode=pass expected it to succeed. Check the active policy's rules " +
            "(destinations/amount/action type) for this agent -- code: " +
            precheck.data.code,
    );
    return;
  }
  if (!precheck.ok || precheck.data?.status !== "PENDING_TEEML") {
    console.log("\nUnexpected precheck response, stopping.");
    return;
  }

  console.log("\nPrecheck passed the policy gate (PASS_TO_TEEML). Continuing to TeeML verify...");

  const requestId = precheck.data.requestId;
  const teemlBody = { serviceId: SERVICE_ID, ...(PRODUCT_ID ? { productId: PRODUCT_ID } : {}) };
  const teemlHeaders = await authorizeAgentAction(
    AGENT_ID,
    "TEEML_VERIFY",
    hashActionContext({ requestId, serviceId: SERVICE_ID, productId: PRODUCT_ID ?? null }),
  );
  const teeml = await call(
    `/api/agent-service/actions/${encodeURIComponent(requestId)}/teeml/verify?agentId=${encodeURIComponent(AGENT_ID)}`,
    { method: "POST", body: teemlBody, headers: teemlHeaders },
  );
  log("TEEML VERIFY", teeml.data);

  if (!teeml.ok || teeml.data?.verdict !== "ALLOW") {
    console.log(
      "\nTeeML did not return ALLOW. If this policy has no trusted service configured (a destination plus a " +
        "matching serviceId), this is expected: running an action through TeeML verify requires the active " +
        "policy to name exactly one trusted service. Set AEGIS_SERVICE_ID (and add that destination + service " +
        "to the policy) to reach execute.",
    );
    return;
  }

  console.log("\nTeeML allowed. Executing the real Safe payment on Hedera testnet...");
  const executeHeaders = await authorizeAgentAction(AGENT_ID, "EXECUTE", hashActionContext({ requestId }));
  const execute = await call(
    `/api/agent-service/actions/${encodeURIComponent(requestId)}/execute?agentId=${encodeURIComponent(AGENT_ID)}`,
    { method: "POST", headers: executeHeaders },
  );
  log("EXECUTE", execute.data);
  console.log(execute.ok ? `\nExecuted. Transaction hash: ${execute.data.transactionHash}` : "\nExecute failed.");
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
