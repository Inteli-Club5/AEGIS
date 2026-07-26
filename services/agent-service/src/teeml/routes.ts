import { Router, type Request, type Response } from "express";
import type { AgentActorAuthenticator } from "../policy-engine/routes.js";
import { PolicyEngineError } from "../policy-engine/errors.js";
import { TeeMlError } from "./errors.js";
import type { TeeMlService } from "./service.js";

export function createTeeMlRouter(
  service: TeeMlService,
  authenticateAgentActor?: AgentActorAuthenticator,
): Router {
  const router = Router();

  router.post(
    "/actions/:requestId/teeml/verify",
    asyncHandler(async (req, res) => {
      if (!authenticateAgentActor) {
        throw new PolicyEngineError(
          503,
          "agent_auth_unconfigured",
          "Agent TeeML authentication adapter is not configured",
        );
      }
      const actor = await authenticateAgentActor(req);
      const result = await service.verify({
        requestId: req.params.requestId,
        body: req.body,
        actor,
      });
      res.status(result.httpStatus).json(result.response);
    }),
  );

  return router;
}

function asyncHandler(
  handler: (req: Request, res: Response) => Promise<void>,
) {
  return (req: Request, res: Response) => {
    handler(req, res).catch(error => {
      if (error instanceof TeeMlError) {
        return res
          .status(error.httpStatus)
          .type("application/problem+json")
          .json({
            type: "about:blank",
            title: "TeeML verification failed",
            status: error.httpStatus,
            code: error.code,
          });
      }
      if (error instanceof PolicyEngineError) {
        return res
          .status(error.status)
          .type("application/problem+json")
          .json({
            type: "about:blank",
            title: "TeeML request rejected",
            status: error.status,
            code: error.code,
          });
      }
      res
        .status(500)
        .type("application/problem+json")
        .json({
          type: "about:blank",
          title: "TeeML verification failed",
          status: 500,
          code: "TEEML_UNKNOWN_RESULT",
        });
    });
  };
}
