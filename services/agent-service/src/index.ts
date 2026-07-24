import "dotenv/config";
import express from "express";
import { createAgent } from "./createAgent.js";
import { proposeAction } from "./proposeAction.js";
import { getAgent } from "./store.js";
import type { AgentType } from "./types.js";

const AGENT_TYPES: AgentType[] = ["Payment", "API Buyer", "DeFi", "Treasury", "Other"];

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true, service: "aegis-agent-service" }));

app.post("/create-agents", async (req, res) => {
  const { ownerWallet, name, type, endpoint, description } = req.body ?? {};

  if (typeof ownerWallet !== "string" || !ownerWallet) {
    return res.status(400).json({ error: "ownerWallet is required" });
  }
  if (typeof name !== "string" || !name) {
    return res.status(400).json({ error: "name is required" });
  }
  if (!AGENT_TYPES.includes(type)) {
    return res.status(400).json({ error: `type must be one of: ${AGENT_TYPES.join(", ")}` });
  }

  try {
    const profile = await createAgent({ ownerWallet, name, type, endpoint, description });
    res.status(201).json(profile);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "create_agent_failed" });
  }
});

app.get("/agents/:agentId", (req, res) => {
  const profile = getAgent(req.params.agentId);
  if (!profile) return res.status(404).json({ error: "not_found" });
  res.json(profile);
});

app.post("/agents/:agentId/propose-actions", async (req, res) => {
  const { task } = req.body ?? {};

  if (typeof task !== "string" || !task) {
    return res.status(400).json({ error: "task is required" });
  }

  try {
    const proposal = await proposeAction(req.params.agentId, task);
    res.json({ proposal });
  } catch (error) {
    if (error instanceof Error && error.message === "agent_not_found") {
      return res.status(404).json({ error: "not_found" });
    }
    res.status(500).json({ error: error instanceof Error ? error.message : "propose_action_failed" });
  }
});

const port = process.env.AGENT_SERVICE_PORT ?? 4200;
app.listen(port, () => console.log(`aegis-agent-service on :${port}`));
