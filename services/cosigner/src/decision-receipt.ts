import { recoverTypedDataAddress, type Hex } from "viem";

const HEDERA_TESTNET_CHAIN_ID = 296;

export const DECISION_RECEIPT_DOMAIN = {
  name: "AEGIS Decision Receipt",
  version: "1",
  chainId: HEDERA_TESTNET_CHAIN_ID,
} as const;

export const DECISION_RECEIPT_TYPES = {
  DecisionReceipt: [
    { name: "schemaVersion", type: "string" },
    { name: "requestId", type: "string" },
    { name: "agentId", type: "string" },
    { name: "walletId", type: "string" },
    { name: "policyId", type: "string" },
    { name: "policyVersion", type: "uint256" },
    { name: "policyHash", type: "bytes32" },
    { name: "actionHash", type: "bytes32" },
    { name: "actionType", type: "string" },
    { name: "destinationKind", type: "string" },
    { name: "destinationValue", type: "string" },
    { name: "assetId", type: "string" },
    { name: "amount", type: "uint256" },
    { name: "feeAmount", type: "uint256" },
    { name: "feeRecipientAddress", type: "address" },
    { name: "teemlVerificationId", type: "string" },
    { name: "teemlRequestHash", type: "bytes32" },
    { name: "semanticContextHash", type: "bytes32" },
    { name: "verdict", type: "string" },
    { name: "reasonCode", type: "string" },
    { name: "decidedAt", type: "uint256" },
  ],
} as const;

export type DecisionReceipt = Readonly<{
  schemaVersion: string;
  requestId: string;
  agentId: string;
  walletId: string;
  policyId: string;
  policyVersion: number;
  policyHash: `0x${string}`;
  actionHash: `0x${string}`;
  actionType: string;
  destination: Readonly<{ kind: string; value: string }>;
  assetId: string;
  amount: string;
  feeAmount: string;
  feeRecipientAddress: `0x${string}`;
  teemlVerificationId: string;
  teemlRequestHash: `0x${string}`;
  semanticContextHash: `0x${string}`;
  verdict: string;
  reasonCode: string;
  decidedAt: number;
}>;

export async function recoverDecisionReceiptSigner(
  receipt: DecisionReceipt,
  signature: Hex,
): Promise<`0x${string}`> {
  return await recoverTypedDataAddress({
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
    signature,
  });
}