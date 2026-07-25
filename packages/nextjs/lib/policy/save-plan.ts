import type { Policy } from "../types/aegis.ts";
import { stableStringify } from "./hash.ts";

export type DesiredPolicyVersion = Pick<Policy, "validFrom" | "validUntil" | "rules" | "semanticRules">;

export type PolicySavePlan =
  | { kind: "CREATE"; policyVersion: 1 }
  | { kind: "REUSE"; policy: Policy }
  | { kind: "UPDATE"; sourcePolicy: Policy; policyVersion: number };

export function planPolicySave(versions: Policy[], desired: DesiredPolicyVersion): PolicySavePlan {
  const latest = versions.reduce<Policy | undefined>(
    (current, policy) => (!current || policy.policyVersion > current.policyVersion ? policy : current),
    undefined,
  );
  if (!latest) return { kind: "CREATE", policyVersion: 1 };

  if (
    stableStringify({
      validFrom: latest.validFrom,
      validUntil: latest.validUntil,
      rules: latest.rules,
      semanticRules: latest.semanticRules,
    }) === stableStringify(desired)
  ) {
    return { kind: "REUSE", policy: latest };
  }

  return {
    kind: "UPDATE",
    sourcePolicy: latest,
    policyVersion: latest.policyVersion + 1,
  };
}
