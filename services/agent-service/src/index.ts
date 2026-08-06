import "dotenv/config";
import { timingSafeEqual } from "node:crypto";
import { fileURLToPath } from "node:url";
import express from "express";
import { createAgent as createAgentProfile } from "./createAgent.js";
import {
  createWallet as createAgentWallet,
  deriveSafeSaltNonce,
  inspectExistingSafeWallet,
} from "./createWallet.js";
import { proposeAction as proposeAgentAction } from "./proposeAction.js";
import {
  getExpectedAgenticIdChainId,
  getExpectedAgenticIdContractAddress,
  HttpError,
  MIN_INTERNAL_TOKEN_LENGTH,
  registerAgenticId,
} from "./registerAgenticId.js";
import {
  deleteAgent as deleteStoredAgent,
  getAgent as getStoredAgent,
  setAgentWallet as setStoredAgentWallet,
} from "./store.js";
import type { AgentProfile, AgentType } from "./types.js";
import {
  createPostgresPolicyRepository,
  createPostgresPrecheckRepository,
  UnconfiguredPolicyRepository,
  UnconfiguredPrecheckRepository,
} from "./policy-engine/db/postgres.js";
import { createUuidV7 } from "./policy-engine/ids.js";
import { PolicyEngineError } from "./policy-engine/errors.js";
import {
  composeAgentActorAuthenticators,
  createEnvAgentActorAuthenticator,
  createStoreAgentActorAuthenticator,
} from "./policy-engine/agent-auth.js";
import {
  AGENT_COMMITMENT_MAX_AGE_SECONDS,
  AGENT_COMMITMENT_MAX_FUTURE_SKEW_SECONDS,
  buildAgentCommitment,
  extractAgentCommitmentAuth,
  verifyAgentCommitmentProof,
} from "./policy-engine/auth.js";
import { conflict } from "./policy-engine/errors.js";
import type { PrecheckRepository } from "./policy-engine/precheck.js";
import {
  DEFAULT_AUDIT_RETENTION_DAYS,
  DEFAULT_USAGE_HOLD_TTL_SECONDS,
  PrecheckService,
  type AgentActorContext,
} from "./policy-engine/precheck.js";
import type { PolicyRepository } from "./policy-engine/repository.js";
import {
  createPolicyRouter,
  type AgentActorAuthenticator,
} from "./policy-engine/routes.js";
import { PolicyLifecycleService } from "./policy-engine/service.js";
import {
  NETWORK_ID,
  type Hex32,
  type WalletCreationOperationRecord,
} from "./policy-engine/types.js";
import {
  createZeroGSemanticInferenceFromEnv,
  DEFAULT_ZERO_G_TEEML_TIMEOUT_MS,
  resolveZeroGSecurityProfileFromEnv,
} from "./integrations/0g/zero-g-semantic-inference.js";
import { createPostgresTeeMlRepository } from "./teeml/postgres-repository.js";
import { createPostgresAgenticIdRegistrationRepository } from "./teeml/postgres-agentic-id-registration.js";
import {
  UnconfiguredAgenticIdRegistrationRepository,
  type AgenticIdRegistrationRepository,
} from "./teeml/agentic-id-registration.js";
import type { TeeMlInferenceGateway } from "./teeml/inference-gateway.js";
import type { ZeroGSecurityProfile } from "./teeml/security-profile.js";
import {
  UnconfiguredTeeMlRepository,
  type TeeMlRepository,
} from "./teeml/repository.js";
import { createTeeMlRouter } from "./teeml/routes.js";
import {
  DEFAULT_TEEML_PROCESSING_LEASE_SECONDS,
  TeeMlService,
} from "./teeml/service.js";
import {
  getAgentPrivateKey,
  issueAgentAuthToken,
  resolveAgentIdForAuthToken,
} from "./store.js";
import { ExecutionError, PaymentExecutionService } from "./payment/execute.js";
import { createPostgresExecutionRepository } from "./payment/execution-repository.js";
import { resolveRecoveryGuardian } from "./walletConfig.js";

const EVM_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const TRANSACTION_HASH_RE = /^0x[a-fA-F0-9]{64}$/;
const PRIVATE_KEY_HEX_RE = /^(0x)?[a-fA-F0-9]{64}$/;
const AGENT_TYPES: AgentType[] = [
  "Payment",
  "API Buyer",
  "DeFi",
  "Treasury",
  "Other",
];

export type AgentServiceAppOptions = {
  policyRepository?: PolicyRepository;
  precheckRepository?: PrecheckRepository;
  teemlRepository?: TeeMlRepository;
  teemlInference?: TeeMlInferenceGateway;
  teemlSecurityProfile?: ZeroGSecurityProfile;
  authenticateAgentActor?: AgentActorAuthenticator;
  createAgent?: typeof createAgentProfile;
  createWallet?: typeof createAgentWallet;
  inspectExistingWallet?: typeof inspectExistingSafeWallet;
  proposeAction?: typeof proposeAgentAction;
  registerAgenticId?: typeof registerAgenticId;
  agenticIdRegistrationRepository?: AgenticIdRegistrationRepository;
  getAgent?: typeof getStoredAgent;
  setAgentWallet?: typeof setStoredAgentWallet;
};

export function createAgentServiceApp(options: AgentServiceAppOptions = {}) {
  const app = express();
  app.use(express.json());

  // Fail at boot, not at the first real Agentic ID registration: these two
  // must be explicit, never a silent testnet default that could point a
  // "production" deployment at the wrong 0G network/contract.
  getExpectedAgenticIdContractAddress();
  getExpectedAgenticIdChainId();
  if (
    process.env.AEGIS_DASHBOARD_INTERNAL_TOKEN &&
    process.env.AEGIS_DASHBOARD_INTERNAL_TOKEN.length < MIN_INTERNAL_TOKEN_LENGTH
  ) {
    throw new Error(
      `AEGIS_DASHBOARD_INTERNAL_TOKEN must be at least ${MIN_INTERNAL_TOKEN_LENGTH} characters`,
    );
  }

  const policyRepository =
    options.policyRepository ??
    (process.env.DATABASE_URL
      ? createPostgresPolicyRepository(process.env.DATABASE_URL)
      : new UnconfiguredPolicyRepository());
  const precheckRepository =
    options.precheckRepository ??
    (process.env.DATABASE_URL
      ? createPostgresPrecheckRepository(process.env.DATABASE_URL)
      : new UnconfiguredPrecheckRepository());
  const teemlRepository =
    options.teemlRepository ??
    (process.env.DATABASE_URL
      ? createPostgresTeeMlRepository(process.env.DATABASE_URL)
      : new UnconfiguredTeeMlRepository());
  const agenticIdRegistrationRepository =
    options.agenticIdRegistrationRepository ??
    (process.env.DATABASE_URL
      ? createPostgresAgenticIdRegistrationRepository(process.env.DATABASE_URL)
      : new UnconfiguredAgenticIdRegistrationRepository());
  const policyService = new PolicyLifecycleService(policyRepository);
  const precheckService = new PrecheckService(precheckRepository, {
    idGenerator: createUuidV7,
    usageHoldTtlSeconds: envPositiveInteger(
      "USAGE_HOLD_TTL_SECONDS",
      DEFAULT_USAGE_HOLD_TTL_SECONDS,
    ),
    auditRetentionDays: envPositiveInteger(
      "AUDIT_RETENTION_DAYS",
      DEFAULT_AUDIT_RETENTION_DAYS,
    ),
  });
  const teemlTimeoutMs = envPositiveInteger(
    "ZG_TEEML_TIMEOUT_MS",
    DEFAULT_ZERO_G_TEEML_TIMEOUT_MS,
  );
  const teemlSecurityProfile =
    options.teemlSecurityProfile ?? resolveZeroGSecurityProfileFromEnv();
  const teemlService = new TeeMlService(
    teemlRepository,
    options.teemlInference ?? createZeroGSemanticInferenceFromEnv(),
    {
      idGenerator: createUuidV7,
      auditRetentionDays: envPositiveInteger(
        "AUDIT_RETENTION_DAYS",
        DEFAULT_AUDIT_RETENTION_DAYS,
      ),
      processingLeaseSeconds: Math.max(
        DEFAULT_TEEML_PROCESSING_LEASE_SECONDS,
        Math.ceil(teemlTimeoutMs / 1_000) + 30,
      ),
      securityProfile: teemlSecurityProfile,
      allowHackathonExecution: process.env.AEGIS_ALLOW_HACKATHON_EXECUTION === "true",
    },
  );
  const isPolicyDatabaseConfigured = !(
    policyRepository instanceof UnconfiguredPolicyRepository
  );
  const paymentExecutionService = createPaymentExecutionServiceFromEnv(
    teemlRepository,
    policyRepository,
  );
  const createAgent = options.createAgent ?? createAgentProfile;
  const createWallet = options.createWallet ?? createAgentWallet;
  const inspectExistingWallet =
    options.inspectExistingWallet ?? inspectExistingSafeWallet;
  const proposeAction = options.proposeAction ?? proposeAgentAction;
  const registerAgenticIdHandler =
    options.registerAgenticId ?? registerAgenticId;
  const getAgent = options.getAgent ?? getStoredAgent;
  const persistAgentWallet = options.setAgentWallet ?? setStoredAgentWallet;

  // The in-memory profile store (store.ts) doesn't survive a restart, but a
  // durable Postgres agent row (written by /create-agents, see saveAgent
  // below) does -- so ownership proofs for an existing agent must fall back
  // to it, the same way create-wallets already tolerates a missing in-memory
  // profile when resuming a durably persisted wallet-creation operation.
  async function resolveAgentOwnerAddress(
    agentId: string,
  ): Promise<`0x${string}` | null> {
    const inMemory = getAgent(agentId);
    if (inMemory) return inMemory.ownerWallet as `0x${string}`;
    if (!isPolicyDatabaseConfigured) return null;
    const record = await policyRepository.getAgent(agentId);
    return record ? record.ownerAddress : null;
  }

  // CREATE_AGENT has no natural idempotency backstop the way CREATE_WALLET
  // (wallet-creation-operation lock) and DELETE_AGENT (delete is a no-op the
  // second time) do -- proof-of-ownership alone doesn't stop the owner's own
  // valid signature from being replayed to mint real Hedera accounts on their
  // dime for as long as it stays fresh. Reject a signature that's already
  // been used once; the freshness check already bounds how long an entry
  // needs to be remembered.
  const usedCreateAgentSignatures = new Map<string, number>();
  function rejectReplayedCreateAgentSignature(signature: string, now: number): void {
    for (const [seenSignature, expiresAt] of usedCreateAgentSignatures) {
      if (expiresAt <= now) usedCreateAgentSignatures.delete(seenSignature);
    }
    if (usedCreateAgentSignatures.has(signature)) {
      conflict(
        "replayed_operator_signature",
        "this signed create-agents request has already been used; sign a fresh one",
      );
    }
    usedCreateAgentSignatures.set(
      signature,
      now + AGENT_COMMITMENT_MAX_AGE_SECONDS + AGENT_COMMITMENT_MAX_FUTURE_SKEW_SECONDS,
    );
  }

  app.get("/health", (_req, res) =>
    res.json({ ok: true, service: "aegis-agent-service" }),
  );

  // Internal-only: lets the dashboard's server fetch an agent's own bearer
  // token so it can act on that agent's behalf (precheck/TeeML verify/
  // execute). Gated by a shared secret the browser never sees; see
  // policy-engine/agent-auth.ts's createStoreAgentActorAuthenticator.
  app.get("/internal/agents/:agentId/auth-token", (req, res) => {
    const expectedToken = process.env.AEGIS_DASHBOARD_INTERNAL_TOKEN;
    if (!expectedToken) {
      return res.status(503).json({ error: "internal_auth_unconfigured" });
    }
    const presentedToken = req.headers["x-aegis-internal-token"];
    if (
      typeof presentedToken !== "string" ||
      !timingSafeEqualStrings(presentedToken, expectedToken)
    ) {
      return res.status(401).json({ error: "invalid_internal_auth" });
    }
    const agentId = req.params.agentId.trim().toLowerCase();
    if (!getAgent(agentId)) {
      return res.status(404).json({ error: "not_found" });
    }
    res.json({ token: issueAgentAuthToken(agentId) });
  });

  app.use(
    createPolicyRouter(
      policyService,
      precheckService,
      options.authenticateAgentActor,
    ),
  );
  app.use(createTeeMlRouter(teemlService, options.authenticateAgentActor));

  app.post("/create-agents", async (req, res) => {
    const { ownerWallet, name, type, endpoint, description } = req.body ?? {};

    if (typeof ownerWallet !== "string" || !ownerWallet) {
      return res.status(400).json({ error: "ownerWallet is required" });
    }
    if (!EVM_ADDRESS_RE.test(ownerWallet)) {
      return res
        .status(400)
        .json({ error: "ownerWallet must be a valid EVM address" });
    }
    if (typeof name !== "string" || !name) {
      return res.status(400).json({ error: "name is required" });
    }
    if (!AGENT_TYPES.includes(type)) {
      return res
        .status(400)
        .json({ error: `type must be one of: ${AGENT_TYPES.join(", ")}` });
    }

    try {
      const auth = extractAgentCommitmentAuth(req.headers);
      const commitment = buildAgentCommitment({
        operation: "CREATE_AGENT",
        operatorAddress: auth.operatorAddress.toLowerCase() as `0x${string}`,
        issuedAt: auth.issuedAt,
        ownerWallet: ownerWallet as `0x${string}`,
        name,
        agentType: type,
        endpoint,
        description,
      });
      await verifyAgentCommitmentProof({
        commitment,
        auth,
        ownerAddress: ownerWallet as `0x${string}`,
      });
      rejectReplayedCreateAgentSignature(
        auth.signature.toLowerCase(),
        Math.floor(Date.now() / 1000),
      );
    } catch (error) {
      if (error instanceof PolicyEngineError) {
        return res
          .status(error.status)
          .json({ error: error.code, message: error.message });
      }
      return res.status(500).json({
        error: error instanceof Error ? error.message : "agent_auth_failed",
      });
    }

    try {
      const profile = await createAgent({
        ownerWallet,
        name,
        type,
        endpoint,
        description,
      });
      if (isPolicyDatabaseConfigured) {
        // TODO(aegis): if this saveAgent throws (DB hiccup) after createAgent
        // above already succeeded, the agent is live in-memory with a real
        // Hedera account but no durable row -- resolveAgentOwnerAddress can
        // never recover its owner after a restart. Needs a retry or a
        // reconciliation job; not introduced by this auth change, but this
        // auth change now depends on both stores staying in sync.
        const createdAt = Math.floor(Date.parse(profile.createdAt) / 1000);
        await policyRepository.saveAgent({
          agentId: profile.agentId,
          ownerAddress: profile.ownerWallet.toLowerCase() as `0x${string}`,
          status: profile.status === "active" ? "ACTIVE" : "PAUSED",
          createdAt,
          updatedAt: createdAt,
        });
      }
      res.status(201).json(profile);
    } catch (error) {
      res
        .status(500)
        .json({
          error: error instanceof Error ? error.message : "create_agent_failed",
        });
    }
  });

  // Lets the dashboard recover an owner's agents on any browser/device,
  // instead of relying on a per-browser localStorage cache written at
  // creation time (which a fresh browser/device never had). Returns only
  // agentIds from the durable Postgres `aegis_agents` table (ownerAddress) --
  // deliberately not the full in-memory AgentProfile (Safe address, 2-of-3
  // owner set, description, toolNames, agenticId): an unauthenticated
  // *bulk* profile dump keyed only by a public wallet address is a much
  // bigger reconnaissance surface than the existing unauthenticated
  // single-agent GET /agents/:agentId, which at least requires already
  // knowing a specific agentId. Callers fetch each id's full profile
  // individually the same way the agent detail page always has. This also
  // means an agent whose in-memory profile was lost to a service restart
  // (see the TODO above `saveAgent`'s call in /create-agents) still shows
  // up here -- the per-agent 404 on the follow-up detail fetch is the
  // existing, already-handled failure mode, instead of this list silently
  // going empty and looking identical to "this owner truly has zero
  // agents."
  app.get("/agents", async (req, res) => {
    const owner = req.query.owner;
    if (typeof owner !== "string" || !EVM_ADDRESS_RE.test(owner)) {
      return res.status(400).json({ error: "owner must be a valid EVM address" });
    }

    try {
      const records = await policyRepository.listAgentsByOwner(owner);
      res.json({ agentIds: records.map(record => record.agentId) });
    } catch (error) {
      if (error instanceof PolicyEngineError) {
        return res.status(error.status).json({ error: error.code, message: error.message });
      }
      res.status(500).json({
        error: error instanceof Error ? error.message : "list_agents_failed",
      });
    }
  });

  app.get("/agents/:agentId", (req, res) => {
    const profile = getAgent(req.params.agentId);
    if (!profile) return res.status(404).json({ error: "not_found" });
    res.json(profile);
  });

  app.post("/agents/:agentId/propose-actions", async (req, res) => {
    const { task, safeAddress } = req.body ?? {};

    if (typeof task !== "string" || !task) {
      return res.status(400).json({ error: "task is required" });
    }
    if (safeAddress !== undefined && typeof safeAddress !== "string") {
      return res.status(400).json({ error: "safeAddress must be a string" });
    }

    const profile = getAgent(req.params.agentId);
    const effectiveSafeAddress = safeAddress ?? profile?.safeAddress;

    try {
      const proposal = await proposeAction(
        req.params.agentId,
        task,
        effectiveSafeAddress,
      );
      res.json({ proposal });
    } catch (error) {
      if (error instanceof Error && error.message === "agent_not_found") {
        return res.status(404).json({ error: "not_found" });
      }
      res
        .status(500)
        .json({
          error:
            error instanceof Error ? error.message : "propose_action_failed",
        });
    }
  });

  app.post("/agents/:agentId/create-wallets", async (req, res) => {
    const { recoveryGuardianAddress, retryFailedDeployment } = req.body ?? {};

    if (
      recoveryGuardianAddress !== undefined &&
      typeof recoveryGuardianAddress !== "string"
    ) {
      return res
        .status(400)
        .json({ error: "recoveryGuardianAddress must be a string" });
    }
    if (
      retryFailedDeployment !== undefined &&
      typeof retryFailedDeployment !== "boolean"
    ) {
      return res
        .status(400)
        .json({ error: "retryFailedDeployment must be a boolean" });
    }

    if (!isPolicyDatabaseConfigured) {
      return res.status(503).json({
        error:
          "DATABASE_URL is required before deploying a Safe so wallet idempotency can be persisted.",
      });
    }

    const agentIdForAuth = req.params.agentId.trim().toLowerCase();
    const ownerAddressForAuth = await resolveAgentOwnerAddress(agentIdForAuth);
    if (!ownerAddressForAuth) {
      return res.status(404).json({ error: "not_found" });
    }

    try {
      const auth = extractAgentCommitmentAuth(req.headers);
      // retryFailedDeployment is deliberately not bound into the commitment:
      // tampering it post-signature only changes whether an already-owner-
      // authorized retry of the same reserved wallet creation is allowed,
      // never who owns the agent or where funds go, so it doesn't need a
      // dedicated commitment field the way recoveryGuardianAddress does.
      const commitment = buildAgentCommitment({
        operation: "CREATE_WALLET",
        operatorAddress: auth.operatorAddress.toLowerCase() as `0x${string}`,
        issuedAt: auth.issuedAt,
        agentId: agentIdForAuth,
        recoveryGuardianAddress: recoveryGuardianAddress as `0x${string}` | undefined,
      });
      await verifyAgentCommitmentProof({
        commitment,
        auth,
        ownerAddress: ownerAddressForAuth,
      });
    } catch (error) {
      if (error instanceof PolicyEngineError) {
        return res
          .status(error.status)
          .json({ error: error.code, message: error.message });
      }
      return res.status(500).json({
        error: error instanceof Error ? error.message : "agent_auth_failed",
      });
    }

    try {
      const agentId = agentIdForAuth;
      const result = await policyRepository.withWalletCreationLock(
        agentId,
        NETWORK_ID,
        async () => {
          let operation = await policyRepository.getWalletCreationOperation(
            agentId,
            NETWORK_ID,
          );
          if (operation?.status === "COMPLETED") {
            const protectedWallet = walletFromCompletedOperation(operation);
            persistAgentWallet(agentId, protectedWallet);
            return { status: 200, wallet: protectedWallet } as const;
          }

          const existingWallet =
            await policyRepository.getWalletByAgentNetwork(
              agentId,
              NETWORK_ID,
            );
          if (existingWallet) {
            if (existingWallet.status !== "PROTECTED") {
              throw new LegacyWalletNotProtectedError();
            }
            const inspected = await inspectExistingWallet(
              existingWallet.safeAddress,
            );
            const protectedWallet: NonNullable<AgentProfile["wallet"]> = {
              walletId: existingWallet.walletId,
              safeAddress: inspected.safeAddress,
              networkId: existingWallet.networkId,
              status: "PROTECTED",
              owners: inspected.owners,
              threshold: inspected.threshold,
              transactionHash: null,
              deploymentProvenance: "LEGACY_WALLET_RECONCILIATION",
              guardianManaged: false,
            };
            persistAgentWallet(agentId, protectedWallet);
            return { status: 200, wallet: protectedWallet } as const;
          }

          if (
            operation &&
            recoveryGuardianAddress !== undefined &&
            recoveryGuardianAddress.toLowerCase() !==
              operation.recoveryGuardianAddress
          ) {
            throw new WalletCreationConflictError();
          }

          if (operation?.status === "FAILED") {
            if (retryFailedDeployment !== true) {
              throw new WalletCreationRetryRequiredError();
            }
            operation = await policyRepository.resetFailedWalletCreation(
              operation.operationId,
              Math.floor(Date.now() / 1000),
            );
          } else if (retryFailedDeployment === true) {
            throw new WalletCreationNotRetryableError();
          }

          const currentProfile = getAgent(agentId);
          if (!operation && currentProfile?.wallet) {
            return { status: 200, wallet: currentProfile.wallet } as const;
          }

          if (!operation) {
            if (!currentProfile) throw new Error("agent_not_found");
            const guardian = resolveRecoveryGuardian({
              requestedAddress: recoveryGuardianAddress,
              configuredAddress: process.env.AEGIS_RECOVERY_GUARDIAN_ADDRESS,
              ownerWallet: currentProfile.ownerWallet,
            });
            if (!guardian || !EVM_ADDRESS_RE.test(guardian.address)) {
              throw new InvalidRecoveryGuardianError();
            }

            const now = Math.floor(Date.now() / 1000);
            operation = await policyRepository.beginWalletCreation({
              operationId: createUuidV7(),
              agentId,
              networkId: NETWORK_ID,
              walletId: createUuidV7(),
              recoveryGuardianAddress:
                guardian.address.toLowerCase() as `0x${string}`,
              guardianSource: guardian.source,
              saltNonce: deriveSafeSaltNonce(agentId),
              status: "INITIALIZED",
              predictedSafeAddress: null,
              transactionHash: null,
              owners: null,
              threshold: null,
              deploymentProvenance: null,
              failureCode: null,
              createdAt: now,
              updatedAt: now,
            });
          }

          const operationId = operation.operationId;
          const wallet = await createWallet(
            agentId,
            operation.recoveryGuardianAddress,
            {
              saltNonce: operation.saltNonce,
              expectedSafeAddress: operation.predictedSafeAddress,
              expectedOwners: operation.owners,
              expectedThreshold: operation.threshold,
              transactionHash: operation.transactionHash,
              onPrepared: async (
                predictedSafeAddress,
                expectedOwners,
                expectedThreshold,
              ) => {
                operation = await policyRepository.markWalletCreationPrepared(
                  operationId,
                  predictedSafeAddress,
                  expectedOwners,
                  expectedThreshold,
                  Math.floor(Date.now() / 1000),
                );
              },
              onBroadcast: async transactionHash => {
                operation = await policyRepository.markWalletCreationBroadcast(
                  operationId,
                  transactionHash,
                  Math.floor(Date.now() / 1000),
                );
              },
              onFailed: async (transactionHash, failureCode) => {
                operation = await policyRepository.markWalletCreationFailed(
                  operationId,
                  transactionHash,
                  failureCode,
                  Math.floor(Date.now() / 1000),
                );
              },
            },
          );
          const safeAddress = normalizeEvmAddress(
            wallet.safeAddress,
            "deployed Safe",
          );
          const owners = wallet.owners.map(owner =>
            normalizeEvmAddress(owner, "Safe owner"),
          );
          const transactionHash = normalizeOptionalTransactionHash(
            wallet.transactionHash,
          );
          const deploymentProvenance =
            wallet.deploymentProvenance ??
            (transactionHash === null
              ? "PREDICTED_SAFE_RECONCILIATION"
              : "BROADCAST_RECEIPT");
          operation = await policyRepository.completeWalletCreation({
            operationId: operation.operationId,
            safeAddress,
            transactionHash,
            owners,
            threshold: wallet.threshold,
            deploymentProvenance,
            now: Math.floor(Date.now() / 1000),
          });

          const protectedWallet = walletFromCompletedOperation(operation);
          persistAgentWallet(agentId, protectedWallet);
          return { status: 201, wallet: protectedWallet } as const;
        },
      );
      res.status(result.status).json(result.wallet);
    } catch (error) {
      if (error instanceof InvalidRecoveryGuardianError) {
        return res.status(400).json({
          error:
            "recoveryGuardianAddress must be a valid EVM address (defaults to AEGIS_RECOVERY_GUARDIAN_ADDRESS, then the agent's ownerWallet)",
        });
      }
      if (error instanceof WalletCreationConflictError) {
        return res.status(409).json({
          error:
            "wallet creation is already reserved with a different recovery guardian",
        });
      }
      if (error instanceof WalletCreationRetryRequiredError) {
        return res.status(409).json({
          error:
            "the persisted Safe deployment reverted; retry only with retryFailedDeployment=true",
        });
      }
      if (error instanceof WalletCreationNotRetryableError) {
        return res.status(409).json({
          error:
            "wallet deployment retry is allowed only after a conclusively reverted persisted transaction",
        });
      }
      if (error instanceof LegacyWalletNotProtectedError) {
        return res.status(409).json({
          error:
            "the persisted legacy wallet is not PROTECTED and cannot be reclassified or redeployed",
        });
      }
      if (error instanceof Error && error.message === "agent_not_found") {
        return res.status(404).json({ error: "not_found" });
      }
      res
        .status(500)
        .json({
          error:
            error instanceof Error ? error.message : "create_wallet_failed",
        });
    }
  });

  app.post("/agents/:agentId/register-agentic-id", async (req, res) => {
    try {
      if (!options.authenticateAgentActor) {
        return res.status(503).json({
          error: "agent_auth_unconfigured",
        });
      }
      const actor = await options.authenticateAgentActor(req);
      if (
        actor.actorType !== "AGENT" ||
        actor.authenticatedAgentId.trim().toLowerCase() !==
          req.params.agentId.trim().toLowerCase()
      ) {
        return res.status(403).json({ error: "agent_context_mismatch" });
      }
      if (
        req.body !== undefined &&
        (req.body === null ||
          typeof req.body !== "object" ||
          Array.isArray(req.body) ||
          Object.keys(req.body as Record<string, unknown>).length > 0)
      ) {
        return res.status(400).json({ error: "unknown_property" });
      }
      let policyHash: Hex32 | undefined;
      if (!options.registerAgenticId) {
        if (!isPolicyDatabaseConfigured) {
          return res.status(503).json({ error: "policy_store_unavailable" });
        }
        const agentId = req.params.agentId.trim().toLowerCase();
        const agent = getAgent(agentId);
        if (!agent) return res.status(404).json({ error: "not_found" });
        if (!agent.wallet) {
          return res.status(409).json({ error: "agent_wallet_not_created" });
        }
        const activePolicy = await policyRepository.getActivePolicy(
          agentId,
          agent.wallet.walletId,
        );
        if (!activePolicy) {
          return res.status(409).json({ error: "active_policy_required" });
        }
        policyHash = activePolicy.policyHash;
      }
      const profile = await registerAgenticIdHandler(req.params.agentId, {
        registrationRepository: agenticIdRegistrationRepository,
        ...(policyHash ? { policyHash } : {}),
      });
      res.status(201).json(profile);
    } catch (error) {
      if (error instanceof PolicyEngineError) {
        return res
          .status(error.status)
          .json({ error: error.code, message: error.message });
      }
      if (error instanceof Error && error.message === "agent_not_found") {
        return res.status(404).json({ error: "not_found" });
      }
      if (
        error instanceof Error &&
        error.message === "agent_wallet_not_created"
      ) {
        return res
          .status(409)
          .json({
            error:
              "agent must have a Safe wallet (create-wallets) before registering an Agentic ID",
          });
      }
      if (error instanceof HttpError) {
        return res.status(error.status).json({ error: error.message });
      }
      res.status(500).json({
        error:
          error instanceof Error ? error.message : "register_agentic_id_failed",
      });
    }
  });

  app.post("/actions/:requestId/execute", async (req, res) => {
    if (!options.authenticateAgentActor) {
      return res.status(503).json({ error: "agent_auth_unconfigured" });
    }
    if (!paymentExecutionService) {
      return res.status(503).json({ error: "execution_unconfigured" });
    }
    try {
      const actor = await options.authenticateAgentActor(req);
      const result = await paymentExecutionService.execute(
        req.params.requestId,
        actor,
      );
      res.status(200).json(result);
    } catch (error) {
      if (error instanceof ExecutionError) {
        return res
          .status(error.httpStatus)
          .json({ error: error.code, message: error.message });
      }
      if (error instanceof PolicyEngineError) {
        return res
          .status(error.status)
          .json({ error: error.code, message: error.message });
      }
      res.status(502).json({
        error: "execution_failed",
        message: error instanceof Error ? error.message : "unknown_error",
      });
    }
  });

  app.delete("/agents/:agentId", async (req, res) => {
    const agentId = req.params.agentId;

    // Deleting an already-deleted (or never-existing) agent is a deliberate
    // no-op -- nothing to authenticate ownership of, and no state changes.
    // An existing agent must prove ownership before its records are removed.
    const ownerAddressForAuth = await resolveAgentOwnerAddress(agentId);
    if (ownerAddressForAuth) {
      try {
        const auth = extractAgentCommitmentAuth(req.headers);
        const commitment = buildAgentCommitment({
          operation: "DELETE_AGENT",
          operatorAddress: auth.operatorAddress.toLowerCase() as `0x${string}`,
          issuedAt: auth.issuedAt,
          agentId,
        });
        await verifyAgentCommitmentProof({
          commitment,
          auth,
          ownerAddress: ownerAddressForAuth,
        });
      } catch (error) {
        if (error instanceof PolicyEngineError) {
          return res
            .status(error.status)
            .json({ error: error.code, message: error.message });
        }
        return res.status(500).json({
          error: error instanceof Error ? error.message : "agent_auth_failed",
        });
      }
    }

    deleteStoredAgent(agentId);

    if (!isPolicyDatabaseConfigured) {
      return res.status(204).end();
    }

    try {
      await policyRepository.deleteAgent(agentId);
      res.status(204).end();
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "delete_agent_failed",
      });
    }
  });

  return app;
}

class InvalidRecoveryGuardianError extends Error {}
class WalletCreationConflictError extends Error {}
class WalletCreationRetryRequiredError extends Error {}
class WalletCreationNotRetryableError extends Error {}
class LegacyWalletNotProtectedError extends Error {}

function walletFromCompletedOperation(
  operation: WalletCreationOperationRecord,
): NonNullable<AgentProfile["wallet"]> {
  if (
    operation.status !== "COMPLETED" ||
    operation.predictedSafeAddress === null ||
    operation.owners === null ||
    operation.threshold === null ||
    operation.deploymentProvenance === null
  ) {
    throw new Error("wallet_creation_operation_incomplete");
  }
  return {
    walletId: operation.walletId,
    safeAddress: operation.predictedSafeAddress,
    networkId: operation.networkId,
    status: "PROTECTED",
    owners: operation.owners,
    threshold: operation.threshold,
    transactionHash: operation.transactionHash,
    deploymentProvenance: operation.deploymentProvenance,
    guardianManaged: operation.guardianSource === "CONFIGURED_AEGIS",
  };
}

function normalizeEvmAddress(
  address: string,
  label: string,
): `0x${string}` {
  if (!EVM_ADDRESS_RE.test(address)) {
    throw new Error(`${label} must be a valid EVM address`);
  }
  return address.toLowerCase() as `0x${string}`;
}

function normalizeOptionalTransactionHash(
  transactionHash: string | null,
): `0x${string}` | null {
  if (transactionHash === null) return null;
  if (!TRANSACTION_HASH_RE.test(transactionHash)) {
    throw new Error("Safe deployment transactionHash must be bytes32");
  }
  return transactionHash.toLowerCase() as `0x${string}`;
}

export function fixedAgentActor(agentId: string): AgentActorContext {
  return { authenticatedAgentId: agentId.toLowerCase(), actorType: "AGENT" };
}

function envPositiveInteger(name: string, fallback: number): number {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

function createPaymentExecutionServiceFromEnv(
  teemlRepository: TeeMlRepository,
  policyRepository: PolicyRepository,
): PaymentExecutionService | undefined {
  const agentVerifierSignerPrivateKey = process.env.AGENT_VERIFIER_SIGNER_PRIVATE_KEY;
  const feeRecipientAddress = process.env.AEGIS_FEE_RECIPIENT_ADDRESS;
  const rpcUrl = process.env.RPC_URL;
  const cosignerBaseUrl = process.env.COSIGNER_BASE_URL;
  if (
    !agentVerifierSignerPrivateKey ||
    !feeRecipientAddress ||
    !rpcUrl ||
    !cosignerBaseUrl ||
    !process.env.DATABASE_URL
  ) {
    return undefined;
  }
  return new PaymentExecutionService(
    teemlRepository,
    policyRepository,
    createPostgresExecutionRepository(process.env.DATABASE_URL),
    {
      agentVerifierSignerPrivateKey: normalizeHexKey(
        agentVerifierSignerPrivateKey,
        "AGENT_VERIFIER_SIGNER_PRIVATE_KEY",
      ),
      feeRecipientAddress: normalizeEvmAddress(
        feeRecipientAddress,
        "AEGIS_FEE_RECIPIENT_ADDRESS",
      ),
      rpcUrl,
      cosignerBaseUrl,
      getAgentPrivateKey,
      idGenerator: createUuidV7,
      clock: () => Math.floor(Date.now() / 1000),
    },
  );
}

function normalizeHexKey(key: string, label: string): `0x${string}` {
  if (!PRIVATE_KEY_HEX_RE.test(key)) {
    throw new Error(`${label} must be a 32-byte hex private key`);
  }
  const withoutPrefix = key.startsWith("0x") ? key.slice(2) : key;
  return `0x${withoutPrefix}`;
}

function timingSafeEqualStrings(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

const port = process.env.AGENT_SERVICE_PORT ?? 4200;
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const authenticateAgentActor = composeAgentActorAuthenticators(
    createStoreAgentActorAuthenticator(resolveAgentIdForAuthToken),
    createEnvAgentActorAuthenticator(),
  );
  createAgentServiceApp({
    ...(authenticateAgentActor ? { authenticateAgentActor } : {}),
  }).listen(port, () => console.log(`aegis-agent-service on :${port}`));
}
