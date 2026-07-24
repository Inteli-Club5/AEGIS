import { Client, PrivateKey } from "@hiero-ledger/sdk";

export function getOperatorClient(): Client {
  const operatorId = process.env.HEDERA_OPERATOR_ID;
  const operatorKey = process.env.HEDERA_OPERATOR_KEY;
  const network = process.env.HEDERA_NETWORK ?? "testnet";

  if (!operatorId || !operatorKey) {
    throw new Error("HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY must be set");
  }

  const client = network === "mainnet" ? Client.forMainnet() : Client.forTestnet();
  client.setOperator(operatorId, PrivateKey.fromStringECDSA(operatorKey));
  return client;
}
