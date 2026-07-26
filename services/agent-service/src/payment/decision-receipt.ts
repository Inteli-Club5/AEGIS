import {
  recoverTypedDataAddress,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { HEDERA_TESTNET_CHAIN_ID } from "../policy-engine/types.js";
import type { BaseUnitAmount, DestinationIdentity, Hex32 } from "../policy-engine/types.js";
import { calculateExecutionFeeTinybar } from "./fee.js";

export const NATIVE_HBAR_ASSET_ID = "hedera:testnet:hbar";

export const DECISION_RECEIPT_SCHEMA = "aegis.decision-receipt.v1";

export type DecisionReceiptInput = Readonly<{
  requestId: string;
  agentId: string;
  walletId: string;
  policyId: string;
  policyVersion: number;
  policyHash: Hex32;
  actionHash: Hex32;
  actionType: string;
  destination: DestinationIdentity;
  assetId: string;
  amount: BaseUnitAmount;
  teemlVerificationId: string;
  teemlRequestHash: Hex32;
  semanticContextHash: Hex32;
  reasonCode: string;
  decidedAt: number;
}>;

export type DecisionReceipt = DecisionReceiptInput &
  Readonly<{
    schemaVersion: typeof DECISION_RECEIPT_SCHEMA;
    verdict: "ALLOW";
    feeAmount: BaseUnitAmount;
    feeRecipientAddress: `0x${string}`;
  }>;

export function buildDecisionReceipt(
  input: DecisionReceiptInput,
  feeRecipientAddress: `0x${string}`,
): DecisionReceipt {
  if (input.assetId !== NATIVE_HBAR_ASSET_ID) {
    throw new Error(
      "the AEGIS execution fee and payment path are only defined for the native HBAR asset",
    );
  }
  return {
    ...input,
    schemaVersion: DECISION_RECEIPT_SCHEMA,
    verdict: "ALLOW",
    feeAmount: calculateExecutionFeeTinybar(input.amount),
    feeRecipientAddress,
  };
}

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

export type DecisionReceiptTypedMessage = Readonly<{
  schemaVersion: string;
  requestId: string;
  agentId: string;
  walletId: string;
  policyId: string;
  policyVersion: bigint;
  policyHash: Hex32;
  actionHash: Hex32;
  actionType: string;
  destinationKind: string;
  destinationValue: string;
  assetId: string;
  amount: bigint;
  feeAmount: bigint;
  feeRecipientAddress: `0x${string}`;
  teemlVerificationId: string;
  teemlRequestHash: Hex32;
  semanticContextHash: Hex32;
  verdict: string;
  reasonCode: string;
  decidedAt: bigint;
}>;

export function toDecisionReceiptTypedMessage(
  receipt: DecisionReceipt,
): DecisionReceiptTypedMessage {
  return {
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
  };
}

export async function signDecisionReceipt(
  receipt: DecisionReceipt,
  privateKey: Hex,
): Promise<{ signerAddress: `0x${string}`; signature: Hex }> {
  const account = privateKeyToAccount(privateKey);
  const signature = await account.signTypedData({
    domain: DECISION_RECEIPT_DOMAIN,
    types: DECISION_RECEIPT_TYPES,
    primaryType: "DecisionReceipt",
    message: toDecisionReceiptTypedMessage(receipt),
  });
  return { signerAddress: account.address, signature };
}

export async function recoverDecisionReceiptSigner(
  receipt: DecisionReceipt,
  signature: Hex,
): Promise<`0x${string}`> {
  return await recoverTypedDataAddress({
    domain: DECISION_RECEIPT_DOMAIN,
    types: DECISION_RECEIPT_TYPES,
    primaryType: "DecisionReceipt",
    message: toDecisionReceiptTypedMessage(receipt),
    signature,
  });
}