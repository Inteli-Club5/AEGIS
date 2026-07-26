// AEGIS co-signer. Re-checks the decision receipt and the requested payment
// legs, then co-signs and executes the Safe 2-of-3 payment (agent signer +
// AEGIS co-signer + recovery guardian). Key in .env for DEMO ONLY - never
// exposed to the user; local HSM/MPC/TEE in prod, always self-hosted.
import "dotenv/config";
import express from "express";
import { CosignError, cosignAndExecute, type CosignRequest } from "./cosign.js";

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true, service: "aegis-cosigner" }));

// POST /cosign  { safeAddress, paymentCall, nonce, agentSignature, decisionReceipt, decisionReceiptSignature }
app.post("/cosign", async (req, res) => {
  const rpcUrl = process.env.RPC_URL;
  const cosignerPrivateKey = process.env.COSIGNER_PRIVATE_KEY;
  const expectedAgentVerifierSignerAddress =
    process.env.AEGIS_AGENT_VERIFIER_SIGNER_ADDRESS;

  if (!rpcUrl || !cosignerPrivateKey || !expectedAgentVerifierSignerAddress) {
    return res.status(503).json({ error: "cosigner_unconfigured" });
  }

  const body = req.body as Partial<CosignRequest> | undefined;
  if (
    !body ||
    typeof body.safeAddress !== "string" ||
    !body.paymentCall ||
    typeof body.paymentCall.to !== "string" ||
    typeof body.paymentCall.value !== "string" ||
    typeof body.paymentCall.data !== "string" ||
    typeof body.nonce !== "number" ||
    !body.agentSignature ||
    typeof body.agentSignature.signer !== "string" ||
    typeof body.agentSignature.data !== "string" ||
    !body.decisionReceipt ||
    typeof body.decisionReceiptSignature !== "string"
  ) {
    return res.status(400).json({ error: "invalid_cosign_request" });
  }

  try {
    const result = await cosignAndExecute(body as CosignRequest, {
      rpcUrl,
      cosignerPrivateKey,
      expectedAgentVerifierSignerAddress,
    });
    res.status(200).json(result);
  } catch (error) {
    if (error instanceof CosignError) {
      return res.status(403).json({ error: error.code, message: error.message });
    }
    res.status(502).json({
      error: "cosign_failed",
      message: error instanceof Error ? error.message : "unknown_error",
    });
  }
});

app.listen(process.env.COSIGNER_PORT ?? 4100, () =>
  console.log(`aegis-cosigner on :${process.env.COSIGNER_PORT ?? 4100}`));