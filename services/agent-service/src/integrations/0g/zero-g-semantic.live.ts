import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  computePolicyHash,
  hashCanonicalValue,
} from "../../policy-engine/canonicalize.js";
import {
  buildOperatorSemanticStatements,
} from "../../teeml/context-builder.js";
import {
  computeActionHash,
  parsePrecheckActionRequest,
} from "../../policy-engine/precheck.js";
import {
  resolveTrustedServiceDescriptors,
} from "../../policy-engine/trusted-service-descriptor.js";
import {
  HEDERA_TESTNET_CHAIN_ID,
  NETWORK_ID,
  TRUSTED_SERVICE_DESCRIPTOR_RULE_KIND,
  type PolicyRules,
  type SemanticRule,
} from "../../policy-engine/types.js";
import {
  normalizePolicyRules,
  normalizeSemanticRules,
} from "../../policy-engine/validation.js";
import {
  computeSemanticContextHash,
  computeTeeMlRequestHash,
} from "../../teeml/hashing.js";
import { parseTeeMlSemanticVerdict } from "../../teeml/output-parser.js";
import { buildTransientTeeMlMessages } from "../../teeml/prompt.js";
import { normalizeTrustedSemanticContext } from "../../teeml/schemas.js";
import type {
  TeeMlSemanticVerdictValue,
  TrustedSemanticContext,
} from "../../teeml/types.js";
import {
  getAllowedActionStatus,
  getZeroGSecurityContract,
  HACKATHON_TESTNET_TEETLS_PROFILE,
  isExactZeroGSecurityContract,
  PRODUCTION_PRIVATE_TEEML_PROFILE,
  type ZeroGSecurityProfile,
} from "../../teeml/security-profile.js";
import {
  createZeroGSemanticInferenceFromEnv,
  DEFAULT_ZERO_G_ROUTER_BASE_URL,
  resolveZeroGSecurityProfileFromEnv,
} from "./zero-g-semantic-inference.js";
import { resolveZeroGRouterNetwork } from "./zero-g-network.js";

const RESPONSE_HASH_SCHEMA = "aegis.teeml.response.v1";
const REQUIRED_ENV = ["ZG_ROUTER_API_KEY", "ZG_TEEML_MODEL"] as const;
const missing = REQUIRED_ENV.filter(name => !process.env[name]?.trim());

if (missing.length > 0) {
  blocked(missing.map(name => `${name} is not configured`), false);
} else {
  await run();
}

async function run(): Promise<void> {
  let gateway: ReturnType<typeof createZeroGSemanticInferenceFromEnv> | null =
    null;
  let activeProfile: ZeroGSecurityProfile | null = null;
  try {
    const securityProfile = resolveZeroGSecurityProfileFromEnv();
    activeProfile = securityProfile;
    const security = getZeroGSecurityContract(securityProfile);
    gateway = createZeroGSemanticInferenceFromEnv();
    const allow = await verifyCase("live-allow", "ALLOW");
    const deny = await verifyCase("live-deny", "DENY");
    const network = resolveZeroGRouterNetwork(
      process.env.ZG_ROUTER_BASE_URL ?? DEFAULT_ZERO_G_ROUTER_BASE_URL,
    );
    const evidence = {
      schemaVersion: "1.0",
      generatedAt: new Date().toISOString(),
      integration: "0G Router semantic verification",
      network: network.name,
      routerBaseUrl: network.routerBaseUrl,
      sdk: {
        package: "@0gfoundation/0g-compute-ts-sdk",
        version: "0.9.0",
      },
      securityProfile,
      trustMode: security.trustMode,
      verificationMode: security.verificationMode,
      teeVerified: true,
      sealedInference: security.sealedInference,
      productionReady:
        securityProfile === PRODUCTION_PRIVATE_TEEML_PROFILE,
      independentSignedContentVerification: true,
      privacyStatement:
        securityProfile === PRODUCTION_PRIVATE_TEEML_PROFILE
          ? "The model executed in sealed Private/TeeML mode."
          : "Hackathon-only TeeTLS: the broker transport and response are TEE-verified, but the upstream model provider may process plaintext.",
      productionRequirement: PRODUCTION_PRIVATE_TEEML_PROFILE,
      cases: [allow, deny],
      sensitivePlaintextPersisted: false,
      rawPromptPersisted: false,
      rawOutputPersisted: false,
    };
    const evidenceFile = evidenceFileFor(securityProfile);
    const evidencePath = fileURLToPath(
      new URL(`../../../../../${evidenceFile}`, import.meta.url),
    );
    await mkdir(fileURLToPath(new URL("../../../../../docs/evidence/", import.meta.url)), {
      recursive: true,
    });
    await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o644,
    });
    process.stdout.write(
      `${JSON.stringify({
        status:
          securityProfile === PRODUCTION_PRIVATE_TEEML_PROFILE
            ? "TEEML_REAL_INTEGRATION_VERIFIED"
            : "TEETLS_HACKATHON_INTEGRATION_VERIFIED",
        securityProfile,
        evidenceFile,
        cases: evidence.cases.map(item => ({
          status: item.status,
          model: item.model,
          provider: item.provider,
          latencyMs: item.latencyMs,
        })),
      })}\n`,
    );
  } catch (error) {
    const code =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      typeof (error as { code?: unknown }).code === "string"
        ? (error as { code: string }).code
        : "TEEML_UNKNOWN_RESULT";
    const requestDispatched =
      typeof error === "object" &&
      error !== null &&
      "requestDispatched" in error &&
      typeof (error as { requestDispatched?: unknown }).requestDispatched ===
        "boolean"
        ? (error as { requestDispatched: boolean }).requestDispatched
        : null;
    const diagnostic = sanitizedOperationalDiagnostic(error);
    blocked([
      `real 0G verification failed with ${code}`,
      "confirm Router API key credit, configured profile/model availability, and paired 0G network RPC/provider signature availability",
    ], requestDispatched, diagnostic);
  }

  async function verifyCase(
    requestId: string,
    expectedVerdict: TeeMlSemanticVerdictValue,
  ) {
    if (!gateway || !activeProfile) {
      throw Object.assign(new Error("TEEML_CONFIG_ERROR"), {
        code: "TEEML_CONFIG_ERROR",
        requestDispatched: false as const,
      });
    }
    const context = liveContext(requestId, expectedVerdict);
    const semanticContextHash = computeSemanticContextHash(context);
    const teemlRequestHash = computeTeeMlRequestHash(
      context,
      semanticContextHash,
    );
    const completion = await gateway.complete(
      buildTransientTeeMlMessages({
        context,
        semanticContextHash,
        teemlRequestHash,
      }),
    );
    const verdict = parseTeeMlSemanticVerdict(completion.content, {
      requestId,
      policyHash: context.policy.policyHash,
      actionHash: context.action.actionHash,
      semanticContextHash,
      teemlRequestHash,
    });
    if (verdict.verdict !== expectedVerdict) {
      throw dispatchedLiveFailure("TEEML_OUTPUT_INVALID");
    }
    if (
      completion.securityProfile !== activeProfile ||
      !isExactZeroGSecurityContract(completion) ||
      completion.teeVerified !== true ||
      !completion.providerAddress ||
      !completion.responseId
    ) {
      throw dispatchedLiveFailure("TEEML_NOT_VERIFIED");
    }
    return {
      requestId,
      status:
        verdict.verdict === "ALLOW"
          ? getAllowedActionStatus(completion.securityProfile)
          : "TEEML_DENIED",
      reasonCode: verdict.reasonCode,
      model: completion.modelId,
      provider: completion.providerAddress,
      securityProfile: completion.securityProfile,
      trustMode: completion.trustMode,
      verificationMode: completion.verificationMode,
      sealedInference: completion.sealedInference,
      teeVerified: true as const,
      semanticContextHash,
      teemlRequestHash,
      responseHash: hashCanonicalValue({
        schema: RESPONSE_HASH_SCHEMA,
        content: completion.content,
      }),
      responseId: completion.responseId,
      promptTokens: completion.promptTokens,
      completionTokens: completion.completionTokens,
      latencyMs: completion.latencyMs,
    };
  }
}

function evidenceFileFor(profile: ZeroGSecurityProfile): string {
  return profile === HACKATHON_TESTNET_TEETLS_PROFILE
    ? "docs/evidence/0g-teetls-hackathon-verification.json"
    : "docs/evidence/0g-teeml-verification.json";
}

function liveContext(
  requestId: string,
  expectedVerdict: TeeMlSemanticVerdictValue,
): TrustedSemanticContext {
  const allow = expectedVerdict === "ALLOW";
  const agentId = "aegis-live-verifier";
  const walletId = "aegis-live-wallet";
  const policyId = `aegis-live-policy-${allow ? "allow" : "deny"}`;
  const destination = allow ? "0.0.1234" : "0.0.5678";
  const service = {
    providerId: "aegis-live-provider",
    serviceId: allow ? "archive-storage" : "gaming-items",
    categoryIds: allow ? ["archive", "storage"] : ["gaming"],
    capabilityIds: allow ? ["archive.write"] : ["gaming.purchase"],
    metadataHash: allow
      ? `0x${"33".repeat(32)}`
      : `0x${"34".repeat(32)}`,
    shortDescription: allow
      ? "Archival storage for signed audit records."
      : "Purchases cosmetic items for online games.",
  };
  const rules: PolicyRules = normalizePolicyRules({
    allowedActionTypes: ["HEDERA_HBAR_TRANSFER"],
    allowedDestinations: [
      {
        kind: "HEDERA_ACCOUNT_ID",
        value: destination,
        chainId: HEDERA_TESTNET_CHAIN_ID,
      },
    ],
    allowedAssets: [
      {
        kind: "NATIVE",
        chainId: HEDERA_TESTNET_CHAIN_ID,
        assetId: "hbar",
        decimals: 8,
      },
    ],
    amount: {
      min: "1",
      max: "100000000",
      dailyLimit: "200000000",
    },
    actionCount: { dailyLimit: 2 },
  });
  const semanticRules: SemanticRule[] = normalizeSemanticRules([
    {
      ruleId: "authorized-purpose",
      kind: "PURPOSE",
      params: { purpose: "archive approved audit records" },
    },
    {
      ruleId: "trusted-live-service",
      kind: TRUSTED_SERVICE_DESCRIPTOR_RULE_KIND,
      params: {
        schemaVersion: "1.0",
        ...service,
        networkId: NETWORK_ID,
        destinationIds: [destination],
      },
    },
  ]);
  const action = parsePrecheckActionRequest(
    { agentId, walletId },
    {
      actionType: "HEDERA_HBAR_TRANSFER",
      destination: {
        kind: "HEDERA_ACCOUNT_ID",
        value: destination,
        chainId: HEDERA_TESTNET_CHAIN_ID,
      },
      assetId: "hbar",
      amount: "1",
      actionDeadline: 2_000_000_000,
    },
  );
  const durablePolicy = {
    agentId,
    walletId,
    policyVersion: 1,
    validFrom: 1_700_000_000,
    validUntil: null,
    rules,
    semanticRules,
  };
  const policyHash = computePolicyHash(durablePolicy);
  const actionHash = computeActionHash({
    requestId,
    agentId,
    walletId,
    networkId: NETWORK_ID,
    action,
    policy: {
      policyId,
      policyVersion: durablePolicy.policyVersion,
      policyHash,
    },
    aegisNonce: 1n,
  });
  const [trustedService] = resolveTrustedServiceDescriptors(semanticRules, {
    serviceId: service.serviceId,
    destination: action.destination,
  });
  if (!trustedService) {
    throw new Error("live trusted service fixture is invalid");
  }

  return normalizeTrustedSemanticContext({
    schemaVersion: "1.0",
    requestId,
    agent: {
      agentId,
      // This Router-only test uses an explicit Agentic ID fixture and does not mint on-chain.
      agenticId:
        "0g-agentic-id:0x0000000000000000000000000000000000000001:1",
      capabilityIds: ["archive.write"],
    },
    policy: {
      policyId,
      policyVersion: durablePolicy.policyVersion,
      policyHash,
      semanticRules: buildOperatorSemanticStatements(
        semanticRules,
        trustedService,
      ),
    },
    action: {
      actionHash,
      actionType: action.actionType,
      destination: action.destination.value,
      assetId: action.assetId,
      amount: action.amount,
    },
    trustedService: {
      providerId: trustedService.providerId,
      serviceId: trustedService.serviceId,
      categoryIds: trustedService.categoryIds,
      capabilityIds: trustedService.capabilityIds,
      metadataHash: trustedService.metadataHash,
      ...(trustedService.shortDescription === undefined
        ? {}
        : { shortDescription: trustedService.shortDescription }),
    },
  });
}

function dispatchedLiveFailure(code: string): Error {
  return Object.assign(new Error(code), {
    code,
    requestDispatched: true as const,
  });
}

function blocked(
  missingOperationalData: string[],
  requestDispatched: boolean | null,
  diagnostic?: Readonly<{
    providerStage: string;
    providerReason: string;
    upstreamHttpStatus?: number;
  }>,
): never {
  process.stderr.write(
    `${JSON.stringify({
      status: "TEEML_REAL_INTEGRATION_BLOCKED",
      requestDispatched,
      missingOperationalData,
      ...(diagnostic ? { diagnostic } : {}),
    })}\n`,
  );
  process.exit(2);
}

function sanitizedOperationalDiagnostic(
  error: unknown,
):
  | Readonly<{
      providerStage: string;
      providerReason: string;
      upstreamHttpStatus?: number;
    }>
  | undefined {
  if (
    typeof error !== "object" ||
    error === null ||
    !("providerStage" in error) ||
    !("providerReason" in error) ||
    typeof error.providerStage !== "string" ||
    typeof error.providerReason !== "string"
  ) {
    return undefined;
  }
  const upstreamHttpStatus =
    "upstreamHttpStatus" in error &&
    typeof error.upstreamHttpStatus === "number"
      ? error.upstreamHttpStatus
      : undefined;
  return {
    providerStage: error.providerStage,
    providerReason: error.providerReason,
    ...(upstreamHttpStatus === undefined ? {} : { upstreamHttpStatus }),
  };
}
