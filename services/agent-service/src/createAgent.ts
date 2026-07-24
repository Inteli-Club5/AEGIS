import { randomUUID } from "node:crypto";
import { AccountCreateTransaction, Hbar, PrivateKey } from "@hiero-ledger/sdk";
import { buildAgentToolkit, getAgentClient, getOperatorClient } from "./hederaClient.js";
import { saveAgent } from "./store.js";
import type { AgentProfile, CreateAgentInput } from "./types.js";

const initialBalanceHbar = Number(process.env.AGENT_INITIAL_BALANCE_HBAR ?? "0");

export async function createAgent(input: CreateAgentInput): Promise<AgentProfile> {
  const operatorClient = getOperatorClient();

  const agentPrivateKey = PrivateKey.generateECDSA();

  const createTx = new AccountCreateTransaction()
    .setECDSAKeyWithAlias(agentPrivateKey.publicKey)
    .setInitialBalance(new Hbar(initialBalanceHbar));

  const txResponse = await createTx.execute(operatorClient);
  const receipt = await txResponse.getReceipt(operatorClient);
  const hederaAccountId = receipt.accountId;

  if (!hederaAccountId) {
    throw new Error("Hedera did not return an account ID for the new agent");
  }

  const agentClient = getAgentClient(hederaAccountId.toString(), agentPrivateKey.toString());
  const toolkit = buildAgentToolkit(agentClient, hederaAccountId.toString());

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
