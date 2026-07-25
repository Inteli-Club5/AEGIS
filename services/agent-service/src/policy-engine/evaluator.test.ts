import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DENY_PRECHECK,
  PASS_TO_TEEML,
  evaluateDeterministicPolicy,
  type AssetCatalogEntry,
  type DeterministicPolicyEvaluationInput,
  type DeterministicPolicyReasonCode,
  type NormalizedAction,
  type UsageSnapshot,
} from "./evaluator.js";
import { NETWORK_ID, type Hex32, type Policy, type PolicyRules } from "./types.js";

const AGENT_ID = "018f0000-0000-7000-8000-000000000001";
const WALLET_ID = "018f0000-0000-7000-8000-000000000002";
const OTHER_AGENT_ID = "018f0000-0000-7000-8000-000000000099";
const OTHER_WALLET_ID = "018f0000-0000-7000-8000-000000000098";
const POLICY_HASH = `0x${"11".repeat(32)}` as Hex32;
const ACTION_HASH = `0x${"22".repeat(32)}` as Hex32;
const OTHER_ACTION_HASH = `0x${"33".repeat(32)}` as Hex32;
const HBAR_ASSET_ID = "hedera:testnet:hbar";
const HTS_ASSET_ID = "hedera:testnet:hts:0.0.12345";

describe("DeterministicPolicyEvaluator", () => {
  describe("valid cases", () => {
    it("passes a valid HBAR action to TeeML without granting final allowance", () => {
      const result = evaluateDeterministicPolicy(baseInput());

      assert.deepEqual(result, {
        status: PASS_TO_TEEML,
        policyId: "policy-1",
        policyVersion: 1,
        policyHash: POLICY_HASH,
        actionHash: ACTION_HASH,
        aegisNonce: "1",
        evaluatedAt: 1500,
      });
    });

    it("passes a valid fungible HTS action using the catalog identity", () => {
      const result = evaluateDeterministicPolicy(
        baseInput({
          normalizedAction: {
            actionType: "HEDERA_HTS_FUNGIBLE_TRANSFER",
            assetId: HTS_ASSET_ID,
            amount: "250",
          },
          assetCatalogEntry: htsAsset(),
        }),
      );

      assert.equal(result.status, PASS_TO_TEEML);
      assert.equal(result.policyVersion, 1);
    });

    it("allows amount, monetary limit, action count, and expiry boundary cases", () => {
      const cases: DeterministicPolicyEvaluationInput[] = [
        baseInput({ normalizedAction: { amount: "10" } }),
        baseInput({ normalizedAction: { amount: "1000" } }),
        baseInput({
          normalizedAction: { amount: "1000" },
          usageSnapshot: { periodAmountUsed: "3000", periodAmountHeld: "1000" },
        }),
        baseInput({ usageSnapshot: { periodActionCountUsed: 3, periodActionCountHeld: 1 } }),
        baseInput({ now: 1999, normalizedAction: { deadline: 2000 } }),
      ];

      for (const input of cases) {
        assert.equal(evaluateDeterministicPolicy(input).status, PASS_TO_TEEML);
      }
    });

    it("is deterministic for the same input and explicit now", () => {
      const input = baseInput();

      assert.deepEqual(evaluateDeterministicPolicy(input), evaluateDeterministicPolicy(input));
    });
  });

  describe("agent and wallet failures", () => {
    it("returns stable reason codes for agent and wallet state failures", () => {
      const cases: Array<[DeterministicPolicyEvaluationInput, DeterministicPolicyReasonCode]> = [
        [baseInput({ agent: null }), "AGENT_NOT_FOUND"],
        [baseInput({ agent: { status: "PAUSED" } }), "AGENT_NOT_ACTIVE"],
        [baseInput({ agent: { status: "RETIRED" } }), "AGENT_NOT_ACTIVE"],
        [baseInput({ wallet: null }), "WALLET_NOT_FOUND"],
        [baseInput({ wallet: { agentId: OTHER_AGENT_ID } }), "WALLET_AGENT_MISMATCH"],
        [baseInput({ wallet: { status: "PAUSED" } }), "WALLET_NOT_PROTECTED"],
        [baseInput({ wallet: { status: "RETIRED" } }), "WALLET_NOT_PROTECTED"],
        [baseInput({ wallet: { status: "DEAD" } }), "WALLET_NOT_PROTECTED"],
        [baseInput({ wallet: { networkId: "hedera:mainnet" } }), "NETWORK_NOT_SUPPORTED"],
      ];

      for (const [input, code] of cases) {
        assertDenied(input, code);
      }
    });
  });

  describe("policy failures", () => {
    it("returns stable reason codes for policy state and ownership failures", () => {
      const cases: Array<[DeterministicPolicyEvaluationInput, DeterministicPolicyReasonCode]> = [
        [baseInput({ policy: null }), "POLICY_NOT_FOUND"],
        [baseInput({ policy: basePolicy({ agentId: OTHER_AGENT_ID }) }), "POLICY_AGENT_MISMATCH"],
        [baseInput({ policy: basePolicy({ walletId: OTHER_WALLET_ID }) }), "POLICY_WALLET_MISMATCH"],
        [baseInput({ policy: basePolicy({ status: "DRAFT" }) }), "POLICY_NOT_ACTIVE"],
        [baseInput({ policy: basePolicy({ status: "SUPERSEDED" }) }), "POLICY_SUPERSEDED"],
        [baseInput({ policy: basePolicy({ status: "REVOKED" }) }), "POLICY_REVOKED"],
        [baseInput({ now: 2001 }), "POLICY_EXPIRED"],
        [baseInput({ expectedActivePolicyVersion: 2 }), "POLICY_VERSION_STALE"],
      ];

      for (const [input, code] of cases) {
        assertDenied(input, code);
      }
    });

    it("does not mutate a valid policy input", () => {
      const policy = basePolicy();
      const before = structuredClone(policy);
      const input = deepFreeze(baseInput({ policy }));

      evaluateDeterministicPolicy(input);

      assert.deepEqual(policy, before);
    });
  });

  describe("action failures", () => {
    it("returns stable reason codes for action context and policy rule failures", () => {
      const unsupportedRules = baseRules({ allowedActionTypes: ["HEDERA_NFT_TRANSFER"] });
      const cases: Array<[DeterministicPolicyEvaluationInput, DeterministicPolicyReasonCode]> = [
        [baseInput({ normalizedAction: { agentId: OTHER_AGENT_ID } }), "ACTION_CONTEXT_MISMATCH"],
        [baseInput({ normalizedAction: { walletId: OTHER_WALLET_ID } }), "ACTION_CONTEXT_MISMATCH"],
        [baseInput({ normalizedAction: { networkId: "hedera:mainnet" } }), "ACTION_CONTEXT_MISMATCH"],
        [baseInput({ normalizedAction: { deadline: 1499 } }), "ACTION_DEADLINE_EXPIRED"],
        [
          baseInput({
            policy: basePolicy({ rules: baseRules({ allowedActionTypes: ["HEDERA_HBAR_TRANSFER"] }) }),
            normalizedAction: { actionType: "HEDERA_HTS_FUNGIBLE_TRANSFER", assetId: HTS_ASSET_ID },
            assetCatalogEntry: htsAsset(),
          }),
          "ACTION_TYPE_NOT_ALLOWED",
        ],
        [
          baseInput({
            policy: basePolicy({ rules: unsupportedRules }),
            normalizedAction: { actionType: "HEDERA_NFT_TRANSFER" },
          }),
          "ACTION_TYPE_NOT_SUPPORTED",
        ],
        [
          baseInput({
            normalizedAction: {
              destination: {
                kind: "EVM_ADDRESS",
                value: "0x00000000000000000000000000000000000000bb",
                chainId: 296,
              },
            },
          }),
          "DESTINATION_NOT_ALLOWED",
        ],
      ];

      for (const [input, code] of cases) {
        assertDenied(input, code);
      }
    });

    it("accepts an equivalent destination after normalization", () => {
      const policy = basePolicy({
        rules: baseRules({
          allowedDestinations: [{ kind: "URL_ORIGIN", value: "https://API.EXAMPLE.COM/v1/pay" }],
        }),
      });
      const result = evaluateDeterministicPolicy(
        baseInput({
          policy,
          normalizedAction: { destination: { kind: "URL_ORIGIN", value: "https://api.example.com/other/path" } },
        }),
      );

      assert.equal(result.status, PASS_TO_TEEML);
    });
  });

  describe("asset failures", () => {
    it("returns stable reason codes for asset catalog failures", () => {
      const cases: Array<[DeterministicPolicyEvaluationInput, DeterministicPolicyReasonCode]> = [
        [baseInput({ assetCatalogEntry: null }), "ASSET_NOT_FOUND"],
        [baseInput({ normalizedAction: { assetId: HTS_ASSET_ID } }), "ASSET_NOT_FOUND"],
        [baseInput({ assetCatalogEntry: hbarAsset({ active: false }) }), "ASSET_NOT_ACTIVE"],
        [baseInput({ assetCatalogEntry: hbarAsset({ networkId: "hedera:mainnet" }) }), "ASSET_NETWORK_MISMATCH"],
        [
          baseInput({
            normalizedAction: { actionType: "HEDERA_HTS_FUNGIBLE_TRANSFER" },
            assetCatalogEntry: hbarAsset(),
          }),
          "ASSET_ACTION_TYPE_MISMATCH",
        ],
        [
          baseInput({
            normalizedAction: { actionType: "HEDERA_HBAR_TRANSFER", assetId: HTS_ASSET_ID },
            assetCatalogEntry: htsAsset(),
          }),
          "ASSET_ACTION_TYPE_MISMATCH",
        ],
        [
          baseInput({
            policy: basePolicy({
              rules: baseRules({ allowedAssets: [{ kind: "NATIVE", chainId: 296, assetId: "hbar", decimals: 8, symbol: "HBAR" }] }),
            }),
            normalizedAction: { actionType: "HEDERA_HTS_FUNGIBLE_TRANSFER", assetId: HTS_ASSET_ID },
            assetCatalogEntry: htsAsset(),
          }),
          "ASSET_NOT_ALLOWED",
        ],
      ];

      for (const [input, code] of cases) {
        assertDenied(input, code);
      }
    });

    it("uses HBAR and HTS decimals from the catalog, not the action request", () => {
      assert.equal(evaluateDeterministicPolicy(baseInput({ assetCatalogEntry: hbarAsset({ decimals: 8 }) })).status, PASS_TO_TEEML);
      assert.equal(
        evaluateDeterministicPolicy(
          baseInput({
            normalizedAction: { actionType: "HEDERA_HTS_FUNGIBLE_TRANSFER", assetId: HTS_ASSET_ID },
            assetCatalogEntry: htsAsset({ decimals: 6 }),
          }),
        ).status,
        PASS_TO_TEEML,
      );
    });
  });

  describe("amount and limit failures", () => {
    it("rejects invalid amount formats without using number or float money handling", () => {
      for (const amount of ["", "1.1", "1e3", "abc", "-1", "0"]) {
        assertDenied(baseInput({ normalizedAction: { amount } }), "AMOUNT_INVALID");
      }
    });

    it("returns stable reason codes for amount and usage limit failures", () => {
      const cases: Array<[DeterministicPolicyEvaluationInput, DeterministicPolicyReasonCode]> = [
        [baseInput({ normalizedAction: { amount: "9" } }), "AMOUNT_BELOW_MIN"],
        [baseInput({ normalizedAction: { amount: "1001" } }), "AMOUNT_ABOVE_MAX"],
        [
          baseInput({
            normalizedAction: { amount: "500" },
            usageSnapshot: { periodAmountUsed: "4501", periodAmountHeld: "0" },
          }),
          "DAILY_LIMIT_EXCEEDED",
        ],
        [
          baseInput({
            normalizedAction: { amount: "500" },
            usageSnapshot: { periodAmountUsed: "4000", periodAmountHeld: "600" },
          }),
          "DAILY_LIMIT_EXCEEDED",
        ],
        [baseInput({ usageSnapshot: { periodActionCountUsed: 5, periodActionCountHeld: 0 } }), "ACTION_COUNT_LIMIT_EXCEEDED"],
        [baseInput({ usageSnapshot: { periodActionCountUsed: 4, periodActionCountHeld: 1 } }), "ACTION_COUNT_LIMIT_EXCEEDED"],
      ];

      for (const [input, code] of cases) {
        assertDenied(input, code);
      }
    });

    it("handles amounts larger than Number.MAX_SAFE_INTEGER with bigint", () => {
      const huge = "900719925474099312345";
      const result = evaluateDeterministicPolicy(
        baseInput({
          policy: basePolicy({
            rules: baseRules({ amount: { min: "1", max: huge, dailyLimit: huge } }),
          }),
          normalizedAction: { amount: huge },
        }),
      );

      assert.equal(result.status, PASS_TO_TEEML);
    });
  });

  describe("nonce and action hash failures", () => {
    it("validates nonce format and pure reuse evidence when supplied", () => {
      assertDenied(baseInput({ generatedAegisNonce: "abc" }), "NONCE_INVALID");
      assertDenied(baseInput({ usageSnapshot: { usedAegisNonces: ["1"] } }), "NONCE_ALREADY_USED");
    });

    it("validates action hash format and optional pure mismatch evidence", () => {
      assertDenied(baseInput({ calculatedActionHash: "0x123" }), "ACTION_HASH_INVALID");
      assertDenied(baseInput({ expectedActionHash: OTHER_ACTION_HASH }), "ACTION_HASH_MISMATCH");
    });
  });

  describe("pure function properties", () => {
    it("always returns the first failure in the required order", () => {
      assertDenied(baseInput({ agent: { status: "PAUSED" }, wallet: null, policy: null }), "AGENT_NOT_ACTIVE");
      assertDenied(baseInput({ now: 2001, normalizedAction: { amount: "0", deadline: 1499 } }), "POLICY_EXPIRED");
    });

    it("does not mutate any input object", () => {
      const input = baseInput();
      const before = structuredClone(input);

      evaluateDeterministicPolicy(deepFreeze(input));

      assert.deepEqual(input, before);
    });

    it("does not read Date.now or depend on the global clock", () => {
      const originalDateNow = Date.now;
      Date.now = () => {
        throw new Error("Date.now must not be called by the evaluator");
      };

      try {
        assert.equal(evaluateDeterministicPolicy(baseInput({ now: 1500 })).status, PASS_TO_TEEML);
        assertDenied(baseInput({ now: 2001 }), "POLICY_EXPIRED");
      } finally {
        Date.now = originalDateNow;
      }
    });

    it("does not depend on environment variables", () => {
      const previousValue = process.env.AEGIS_EVALUATOR_TEST_VALUE;
      const input = baseInput();
      process.env.AEGIS_EVALUATOR_TEST_VALUE = "left";
      const left = evaluateDeterministicPolicy(input);
      process.env.AEGIS_EVALUATOR_TEST_VALUE = "right";
      const right = evaluateDeterministicPolicy(input);

      if (previousValue === undefined) {
        delete process.env.AEGIS_EVALUATOR_TEST_VALUE;
      } else {
        process.env.AEGIS_EVALUATOR_TEST_VALUE = previousValue;
      }

      assert.deepEqual(left, right);
    });
  });
});

type InputOverrides = Partial<Omit<DeterministicPolicyEvaluationInput, "agent" | "wallet" | "normalizedAction" | "usageSnapshot">> & {
  agent?: Partial<NonNullable<DeterministicPolicyEvaluationInput["agent"]>> | null;
  wallet?: Partial<NonNullable<DeterministicPolicyEvaluationInput["wallet"]>> | null;
  normalizedAction?: Partial<NormalizedAction>;
  usageSnapshot?: Partial<UsageSnapshot>;
};

function baseInput(overrides: InputOverrides = {}): DeterministicPolicyEvaluationInput {
  const agent = overrides.agent === null ? null : { agentId: AGENT_ID, status: "ACTIVE" as const, ...overrides.agent };
  const wallet =
    overrides.wallet === null
      ? null
      : {
          walletId: WALLET_ID,
          agentId: AGENT_ID,
          networkId: NETWORK_ID,
          status: "ACTIVE_PROTECTED" as const,
          ...overrides.wallet,
        };

  return {
    agent,
    wallet,
    policy: overrides.policy === undefined ? basePolicy() : overrides.policy,
    expectedActivePolicyVersion: overrides.expectedActivePolicyVersion ?? 1,
    normalizedAction: { ...baseAction(), ...overrides.normalizedAction },
    assetCatalogEntry: overrides.assetCatalogEntry === undefined ? hbarAsset() : overrides.assetCatalogEntry,
    usageSnapshot: { ...baseUsageSnapshot(), ...overrides.usageSnapshot },
    now: overrides.now ?? 1500,
    generatedAegisNonce: overrides.generatedAegisNonce ?? "1",
    calculatedActionHash: overrides.calculatedActionHash ?? ACTION_HASH,
    expectedActionHash: overrides.expectedActionHash,
  };
}

function basePolicy(overrides: Partial<Policy> = {}): Policy {
  return {
    policyId: "policy-1",
    agentId: AGENT_ID,
    walletId: WALLET_ID,
    policyVersion: 1,
    policyHash: POLICY_HASH,
    status: "ACTIVE",
    validFrom: 1000,
    validUntil: 2000,
    rules: baseRules(),
    semanticRules: [],
    createdAt: 1000,
    updatedAt: 1000,
    activatedAt: 1100,
    revokedAt: null,
    supersededAt: null,
    supersededByPolicyId: null,
    ...overrides,
  };
}

function baseRules(overrides: Partial<PolicyRules> = {}): PolicyRules {
  return {
    allowedActionTypes: overrides.allowedActionTypes ?? ["HEDERA_HBAR_TRANSFER", "HEDERA_HTS_FUNGIBLE_TRANSFER"],
    allowedDestinations: overrides.allowedDestinations ?? [
      { kind: "EVM_ADDRESS", value: "0x00000000000000000000000000000000000000AA", chainId: 296 },
    ],
    allowedAssets: overrides.allowedAssets ?? [
      { kind: "NATIVE", chainId: 296, assetId: "hbar", decimals: 8, symbol: "HBAR" },
      { kind: "HTS", chainId: 296, tokenId: "0.0.12345", decimals: 6, symbol: "DEMO" },
    ],
    amount: overrides.amount ?? { min: "10", max: "1000", dailyLimit: "5000" },
    actionCount: overrides.actionCount ?? { dailyLimit: 5 },
  };
}

function baseAction(): NormalizedAction {
  return {
    actionType: "HEDERA_HBAR_TRANSFER",
    agentId: AGENT_ID,
    walletId: WALLET_ID,
    networkId: NETWORK_ID,
    destination: { kind: "EVM_ADDRESS", value: "0x00000000000000000000000000000000000000aa", chainId: 296 },
    assetId: HBAR_ASSET_ID,
    amount: "100",
    deadline: 1600,
  };
}

function baseUsageSnapshot(): UsageSnapshot {
  return {
    periodAmountUsed: "0",
    periodAmountHeld: "0",
    periodActionCountUsed: 0,
    periodActionCountHeld: 0,
  };
}

function hbarAsset(overrides: Partial<AssetCatalogEntry> = {}): AssetCatalogEntry {
  return {
    canonicalAssetId: HBAR_ASSET_ID,
    networkId: NETWORK_ID,
    kind: "HBAR",
    active: true,
    decimals: 8,
    symbol: "HBAR",
    ...overrides,
  };
}

function htsAsset(overrides: Partial<AssetCatalogEntry> = {}): AssetCatalogEntry {
  return {
    canonicalAssetId: HTS_ASSET_ID,
    networkId: NETWORK_ID,
    kind: "HTS_FUNGIBLE",
    active: true,
    decimals: 6,
    tokenId: "0.0.12345",
    symbol: "DEMO",
    ...overrides,
  };
}

function assertDenied(input: DeterministicPolicyEvaluationInput, code: DeterministicPolicyReasonCode): void {
  const result = evaluateDeterministicPolicy(input);

  assert.equal(result.status, DENY_PRECHECK);
  if (result.status === DENY_PRECHECK) {
    assert.equal(result.code, code);
    assert.equal(typeof result.message, "string");
    assert.equal(result.evaluatedAt, input.now);
  }
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  Object.freeze(value);
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreeze(child);
  }
  return value;
}
