// AEGIS co-signer (skeleton). Re-checks policy + identity + decision receipt,
// then co-signs (Safe 2-of-3: agent signer + AEGIS co-signer + recovery
// guardian). Key in .env for DEMO ONLY - never exposed to the user; always
// local, KMS/HSM/MPC in prod.
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
  // TODO(aegis): this only enforces 0G/policy in this handler's own code - the
  // Safe itself just checks for 2-of-3 signatures, so a stolen
  // COSIGNER_PRIVATE_KEY can sign offline without ever hitting this endpoint.
  // Close this with a Safe Guard/Module that requires a verifiable 0G
  // attestation on-chain before allowing execution. Blocked on the real
  // verification-gated 0G integration tracked by TG-TEEML-E2E-001.
  res.status(501).json({ error: "not_implemented" });
});

app.listen(process.env.COSIGNER_PORT ?? 4100, () =>
  console.log(`aegis-cosigner on :${process.env.COSIGNER_PORT ?? 4100}`));
