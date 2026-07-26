import { z } from "zod";
import { stableStringify } from "../policy-engine/canonicalize.js";
import {
  TEEML_CONTEXT_SCHEMA_VERSION,
  type TrustedSemanticContext,
} from "./types.js";

const MAX_CONTEXT_BYTES = 16_384;
const MAX_SEMANTIC_RULES = 20;
const MAX_CAPABILITIES = 20;
const MAX_CATEGORIES = 20;
const MAX_TEXT_LENGTH = 256;
const HEX32_RE = /^0x[a-fA-F0-9]{64}$/;
const MARKUP_RE = /<[^>]*>|```|(?:^|\n)\s{0,3}(?:#{1,6}\s|[-*+]\s|\d+\.\s)|\[[^\]]+\]\([^)]*\)/;

const normalizedIdentifier = (label: string) =>
  z
    .string()
    .min(1, `${label} is required`)
    .max(256, `${label} must be at most 256 characters`)
    .transform(value => collapseWhitespace(value).toLowerCase())
    .refine(value => value.length > 0, `${label} is required`);

const normalizedPlainText = (label: string) =>
  z
    .string()
    .min(1, `${label} is required`)
    .max(MAX_TEXT_LENGTH, `${label} must be at most ${MAX_TEXT_LENGTH} characters`)
    .transform(collapseWhitespace)
    .refine(value => !MARKUP_RE.test(value), `${label} must not contain HTML or markdown`);

const normalizedHex32 = z
  .string()
  .regex(HEX32_RE, "must be a 0x-prefixed 32-byte hex value")
  .transform(value => value.toLowerCase() as `0x${string}`);

const sortedIdentifierSet = (label: string, max: number) =>
  z
    .array(normalizedIdentifier(label))
    .max(max, `${label} must contain at most ${max} values`)
    .transform(values => [...new Set(values)].sort());

const sortedPlainTextSet = (label: string, max: number) =>
  z
    .array(normalizedPlainText(label))
    .min(1, `${label} must contain at least one value`)
    .max(max, `${label} must contain at most ${max} values`)
    .transform(values => [...new Set(values)].sort());

const agentSchema = z
  .object({
    agentId: normalizedIdentifier("agent.agentId"),
    agenticId: normalizedIdentifier("agent.agenticId"),
    capabilityIds: sortedIdentifierSet("agent.capabilityIds", MAX_CAPABILITIES),
  })
  .strict()
  .refine(value => value.capabilityIds.length > 0, "agent.capabilityIds must not be empty");

const policySchema = z
  .object({
    policyId: normalizedIdentifier("policy.policyId"),
    policyVersion: z.number().int().positive(),
    policyHash: normalizedHex32,
    semanticRules: sortedPlainTextSet("policy.semanticRules", MAX_SEMANTIC_RULES),
  })
  .strict();

const actionSchema = z
  .object({
    actionHash: normalizedHex32,
    actionType: z.enum([
      "HEDERA_HBAR_TRANSFER",
      "HEDERA_HTS_FUNGIBLE_TRANSFER",
    ]),
    destination: normalizedIdentifier("action.destination"),
    assetId: normalizedIdentifier("action.assetId"),
    amount: z
      .string()
      .regex(/^\d+$/, "action.amount must be an integer base-unit string")
      .transform(value => BigInt(value).toString())
      .refine(value => value !== "0", "action.amount must be positive"),
  })
  .strict();

const trustedServiceSchema = z
  .object({
    providerId: normalizedIdentifier("trustedService.providerId"),
    serviceId: normalizedIdentifier("trustedService.serviceId"),
    productId: normalizedIdentifier("trustedService.productId").optional(),
    categoryIds: sortedIdentifierSet("trustedService.categoryIds", MAX_CATEGORIES),
    capabilityIds: sortedIdentifierSet(
      "trustedService.capabilityIds",
      MAX_CAPABILITIES,
    ),
    metadataHash: normalizedHex32,
    shortDescription: normalizedPlainText(
      "trustedService.shortDescription",
    ).optional(),
  })
  .strict()
  .refine(value => value.categoryIds.length > 0, "trustedService.categoryIds must not be empty")
  .refine(
    value => value.capabilityIds.length > 0,
    "trustedService.capabilityIds must not be empty",
  );

const trustedOperatorTaskSchema = z
  .object({
    taskId: normalizedIdentifier("trustedOperatorTask.taskId"),
    taskType: normalizedIdentifier("trustedOperatorTask.taskType"),
    taskHash: normalizedHex32,
    shortSummary: normalizedPlainText("trustedOperatorTask.shortSummary"),
    expiresAt: z.number().int().nonnegative(),
  })
  .strict();

const trustedSemanticContextSchema = z
  .object({
    schemaVersion: z.literal(TEEML_CONTEXT_SCHEMA_VERSION),
    requestId: normalizedIdentifier("requestId"),
    agent: agentSchema,
    policy: policySchema,
    action: actionSchema,
    trustedService: trustedServiceSchema.optional(),
    trustedOperatorTask: trustedOperatorTaskSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      !value.trustedService &&
      !value.trustedOperatorTask &&
      value.policy.semanticRules.length === 0
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "at least one trusted semantic source is required",
      });
    }
    if (Buffer.byteLength(stableStringify(value), "utf8") > MAX_CONTEXT_BYTES) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `trusted semantic context must be at most ${MAX_CONTEXT_BYTES} bytes`,
      });
    }
  });

export function normalizeTrustedSemanticContext(
  input: unknown,
): TrustedSemanticContext {
  return trustedSemanticContextSchema.parse(input) as TrustedSemanticContext;
}

function collapseWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}
