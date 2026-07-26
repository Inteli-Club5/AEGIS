import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { COMPILED_CONTRACT_ARTIFACT_PATH } from "./constants.js";

const forbiddenNames = [
  "prompt",
  "semanticRules",
  "semanticContextPlaintext",
  "detailedReason",
  "agentReason",
  "rawTeeMLOutput",
  "rawAttestation",
  "apiKey",
  "privateKey",
  "privateUri",
  "chainOfThought",
  "callerTimestamp",
];

describe("AegisTeeValidationRegistry ABI privacy surface", () => {
  it("contains no dynamic string/bytes record fields or sensitive names", () => {
    const artifact = JSON.parse(
      readFileSync(COMPILED_CONTRACT_ARTIFACT_PATH, "utf8")
    );
    const abi = artifact.abi;
    const recordFunction = abi.find(
      (entry) =>
        entry.type === "function" && entry.name === "recordTeeMLValidation"
    );
    const recordEvent = abi.find(
      (entry) =>
        entry.type === "event" && entry.name === "TeeMLValidationRecorded"
    );

    assert.ok(recordFunction, "recordTeeMLValidation must exist");
    assert.ok(recordEvent, "TeeMLValidationRecorded must exist");
    assert.deepEqual(
      recordFunction.inputs[0].components.map((input) => [
        input.name,
        input.type,
      ]),
      [
        ["requestId", "bytes32"],
        ["agentIdHash", "bytes32"],
        ["actionHash", "bytes32"],
        ["policyHash", "bytes32"],
        ["semanticContextHash", "bytes32"],
        ["teemlRequestHash", "bytes32"],
        ["artifactHash", "bytes32"],
        ["modelIdHash", "bytes32"],
        ["reasonCodeHash", "bytes32"],
        ["safe", "address"],
        ["agenticIdTokenId", "uint256"],
        ["verdict", "uint8"],
        ["schemaVersion", "uint16"],
      ]
    );
    assert.deepEqual(
      recordEvent.inputs.map((input) => [input.name, input.type]),
      [
        ["requestId", "bytes32"],
        ["agentIdHash", "bytes32"],
        ["actionHash", "bytes32"],
        ["policyHash", "bytes32"],
        ["semanticContextHash", "bytes32"],
        ["teemlRequestHash", "bytes32"],
        ["artifactHash", "bytes32"],
        ["modelIdHash", "bytes32"],
        ["reasonCodeHash", "bytes32"],
        ["safe", "address"],
        ["agenticIdTokenId", "uint256"],
        ["verdict", "uint8"],
        ["recorder", "address"],
        ["schemaVersion", "uint16"],
      ]
    );
    assert.deepEqual(
      recordEvent.inputs
        .filter((input) => input.indexed)
        .map((input) => input.name),
      ["requestId", "agentIdHash", "actionHash"]
    );

    const everyInput = abi.flatMap((entry) =>
      flattenInputs(entry.inputs || [])
    );
    assert.equal(
      everyInput.some(
        (input) => input.type === "string" || input.type === "bytes"
      ),
      false
    );
    assert.equal(
      everyInput.some((input) => input.type.endsWith("[]")),
      false
    );

    const serializedAbi = JSON.stringify(abi);
    const normalizedAbi = serializedAbi.toLowerCase().replace(/[^a-z0-9]/g, "");
    for (const forbiddenName of forbiddenNames) {
      const normalizedName = forbiddenName
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
      assert.equal(
        normalizedAbi.includes(normalizedName),
        false,
        `${forbiddenName} must not appear in the ABI`
      );
    }
  });
});

function flattenInputs(inputs) {
  return inputs.flatMap((input) => [
    input,
    ...flattenInputs(input.components || []),
  ]);
}
