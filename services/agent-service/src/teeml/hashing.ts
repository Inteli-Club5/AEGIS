import { hashCanonicalValue } from "../policy-engine/canonicalize.js";
import type { Hex32 } from "../policy-engine/types.js";
import { normalizeTrustedSemanticContext } from "./schemas.js";
import {
  SEMANTIC_CONTEXT_HASH_SCHEMA,
  TEEML_REQUEST_HASH_SCHEMA,
  type TrustedSemanticContext,
} from "./types.js";

export function computeSemanticContextHash(
  input: TrustedSemanticContext,
): Hex32 {
  const context = normalizeTrustedSemanticContext(input);
  return hashCanonicalValue({
    schema: SEMANTIC_CONTEXT_HASH_SCHEMA,
    context,
  });
}

export function computeTeeMlRequestHash(
  input: TrustedSemanticContext,
  semanticContextHash: Hex32,
): Hex32 {
  const context = normalizeTrustedSemanticContext(input);
  return hashCanonicalValue({
    schema: TEEML_REQUEST_HASH_SCHEMA,
    schemaVersion: context.schemaVersion,
    requestId: context.requestId,
    agentId: context.agent.agentId,
    agenticId: context.agent.agenticId,
    policyHash: context.policy.policyHash,
    actionHash: context.action.actionHash,
    semanticContextHash: semanticContextHash.toLowerCase(),
  });
}
