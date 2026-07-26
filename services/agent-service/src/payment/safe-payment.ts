import Safe from "@safe-global/protocol-kit";
import type { MetaTransactionData, SafeTransactionData } from "@safe-global/types-kit";
import { encodeFunctionData } from "viem";
import { contractNetworks } from "../safeContracts.js";
import type { DecisionReceipt } from "./decision-receipt.js";
import { resolveDestinationEvmAddress } from "./destination.js";
import { CRYPTO_TRANSFER_ABI, HTS_PRECOMPILE_ADDRESS } from "./hts.js";

/**
 * The AEGIS "split payment": one Safe-executed transaction that transfers the
 * approved amount to the destination AND the AEGIS execution fee to AEGIS's
 * fee account in the same atomic execution (docs/AEGIS_ARCHITECTURE.md
 * §4.4/§5.2).
 *
 * This targets Hedera's HTS system-contract precompile (0x167) with an
 * encoded cryptoTransfer call (value=0) rather than a plain value-carrying
 * CALL to the destination. Hedera's EVM rejects a native HBAR transfer
 * performed by code running via DELEGATECALL — which is exactly how every
 * Safe execTransaction executes its inner call — confirmed via an isolated
 * minimal-proxy repro (a trivial delegatecall proxy sending value via a bare
 * `.call{value}` or `.transfer()` reverts unconditionally on Hedera testnet,
 * regardless of gas stipend, target type, or RPC relay). cryptoTransfer moves
 * value through Hedera's native ledger logic instead, which is unaffected.
 * One cryptoTransfer call lists every credit atomically, so no MultiSend
 * batching is needed either.
 */
export async function buildPaymentCall(
  receipt: DecisionReceipt,
  safeAddress: `0x${string}`,
): Promise<MetaTransactionData> {
  const destinationAddress = await resolveDestinationEvmAddress(receipt.destination);
  const amountTinybar = BigInt(receipt.amount);
  const feeTinybar = BigInt(receipt.feeAmount);
  const totalTinybar = amountTinybar + feeTinybar;

  const data = encodeFunctionData({
    abi: CRYPTO_TRANSFER_ABI,
    functionName: "cryptoTransfer",
    args: [
      {
        transfers: [
          { accountID: safeAddress, amount: -totalTinybar, isApproval: false },
          { accountID: destinationAddress, amount: amountTinybar, isApproval: false },
          { accountID: receipt.feeRecipientAddress, amount: feeTinybar, isApproval: false },
        ],
      },
      [],
    ],
  });

  return { to: HTS_PRECOMPILE_ADDRESS, value: "0", data };
}

export type AgentSignedPayment = Readonly<{
  transactionData: SafeTransactionData;
  agentSignature: Readonly<{ signer: string; data: string }>;
}>;

export async function createAgentSignedPayment(input: {
  rpcUrl: string;
  safeAddress: string;
  agentPrivateKey: string;
  paymentCall: MetaTransactionData;
}): Promise<AgentSignedPayment> {
  const protocolKit = await Safe.init({
    provider: input.rpcUrl,
    signer: normalizeKey(input.agentPrivateKey),
    safeAddress: input.safeAddress,
    contractNetworks,
  });

  const nonce = await protocolKit.getNonce();
  const safeTransaction = await protocolKit.createTransaction({
    transactions: [input.paymentCall],
    options: { nonce },
  });
  const signed = await protocolKit.signTransaction(safeTransaction);
  const agentAddress = (await protocolKit.getSafeProvider().getSignerAddress()) as string;
  const signature = signed.getSignature(agentAddress);
  if (!signature) {
    throw new Error("agent signature was not attached to the payment transaction");
  }

  return {
    transactionData: signed.data,
    agentSignature: { signer: signature.signer, data: signature.data },
  };
}

function normalizeKey(key: string): `0x${string}` {
  return key.startsWith("0x") ? (key as `0x${string}`) : `0x${key}`;
}
