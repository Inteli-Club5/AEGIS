import { NextResponse } from "next/server";
import { toOnchainApiError } from "~~/lib/onchain-data/apiErrors";
import {
  AUDIT_COPILOT_MAX_REQUEST_BYTES,
  AuditCopilotEvidenceError,
  AuditCopilotInputError,
  AuditCopilotRequestTooLargeError,
  parseAuditCopilotRequest,
  readAuditCopilotRequestBody,
  runAuditCopilot,
} from "~~/lib/onchain-data/auditCopilot";
import { getZeroGGraphClient } from "~~/lib/onchain-data/serverClients";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await readAuditCopilotRequestBody(request);
    const result = await runAuditCopilot({
      client: getZeroGGraphClient(),
      request: parseAuditCopilotRequest(body),
    });
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof AuditCopilotRequestTooLargeError) {
      return NextResponse.json(
        {
          error: "audit_copilot_request_too_large",
          message: `Request body must not exceed ${AUDIT_COPILOT_MAX_REQUEST_BYTES} bytes.`,
        },
        { status: 413 },
      );
    }
    if (error instanceof AuditCopilotInputError) {
      return NextResponse.json({ error: "invalid_audit_question", message: error.message }, { status: 400 });
    }
    if (error instanceof AuditCopilotEvidenceError) {
      return NextResponse.json({ error: "audit_evidence_unavailable", message: error.message }, { status: 409 });
    }
    const response = toOnchainApiError(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
