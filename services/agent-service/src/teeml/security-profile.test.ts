import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getAllowedActionStatus,
  getAllowedVerificationStatus,
  getZeroGSecurityContract,
  HACKATHON_TEETLS_ALLOWED_STATUS,
  HACKATHON_TESTNET_TEETLS_PROFILE,
  isExactZeroGSecurityContract,
  parseZeroGSecurityProfile,
  PRODUCTION_PRIVATE_TEEML_PROFILE,
  PRODUCTION_TEEML_ALLOWED_STATUS,
} from "./security-profile.js";

describe("0G semantic inference security profiles", () => {
  it("defaults to the production Private/TeeML contract", () => {
    assert.equal(
      parseZeroGSecurityProfile(undefined),
      PRODUCTION_PRIVATE_TEEML_PROFILE,
    );
    assert.deepEqual(
      getZeroGSecurityContract(PRODUCTION_PRIVATE_TEEML_PROFILE),
      {
        securityProfile: PRODUCTION_PRIVATE_TEEML_PROFILE,
        trustMode: "private",
        verificationMode: "TeeML",
        sealedInference: true,
        requiredNetwork: "mainnet",
      },
    );
  });

  it("models the explicit testnet TeeTLS exception without a privacy claim", () => {
    assert.deepEqual(
      getZeroGSecurityContract(HACKATHON_TESTNET_TEETLS_PROFILE),
      {
        securityProfile: HACKATHON_TESTNET_TEETLS_PROFILE,
        trustMode: "verified",
        verificationMode: "TeeTLS",
        sealedInference: false,
        requiredNetwork: "testnet",
      },
    );
  });

  it("reserves production ALLOW states and assigns a distinct demo-only TeeTLS state", () => {
    assert.equal(
      getAllowedActionStatus(PRODUCTION_PRIVATE_TEEML_PROFILE),
      PRODUCTION_TEEML_ALLOWED_STATUS,
    );
    assert.equal(
      getAllowedVerificationStatus(PRODUCTION_PRIVATE_TEEML_PROFILE),
      "ALLOWED",
    );
    assert.equal(
      getAllowedActionStatus(HACKATHON_TESTNET_TEETLS_PROFILE),
      HACKATHON_TEETLS_ALLOWED_STATUS,
    );
    assert.equal(
      getAllowedVerificationStatus(HACKATHON_TESTNET_TEETLS_PROFILE),
      HACKATHON_TEETLS_ALLOWED_STATUS,
    );
  });

  it("rejects mixed tuples and unknown fallback-like profile values", () => {
    assert.equal(
      isExactZeroGSecurityContract({
        securityProfile: HACKATHON_TESTNET_TEETLS_PROFILE,
        trustMode: "private",
        verificationMode: "TeeTLS",
        sealedInference: false,
      }),
      false,
    );
    assert.equal(
      isExactZeroGSecurityContract({
        securityProfile: PRODUCTION_PRIVATE_TEEML_PROFILE,
        trustMode: "private",
        verificationMode: "TeeML",
        sealedInference: false,
      }),
      false,
    );
    assert.throws(() => parseZeroGSecurityProfile("fallback"));
    assert.throws(() =>
      getZeroGSecurityContract("fallback" as typeof PRODUCTION_PRIVATE_TEEML_PROFILE),
    );
  });
});
