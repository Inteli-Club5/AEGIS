import { randomUUID } from "node:crypto";
import { AccountCreateTransaction, Client, Hbar, PrivateKey } from "@hiero-ledger/sdk";
import { AgentMode } from "@hashgraph/hedera-agent-kit";
import { allCorePlugins } from "@hashgraph/hedera-agent-kit/plugins";
import { HederaLangchainToolkit } from "@hashgraph/hedera-agent-kit-langchain";
import { getOperatorClient } from "./hederaClient.js";
import { saveAgent } from "./store.js";
import type { AgentProfile, CreateAgentInput } from "./types.js";

const initialBalanceHbar = Number(process.env.AGENT_INITIAL_BALANCE_HBAR ?? "0");

export async function createAgent(input: CreateAgentInput): Promise<AgentProfile> {
  const operatorClient = getOperatorClient();

  const agentPrivateKey = PrivateKey.generateECDSA();

  // EVM alias, not setKeyWithoutAlias: this account must later act as an EVM
  // owner on the Safe smart wallet (architecture doc §3.3).
  const createTx = new AccountCreateTransaction()
    .setECDSAKeyWithAlias(agentPrivateKey.publicKey)
    .setInitialBalance(new Hbar(initialBalanceHbar));

  const txResponse = await createTx.execute(operatorClient);
  const receipt = await txResponse.getReceipt(operatorClient);
  const hederaAccountId = receipt.accountId;

  if (!hederaAccountId) {
    throw new Error("Hedera did not return an account ID for the new agent");
  }

  const agentClient = Client.forTestnet().setOperator(hederaAccountId, agentPrivateKey);
  const toolkit = new HederaLangchainToolkit({
    client: agentClient,
    configuration: {
      tools: [],
      plugins: allCorePlugins,
      context: { mode: AgentMode.AUTONOMOUS, accountId: hederaAccountId.toString() },
    },
  });

  const profile: AgentProfile = {
    agentId: randomUUID(),
    ownerWallet: input.ownerWallet,
    name: input.name,
    type: input.type,
    endpoint: input.endpoint,
    description: input.description,
    hederaAccountId: hederaAccountId.toString(),
    publicKey: agentPrivateKey.publicKey.toString(),
    toolNames: toolkit.getTools().map(tool => tool.name),
    status: "active",
    createdAt: new Date().toISOString(),
  };

  saveAgent(profile, agentPrivateKey.toString());

  return profile;
}
