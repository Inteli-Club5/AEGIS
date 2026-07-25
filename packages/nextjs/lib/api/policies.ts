import { type OperatorHeaders, requestJson } from "~~/lib/api/http";
import type { EffectivePolicyStatus, Policy } from "~~/lib/types/aegis";

export async function getPolicy(policyId: string): Promise<Policy> {
  const { policy } = await requestJson<{ policy: Policy }>(
    `/api/agent-service/policies/${encodeURIComponent(policyId)}`,
  );
  return policy;
}

export async function listPolicyVersions(policyId: string): Promise<Policy[]> {
  const { policies } = await requestJson<{ policies: Policy[] }>(
    `/api/agent-service/policies/${encodeURIComponent(policyId)}/versions`,
  );
  return policies;
}

export async function getActivePolicy(
  agentId: string,
  walletId: string,
): Promise<{
  policy: Policy | null;
  effectiveStatus: EffectivePolicyStatus | null;
}> {
  return requestJson(
    `/api/agent-service/agents/${encodeURIComponent(agentId)}/wallets/${encodeURIComponent(walletId)}/policies/active`,
  );
}

export async function postPolicy(
  body: {
    agentId: string;
    walletId: string;
    validFrom: number;
    validUntil: number | null;
    rules: Policy["rules"];
    semanticRules?: Policy["semanticRules"];
  },
  operator: OperatorHeaders,
): Promise<Policy> {
  const { policy } = await requestJson<{ policy: Policy }>("/api/agent-service/policies", {
    method: "POST",
    body,
    operator,
  });
  return policy;
}

export async function patchPolicy(
  policyId: string,
  body: {
    expectedPolicyVersion: number;
    validFrom: number;
    validUntil: number | null;
    rules: Policy["rules"];
    semanticRules?: Policy["semanticRules"];
  },
  operator: OperatorHeaders,
): Promise<Policy> {
  const { policy } = await requestJson<{ policy: Policy }>(
    `/api/agent-service/policies/${encodeURIComponent(policyId)}`,
    { method: "PATCH", body, operator },
  );
  return policy;
}

export async function postPolicyActivation(policy: Policy, operator: OperatorHeaders): Promise<Policy> {
  const response = await requestJson<{ policy: Policy }>(
    `/api/agent-service/policies/${encodeURIComponent(policy.policyId)}/activate`,
    {
      method: "POST",
      body: {
        expectedPolicyVersion: policy.policyVersion,
        expectedPolicyHash: policy.policyHash,
      },
      operator,
    },
  );
  return response.policy;
}

export async function postPolicyRevocation(policy: Policy, operator: OperatorHeaders): Promise<Policy> {
  const { policy: revoked } = await requestJson<{ policy: Policy }>(
    `/api/agent-service/policies/${encodeURIComponent(policy.policyId)}/revoke`,
    {
      method: "POST",
      body: {
        expectedPolicyVersion: policy.policyVersion,
        expectedPolicyHash: policy.policyHash,
      },
      operator,
    },
  );
  return revoked;
}
