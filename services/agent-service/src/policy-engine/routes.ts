import { Router, type Request, type Response } from "express";
import { extractOperatorAuth } from "./auth.js";
import { PolicyEngineError } from "./errors.js";
import type { AgentActorContext, PrecheckService } from "./precheck.js";
import type { PolicyLifecycleService } from "./service.js";

export type AgentActorAuthenticator = (req: Request) => Promise<AgentActorContext>;

export function createPolicyRouter(service: PolicyLifecycleService, precheckService?: PrecheckService, authenticateAgentActor?: AgentActorAuthenticator): Router {
  const router = Router();

  router.post("/policies", asyncHandler(async (req, res) => {
    res.status(201).json(await service.createPolicy(req.body, extractOperatorAuth(req.headers)));
  }));

  router.get("/policies/:policyId", asyncHandler(async (req, res) => {
    res.json({ policy: await service.getPolicy(req.params.policyId) });
  }));

  router.get("/policies/:policyId/versions", asyncHandler(async (req, res) => {
    res.json({ policies: await service.listPolicyVersions(req.params.policyId) });
  }));

  router.patch("/policies/:policyId", asyncHandler(async (req, res) => {
    res.status(201).json(await service.updatePolicy(req.params.policyId, req.body, extractOperatorAuth(req.headers)));
  }));

  router.post("/policies/:policyId/activate", asyncHandler(async (req, res) => {
    res.json(await service.activatePolicy(req.params.policyId, req.body, extractOperatorAuth(req.headers)));
  }));

  router.post("/policies/:policyId/revoke", asyncHandler(async (req, res) => {
    res.json(await service.revokePolicy(req.params.policyId, req.body, extractOperatorAuth(req.headers)));
  }));

  router.get("/agents/:agentId/wallets/:walletId/policies/active", asyncHandler(async (req, res) => {
    const now = req.query.now === undefined ? undefined : Number(req.query.now);
    res.json(await service.getActivePolicy(req.params.agentId, req.params.walletId, now));
  }));

  if (precheckService) {
    router.post("/agents/:agentId/wallets/:walletId/actions/precheck", asyncHandler(async (req, res) => {
      if (!authenticateAgentActor) {
        throw new PolicyEngineError(503, "agent_auth_unconfigured", "Agent precheck authentication adapter is not configured");
      }
      const actor = await authenticateAgentActor(req);
      const result = await precheckService.precheck({
        params: { agentId: req.params.agentId, walletId: req.params.walletId },
        body: req.body,
        idempotencyKey: firstHeader(req.headers["idempotency-key"]) ?? null,
        actor,
      });
      res.status(result.httpStatus).json(result.response);
    }));
  }

  return router;
}

function firstHeader(value: unknown): string | undefined {
  if (Array.isArray(value)) return typeof value[0] === "string" ? value[0] : undefined;
  return typeof value === "string" ? value : undefined;
}

function asyncHandler(handler: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response) => {
    handler(req, res).catch(error => {
      if (error instanceof PolicyEngineError) {
        return res.status(error.status).json({ error: error.code, message: error.message });
      }
      res.status(500).json({ error: error instanceof Error ? error.message : "policy_engine_failed" });
    });
  };
}
