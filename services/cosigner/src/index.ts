// AEGIS co-signer (skeleton). Re-checks policy + identity + decision receipt,
// then co-signs (Safe 2-of-2 in prod, AgentVault in MVP). Key in .env for DEMO
// ONLY - never exposed to the user; KMS/HSM in prod.
import "dotenv/config";
import express from "express";

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true, service: "aegis-cosigner" }));

// POST /cosign  { agentId, wallet, policyHash, action, decisionReceipt }
app.post("/cosign", async (_req, res) => {
  // TODO(aegis): verify decisionReceipt signature came from the 0G TEE
  // TODO(aegis): re-check policy (destination, token, amount, deadline, nonce)
  // TODO(aegis): check identity / policyHash; valid -> AcceptedReceipt + co-sign
  //              invalid -> DeniedReceipt, no signature, blocked
  res.status(501).json({ error: "not_implemented" });
});

app.listen(process.env.COSIGNER_PORT ?? 4100, () =>
  console.log(`aegis-cosigner on :${process.env.COSIGNER_PORT ?? 4100}`));
