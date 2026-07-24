import { ChatGroq } from "@langchain/groq";
import { createAgent } from "langchain";
import { buildAgentToolkit, getAgentClient } from "./hederaClient.js";
import { getAgent, getAgentPrivateKey } from "./store.js";

function systemPrompt(safeAddress?: string): string {
  const walletNote = safeAddress
    ? `Your protected wallet (a Safe) is at account ${safeAddress} - that is
where operational funds live and where any approved payment would be sent
from. Your own account is not the funding source; when checking balance or
affordability, query ${safeAddress}'s balance, not your own account's.`
    : `You do not have a protected wallet (Safe) set up yet. Your own account
is not a funding source for operations - do not propose a payment based on
your own balance. If asked to propose a payment, say a protected wallet must
be created first.`;

  return `You are the operational agent for an AEGIS-protected Hedera account.
${walletNote}
You can query Hedera state freely. Any transaction tool you call only returns
unsigned transaction bytes - it does not execute on-chain. Your job is to
propose one clear action: state the action type, destination, token, amount,
and your reason. AEGIS decides separately whether to approve and execute it.`;
}

type CreateAgentConfig = Parameters<typeof createAgent>[0];

export async function proposeAction(agentId: string, task: string, safeAddress?: string): Promise<string> {
  const profile = getAgent(agentId);
  const privateKey = getAgentPrivateKey(agentId);

  if (!profile || !privateKey) {
    throw new Error("agent_not_found");
  }

  const client = getAgentClient(profile.hederaAccountId, privateKey);
  const toolkit = buildAgentToolkit(client, profile.hederaAccountId);

  const model = new ChatGroq({
    model: process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile",
    temperature: 0,
  });

  const agent = createAgent({
    model,
    tools: toolkit.getTools() as unknown as CreateAgentConfig["tools"],
    systemPrompt: systemPrompt(safeAddress),
  });

  const response = await agent.invoke({
    messages: [{ role: "user", content: task }],
  });

  const last = response.messages[response.messages.length - 1];
  return typeof last.content === "string" ? last.content : JSON.stringify(last.content);
}
