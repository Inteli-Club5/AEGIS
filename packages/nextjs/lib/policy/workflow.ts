import type { AgenticIdInfo, EffectivePolicyStatus, Policy } from "../types/aegis.ts";

export type ProtectionPhase = "sign-activation" | "agentic-id";

export type ProtectionGateway = {
  getPolicy: (policyId: string) => Promise<Policy>;
  activatePolicy: (policy: Policy) => Promise<Policy>;
  getActivePolicy: (
    agentId: string,
    walletId: string,
  ) => Promise<{ policy: Policy | null; effectiveStatus: EffectivePolicyStatus | null }>;
  getAgenticId: (agentId: string) => Promise<AgenticIdInfo | null>;
  registerAgenticId: (agentId: string, policyHash: Policy["policyHash"]) => Promise<AgenticIdInfo>;
};

export async function completeProtection(
  input: { agentId: string; policyId: string },
  gateway: ProtectionGateway,
  onPhase?: (phase: ProtectionPhase) => void,
): Promise<{ policy: Policy; agenticId: AgenticIdInfo }> {
  let policy = await gateway.getPolicy(input.policyId);
  if (policy.agentId.toLowerCase() !== input.agentId.toLowerCase()) {
    throw new Error(`Policy ${policy.policyId} does not belong to agent ${input.agentId}.`);
  }

  if (policy.status === "DRAFT") {
    onPhase?.("sign-activation");
    try {
      policy = await gateway.activatePolicy(policy);
    } catch (activationError) {
      policy = await gateway.getPolicy(input.policyId);
      if (policy.status !== "ACTIVE") throw activationError;
    }
  }

  if (policy.status !== "ACTIVE") {
    throw new Error(`Policy ${policy.policyId} is ${policy.status} and cannot activate protection.`);
  }

  const active = await gateway.getActivePolicy(policy.agentId, policy.walletId);
  if (active.effectiveStatus === "EXPIRED") {
    throw new Error(`Policy ${policy.policyId} is expired and cannot protect this agent.`);
  }
  if (active.effectiveStatus !== "ACTIVE" || active.policy?.policyId.toLowerCase() !== policy.policyId.toLowerCase()) {
    throw new Error(`Policy ${policy.policyId} is not the effective active policy for this wallet.`);
  }
  policy = active.policy;

  onPhase?.("agentic-id");
  const existingAgenticId = await gateway.getAgenticId(input.agentId);
  let agenticId = existingAgenticId;
  if (!agenticId) {
    try {
      agenticId = await gateway.registerAgenticId(input.agentId, policy.policyHash);
    } catch (registrationError) {
      agenticId = await gateway.getAgenticId(input.agentId);
      if (!agenticId) throw registrationError;
    }
  }

  return { policy, agenticId };
}
