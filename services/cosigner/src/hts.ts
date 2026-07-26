export const HTS_PRECOMPILE_ADDRESS =
  "0x0000000000000000000000000000000000000167" as const;

/**
 * Mirrors services/agent-service/src/payment/hts.ts: Safe's execTransaction
 * moves native HBAR out of its own balance by targeting this precompile with
 * an encoded cryptoTransfer call (value=0) instead of a plain value-carrying
 * CALL, since Hedera's EVM rejects a native value transfer performed by code
 * running via DELEGATECALL (exactly how every Safe execTransaction runs).
 */
export const CRYPTO_TRANSFER_ABI = [
  {
    type: "function",
    name: "cryptoTransfer",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "transferList",
        type: "tuple",
        components: [
          {
            name: "transfers",
            type: "tuple[]",
            components: [
              { name: "accountID", type: "address" },
              { name: "amount", type: "int64" },
              { name: "isApproval", type: "bool" },
            ],
          },
        ],
      },
      {
        name: "tokenTransfers",
        type: "tuple[]",
        components: [
          { name: "token", type: "address" },
          {
            name: "transfers",
            type: "tuple[]",
            components: [
              { name: "accountID", type: "address" },
              { name: "amount", type: "int64" },
              { name: "isApproval", type: "bool" },
            ],
          },
          {
            name: "nftTransfers",
            type: "tuple[]",
            components: [
              { name: "senderAccountID", type: "address" },
              { name: "receiverAccountID", type: "address" },
              { name: "serialNumber", type: "int64" },
              { name: "isApproval", type: "bool" },
            ],
          },
        ],
      },
    ],
    outputs: [{ name: "responseCode", type: "int64" }],
  },
] as const;

export type HbarTransfer = Readonly<{
  accountID: `0x${string}`;
  amount: bigint;
  isApproval: boolean;
}>;
