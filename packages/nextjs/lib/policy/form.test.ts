import { emptyTrustedServiceFormValues, parsePolicyForm, policyToFormValues } from "./form.ts";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

describe("Policy form contract", () => {
  it("accepts a policy with no optional rules filled in", () => {
    const parsed = parsePolicyForm(
      {
        assetKind: "HBAR",
        htsTokenId: "",
        htsDecimals: "",
        destinations: [],
        minAmount: "",
        maxAmount: "",
        dailyAmount: "",
        dailyActionCount: "",
        validFromMode: "NOW",
        validFromLocal: "",
        validUntilMode: "NONE",
        validUntilLocal: "",
        recoveryGuardianMode: "DEFAULT",
        recoveryGuardianAddress: "",
        trustedService: emptyTrustedServiceFormValues(),
      },
      1_800_000_000,
    );

    assert.deepEqual(parsed.rules.allowedDestinations, []);
    assert.deepEqual(parsed.rules.amount, {
      min: null,
      max: null,
      dailyLimit: null,
    });
    assert.deepEqual(parsed.rules.actionCount, { dailyLimit: null });
    assert.equal(parsed.validFrom, 1_800_000_000);
    assert.equal(parsed.validUntil, null);
  });

  it("builds normalized HBAR rules with exact base-unit limits", () => {
    const parsed = parsePolicyForm(
      {
        assetKind: "HBAR",
        htsTokenId: "",
        htsDecimals: "",
        destinations: [
          { kind: "HEDERA_ACCOUNT_ID", value: "0.0.123456" },
          { kind: "EVM_ADDRESS", value: "0x00000000000000000000000000000000000000AA" },
        ],
        minAmount: "0.00000001",
        maxAmount: "2.5",
        dailyAmount: "10",
        dailyActionCount: "5",
        validFromMode: "NOW",
        validFromLocal: "",
        validUntilMode: "NONE",
        validUntilLocal: "",
        recoveryGuardianMode: "DEFAULT",
        recoveryGuardianAddress: "",
        trustedService: emptyTrustedServiceFormValues(),
      },
      1_800_000_000,
    );

    assert.deepEqual(parsed.rules.allowedAssets, [{ kind: "NATIVE", chainId: 296, assetId: "hbar", decimals: 8 }]);
    assert.deepEqual(parsed.rules.allowedActionTypes, ["HEDERA_HBAR_TRANSFER"]);
    assert.deepEqual(parsed.rules.amount, {
      min: "1",
      max: "250000000",
      dailyLimit: "1000000000",
    });
    assert.equal(parsed.rules.actionCount.dailyLimit, 5);
    assert.deepEqual(parsed.rules.allowedDestinations, [
      {
        kind: "EVM_ADDRESS",
        value: "0x00000000000000000000000000000000000000aa",
        chainId: 296,
      },
      { kind: "HEDERA_ACCOUNT_ID", value: "0.0.123456" },
    ]);
    assert.equal(parsed.validFrom, 1_800_000_000);
    assert.equal(parsed.validUntil, null);
  });

  it("builds an HTS policy using that token's decimals", () => {
    const parsed = parsePolicyForm({
      assetKind: "HTS",
      htsTokenId: "0.0.456789",
      htsDecimals: "6",
      destinations: [{ kind: "HEDERA_ACCOUNT_ID", value: "0.0.123456" }],
      minAmount: "",
      maxAmount: "1.000001",
      dailyAmount: "25",
      dailyActionCount: "",
      validFromMode: "CUSTOM",
      validFromLocal: "2027-01-01T12:00",
      validUntilMode: "CUSTOM",
      validUntilLocal: "2027-01-02T12:00",
      recoveryGuardianMode: "DEFAULT",
      recoveryGuardianAddress: "",
      trustedService: emptyTrustedServiceFormValues(),
    });

    assert.deepEqual(parsed.rules.allowedAssets, [{ kind: "HTS", chainId: 296, tokenId: "0.0.456789", decimals: 6 }]);
    assert.deepEqual(parsed.rules.allowedActionTypes, ["HEDERA_HTS_FUNGIBLE_TRANSFER"]);
    assert.deepEqual(parsed.rules.amount, {
      min: null,
      max: "1000001",
      dailyLimit: "25000000",
    });
    assert.equal(parsed.validFrom, Math.floor(new Date("2027-01-01T12:00").getTime() / 1000));
    assert.equal(parsed.validUntil, Math.floor(new Date("2027-01-02T12:00").getTime() / 1000));
  });

  it("rejects invalid validity windows", () => {
    assert.throws(
      () =>
        parsePolicyForm({
          assetKind: "HBAR",
          htsTokenId: "",
          htsDecimals: "",
          destinations: [{ kind: "HEDERA_ACCOUNT_ID", value: "0.0.123456" }],
          minAmount: "",
          maxAmount: "",
          dailyAmount: "",
          dailyActionCount: "",
          validFromMode: "CUSTOM",
          validFromLocal: "2027-01-02T12:00",
          validUntilMode: "CUSTOM",
          validUntilLocal: "2027-01-01T12:00",
          recoveryGuardianMode: "DEFAULT",
          recoveryGuardianAddress: "",
          trustedService: emptyTrustedServiceFormValues(),
        }),
      /expiry must be after its start/i,
    );
  });

  it("normalizes a custom recovery guardian address to its EIP-55 checksum", () => {
    const parsed = parsePolicyForm(
      {
        assetKind: "HBAR",
        htsTokenId: "",
        htsDecimals: "",
        destinations: [{ kind: "HEDERA_ACCOUNT_ID", value: "0.0.123456" }],
        minAmount: "",
        maxAmount: "",
        dailyAmount: "",
        dailyActionCount: "",
        validFromMode: "NOW",
        validFromLocal: "",
        validUntilMode: "NONE",
        validUntilLocal: "",
        recoveryGuardianMode: "CUSTOM",
        recoveryGuardianAddress: "0x000000000000000000000000000000000000ae61",
        trustedService: emptyTrustedServiceFormValues(),
      },
      1_800_000_000,
    );

    assert.equal(parsed.recoveryGuardianAddress, "0x000000000000000000000000000000000000AE61");
  });

  it("rejects a malformed custom recovery guardian address", () => {
    assert.throws(
      () =>
        parsePolicyForm({
          assetKind: "HBAR",
          htsTokenId: "",
          htsDecimals: "",
          destinations: [{ kind: "HEDERA_ACCOUNT_ID", value: "0.0.123456" }],
          minAmount: "",
          maxAmount: "",
          dailyAmount: "",
          dailyActionCount: "",
          validFromMode: "NOW",
          validFromLocal: "",
          validUntilMode: "NONE",
          validUntilLocal: "",
          recoveryGuardianMode: "CUSTOM",
          recoveryGuardianAddress: "not-an-address",
          trustedService: emptyTrustedServiceFormValues(),
        }),
      /must be a valid EVM address/i,
    );
  });

  it("prefills every editable rule from an existing policy version", () => {
    const values = policyToFormValues({
      policyId: "pol_1",
      agentId: "agent_1",
      walletId: "wallet_1",
      policyVersion: 2,
      policyHash: `0x${"ab".repeat(32)}`,
      status: "DRAFT",
      validFrom: 1_800_000_000,
      validUntil: 1_800_086_400,
      rules: {
        allowedActionTypes: ["HEDERA_HTS_FUNGIBLE_TRANSFER"],
        allowedDestinations: [{ kind: "HEDERA_ACCOUNT_ID", value: "0.0.7" }],
        allowedAssets: [{ kind: "HTS", chainId: 296, tokenId: "0.0.8", decimals: 6 }],
        amount: { min: "1", max: "2500000", dailyLimit: "10000000" },
        actionCount: { dailyLimit: 4 },
      },
      semanticRules: [],
      createdAt: 1_800_000_000,
      updatedAt: 1_800_000_000,
      activatedAt: null,
      revokedAt: null,
      supersededAt: null,
      supersededByPolicyId: null,
    });

    assert.equal(values.assetKind, "HTS");
    assert.equal(values.htsTokenId, "0.0.8");
    assert.equal(values.htsDecimals, "6");
    assert.deepEqual(values.destinations, [{ kind: "HEDERA_ACCOUNT_ID", value: "0.0.7" }]);
    assert.equal(values.minAmount, "0.000001");
    assert.equal(values.maxAmount, "2.5");
    assert.equal(values.dailyAmount, "10");
    assert.equal(values.dailyActionCount, "4");
    assert.equal(values.validFromMode, "CUSTOM");
    assert.equal(values.validUntilMode, "CUSTOM");
    assert.equal(values.trustedService.enabled, false);
  });

  it("rejects an enabled trusted service with no configured destination", () => {
    assert.throws(
      () =>
        parsePolicyForm({
          assetKind: "HBAR",
          htsTokenId: "",
          htsDecimals: "",
          destinations: [],
          minAmount: "",
          maxAmount: "",
          dailyAmount: "",
          dailyActionCount: "",
          validFromMode: "NOW",
          validFromLocal: "",
          validUntilMode: "NONE",
          validUntilLocal: "",
          recoveryGuardianMode: "DEFAULT",
          recoveryGuardianAddress: "",
          trustedService: {
            enabled: true,
            providerId: "acme",
            serviceId: "market-data",
            productId: "",
            categoryIds: "data",
            capabilityIds: "call_api",
            shortDescription: "",
          },
        }),
      /at least one destination/i,
    );
  });

  it("builds a single TRUSTED_SERVICE_DESCRIPTOR_V1 semantic rule from an enabled trusted service", () => {
    const parsed = parsePolicyForm(
      {
        assetKind: "HBAR",
        htsTokenId: "",
        htsDecimals: "",
        destinations: [{ kind: "HEDERA_ACCOUNT_ID", value: "0.0.123456" }],
        minAmount: "",
        maxAmount: "",
        dailyAmount: "",
        dailyActionCount: "",
        validFromMode: "NOW",
        validFromLocal: "",
        validUntilMode: "NONE",
        validUntilLocal: "",
        recoveryGuardianMode: "DEFAULT",
        recoveryGuardianAddress: "",
        trustedService: {
          enabled: true,
          providerId: "Acme",
          serviceId: "Market-Data",
          productId: "",
          categoryIds: "Data, data, market",
          capabilityIds: "call_api",
          shortDescription: "  Real-time market data feed  ",
        },
      },
      1_800_000_000,
    );

    assert.equal(parsed.semanticRules.length, 1);
    const rule = parsed.semanticRules[0];
    assert.equal(rule.kind, "TRUSTED_SERVICE_DESCRIPTOR_V1");
    const descriptor = rule.params as {
      providerId: string;
      serviceId: string;
      productId?: string;
      destinationIds: string[];
      categoryIds: string[];
      capabilityIds: string[];
      metadataHash: string;
      shortDescription?: string;
    };
    assert.equal(descriptor.providerId, "Acme");
    assert.equal(descriptor.serviceId, "Market-Data");
    assert.equal(descriptor.productId, undefined);
    assert.deepEqual(descriptor.destinationIds, ["0.0.123456"]);
    assert.deepEqual(descriptor.categoryIds, ["data", "market"]);
    assert.deepEqual(descriptor.capabilityIds, ["call_api"]);
    assert.equal(descriptor.shortDescription, "Real-time market data feed");
    assert.match(descriptor.metadataHash, /^0x[a-f0-9]{64}$/);
  });

  it("hydrates an enabled trusted service back from an existing policy's semantic rules", () => {
    const values = policyToFormValues({
      policyId: "pol_1",
      agentId: "agent_1",
      walletId: "wallet_1",
      policyVersion: 1,
      policyHash: `0x${"ab".repeat(32)}`,
      status: "ACTIVE",
      validFrom: 1_800_000_000,
      validUntil: null,
      rules: {
        allowedActionTypes: ["HEDERA_HBAR_TRANSFER"],
        allowedDestinations: [{ kind: "HEDERA_ACCOUNT_ID", value: "0.0.7" }],
        allowedAssets: [{ kind: "NATIVE", chainId: 296, assetId: "hbar", decimals: 8 }],
        amount: { min: null, max: null, dailyLimit: null },
        actionCount: { dailyLimit: null },
      },
      semanticRules: [
        {
          ruleId: "trusted-service:market-data",
          kind: "TRUSTED_SERVICE_DESCRIPTOR_V1",
          params: {
            schemaVersion: "1.0",
            providerId: "acme",
            serviceId: "market-data",
            networkId: "hedera:testnet",
            destinationIds: ["0.0.7"],
            categoryIds: ["data"],
            capabilityIds: ["call_api"],
            metadataHash: `0x${"cd".repeat(32)}`,
            shortDescription: "Real-time market data feed",
          },
        },
      ],
      createdAt: 1_800_000_000,
      updatedAt: 1_800_000_000,
      activatedAt: 1_800_000_000,
      revokedAt: null,
      supersededAt: null,
      supersededByPolicyId: null,
    });

    assert.equal(values.trustedService.enabled, true);
    assert.equal(values.trustedService.providerId, "acme");
    assert.equal(values.trustedService.serviceId, "market-data");
    assert.equal(values.trustedService.categoryIds, "data");
    assert.equal(values.trustedService.capabilityIds, "call_api");
    assert.equal(values.trustedService.shortDescription, "Real-time market data feed");
  });
});
