import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeSemanticContextHash, computeTeeMlRequestHash } from "./hashing.js";
import { normalizeTrustedSemanticContext } from "./schemas.js";

const HASH_A = `0x${"11".repeat(32)}` as const;
const HASH_B = `0x${"22".repeat(32)}` as const;
const HASH_C = `0x${"33".repeat(32)}` as const;

function contextInput() {
  return {
    schemaVersion: "1.0",
    requestId: " Request-01 ",
    agent: {
      agentId: " Agent-01 ",
      agenticId: " 0G:Agentic:01 ",
      capabilityIds: [" hedera.transfer ", "catalog.read", "HEDERA.TRANSFER"],
    },
    policy: {
      policyId: " Policy-01 ",
      policyVersion: 2,
      policyHash: HASH_A.toUpperCase().replace("0X", "0x"),
      semanticRules: [" allow approved monitoring services ", "deny unrelated purchases"],
    },
    action: {
      actionHash: HASH_B,
      actionType: "HEDERA_HBAR_TRANSFER",
      destination: " 0.0.12345 ",
      assetId: " HEDERA:TESTNET:HBAR ",
      amount: "000100",
    },
    trustedService: {
      providerId: " Provider-01 ",
      serviceId: " Monitoring ",
      categoryIds: [" Security ", "monitoring"],
      capabilityIds: ["hedera.transfer", " catalog.read "],
      metadataHash: HASH_C,
      shortDescription: "  Approved   API monitoring service  ",
    },
  };
}

describe("trusted semantic context commitments", () => {
  it("is stable across set ordering and normalization but changes for semantic input", () => {
    const left = normalizeTrustedSemanticContext(contextInput());
    const reorderedInput = contextInput();
    reorderedInput.agent.capabilityIds.reverse();
    reorderedInput.policy.semanticRules.reverse();
    reorderedInput.trustedService.categoryIds.reverse();
    reorderedInput.trustedService.capabilityIds.reverse();
    const right = normalizeTrustedSemanticContext(reorderedInput);

    const leftHash = computeSemanticContextHash(left);
    assert.equal(
      leftHash,
      "0x5334ded0022b17e49953f7eaf4da1078ccd4f3d56972f3dfe8f363f832fb821d",
    );
    assert.equal(computeSemanticContextHash(right), leftHash);

    const changedRule = structuredClone(left);
    changedRule.policy.semanticRules[0] = "allow a different service purpose";
    assert.notEqual(computeSemanticContextHash(changedRule), leftHash);

    const changedCapability = structuredClone(left);
    changedCapability.agent.capabilityIds = ["catalog.read"];
    assert.notEqual(computeSemanticContextHash(changedCapability), leftHash);

    const changedMetadata = structuredClone(left);
    changedMetadata.trustedService!.metadataHash = HASH_A;
    assert.notEqual(computeSemanticContextHash(changedMetadata), leftHash);

    const auditEnvelopeBefore = {
      context: left,
      status: "PENDING_TEEML",
      evaluatedAt: 1_800_000_000,
      latencyMs: 1,
    };
    const auditEnvelopeAfter = {
      context: left,
      status: "TEEML_ALLOWED",
      evaluatedAt: 1_900_000_000,
      latencyMs: 9_999,
    };
    assert.equal(
      computeSemanticContextHash(auditEnvelopeBefore.context),
      computeSemanticContextHash(auditEnvelopeAfter.context),
    );

    const requestHash = computeTeeMlRequestHash(left, leftHash);
    assert.equal(
      requestHash,
      "0xf2eb72e6e6e451080a4cc2390a3bcc673f14623a038980b82562aa78c39088ee",
    );
    const changedPolicyHash = structuredClone(left);
    changedPolicyHash.policy.policyHash = HASH_C;
    assert.notEqual(
      computeTeeMlRequestHash(
        changedPolicyHash,
        computeSemanticContextHash(changedPolicyHash),
      ),
      requestHash,
    );
    const changedAction = structuredClone(left);
    changedAction.action.actionHash = HASH_C;
    assert.notEqual(
      computeTeeMlRequestHash(changedAction, computeSemanticContextHash(changedAction)),
      requestHash,
    );
    assert.notEqual(
      computeTeeMlRequestHash(
        changedCapability,
        computeSemanticContextHash(changedCapability),
      ),
      requestHash,
    );
    assert.notEqual(
      computeTeeMlRequestHash(
        changedMetadata,
        computeSemanticContextHash(changedMetadata),
      ),
      requestHash,
    );
  });
});
