import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildSafeAccountConfig,
  resolveRecoveryGuardianAddress,
} from "./walletConfig.js";

const AGENT_ADDRESS = "0xa3189c893712aD2C35C48CcfF1eA2a50d4eE2330";
const COSIGNER_ADDRESS = "0x03f197ABD7C8AcFecE274261cA20bee0E6BB3b5f";
const DEMO_GUARDIAN_ADDRESS =
  "0x000000000000000000000000000000000000aE61";

describe("Safe wallet configuration", () => {
  it("uses the configured demo guardian when the request omits one", () => {
    assert.equal(
      resolveRecoveryGuardianAddress({
        requestedAddress: undefined,
        configuredAddress: DEMO_GUARDIAN_ADDRESS,
        ownerWallet: COSIGNER_ADDRESS,
      }),
      DEMO_GUARDIAN_ADDRESS,
    );
  });

  it("builds a 2-of-3 Safe only when all owners are unique", () => {
    assert.deepEqual(
      buildSafeAccountConfig(
        AGENT_ADDRESS,
        COSIGNER_ADDRESS,
        DEMO_GUARDIAN_ADDRESS,
      ),
      {
        owners: [
          AGENT_ADDRESS,
          COSIGNER_ADDRESS,
          DEMO_GUARDIAN_ADDRESS,
        ],
        threshold: 2,
      },
    );

    assert.throws(
      () =>
        buildSafeAccountConfig(
          AGENT_ADDRESS,
          COSIGNER_ADDRESS,
          COSIGNER_ADDRESS,
        ),
      /Safe owners must be unique/i,
    );
  });
});
