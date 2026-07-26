import Safe from "@safe-global/protocol-kit";
import { EthSafeSignature } from "@safe-global/protocol-kit";
import type { MetaTransactionData } from "@safe-global/types-kit";
import { decodeFunctionData, type Hex } from "viem";
import { contractNetworks } from "./safeContracts.js";
import {
  recoverDecisionReceiptSigner,
  type DecisionReceipt,
} from "./decision-receipt.js";
import { resolveDestinationEvmAddress } from "./destination.js";
import { CRYPTO_TRANSFER_ABI, HTS_PRECOMPILE_ADDRESS } from "./hts.js";

const MAX_RECEIPT_AGE_SECONDS = 600;

export class CosignError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "CosignError";
  }
}

export type CosignRequest = Readonly<{
  safeAddress: string;
  paymentCall: MetaTransactionData;
  nonce: number;
  agentSignature: Readonly<{ signer: string; data: string }>;
  decisionReceipt: DecisionReceipt;
  decisionReceiptSignature: Hex;
}>;

export type CosignResult = Readonly<{
  status: "EXECUTED";
  safeTxHash: string;
  transactionHash: string;
}>;

export async function cosignAndExecute(
  request: CosignRequest,
  dependencies: {
    rpcUrl: string;
    cosignerPrivateKey: string;
    expectedAgentVerifierSignerAddress: string;
    now?: () => number;
    fetch?: typeof fetch;
  },
): Promise<CosignResult> {
  const now = dependencies.now ?? (() => Math.floor(Date.now() / 1000));

  await assertValidDecisionReceipt(request, dependencies.expectedAgentVerifierSignerAddress, now());
  await assertPaymentCallMatchesReceipt(
    request.paymentCall,
    request.decisionReceipt,
    request.safeAddress,
    { fetch: dependencies.fetch },
  );

  const protocolKit = await Safe.init({
    provider: dependencies.rpcUrl,
    signer: normalizeKey(dependencies.cosignerPrivateKey),
    safeAddress: request.safeAddress,
    contractNetworks,
  });

  let safeTransaction = await protocolKit.createTransaction({
    transactions: [request.paymentCall],
    options: { nonce: request.nonce },
  });

  safeTransaction.addSignature(
    new EthSafeSignature(request.agentSignature.signer, request.agentSignature.data),
  );
  safeTransaction = await protocolKit.signTransaction(safeTransaction);

  const safeTxHash = await protocolKit.getTransactionHash(safeTransaction);

  const isValid = await protocolKit.isValidTransaction(safeTransaction);
  if (!isValid) {
    throw new CosignError(
      "invalid_transaction",
      "the Safe rejected the payment transaction's signatures or threshold",
    );
  }

  const executed = await protocolKit.executeTransaction(safeTransaction);
  const publicClient = protocolKit.getSafeProvider().getExternalProvider();
  await publicClient.waitForTransactionReceipt({
    hash: executed.hash as `0x${string}`,
  });

  return {
    status: "EXECUTED",
    safeTxHash,
    transactionHash: executed.hash,
  };
}

export async function assertValidDecisionReceipt(
  request: CosignRequest,
  expectedAgentVerifierSignerAddress: string,
  nowSeconds: number,
): Promise<void> {
  const { decisionReceipt, decisionReceiptSignature } = request;

  if (decisionReceipt.verdict !== "ALLOW") {
    throw new CosignError("receipt_not_allow", "decision receipt is not an ALLOW verdict");
  }
  const age = nowSeconds - decisionReceipt.decidedAt;
  if (age < 0 || age > MAX_RECEIPT_AGE_SECONDS) {
    throw new CosignError("receipt_stale", "decision receipt is expired or has an invalid timestamp");
  }

  const recoveredSigner = await recoverDecisionReceiptSigner(
    decisionReceipt,
    decisionReceiptSignature,
  );
  if (
    recoveredSigner.toLowerCase() !==
    expectedAgentVerifierSignerAddress.toLowerCase()
  ) {
    throw new CosignError(
      "receipt_signature_invalid",
      "decision receipt was not signed by the configured AEGIS agent verifier signer",
    );
  }
}

export async function assertPaymentCallMatchesReceipt(
  paymentCall: MetaTransactionData,
  receipt: DecisionReceipt,
  safeAddress: string,
  deps?: { fetch?: typeof fetch },
): Promise<void> {
  if (
    paymentCall.to.toLowerCase() !== HTS_PRECOMPILE_ADDRESS ||
    paymentCall.value !== "0"
  ) {
    throw new CosignError(
      "payment_call_mismatch",
      "the payment call must target the HTS precompile with zero native value",
    );
  }

  let decoded;
  try {
    decoded = decodeFunctionData({
      abi: CRYPTO_TRANSFER_ABI,
      data: paymentCall.data as Hex,
    });
  } catch {
    throw new CosignError("payment_call_mismatch", "the payment call data could not be decoded");
  }

  const [transferList, tokenTransfers] = decoded.args;
  if (tokenTransfers.length !== 0) {
    throw new CosignError("payment_call_mismatch", "the payment call must not include token transfers");
  }

  const destinationAddress = await resolveDestinationEvmAddress(receipt.destination, deps);
  const amountTinybar = BigInt(receipt.amount);
  const feeTinybar = BigInt(receipt.feeAmount);
  const totalTinybar = amountTinybar + feeTinybar;

  const transfers = transferList.transfers;
  if (transfers.length !== 3) {
    throw new CosignError("payment_call_mismatch", "the payment call must have exactly three transfers");
  }

  const matchesEntry = (entry: (typeof transfers)[number], accountID: string, amount: bigint) =>
    entry.accountID.toLowerCase() === accountID.toLowerCase() &&
    entry.amount === amount &&
    entry.isApproval === false;

  const debitOk = transfers.some(entry => matchesEntry(entry, safeAddress, -totalTinybar));
  const destinationOk = transfers.some(entry => matchesEntry(entry, destinationAddress, amountTinybar));
  const feeOk = transfers.some(entry =>
    matchesEntry(entry, receipt.feeRecipientAddress, feeTinybar),
  );

  if (!debitOk || !destinationOk || !feeOk) {
    throw new CosignError(
      "payment_call_mismatch",
      "the payment call's transfers do not match the decision receipt's destination and fee",
    );
  }
}

function normalizeKey(key: string): `0x${string}` {
  return key.startsWith("0x") ? (key as `0x${string}`) : `0x${key}`;
}
