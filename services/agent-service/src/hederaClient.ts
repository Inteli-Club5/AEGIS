import { Client, PrivateKey } from "@hiero-ledger/sdk";
import { AgentMode } from "@hashgraph/hedera-agent-kit";
import {
  coreAccountPlugin,
  coreAccountQueryPlugin,
  GET_HBAR_BALANCE_QUERY_TOOL,
  TRANSFER_HBAR_TOOL,
} from "@hashgraph/hedera-agent-kit/plugins";
import { HederaLangchainToolkit } from "@hashgraph/hedera-agent-kit-langchain";

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

export function getAgentClient(hederaAccountId: string, privateKey: string): Client {
  const network = process.env.HEDERA_NETWORK ?? "testnet";
  const client = network === "mainnet" ? Client.forMainnet() : Client.forTestnet();
  client.setOperator(hederaAccountId, PrivateKey.fromStringECDSA(privateKey));
  return client;
}

export function buildAgentToolkit(client: Client, hederaAccountId: string): HederaLangchainToolkit {
  return new HederaLangchainToolkit({
    client,
    configuration: {
      tools: [GET_HBAR_BALANCE_QUERY_TOOL, TRANSFER_HBAR_TOOL],
      plugins: [coreAccountPlugin, coreAccountQueryPlugin],
      context: { mode: AgentMode.RETURN_BYTES, accountId: hederaAccountId },
    },
  });
}
