import { Router, type Request, type Response } from "express";
import { extractOperatorAuth } from "./auth.js";
import { PolicyEngineError } from "./errors.js";
import type { PolicyLifecycleService } from "./service.js";

export function createPolicyRouter(service: PolicyLifecycleService): Router {
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

  return router;
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

