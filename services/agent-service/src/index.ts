import "dotenv/config";
import { fileURLToPath } from "node:url";
import express from "express";
import { createAgent as createAgentProfile } from "./createAgent.js";
import { createWallet as createAgentWallet } from "./createWallet.js";
import { proposeAction as proposeAgentAction } from "./proposeAction.js";
import { HttpError, registerAgenticId } from "./registerAgenticId.js";
import { getAgent as getStoredAgent } from "./store.js";
import type { AgentType } from "./types.js";
import {
  createPostgresPolicyRepository,
  createPostgresPrecheckRepository,
  UnconfiguredPolicyRepository,
  UnconfiguredPrecheckRepository,
} from "./policy-engine/db/postgres.js";
import { createUuidV7 } from "./policy-engine/ids.js";
import type { PrecheckRepository } from "./policy-engine/precheck.js";
import { DEFAULT_AUDIT_RETENTION_DAYS, DEFAULT_USAGE_HOLD_TTL_SECONDS, PrecheckService, type AgentActorContext } from "./policy-engine/precheck.js";
import type { PolicyRepository } from "./policy-engine/repository.js";
import { createPolicyRouter, type AgentActorAuthenticator } from "./policy-engine/routes.js";
import { PolicyLifecycleService } from "./policy-engine/service.js";
import { NETWORK_ID } from "./policy-engine/types.js";

const EVM_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const AGENT_TYPES: AgentType[] = ["Payment", "API Buyer", "DeFi", "Treasury", "Other"];

export type AgentServiceAppOptions = {
  policyRepository?: PolicyRepository;
  precheckRepository?: PrecheckRepository;
  authenticateAgentActor?: AgentActorAuthenticator;
  createAgent?: typeof createAgentProfile;
  createWallet?: typeof createAgentWallet;
  proposeAction?: typeof proposeAgentAction;
  registerAgenticId?: typeof registerAgenticId;
  getAgent?: typeof getStoredAgent;
};

export function createAgentServiceApp(options: AgentServiceAppOptions = {}) {
  const app = express();
  app.use(express.json());

  const policyRepository =
    options.policyRepository ??
    (process.env.DATABASE_URL ? createPostgresPolicyRepository(process.env.DATABASE_URL) : new UnconfiguredPolicyRepository());
  const precheckRepository =
    options.precheckRepository ??
    (process.env.DATABASE_URL ? createPostgresPrecheckRepository(process.env.DATABASE_URL) : new UnconfiguredPrecheckRepository());
  const policyService = new PolicyLifecycleService(policyRepository);
  const precheckService = new PrecheckService(precheckRepository, {
    idGenerator: createUuidV7,
    usageHoldTtlSeconds: envPositiveInteger("USAGE_HOLD_TTL_SECONDS", DEFAULT_USAGE_HOLD_TTL_SECONDS),
    auditRetentionDays: envPositiveInteger("AUDIT_RETENTION_DAYS", DEFAULT_AUDIT_RETENTION_DAYS),
  });
  const isPolicyDatabaseConfigured = !(policyRepository instanceof UnconfiguredPolicyRepository);
  const createAgent = options.createAgent ?? createAgentProfile;
  const createWallet = options.createWallet ?? createAgentWallet;
  const proposeAction = options.proposeAction ?? proposeAgentAction;
  const registerAgenticIdHandler = options.registerAgenticId ?? registerAgenticId;
  const getAgent = options.getAgent ?? getStoredAgent;

  app.get("/health", (_req, res) => res.json({ ok: true, service: "aegis-agent-service" }));

  app.use(createPolicyRouter(policyService, precheckService, options.authenticateAgentActor));

  app.post("/create-agents", async (req, res) => {
    const { ownerWallet, name, type, endpoint, description } = req.body ?? {};

    if (typeof ownerWallet !== "string" || !ownerWallet) {
      return res.status(400).json({ error: "ownerWallet is required" });
    }
    if (!EVM_ADDRESS_RE.test(ownerWallet)) {
      return res.status(400).json({ error: "ownerWallet must be a valid EVM address" });
    }
    if (typeof name !== "string" || !name) {
      return res.status(400).json({ error: "name is required" });
    }
    if (!AGENT_TYPES.includes(type)) {
      return res.status(400).json({ error: `type must be one of: ${AGENT_TYPES.join(", ")}` });
    }

    try {
      const profile = await createAgent({ ownerWallet, name, type, endpoint, description });
      if (isPolicyDatabaseConfigured) {
        const createdAt = Math.floor(Date.parse(profile.createdAt) / 1000);
        await policyRepository.saveAgent({
          agentId: profile.agentId,
          ownerAddress: profile.ownerWallet.toLowerCase() as `0x${string}`,
          status: profile.status === "active" ? "ACTIVE" : "PAUSED",
          createdAt,
          updatedAt: createdAt,
        });
      }
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
    const { task, safeAddress } = req.body ?? {};

    if (typeof task !== "string" || !task) {
      return res.status(400).json({ error: "task is required" });
    }
    if (safeAddress !== undefined && typeof safeAddress !== "string") {
      return res.status(400).json({ error: "safeAddress must be a string" });
    }

    const profile = getAgent(req.params.agentId);
    const effectiveSafeAddress = safeAddress ?? profile?.safeAddress;

    try {
      const proposal = await proposeAction(req.params.agentId, task, effectiveSafeAddress);
      res.json({ proposal });
    } catch (error) {
      if (error instanceof Error && error.message === "agent_not_found") {
        return res.status(404).json({ error: "not_found" });
      }
      res.status(500).json({ error: error instanceof Error ? error.message : "propose_action_failed" });
    }
  });

  app.post("/agents/:agentId/create-wallets", async (req, res) => {
    const { recoveryGuardianAddress } = req.body ?? {};

    if (recoveryGuardianAddress !== undefined && typeof recoveryGuardianAddress !== "string") {
      return res.status(400).json({ error: "recoveryGuardianAddress must be a string" });
    }

    const profile = getAgent(req.params.agentId);
    const effectiveGuardian = recoveryGuardianAddress ?? profile?.ownerWallet;

    if (typeof effectiveGuardian !== "string" || !EVM_ADDRESS_RE.test(effectiveGuardian)) {
      return res.status(400).json({
        error: "recoveryGuardianAddress must be a valid EVM address (defaults to the agent's ownerWallet, which must also be one)",
      });
    }

    try {
      const wallet = await createWallet(req.params.agentId, effectiveGuardian);
      if (!isPolicyDatabaseConfigured) {
        return res.status(201).json(wallet);
      }

      const now = Math.floor(Date.now() / 1000);
      const walletRecord = await policyRepository.saveWallet({
        walletId: createUuidV7(),
        agentId: req.params.agentId.toLowerCase(),
        networkId: NETWORK_ID,
        safeAddress: wallet.safeAddress.toLowerCase() as `0x${string}`,
        status: "PROTECTED",
        createdAt: now,
        updatedAt: now,
      });

      res.status(201).json({ ...wallet, walletId: walletRecord.walletId, networkId: walletRecord.networkId });
    } catch (error) {
      if (error instanceof Error && error.message === "agent_not_found") {
        return res.status(404).json({ error: "not_found" });
      }
      res.status(500).json({ error: error instanceof Error ? error.message : "create_wallet_failed" });
    }
  });

  app.post("/agents/:agentId/register-agentic-id", async (req, res) => {
    try {
      const profile = await registerAgenticIdHandler(req.params.agentId);
      res.status(201).json(profile);
    } catch (error) {
      if (error instanceof Error && error.message === "agent_not_found") {
        return res.status(404).json({ error: "not_found" });
      }
      if (error instanceof Error && error.message === "agent_wallet_not_created") {
        return res.status(409).json({ error: "agent must have a Safe wallet (create-wallets) before registering an Agentic ID" });
      }
      if (error instanceof HttpError) {
        return res.status(error.status).json({ error: error.message });
      }
      res.status(500).json({ error: error instanceof Error ? error.message : "register_agentic_id_failed" });
    }
  });

  return app;
}

export function fixedAgentActor(agentId: string): AgentActorContext {
  return { authenticatedAgentId: agentId.toLowerCase(), actorType: "AGENT" };
}

function envPositiveInteger(name: string, fallback: number): number {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

const port = process.env.AGENT_SERVICE_PORT ?? 4200;
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  createAgentServiceApp().listen(port, () => console.log(`aegis-agent-service on :${port}`));
}
