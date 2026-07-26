import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { encodeFunctionData } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import {
  assertPaymentCallMatchesReceipt,
  assertValidDecisionReceipt,
  CosignError,
  type CosignRequest,
} from "./cosign.js";
import {
  DECISION_RECEIPT_DOMAIN,
  DECISION_RECEIPT_TYPES,
  type DecisionReceipt,
} from "./decision-receipt.js";
import { CRYPTO_TRANSFER_ABI, HTS_PRECOMPILE_ADDRESS } from "./hts.js";

const FEE_RECIPIENT = "0x03f197ABD7C8AcFecE274261cA20bee0E6BB3b5f" as const;
const SAFE_ADDRESS = "0x997d955c1C67A7EdE37aaa1cB6E8bd76dc8FBACC" as const;
const NOW = 1_800_000_000;

function encodePaymentCall(
  transfers: readonly { accountID: `0x${string}`; amount: bigint }[],
) {
  const data = encodeFunctionData({
    abi: CRYPTO_TRANSFER_ABI,
    functionName: "cryptoTransfer",
    args: [
      {
        transfers: transfers.map(t => ({ ...t, isApproval: false })),
      },
      [],
    ],
  });
  return { to: HTS_PRECOMPILE_ADDRESS, value: "0", data } as const;
}

function baseReceipt(overrides: Partial<DecisionReceipt> = {}): DecisionReceipt {
  return {
    schemaVersion: "aegis.decision-receipt.v1",
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
    feeAmount: "100000000",
    feeRecipientAddress: FEE_RECIPIENT,
    teemlVerificationId: "verification-1",
    teemlRequestHash: `0x${"33".repeat(32)}`,
    semanticContextHash: `0x${"44".repeat(32)}`,
    verdict: "ALLOW",
    reasonCode: "SEMANTIC_POLICY_MATCH",
    decidedAt: NOW - 10,
    ...overrides,
  };
}

async function signReceipt(receipt: DecisionReceipt, privateKey: `0x${string}`) {
  const account = privateKeyToAccount(privateKey);
  return account.signTypedData({
    domain: DECISION_RECEIPT_DOMAIN,
    types: DECISION_RECEIPT_TYPES,
    primaryType: "DecisionReceipt",
    message: {
      schemaVersion: receipt.schemaVersion,
      requestId: receipt.requestId,
      agentId: receipt.agentId,
      walletId: receipt.walletId,
      policyId: receipt.policyId,
      policyVersion: BigInt(receipt.policyVersion),
      policyHash: receipt.policyHash,
      actionHash: receipt.actionHash,
      actionType: receipt.actionType,
      destinationKind: receipt.destination.kind,
      destinationValue: receipt.destination.value,
      assetId: receipt.assetId,
      amount: BigInt(receipt.amount),
      feeAmount: BigInt(receipt.feeAmount),
      feeRecipientAddress: receipt.feeRecipientAddress,
      teemlVerificationId: receipt.teemlVerificationId,
      teemlRequestHash: receipt.teemlRequestHash,
      semanticContextHash: receipt.semanticContextHash,
      verdict: receipt.verdict,
      reasonCode: receipt.reasonCode,
      decidedAt: BigInt(receipt.decidedAt),
    },
  });
}

describe("assertValidDecisionReceipt", () => {
  it("accepts a fresh receipt signed by the expected agent verifier signer", async () => {
    const privateKey = generatePrivateKey();
    const account = privateKeyToAccount(privateKey);
    const receipt = baseReceipt();
    const signature = await signReceipt(receipt, privateKey);

    await assertValidDecisionReceipt(
      { decisionReceipt: receipt, decisionReceiptSignature: signature } as CosignRequest,
      account.address,
      NOW,
    );
  });

  it("rejects a receipt signed by an unexpected key", async () => {
    const privateKey = generatePrivateKey();
    const otherAddress = privateKeyToAccount(generatePrivateKey()).address;
    const receipt = baseReceipt();
    const signature = await signReceipt(receipt, privateKey);

    await assert.rejects(
      () =>
        assertValidDecisionReceipt(
          { decisionReceipt: receipt, decisionReceiptSignature: signature } as CosignRequest,
          otherAddress,
          NOW,
        ),
      CosignError,
    );
  });

  it("rejects a stale receipt", async () => {
    const privateKey = generatePrivateKey();
    const account = privateKeyToAccount(privateKey);
    const receipt = baseReceipt({ decidedAt: NOW - 10_000 });
    const signature = await signReceipt(receipt, privateKey);

    await assert.rejects(
      () =>
        assertValidDecisionReceipt(
          { decisionReceipt: receipt, decisionReceiptSignature: signature } as CosignRequest,
          account.address,
          NOW,
        ),
      CosignError,
    );
  });

  it("rejects a non-ALLOW verdict", async () => {
    const privateKey = generatePrivateKey();
    const account = privateKeyToAccount(privateKey);
    const receipt = baseReceipt({ verdict: "DENY" });
    const signature = await signReceipt(receipt, privateKey);

    await assert.rejects(
      () =>
        assertValidDecisionReceipt(
          { decisionReceipt: receipt, decisionReceiptSignature: signature } as CosignRequest,
          account.address,
          NOW,
        ),
      CosignError,
    );
  });
});

const noEvmAddressFetch: typeof fetch = (async () =>
  new Response(JSON.stringify({ evm_address: null }), { status: 200 })) as typeof fetch;

const LONG_ZERO_DESTINATION = "0x00000000000000000000000000000000000181cd" as const;

describe("assertPaymentCallMatchesReceipt", () => {
  it("accepts a payment call whose transfers exactly match the receipt's destination and fee", async () => {
    const receipt = baseReceipt();
    const paymentCall = encodePaymentCall([
      { accountID: SAFE_ADDRESS, amount: -10100000000n },
      { accountID: LONG_ZERO_DESTINATION, amount: 10000000000n },
      { accountID: FEE_RECIPIENT, amount: 100000000n },
    ]);
    await assertPaymentCallMatchesReceipt(paymentCall, receipt, SAFE_ADDRESS, { fetch: noEvmAddressFetch });
  });

  it("accepts the credit transfers in swapped order", async () => {
    const receipt = baseReceipt();
    const paymentCall = encodePaymentCall([
      { accountID: FEE_RECIPIENT, amount: 100000000n },
      { accountID: LONG_ZERO_DESTINATION, amount: 10000000000n },
      { accountID: SAFE_ADDRESS, amount: -10100000000n },
    ]);
    await assertPaymentCallMatchesReceipt(paymentCall, receipt, SAFE_ADDRESS, { fetch: noEvmAddressFetch });
  });

  it("prefers the destination's canonical mirror-node evm_address over its long-zero alias", async () => {
    const receipt = baseReceipt();
    const canonicalAddress = "0x6cb3edf0111cddb079478ab5fabd5724dbfa5549" as const;
    const paymentCall = encodePaymentCall([
      { accountID: SAFE_ADDRESS, amount: -10100000000n },
      { accountID: canonicalAddress, amount: 10000000000n },
      { accountID: FEE_RECIPIENT, amount: 100000000n },
    ]);
    const canonicalFetch: typeof fetch = (async () =>
      new Response(JSON.stringify({ evm_address: canonicalAddress }), { status: 200 })) as typeof fetch;
    await assertPaymentCallMatchesReceipt(paymentCall, receipt, SAFE_ADDRESS, { fetch: canonicalFetch });
  });

  it("rejects a payment call not targeting the HTS precompile", async () => {
    const receipt = baseReceipt();
    const paymentCall = { ...encodePaymentCall([
      { accountID: SAFE_ADDRESS, amount: -10100000000n },
      { accountID: LONG_ZERO_DESTINATION, amount: 10000000000n },
      { accountID: FEE_RECIPIENT, amount: 100000000n },
    ]), to: FEE_RECIPIENT };
    await assert.rejects(
      () => assertPaymentCallMatchesReceipt(paymentCall, receipt, SAFE_ADDRESS, { fetch: noEvmAddressFetch }),
      CosignError,
    );
  });

  it("rejects a tampered amount", async () => {
    const receipt = baseReceipt();
    const paymentCall = encodePaymentCall([
      { accountID: SAFE_ADDRESS, amount: -10100000000n },
      { accountID: LONG_ZERO_DESTINATION, amount: 9999999999n },
      { accountID: FEE_RECIPIENT, amount: 100000001n },
    ]);
    await assert.rejects(
      () => assertPaymentCallMatchesReceipt(paymentCall, receipt, SAFE_ADDRESS, { fetch: noEvmAddressFetch }),
      CosignError,
    );
  });

  it("rejects a tampered fee recipient", async () => {
    const receipt = baseReceipt();
    const paymentCall = encodePaymentCall([
      { accountID: SAFE_ADDRESS, amount: -10100000000n },
      { accountID: LONG_ZERO_DESTINATION, amount: 10000000000n },
      { accountID: "0x000000000000000000000000000000000000AE61", amount: 100000000n },
    ]);
    await assert.rejects(
      () => assertPaymentCallMatchesReceipt(paymentCall, receipt, SAFE_ADDRESS, { fetch: noEvmAddressFetch }),
      CosignError,
    );
  });

  it("rejects when the safe's own debit entry is missing", async () => {
    const receipt = baseReceipt();
    const paymentCall = encodePaymentCall([
      { accountID: "0x000000000000000000000000000000000000AE61", amount: -10100000000n },
      { accountID: LONG_ZERO_DESTINATION, amount: 10000000000n },
      { accountID: FEE_RECIPIENT, amount: 100000000n },
    ]);
    await assert.rejects(
      () => assertPaymentCallMatchesReceipt(paymentCall, receipt, SAFE_ADDRESS, { fetch: noEvmAddressFetch }),
      CosignError,
    );
  });
});
