import type { Policy } from "../types/aegis.ts";
import { planPolicySave } from "./save-plan.ts";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

const basePolicy: Policy = {
  policyId: "pol_v1",
  agentId: "agent_1",
  walletId: "wallet_1",
  policyVersion: 1,
  policyHash: `0x${"11".repeat(32)}`,
  status: "ACTIVE",
  validFrom: 100,
  validUntil: null,
  rules: {
    allowedActionTypes: ["HEDERA_HBAR_TRANSFER"],
    allowedDestinations: [{ kind: "HEDERA_ACCOUNT_ID", value: "0.0.7" }],
    allowedAssets: [{ kind: "NATIVE", chainId: 296, assetId: "hbar", decimals: 8 }],
    amount: { min: null, max: "100", dailyLimit: null },
    actionCount: { dailyLimit: null },
  },
  semanticRules: [],
  createdAt: 100,
  updatedAt: 100,
  activatedAt: 101,
  revokedAt: null,
  supersededAt: null,
  supersededByPolicyId: null,
};

describe("Policy save planning", () => {
  it("creates a new series at version 1", () => {
    assert.deepEqual(
      planPolicySave([], {
        validFrom: basePolicy.validFrom,
        validUntil: basePolicy.validUntil,
        rules: basePolicy.rules,
        semanticRules: [],
      }),
      { kind: "CREATE", policyVersion: 1 },
    );
  });

  it("updates from the authoritative latest version instead of posting another v1", () => {
    const latest = {
      ...basePolicy,
      policyId: "pol_v2",
      policyVersion: 2,
      policyHash: `0x${"22".repeat(32)}` as const,
      status: "DRAFT" as const,
    };
    const plan = planPolicySave([basePolicy, latest], {
      validFrom: latest.validFrom,
      validUntil: latest.validUntil,
      rules: {
        ...latest.rules,
        amount: { ...latest.rules.amount, max: "200" },
      },
      semanticRules: [],
    });

    assert.equal(plan.kind, "UPDATE");
    if (plan.kind !== "UPDATE") return;
    assert.equal(plan.sourcePolicy.policyId, latest.policyId);
    assert.equal(plan.policyVersion, 3);
  });

  it("reuses the latest version when nothing changed", () => {
    const plan = planPolicySave([basePolicy], {
      validFrom: basePolicy.validFrom,
      validUntil: basePolicy.validUntil,
      rules: basePolicy.rules,
      semanticRules: [],
    });

    assert.deepEqual(plan, { kind: "REUSE", policy: basePolicy });
  });
});
