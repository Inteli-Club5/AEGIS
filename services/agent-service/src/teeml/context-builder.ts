import { stableStringify } from "../policy-engine/canonicalize.js";
import { badRequest, PolicyEngineError } from "../policy-engine/errors.js";
import {
  resolveTrustedServiceDescriptors,
} from "../policy-engine/trusted-service-descriptor.js";
import {
  HEDERA_TESTNET_CHAIN_ID,
  MAX_SEMANTIC_RULE_STRING_LENGTH,
  TRUSTED_SERVICE_DESCRIPTOR_RULE_KIND,
  type DestinationIdentity,
  type Hex32,
  type SemanticRule,
  type TrustedServiceDescriptorV1,
} from "../policy-engine/types.js";
import { normalizeSemanticRules } from "../policy-engine/validation.js";
import { TeeMlError } from "./errors.js";
import { normalizeTrustedSemanticContext } from "./schemas.js";
import {
  TEEML_CONTEXT_SCHEMA_VERSION,
  type TeeMlActionType,
  type TrustedSemanticContext,
} from "./types.js";

const IDENTIFIER_RE = /^[a-z0-9][a-z0-9._:-]*$/;
const INSTRUCTION_SHAPED_SEMANTIC_TEXT_RE =
  /\b(?:ignore|disregard|override|forget)\b.{0,80}\b(?:instruction|prompt|rule)s?\b|\b(?:return|respond|output)\b.{0,48}\b(?:allow|deny|json)\b|\bsystem\s+prompt\b|\b(?:change|replace|alter|override)\b.{0,48}\b(?:hash|requestid|policyhash|actionhash)\b/i;

export type TeeMlVerifyRequestBody = {
  serviceId: string;
  productId?: string;
};

export type TrustedSemanticContextSources = {
  requestId: string;
  action: {
    requestId: string;
    agentId: string;
    policyId: string;
    policyVersion: number;
    policyHash: Hex32;
    actionHash: Hex32;
    actionType: string;
    destination: DestinationIdentity;
    assetId: string;
    amount: string;
  };
  policy: {
    policyId: string;
    agentId: string;
    policyVersion: number;
    policyHash: Hex32;
    semanticRules: readonly SemanticRule[];
  };
  agentProfile: {
    agentId: string;
    agenticId: string;
    capabilityIds: readonly string[];
  };
};

export function parseTeeMlVerifyRequestBody(
  input: unknown,
): TeeMlVerifyRequestBody {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    badRequest("invalid_teeml_request", "body must be an object");
  }

  const body = input as Record<string, unknown>;
  const allowedKeys = new Set(["serviceId", "productId"]);
  for (const key of Object.keys(body)) {
    if (!allowedKeys.has(key)) {
      badRequest("unknown_property", `body.${key} is not allowed`);
    }
  }

  const serviceId = routeIdentifier(body.serviceId, "body.serviceId");
  const productId =
    body.productId === undefined
      ? undefined
      : routeIdentifier(body.productId, "body.productId");

  return {
    serviceId,
    ...(productId === undefined ? {} : { productId }),
  };
}

export function buildTrustedSemanticContext(
  sources: TrustedSemanticContextSources,
  request: TeeMlVerifyRequestBody,
): TrustedSemanticContext {
  assertDurableBindings(sources);

  if (
    sources.agentProfile.agenticId.trim().length === 0 ||
    sources.agentProfile.capabilityIds.length === 0
  ) {
    trustedContextMissing();
  }

  let normalizedRules: SemanticRule[];
  let descriptors: TrustedServiceDescriptorV1[];
  try {
    normalizedRules = normalizeSemanticRules([
      ...sources.policy.semanticRules,
    ]);
    descriptors = resolveTrustedServiceDescriptors(normalizedRules, {
      serviceId: request.serviceId,
      ...(request.productId === undefined
        ? {}
        : { productId: request.productId }),
      destination: sources.action.destination,
    });
  } catch (error) {
    if (error instanceof PolicyEngineError) {
      trustedContextMissing();
    }
    throw error;
  }

  if (descriptors.length === 0) {
    trustedContextMissing();
  }
  if (descriptors.length !== 1) {
    throw new TeeMlError(
      "TEEML_CONFLICT",
      "Multiple trusted service descriptors match the same action",
    );
  }

  const descriptor = descriptors[0]!;
  const semanticRules = buildOperatorSemanticStatements(
    normalizedRules,
    descriptor,
  );

  try {
    return normalizeTrustedSemanticContext({
      schemaVersion: TEEML_CONTEXT_SCHEMA_VERSION,
      requestId: sources.requestId,
      agent: {
        agentId: sources.agentProfile.agentId,
        agenticId: sources.agentProfile.agenticId,
        capabilityIds: [...sources.agentProfile.capabilityIds],
      },
      policy: {
        policyId: sources.policy.policyId,
        policyVersion: sources.policy.policyVersion,
        policyHash: sources.policy.policyHash,
        semanticRules,
      },
      action: {
        actionHash: sources.action.actionHash,
        actionType: sources.action.actionType as TeeMlActionType,
        destination: canonicalDestinationValue(sources.action.destination),
        assetId: sources.action.assetId,
        amount: sources.action.amount,
      },
      trustedService: {
        providerId: descriptor.providerId,
        serviceId: descriptor.serviceId,
        ...(descriptor.productId === undefined
          ? {}
          : { productId: descriptor.productId }),
        categoryIds: descriptor.categoryIds,
        capabilityIds: descriptor.capabilityIds,
        metadataHash: descriptor.metadataHash,
        ...(descriptor.shortDescription === undefined
          ? {}
          : { shortDescription: descriptor.shortDescription }),
      },
    });
  } catch {
    trustedContextMissing();
  }
}

export function buildOperatorSemanticStatements(
  semanticRules: readonly SemanticRule[],
  selectedDescriptor: TrustedServiceDescriptorV1,
): string[] {
  const selectedDescriptorCanonical = stableStringify(selectedDescriptor);
  const statements = semanticRules.flatMap(rule => {
    if (rule.kind === TRUSTED_SERVICE_DESCRIPTOR_RULE_KIND) {
      if (stableStringify(rule.params) !== selectedDescriptorCanonical) {
        return [];
      }
      return [
        stableStringify({
          kind: TRUSTED_SERVICE_DESCRIPTOR_RULE_KIND,
          metadataHash: selectedDescriptor.metadataHash,
          ...(selectedDescriptor.productId === undefined
            ? {}
            : { productId: selectedDescriptor.productId }),
          ruleId: rule.ruleId,
          serviceId: selectedDescriptor.serviceId,
        }),
      ];
    }

    // Generic statements remain operator-controlled policy data. Agent request
    // prose is neither accepted by the route schema nor present in these sources.
    const statement = stableStringify({
      kind: rule.kind,
      params: rule.params,
      ruleId: rule.ruleId,
    });
    if (INSTRUCTION_SHAPED_SEMANTIC_TEXT_RE.test(statement)) {
      trustedContextMissing();
    }
    return [statement];
  });

  for (const statement of statements) {
    if (statement.length > MAX_SEMANTIC_RULE_STRING_LENGTH) {
      trustedContextMissing();
    }
  }

  return [...new Set(statements)].sort();
}

function assertDurableBindings(sources: TrustedSemanticContextSources): void {
  const bindings = [
    sameIdentifier(sources.requestId, sources.action.requestId),
    sameIdentifier(sources.action.agentId, sources.policy.agentId),
    sameIdentifier(sources.action.agentId, sources.agentProfile.agentId),
    sameIdentifier(sources.action.policyId, sources.policy.policyId),
    sources.action.policyVersion === sources.policy.policyVersion,
    sameHash(sources.action.policyHash, sources.policy.policyHash),
  ];

  if (bindings.some(binding => !binding)) {
    throw new TeeMlError(
      "TEEML_CONFLICT",
      "Trusted semantic source bindings conflict",
    );
  }
}

function canonicalDestinationValue(destination: DestinationIdentity): string {
  if (
    destination.chainId !== undefined &&
    destination.chainId !== HEDERA_TESTNET_CHAIN_ID
  ) {
    trustedContextMissing();
  }

  if (destination.kind === "EVM_ADDRESS") {
    return destination.value.trim().toLowerCase();
  }
  if (destination.kind === "HEDERA_ACCOUNT_ID") {
    try {
      return destination.value
        .trim()
        .split(".")
        .map(part => BigInt(part).toString())
        .join(".");
    } catch {
      trustedContextMissing();
    }
  }

  try {
    const url = new URL(destination.value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      trustedContextMissing();
    }
    return url.origin.toLowerCase();
  } catch {
    trustedContextMissing();
  }
}

function routeIdentifier(input: unknown, path: string): string {
  if (typeof input !== "string") {
    badRequest("invalid_teeml_reference", `${path} must be a string`);
  }
  const value = input.trim().toLowerCase();
  if (
    value.length === 0 ||
    value.length > MAX_SEMANTIC_RULE_STRING_LENGTH ||
    !IDENTIFIER_RE.test(value)
  ) {
    badRequest(
      "invalid_teeml_reference",
      `${path} must be a bounded service catalog identifier`,
    );
  }
  return value;
}

function sameIdentifier(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

function sameHash(left: Hex32, right: Hex32): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

function trustedContextMissing(): never {
  throw new TeeMlError(
    "TEEML_TRUSTED_CONTEXT_MISSING",
    "Trusted semantic evidence is missing or invalid",
  );
}
