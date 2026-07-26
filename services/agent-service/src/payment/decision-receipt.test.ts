import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import {
  buildDecisionReceipt,
  recoverDecisionReceiptSigner,
  signDecisionReceipt,
  type DecisionReceiptInput,
} from "./decision-receipt.js";

const FEE_RECIPIENT = "0x03f197ABD7C8AcFecE274261cA20bee0E6BB3b5f" as const;

function baseInput(overrides: Partial<DecisionReceiptInput> = {}): DecisionReceiptInput {
  return {
    requestId: "req-1",
    agentId: "agent-1",
    walletId: "wallet-1",
    policyId: "pol_1",
    policyVersion: 1,
    policyHash: `0x${"11".repeat(32)}`,
    actionHash: `0x${"22".repeat(32)}`,
    actionType: "HEDERA_HBAR_TRANSFER",
    destination: { kind: "HEDERA_ACCOUNT_ID", value: "0.0.98765" },
    assetId: "hedera:testnet:hbar",
    amount: "10000000000",
    teemlVerificationId: "verification-1",
    teemlRequestHash: `0x${"33".repeat(32)}`,
    semanticContextHash: `0x${"44".repeat(32)}`,
    reasonCode: "SEMANTIC_POLICY_MATCH",
    decidedAt: 1_800_000_000,
    ...overrides,
  };
}

describe("buildDecisionReceipt", () => {
  it("computes the execution fee for the native HBAR asset", () => {
    const receipt = buildDecisionReceipt(baseInput(), FEE_RECIPIENT);
    assert.equal(receipt.feeAmount, "100000000");
    assert.equal(receipt.feeRecipientAddress, FEE_RECIPIENT);
    assert.equal(receipt.verdict, "ALLOW");
  });

  it("rejects a non-HBAR asset", () => {
    assert.throws(() =>
      buildDecisionReceipt(baseInput({ assetId: "hedera:testnet:some-token" }), FEE_RECIPIENT),
    );
  });
});

describe("decision receipt signing", () => {
  it("recovers the exact signer address from a valid signature", async () => {
    const privateKey = generatePrivateKey();
    const account = privateKeyToAccount(privateKey);
    const receipt = buildDecisionReceipt(baseInput(), FEE_RECIPIENT);

    const { signerAddress, signature } = await signDecisionReceipt(receipt, privateKey);
    assert.equal(signerAddress, account.address);

    const recovered = await recoverDecisionReceiptSigner(receipt, signature);
    assert.equal(recovered.toLowerCase(), account.address.toLowerCase());
  });

  it("fails to recover the correct signer when the receipt is tampered with", async () => {
    const privateKey = generatePrivateKey();
    const account = privateKeyToAccount(privateKey);
    const receipt = buildDecisionReceipt(baseInput(), FEE_RECIPIENT);
    const { signature } = await signDecisionReceipt(receipt, privateKey);

    const tampered = { ...receipt, amount: "999999999999" };
    const recovered = await recoverDecisionReceiptSigner(tampered, signature);
    assert.notEqual(recovered.toLowerCase(), account.address.toLowerCase());
  });
});
