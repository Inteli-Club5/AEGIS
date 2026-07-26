import { z } from "zod";
import type { Hex32 } from "../policy-engine/types.js";
import { TeeMlError } from "./errors.js";
import {
  TEEML_CONTEXT_SCHEMA_VERSION,
  TEEML_SEMANTIC_REASON_CODES,
  type TeeMlSemanticVerdict,
} from "./types.js";

const MAX_OUTPUT_BYTES = 4_096;
const LOWERCASE_HEX32_RE = /^0x[a-f0-9]{64}$/;

const verdictSchema = z
  .object({
    schemaVersion: z.literal(TEEML_CONTEXT_SCHEMA_VERSION),
    verdict: z.enum(["ALLOW", "DENY"]),
    reasonCode: z.enum(TEEML_SEMANTIC_REASON_CODES),
    requestId: z.string().min(1).max(256),
    policyHash: z.string().regex(LOWERCASE_HEX32_RE),
    actionHash: z.string().regex(LOWERCASE_HEX32_RE),
    semanticContextHash: z.string().regex(LOWERCASE_HEX32_RE),
    teemlRequestHash: z.string().regex(LOWERCASE_HEX32_RE),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.verdict === "ALLOW" &&
      value.reasonCode !== "SEMANTIC_POLICY_MATCH"
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "ALLOW requires SEMANTIC_POLICY_MATCH",
      });
    }
    if (
      value.verdict === "DENY" &&
      value.reasonCode === "SEMANTIC_POLICY_MATCH"
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "DENY cannot use SEMANTIC_POLICY_MATCH",
      });
    }
  });

export type TeeMlExpectedBindings = {
  requestId: string;
  policyHash: Hex32;
  actionHash: Hex32;
  semanticContextHash: Hex32;
  teemlRequestHash: Hex32;
};

export function parseTeeMlSemanticVerdict(
  content: string,
  expected: TeeMlExpectedBindings,
): TeeMlSemanticVerdict {
  if (
    typeof content !== "string" ||
    content.length === 0 ||
    Buffer.byteLength(content, "utf8") > MAX_OUTPUT_BYTES ||
    content.trimStart().startsWith("```")
  ) {
    invalidOutput();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    invalidOutput();
  }

  const result = verdictSchema.safeParse(parsed);
  if (!result.success) invalidOutput();
  const verdict = result.data as TeeMlSemanticVerdict;

  if (
    verdict.requestId !== expected.requestId ||
    verdict.policyHash !== expected.policyHash ||
    verdict.actionHash !== expected.actionHash ||
    verdict.semanticContextHash !== expected.semanticContextHash ||
    verdict.teemlRequestHash !== expected.teemlRequestHash
  ) {
    throw new TeeMlError(
      "TEEML_HASH_MISMATCH",
      "TeeML verdict bindings do not match the evaluated request",
      true,
    );
  }

  return verdict;
}

function invalidOutput(): never {
  throw new TeeMlError(
    "TEEML_OUTPUT_INVALID",
    "TeeML returned an invalid semantic verdict",
    true,
  );
}
