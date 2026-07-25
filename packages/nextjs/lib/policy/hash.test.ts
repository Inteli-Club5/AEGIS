import { computePolicyHash } from "./hash.ts";
import assert from "node:assert/strict";
import { it } from "node:test";

it("matches the Policy Engine Level 1 golden policy hash", () => {
  const policyHash = computePolicyHash({
    agentId: "018f0000-0000-7000-8000-000000000001",
    walletId: "018f0000-0000-7000-8000-000000000002",
    policyVersion: 1,
    validFrom: 100,
    validUntil: 2000,
    rules: {
      allowedActionTypes: ["SERVICE_PAYMENT", "TRANSFER"],
      allowedDestinations: [
        {
          kind: "EVM_ADDRESS",
          value: "0x00000000000000000000000000000000000000aa",
          chainId: 296,
        },
        { kind: "URL_ORIGIN", value: "https://api.example.com" },
      ],
      allowedAssets: [
        { kind: "NATIVE", chainId: 296, assetId: "hbar", decimals: 8 },
        { kind: "HTS", chainId: 296, tokenId: "0.0.12345", decimals: 6 },
      ],
      amount: { min: "1", max: "100", dailyLimit: "1000" },
      actionCount: { dailyLimit: 10 },
    },
    semanticRules: [
      { ruleId: "invoice", kind: "TEXT", params: { required: true } },
      { ruleId: "purpose", kind: "TEXT", params: { value: "pay approved providers" } },
    ],
  });

  assert.equal(policyHash, "0x955f255d436d6af3f3da4983e077746857dca9906e32869606f970efcba3d21e");
});
