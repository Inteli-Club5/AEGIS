import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { BigNumber, constants } from "ethers";
import {
  AUTHORIZED_TEST_RECORD_LABEL,
  buildAuthorizedContractIndexingTestRecord,
  parseAuthorizedTestRecordArguments,
} from "./authorizedTestRecord.js";

const safe = "0x00000000000000000000000000000000000000A1";

describe("authorized contract/indexing test record", () => {
  it("only prepares a record and has no CLI broadcast option", () => {
    const parsed = parseAuthorizedTestRecordArguments([
      "--test-id",
      "smoke-2026-07-25-001",
      "--verdict",
      "ALLOW",
      "--safe",
      safe,
    ]);
    assert.equal("broadcast" in parsed, false);
    assert.throws(
      () =>
        parseAuthorizedTestRecordArguments([
          "--test-id",
          "smoke-2026-07-25-001",
          "--verdict",
          "DENY",
          "--safe",
          safe,
          "--broadcast",
        ]),
      /Unknown/
    );
  });

  it("builds fixed-width deterministic values under an explicit test domain", () => {
    const input = {
      testId: "smoke-2026-07-25-001",
      verdictName: "ALLOW",
      safe,
      agenticIdTokenId: BigNumber.from(102),
    };
    const first = buildAuthorizedContractIndexingTestRecord(input);
    const second = buildAuthorizedContractIndexingTestRecord(input);

    assert.deepEqual(first, second);
    for (const field of [
      "requestId",
      "agentIdHash",
      "actionHash",
      "policyHash",
      "semanticContextHash",
      "teemlRequestHash",
      "artifactHash",
      "modelIdHash",
      "reasonCodeHash",
    ]) {
      assert.match(first[field], /^0x[0-9a-f]{64}$/);
    }
    assert.equal(first.verdict, 1);
    assert.equal(first.schemaVersion, 1);
    assert.equal(Object.isFrozen(first), true);
  });

  it("changes request identity across test IDs and rejects unsafe inputs", () => {
    const base = ["--verdict", "ALLOW", "--safe", safe];
    const one = parseAuthorizedTestRecordArguments([
      "--test-id",
      "test-one",
      ...base,
    ]);
    const two = parseAuthorizedTestRecordArguments([
      "--test-id",
      "test-two",
      ...base,
    ]);
    assert.notEqual(
      buildAuthorizedContractIndexingTestRecord(one).requestId,
      buildAuthorizedContractIndexingTestRecord(two).requestId
    );

    assert.throws(
      () =>
        parseAuthorizedTestRecordArguments([
          "--test-id",
          "x",
          ...base,
          "--unknown",
          "x",
        ]),
      /Unknown/
    );
    assert.throws(
      () =>
        parseAuthorizedTestRecordArguments([
          "--test-id",
          "contains space",
          ...base,
        ]),
      /public identifier/
    );
    assert.throws(
      () =>
        parseAuthorizedTestRecordArguments([
          "--test-id",
          "x",
          "--verdict",
          "TEEML_FAILED",
          "--safe",
          safe,
        ]),
      /ALLOW or DENY/
    );
    assert.throws(
      () =>
        parseAuthorizedTestRecordArguments([
          "--test-id",
          "x",
          "--verdict",
          "ALLOW",
          "--safe",
          constants.AddressZero,
        ]),
      /zero address/
    );
  });

  it("labels all evidence and never claims a real TeeML verdict", () => {
    const source = readFileSync(
      new URL("./authorizedTestRecord.js", import.meta.url),
      "utf8"
    );
    const cliSource = readFileSync(
      new URL("./recordAuthorizedTest.js", import.meta.url),
      "utf8"
    );
    assert.equal(
      AUTHORIZED_TEST_RECORD_LABEL,
      "AUTHORIZED CONTRACT/INDEXING TEST RECORD"
    );
    assert.match(source, /realTeeMlVerdict: false/);
    assert.equal(
      cliSource.includes("loadTeeSmartContractValidationEnv"),
      false
    );
    assert.equal(cliSource.includes("tee-smartcontract-validation"), false);
    assert.equal(source.includes("loadTeeSmartContractValidationEnv"), false);
    assert.equal(source.includes("process.env"), false);
    assert.equal(source.includes("TEE_VALIDATION_DEPLOYER_PRIVATE_KEY"), false);
    assert.equal(source.includes("new Wallet"), false);
    assert.equal(source.includes("REAL 0G TEEML VERDICT"), false);
  });
});
