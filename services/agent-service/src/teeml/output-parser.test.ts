import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TeeMlError } from "./errors.js";
import { parseTeeMlSemanticVerdict } from "./output-parser.js";

const bindings = {
  requestId: "request-01",
  policyHash: `0x${"11".repeat(32)}` as const,
  actionHash: `0x${"22".repeat(32)}` as const,
  semanticContextHash: `0x${"33".repeat(32)}` as const,
  teemlRequestHash: `0x${"44".repeat(32)}` as const,
};

function validAllow() {
  return {
    schemaVersion: "1.0",
    verdict: "ALLOW",
    reasonCode: "SEMANTIC_POLICY_MATCH",
    ...bindings,
  };
}

describe("TeeML semantic output parser", () => {
  it("accepts the exact verdict contract and rejects model-added prose", () => {
    assert.deepEqual(
      parseTeeMlSemanticVerdict(JSON.stringify(validAllow()), bindings),
      validAllow(),
    );

    for (const output of [
      JSON.stringify({ ...validAllow(), reason: "because it is safe" }),
      `\`\`\`json\n${JSON.stringify(validAllow())}\n\`\`\``,
      `${JSON.stringify(validAllow())}\nApproved.`,
      JSON.stringify({
        ...validAllow(),
        chainOfThought: "hidden reasoning",
      }),
    ]) {
      assert.throws(
        () => parseTeeMlSemanticVerdict(output, bindings),
        (error: unknown) =>
          error instanceof TeeMlError &&
          error.code === "TEEML_OUTPUT_INVALID" &&
          !error.message.includes(output),
      );
    }
  });

  it("accepts a strict DENY with a permitted non-ALLOW reason code", () => {
    const deny = {
      ...validAllow(),
      verdict: "DENY",
      reasonCode: "POTENTIAL_PROMPT_INJECTION",
    };
    assert.deepEqual(
      parseTeeMlSemanticVerdict(JSON.stringify(deny), bindings),
      deny,
    );
  });

  it("rejects invalid JSON, textual output, invalid reason codes, and verdict/reason incoherence", () => {
    for (const output of [
      "{",
      "ALLOW",
      JSON.stringify({ ...validAllow(), reasonCode: "UNKNOWN_REASON" }),
      JSON.stringify({
        ...validAllow(),
        verdict: "DENY",
        reasonCode: "SEMANTIC_POLICY_MATCH",
      }),
      JSON.stringify({
        ...validAllow(),
        verdict: "ALLOW",
        reasonCode: "SERVICE_PURPOSE_MISMATCH",
      }),
    ]) {
      assert.throws(
        () => parseTeeMlSemanticVerdict(output, bindings),
        (error: unknown) =>
          error instanceof TeeMlError &&
          error.code === "TEEML_OUTPUT_INVALID",
      );
    }
  });

  it("rejects every request or hash binding mismatch", () => {
    const mismatches = [
      { requestId: "request-other" },
      { policyHash: `0x${"aa".repeat(32)}` },
      { actionHash: `0x${"bb".repeat(32)}` },
      { semanticContextHash: `0x${"cc".repeat(32)}` },
      { teemlRequestHash: `0x${"dd".repeat(32)}` },
    ];

    for (const mismatch of mismatches) {
      assert.throws(
        () =>
          parseTeeMlSemanticVerdict(
            JSON.stringify({ ...validAllow(), ...mismatch }),
            bindings,
          ),
        (error: unknown) =>
          error instanceof TeeMlError &&
          error.code === "TEEML_HASH_MISMATCH",
      );
    }
  });

  it("requires normalized lowercase hashes and bounded output", () => {
    assert.throws(
      () =>
        parseTeeMlSemanticVerdict(
          JSON.stringify({
            ...validAllow(),
            policyHash: `0x${"AA".repeat(32)}`,
          }),
          bindings,
        ),
      (error: unknown) =>
        error instanceof TeeMlError &&
        error.code === "TEEML_OUTPUT_INVALID",
    );
    assert.throws(
      () =>
        parseTeeMlSemanticVerdict(
          `${JSON.stringify(validAllow())}${" ".repeat(4_096)}`,
          bindings,
        ),
      (error: unknown) =>
        error instanceof TeeMlError &&
        error.code === "TEEML_OUTPUT_INVALID",
    );
  });
});
