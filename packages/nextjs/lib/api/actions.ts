import { requestJson } from "~~/lib/api/http";
import type { AgentServiceProfile } from "~~/lib/api/onboarding";
import {
  AGENT_ACTION_AUTH_DOMAIN,
  AGENT_ACTION_AUTH_TYPES,
  type AgentAction,
  type AgentActionAuthorizationMessage,
  buildAgentActionAuthorization,
  hashActionContext,
} from "~~/lib/policy/action-auth";
import type { DestinationIdentity } from "~~/lib/policy/hash";

export type SignAgentAction = (params: {
  domain: typeof AGENT_ACTION_AUTH_DOMAIN;
  types: typeof AGENT_ACTION_AUTH_TYPES;
  primaryType: "AgentActionAuthorization";
  message: AgentActionAuthorizationMessage;
}) => Promise<`0x${string}`>;

// Every agent-bearer call requires proof the connected operator wallet owns
// the agent (see lib/policy/action-auth.ts) -- signed fresh, right before the
// request, so it's bound to exactly this call's context.
async function authorizeAgentAction(
  agentId: string,
  action: AgentAction,
  contextHash: `0x${string}`,
  operatorAddress: `0x${string}`,
  signAgentAction: SignAgentAction,
): Promise<Record<string, string>> {
  const issuedAt = Math.floor(Date.now() / 1000);
  const message = buildAgentActionAuthorization({ agentId, operatorAddress, action, contextHash, issuedAt });
  const signature = await signAgentAction({
    domain: AGENT_ACTION_AUTH_DOMAIN,
    types: AGENT_ACTION_AUTH_TYPES,
    primaryType: "AgentActionAuthorization",
    message,
  });
  return {
    "x-aegis-operator-address": operatorAddress,
    "x-aegis-operator-signature": signature,
    "x-aegis-operator-issued-at": String(issuedAt),
  };
}

export async function registerAgenticId(
  agentId: string,
  operatorAddress: `0x${string}`,
  signAgentAction: SignAgentAction,
): Promise<AgentServiceProfile> {
  const headers = await authorizeAgentAction(
    agentId,
    "REGISTER_AGENTIC_ID",
    hashActionContext({}),
    operatorAddress,
    signAgentAction,
  );
  return requestJson<AgentServiceProfile>(
    `/api/agent-service/agents/${encodeURIComponent(agentId)}/register-agentic-id`,
    { method: "POST", headers },
  );
}

export type PrecheckActionInput = {
  actionType: string;
  destination: DestinationIdentity;
  assetId: string;
  amount: string;
  actionDeadline: number;
};

export type PrecheckPassResult = {
  requestId: string;
  precheckId: string;
  status: "PENDING_TEEML";
  policyId: string;
  policyVersion: number;
  policyHash: `0x${string}`;
  actionHash: `0x${string}`;
  aegisNonce: string;
  usageHoldId: string;
  usageHoldExpiresAt: number;
  evaluatedAt: number;
};

export type PrecheckDenyResult = {
  requestId: string;
  precheckId: string;
  stage: "PRECHECK";
  status: "DENY_PRECHECK";
  code: string;
  policyId: string;
  policyVersion: number;
  policyHash: `0x${string}`;
  actionHash: `0x${string}`;
  aegisNonce: null;
  evaluatedAt: number;
};

export type PrecheckResult = PrecheckPassResult | PrecheckDenyResult;

export async function precheckAction(
  agentId: string,
  walletId: string,
  body: PrecheckActionInput,
  idempotencyKey: string,
  operatorAddress: `0x${string}`,
  signAgentAction: SignAgentAction,
): Promise<PrecheckResult> {
  const headers = await authorizeAgentAction(
    agentId,
    "PRECHECK",
    hashActionContext(body),
    operatorAddress,
    signAgentAction,
  );
  return requestJson<PrecheckResult>(
    `/api/agent-service/agents/${encodeURIComponent(agentId)}/wallets/${encodeURIComponent(walletId)}/actions/precheck`,
    { method: "POST", body, headers: { ...headers, "Idempotency-Key": idempotencyKey } },
  );
}

export type TeeMlVerifyInput = { serviceId: string; productId?: string };

export type TeeMlProcessingResult = {
  requestId: string;
  status: "TEEML_PROCESSING";
  semanticContextHash: `0x${string}`;
  teemlRequestHash: `0x${string}`;
};

export type TeeMlAllowResult = {
  requestId: string;
  status: "TEEML_ALLOWED" | "TEETLS_HACKATHON_ALLOWED";
  verdict: "ALLOW";
  reasonCode: string;
  policyHash: `0x${string}`;
  actionHash: `0x${string}`;
  semanticContextHash: `0x${string}`;
  teemlRequestHash: `0x${string}`;
  teeVerified: boolean;
  securityProfile: string;
  trustMode: string;
  verificationMode: string;
  sealedInference: boolean;
  modelId: string;
  evaluatedAt: number;
};

export type TeeMlDenyResult = {
  requestId: string;
  status: "TEEML_DENIED";
  verdict: "DENY";
  reasonCode: string;
  policyHash: `0x${string}`;
  actionHash: `0x${string}`;
  semanticContextHash: `0x${string}`;
  teemlRequestHash: `0x${string}`;
  evaluatedAt: number;
};

export type TeeMlVerifyResult = TeeMlProcessingResult | TeeMlAllowResult | TeeMlDenyResult;

export async function verifyTeeml(
  agentId: string,
  requestId: string,
  body: TeeMlVerifyInput,
  operatorAddress: `0x${string}`,
  signAgentAction: SignAgentAction,
): Promise<TeeMlVerifyResult> {
  const headers = await authorizeAgentAction(
    agentId,
    "TEEML_VERIFY",
    hashActionContext({ requestId, serviceId: body.serviceId, productId: body.productId ?? null }),
    operatorAddress,
    signAgentAction,
  );
  return requestJson<TeeMlVerifyResult>(
    `/api/agent-service/actions/${encodeURIComponent(requestId)}/teeml/verify?agentId=${encodeURIComponent(agentId)}`,
    { method: "POST", body, headers },
  );
}

export type ExecuteActionResult = {
  status: "EXECUTED";
  requestId: string;
  safeTxHash: `0x${string}`;
  transactionHash: `0x${string}`;
  amount: string;
  feeAmount: string;
};

export async function executeAction(
  agentId: string,
  requestId: string,
  operatorAddress: `0x${string}`,
  signAgentAction: SignAgentAction,
): Promise<ExecuteActionResult> {
  const headers = await authorizeAgentAction(
    agentId,
    "EXECUTE",
    hashActionContext({ requestId }),
    operatorAddress,
    signAgentAction,
  );
  return requestJson<ExecuteActionResult>(
    `/api/agent-service/actions/${encodeURIComponent(requestId)}/execute?agentId=${encodeURIComponent(agentId)}`,
    { method: "POST", headers },
  );
}
