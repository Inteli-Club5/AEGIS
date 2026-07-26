import {
  AGENT_ACTION_AUTH_DOMAIN,
  AGENT_ACTION_AUTH_TYPES,
  buildAgentActionAuthorization,
  hashActionContext,
  recoverAgentActionSigner,
  verifySignedAgentAction,
} from "./action-auth.ts";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

async function signHeaders(
  account: ReturnType<typeof privateKeyToAccount>,
  input: { agentId: string; contextHash: `0x${string}`; issuedAt: number },
  operatorAddress: string = account.address,
) {
  const message = buildAgentActionAuthorization({
    agentId: input.agentId,
    operatorAddress: account.address as `0x${string}`,
    action: "PRECHECK",
    contextHash: input.contextHash,
    issuedAt: input.issuedAt,
  });
  const signature = await account.signTypedData({
    domain: AGENT_ACTION_AUTH_DOMAIN,
    types: AGENT_ACTION_AUTH_TYPES,
    primaryType: "AgentActionAuthorization",
    message,
  });
  return { operatorAddress, signature, issuedAt: String(input.issuedAt) };
}

describe("agent action authorization", () => {
  it("recovers the exact signer address that signed the message", async () => {
    const account = privateKeyToAccount(generatePrivateKey());
    const message = buildAgentActionAuthorization({
      agentId: "agent-1",
      operatorAddress: account.address as `0x${string}`,
      action: "PRECHECK",
      contextHash: hashActionContext({ amount: "100" }),
      issuedAt: 1_800_000_000,
    });
    const signature = await account.signTypedData({
      domain: AGENT_ACTION_AUTH_DOMAIN,
      types: AGENT_ACTION_AUTH_TYPES,
      primaryType: "AgentActionAuthorization",
      message,
    });

    const recovered = await recoverAgentActionSigner(message, signature);
    assert.equal(recovered.toLowerCase(), account.address.toLowerCase());
  });

  it("recovers a different address when any bound field changes", async () => {
    const account = privateKeyToAccount(generatePrivateKey());
    const other = privateKeyToAccount(generatePrivateKey());
    const message = buildAgentActionAuthorization({
      agentId: "agent-1",
      operatorAddress: account.address as `0x${string}`,
      action: "EXECUTE",
      contextHash: hashActionContext({ requestId: "req-1" }),
      issuedAt: 1_800_000_000,
    });
    const signature = await account.signTypedData({
      domain: AGENT_ACTION_AUTH_DOMAIN,
      types: AGENT_ACTION_AUTH_TYPES,
      primaryType: "AgentActionAuthorization",
      message,
    });

    const tamperedAgentId = { ...message, agentId: "agent-2" };
    const recoveredForTamperedAgentId = await recoverAgentActionSigner(tamperedAgentId, signature);
    assert.notEqual(recoveredForTamperedAgentId.toLowerCase(), account.address.toLowerCase());

    const tamperedContext = { ...message, contextHash: hashActionContext({ requestId: "req-2" }) };
    const recoveredForTamperedContext = await recoverAgentActionSigner(tamperedContext, signature);
    assert.notEqual(recoveredForTamperedContext.toLowerCase(), account.address.toLowerCase());

    assert.notEqual(other.address.toLowerCase(), account.address.toLowerCase());
  });

  it("hashes context deterministically regardless of key order", () => {
    const a = hashActionContext({ requestId: "r1", serviceId: "svc", productId: null });
    const b = hashActionContext({ productId: null, requestId: "r1", serviceId: "svc" });
    assert.equal(a, b);
  });

  it("hashes different contexts to different values", () => {
    const a = hashActionContext({ requestId: "r1" });
    const b = hashActionContext({ requestId: "r2" });
    assert.notEqual(a, b);
  });

  it("lowercases agentId and operatorAddress when building the message", () => {
    const message = buildAgentActionAuthorization({
      agentId: "Agent-Mixed-Case",
      operatorAddress: "0xABCDEF0000000000000000000000000000000001" as `0x${string}`,
      action: "REGISTER_AGENTIC_ID",
      contextHash: hashActionContext({}),
      issuedAt: 1_800_000_000,
    });
    assert.equal(message.agentId, "agent-mixed-case");
    assert.equal(message.operatorAddress, "0xabcdef0000000000000000000000000000000001");
  });
});

describe("verifySignedAgentAction", () => {
  const AGENT_ID = "agent-1";
  const NOW = 1_800_000_000;

  it("rejects missing headers", async () => {
    const result = await verifySignedAgentAction(
      { operatorAddress: null, signature: null, issuedAt: null },
      { agentId: AGENT_ID, action: "PRECHECK", contextHash: hashActionContext({}) },
      NOW,
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "missing_operator_authorization");
  });

  it("rejects a malformed address or signature", async () => {
    const result = await verifySignedAgentAction(
      { operatorAddress: "not-an-address", signature: "0xdeadbeef", issuedAt: String(NOW) },
      { agentId: AGENT_ID, action: "PRECHECK", contextHash: hashActionContext({}) },
      NOW,
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "invalid_operator_authorization");
  });

  it("accepts a fresh, genuinely signed authorization for the exact context", async () => {
    const account = privateKeyToAccount(generatePrivateKey());
    const contextHash = hashActionContext({ amount: "100" });
    const headers = await signHeaders(account, { agentId: AGENT_ID, contextHash, issuedAt: NOW });

    const result = await verifySignedAgentAction(headers, { agentId: AGENT_ID, action: "PRECHECK", contextHash }, NOW);
    assert.deepEqual(result, { ok: true, operatorAddress: account.address as `0x${string}` });
  });

  it("rejects a signature that is too old", async () => {
    const account = privateKeyToAccount(generatePrivateKey());
    const contextHash = hashActionContext({});
    const headers = await signHeaders(account, { agentId: AGENT_ID, contextHash, issuedAt: NOW - 10_000 });

    const result = await verifySignedAgentAction(headers, { agentId: AGENT_ID, action: "PRECHECK", contextHash }, NOW);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "operator_authorization_expired");
  });

  it("rejects a signature issued too far in the future", async () => {
    const account = privateKeyToAccount(generatePrivateKey());
    const contextHash = hashActionContext({});
    const headers = await signHeaders(account, { agentId: AGENT_ID, contextHash, issuedAt: NOW + 10_000 });

    const result = await verifySignedAgentAction(headers, { agentId: AGENT_ID, action: "PRECHECK", contextHash }, NOW);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "operator_authorization_expired");
  });

  it("rejects when the verifier's expected contextHash differs from what was signed", async () => {
    const account = privateKeyToAccount(generatePrivateKey());
    const headers = await signHeaders(account, {
      agentId: AGENT_ID,
      contextHash: hashActionContext({ amount: "1" }),
      issuedAt: NOW,
    });

    const result = await verifySignedAgentAction(
      headers,
      { agentId: AGENT_ID, action: "PRECHECK", contextHash: hashActionContext({ amount: "2" }) },
      NOW,
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "invalid_operator_authorization");
  });

  it("rejects when the verifier's expected agentId differs from what was signed", async () => {
    const account = privateKeyToAccount(generatePrivateKey());
    const contextHash = hashActionContext({});
    const headers = await signHeaders(account, { agentId: AGENT_ID, contextHash, issuedAt: NOW });

    const result = await verifySignedAgentAction(
      headers,
      { agentId: "someone-elses-agent", action: "PRECHECK", contextHash },
      NOW,
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "invalid_operator_authorization");
  });

  it("rejects a header address that does not match the true signer (spoofed identity)", async () => {
    const account = privateKeyToAccount(generatePrivateKey());
    const impersonated = privateKeyToAccount(generatePrivateKey());
    const contextHash = hashActionContext({});
    const headers = await signHeaders(account, { agentId: AGENT_ID, contextHash, issuedAt: NOW }, impersonated.address);

    const result = await verifySignedAgentAction(headers, { agentId: AGENT_ID, action: "PRECHECK", contextHash }, NOW);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "invalid_operator_authorization");
  });
});
