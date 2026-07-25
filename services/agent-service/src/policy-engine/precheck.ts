import { randomUUID } from "node:crypto";
import { keccak256, stringToHex } from "viem";
import { hashCanonicalValue } from "./canonicalize.js";
import { badRequest, conflict, forbidden, PolicyEngineError } from "./errors.js";
import {
  DENY_PRECHECK,
  PASS_TO_TEEML,
  evaluateDeterministicPolicy,
  type AssetCatalogEntry,
  type DeterministicPolicyEvaluationInput,
  type NormalizedAction,
  type PassToTeeMlResult,
  type UsageSnapshot,
} from "./evaluator.js";
import { toPolicy } from "./repository.js";
import {
  HEDERA_TESTNET_CHAIN_ID,
  NETWORK_ID,
  type AgentRecord,
  type DestinationIdentity,
  type Hex32,
  type PolicyRecord,
  type WalletRecord,
} from "./types.js";

export type { AssetCatalogEntry } from "./evaluator.js";

export const PRECHECK_REQUEST_SCHEMA = "aegis.precheck.request.level1.v1";
export const ACTION_HASH_SCHEMA = "aegis.action.level1.v1";
export const PRECHECK_EVALUATOR_VERSION = "aegis.deterministic-policy-evaluator.level1.v1";
export const AUDIT_EVENT_SCHEMA_VERSION = "aegis.audit.precheck.level1.v1";
export const DEFAULT_USAGE_HOLD_TTL_SECONDS = 300;
export const DEFAULT_AUDIT_RETENTION_DAYS = 90;

export type AgentActorContext = {
  authenticatedAgentId: string;
  actorType: "AGENT";
};

export type PrecheckRouteParams = {
  agentId: string;
  walletId: string;
};

export type NormalizedPrecheckActionRequest = {
  agentId: string;
  walletId: string;
  actionType: string;
  destination: DestinationIdentity;
  assetId: string;
  amount: string;
  actionDeadline: number;
  reason: string | null;
  reasonHash: Hex32 | null;
};

export type PendingTeemlResponse = {
  requestId: string;
  precheckId: string;
  status: "PENDING_TEEML";
  policyId: string;
  policyVersion: number;
  policyHash: Hex32;
  actionHash: Hex32;
  aegisNonce: string;
  usageHoldId: string;
  usageHoldExpiresAt: number;
  evaluatedAt: number;
};

export type DenyPrecheckHttpResponse = {
  requestId: string;
  precheckId: string;
  stage: "PRECHECK";
  status: typeof DENY_PRECHECK;
  code: string;
  policyId: string | null;
  policyVersion: number | null;
  policyHash: Hex32 | null;
  actionHash: Hex32;
  aegisNonce: string | null;
  evaluatedAt: number;
};

export type PrecheckHttpResponse = PendingTeemlResponse | DenyPrecheckHttpResponse;
export type PrecheckActionRequestStatus = "RECEIVED" | "DENIED_PRECHECK" | "PENDING_TEEML";
export type PrecheckRecordStatus = typeof PASS_TO_TEEML | typeof DENY_PRECHECK;
export type UsageHoldStatus = "HELD" | "RELEASED" | "EXPIRED" | "COMMITTED";

export type ActionRequestRecord = {
  requestId: string;
  agentId: string;
  walletId: string;
  idempotencyKeyHash: Hex32;
  requestPayloadHash: Hex32;
  privatePayload: Record<string, unknown>;
  reasonHash: Hex32 | null;
  aegisNonce: string | null;
  policyId: string | null;
  policyVersion: number | null;
  policyHash: Hex32 | null;
  actionHash: Hex32;
  status: PrecheckActionRequestStatus;
  functionalResponse: PrecheckHttpResponse;
  createdAt: number;
  updatedAt: number;
};

export type PrecheckRecordRecord = {
  precheckId: string;
  requestId: string;
  agentId: string;
  walletId: string;
  policyId: string | null;
  policyVersion: number | null;
  policyHash: Hex32 | null;
  actionHash: Hex32;
  aegisNonce: string | null;
  evaluatedAt: number;
  status: PrecheckRecordStatus;
  reasonCode: string | null;
  usageHoldId: string | null;
  evaluatorVersion: string;
  createdAt: number;
};

export type UsageHoldRecord = {
  usageHoldId: string;
  requestId: string;
  precheckId: string;
  agentId: string;
  walletId: string;
  policyId: string;
  policyVersion: number;
  policyHash: Hex32;
  assetId: string;
  amount: string;
  actionCount: 1;
  status: UsageHoldStatus;
  heldAt: number;
  expiresAt: number;
  releasedAt: number | null;
  expiredAt: number | null;
  committedAt: number | null;
  createdAt: number;
  updatedAt: number;
};

export type AuditEventRecord = {
  eventId: string;
  schemaVersion: string;
  eventType: "ACTION_PRECHECK_EVALUATED";
  occurredAt: number;
  requestId: string;
  precheckId: string;
  agentId: string;
  walletId: string;
  policyId: string | null;
  policyVersion: number | null;
  policyHash: Hex32 | null;
  actionHash: Hex32;
  stage: "PRECHECK";
  outcome: "PASS_TO_TEEML" | "DENY_PRECHECK";
  reasonCode: string | null;
  networkId: typeof NETWORK_ID;
  idempotencyKeyHash: Hex32;
  requestPayloadHash: Hex32;
  usageHoldId: string | null;
  actorType: "AGENT";
  retentionUntil: number;
};

export type PrecheckTransaction = {
  lockIdempotencyKey(agentId: string, idempotencyKeyHash: Hex32): Promise<void>;
  lockWalletPolicyScope(agentId: string, walletId: string, policyId: string | null): Promise<void>;
  getActionRequestByIdempotency(agentId: string, idempotencyKeyHash: Hex32): Promise<ActionRequestRecord | null>;
  getAgent(agentId: string): Promise<AgentRecord | null>;
  getWallet(walletId: string): Promise<WalletRecord | null>;
  getActivePolicy(agentId: string, walletId: string): Promise<PolicyRecord | null>;
  getAssetCatalogEntry(assetId: string): Promise<AssetCatalogEntry | null>;
  expireUsageHolds(now: number): Promise<void>;
  getUsageSnapshot(input: { agentId: string; walletId: string; policyId: string | null; windowStart: number; windowEnd: number; now: number }): Promise<UsageSnapshot>;
  allocateNonce(walletId: string, now: number): Promise<bigint>;
  insertActionRequest(record: ActionRequestRecord): Promise<void>;
  insertPrecheckRecord(record: PrecheckRecordRecord): Promise<void>;
  insertUsageHold(record: UsageHoldRecord): Promise<void>;
  insertAuditEvent(record: AuditEventRecord): Promise<void>;
};

export type PrecheckRepository = {
  runInTransaction<T>(run: (tx: PrecheckTransaction) => Promise<T>): Promise<T>;
};

export type PrecheckClock = () => number;
export type PrecheckIdGenerator = () => string;
export type DeterministicEvaluator = (input: DeterministicPolicyEvaluationInput) => ReturnType<typeof evaluateDeterministicPolicy>;

export type PrecheckServiceOptions = {
  clock?: PrecheckClock;
  idGenerator?: PrecheckIdGenerator;
  usageHoldTtlSeconds?: number;
  auditRetentionDays?: number;
  evaluator?: DeterministicEvaluator;
};

export class PrecheckService {
  private readonly clock: PrecheckClock;
  private readonly idGenerator: PrecheckIdGenerator;
  private readonly usageHoldTtlSeconds: number;
  private readonly auditRetentionDays: number;
  private readonly evaluator: DeterministicEvaluator;

  constructor(
    private readonly repository: PrecheckRepository,
    options: PrecheckServiceOptions = {},
  ) {
    this.clock = options.clock ?? (() => Math.floor(Date.now() / 1000));
    this.idGenerator = options.idGenerator ?? (() => randomUUID());
    this.usageHoldTtlSeconds = positiveConfigInteger(options.usageHoldTtlSeconds ?? DEFAULT_USAGE_HOLD_TTL_SECONDS, "usageHoldTtlSeconds");
    this.auditRetentionDays = positiveConfigInteger(options.auditRetentionDays ?? DEFAULT_AUDIT_RETENTION_DAYS, "auditRetentionDays");
    this.evaluator = options.evaluator ?? evaluateDeterministicPolicy;
  }

  async precheck(input: {
    params: PrecheckRouteParams;
    body: unknown;
    idempotencyKey: string | null;
    actor: AgentActorContext;
  }): Promise<{ httpStatus: 200 | 202; response: PrecheckHttpResponse; idempotentReplay: boolean }> {
    const now = this.clock();
    const actorAgentId = normalizeIdentifier(input.actor.authenticatedAgentId);
    const params = {
      agentId: normalizeIdentifier(input.params.agentId),
      walletId: normalizeIdentifier(input.params.walletId),
    };

    if (input.actor.actorType !== "AGENT") forbidden("invalid_actor_type", "actorType must be AGENT");
    if (actorAgentId !== params.agentId) forbidden("agent_context_mismatch", "authenticated agent does not match route agentId");

    const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);
    const action = parsePrecheckActionRequest(params, input.body);
    const idempotencyKeyHash = hashSecret(idempotencyKey);
    const requestPayloadHash = computePrecheckRequestPayloadHash(action);

    return this.repository.runInTransaction(async tx => {
      await tx.lockIdempotencyKey(params.agentId, idempotencyKeyHash);
      const existing = await tx.getActionRequestByIdempotency(params.agentId, idempotencyKeyHash);
      if (existing) {
        if (existing.requestPayloadHash !== requestPayloadHash) {
          conflict("IDEMPOTENCY_CONFLICT", "Idempotency-Key was already used with a different payload");
        }
        return {
          httpStatus: existing.status === "PENDING_TEEML" ? 202 : 200,
          response: structuredClone(existing.functionalResponse),
          idempotentReplay: true,
        };
      }

      const agent = await tx.getAgent(params.agentId);
      const wallet = await tx.getWallet(params.walletId);
      const policy = await tx.getActivePolicy(params.agentId, params.walletId);
      await tx.lockWalletPolicyScope(params.agentId, params.walletId, policy?.policyId ?? null);
      const asset = await tx.getAssetCatalogEntry(action.assetId);
      await tx.expireUsageHolds(now);

      const usageSnapshot = await tx.getUsageSnapshot({
        agentId: params.agentId,
        walletId: params.walletId,
        policyId: policy?.policyId ?? null,
        windowStart: utcDayStart(now),
        windowEnd: utcDayStart(now) + 86_400,
        now,
      });

      const nonce = wallet ? await tx.allocateNonce(params.walletId, now) : null;
      const requestId = this.idGenerator();
      const precheckId = this.idGenerator();
      const usageHoldId = policy && nonce !== null ? this.idGenerator() : null;
      const eventId = this.idGenerator();
      const actionHash = computeActionHash({
        requestId,
        agentId: params.agentId,
        walletId: params.walletId,
        networkId: wallet?.networkId ?? NETWORK_ID,
        action,
        policy,
        aegisNonce: nonce,
      });

      const evaluation = this.evaluator({
        agent: agent ? { agentId: agent.agentId, status: agent.status } : null,
        wallet: wallet
          ? {
              walletId: wallet.walletId,
              agentId: wallet.agentId,
              networkId: wallet.networkId,
              status: wallet.status === "PROTECTED" ? "ACTIVE_PROTECTED" : wallet.status,
            }
          : null,
        policy: policy ? toPolicy(policy) : null,
        expectedActivePolicyVersion: policy?.policyVersion ?? null,
        normalizedAction: toEvaluatorAction(action),
        assetCatalogEntry: asset,
        usageSnapshot,
        now,
        generatedAegisNonce: nonce ?? "0",
        calculatedActionHash: actionHash,
      });

      const holdExpiresAt = now + this.usageHoldTtlSeconds;
      const response =
        evaluation.status === PASS_TO_TEEML
          ? buildPendingTeemlResponse(evaluation, requestId, precheckId, requireGeneratedId(usageHoldId, "usageHoldId"), holdExpiresAt)
          : buildDenyPrecheckResponse(evaluation, requestId, precheckId, nonce);
      const status: PrecheckActionRequestStatus = response.status === "PENDING_TEEML" ? "PENDING_TEEML" : "DENIED_PRECHECK";

      await tx.insertActionRequest({
        requestId,
        agentId: params.agentId,
        walletId: params.walletId,
        idempotencyKeyHash,
        requestPayloadHash,
        privatePayload: buildPrivatePayload(action),
        reasonHash: action.reasonHash,
        aegisNonce: nonce?.toString() ?? null,
        policyId: policy?.policyId ?? null,
        policyVersion: policy?.policyVersion ?? null,
        policyHash: policy?.policyHash ?? null,
        actionHash,
        status,
        functionalResponse: response,
        createdAt: now,
        updatedAt: now,
      });

      await tx.insertPrecheckRecord({
        precheckId,
        requestId,
        agentId: params.agentId,
        walletId: params.walletId,
        policyId: policy?.policyId ?? null,
        policyVersion: policy?.policyVersion ?? null,
        policyHash: policy?.policyHash ?? null,
        actionHash,
        aegisNonce: nonce?.toString() ?? null,
        evaluatedAt: now,
        status: evaluation.status,
        reasonCode: evaluation.status === DENY_PRECHECK ? evaluation.code : null,
        usageHoldId: response.status === "PENDING_TEEML" ? response.usageHoldId : null,
        evaluatorVersion: PRECHECK_EVALUATOR_VERSION,
        createdAt: now,
      });

      if (response.status === "PENDING_TEEML") {
        // TODO(teeml-integration): Send the persisted PENDING_TEEML action and private semantic context to the 0G TeeML verifier once the attestation contract is defined.
        // TODO(usage-hold-finalization): Release this hold after a TeeML denial or timeout, and mark it COMMITTED only after the approved Hedera execution is confirmed.
        await tx.insertUsageHold({
          usageHoldId: response.usageHoldId,
          requestId,
          precheckId,
          agentId: params.agentId,
          walletId: params.walletId,
          policyId: response.policyId,
          policyVersion: response.policyVersion,
          policyHash: response.policyHash,
          assetId: action.assetId,
          amount: action.amount,
          actionCount: 1,
          status: "HELD",
          heldAt: now,
          expiresAt: response.usageHoldExpiresAt,
          releasedAt: null,
          expiredAt: null,
          committedAt: null,
          createdAt: now,
          updatedAt: now,
        });
      }

      await tx.insertAuditEvent({
        eventId,
        schemaVersion: AUDIT_EVENT_SCHEMA_VERSION,
        eventType: "ACTION_PRECHECK_EVALUATED",
        occurredAt: now,
        requestId,
        precheckId,
        agentId: params.agentId,
        walletId: params.walletId,
        policyId: policy?.policyId ?? null,
        policyVersion: policy?.policyVersion ?? null,
        policyHash: policy?.policyHash ?? null,
        actionHash,
        stage: "PRECHECK",
        outcome: evaluation.status,
        reasonCode: evaluation.status === DENY_PRECHECK ? evaluation.code : null,
        networkId: NETWORK_ID,
        idempotencyKeyHash,
        requestPayloadHash,
        usageHoldId: response.status === "PENDING_TEEML" ? response.usageHoldId : null,
        actorType: "AGENT",
        retentionUntil: now + this.auditRetentionDays * 86_400,
      });

      return { httpStatus: response.status === "PENDING_TEEML" ? 202 : 200, response, idempotentReplay: false };
    });
  }
}

export function parsePrecheckActionRequest(params: PrecheckRouteParams, input: unknown): NormalizedPrecheckActionRequest {
  const body = objectOf(input, "body");
  rejectUnknownKeys(body, ["agentId", "walletId", "actionType", "destination", "assetId", "amount", "actionDeadline", "reason"], "body");

  const routeAgentId = normalizeIdentifier(params.agentId);
  const routeWalletId = normalizeIdentifier(params.walletId);
  if (body.agentId !== undefined && normalizeIdentifier(requiredString(body.agentId, "body.agentId")) !== routeAgentId) {
    badRequest("ACTION_CONTEXT_MISMATCH", "body.agentId must match the route agentId");
  }
  if (body.walletId !== undefined && normalizeIdentifier(requiredString(body.walletId, "body.walletId")) !== routeWalletId) {
    badRequest("ACTION_CONTEXT_MISMATCH", "body.walletId must match the route walletId");
  }

  const reason = body.reason === undefined ? null : normalizeReason(body.reason);
  return {
    agentId: routeAgentId,
    walletId: routeWalletId,
    actionType: requiredString(body.actionType, "body.actionType").toUpperCase(),
    destination: normalizeDestination(body.destination, "body.destination"),
    assetId: normalizeIdentifier(requiredString(body.assetId, "body.assetId")),
    amount: positiveBaseUnitAmount(body.amount, "body.amount"),
    actionDeadline: unixSeconds(body.actionDeadline, "body.actionDeadline"),
    reason,
    reasonHash: reason === null ? null : hashSecret(reason),
  };
}

export function computePrecheckRequestPayloadHash(action: NormalizedPrecheckActionRequest): Hex32 {
  return hashCanonicalValue({
    schema: PRECHECK_REQUEST_SCHEMA,
    agentId: action.agentId,
    walletId: action.walletId,
    actionType: action.actionType,
    destination: action.destination,
    assetId: action.assetId,
    amount: action.amount,
    actionDeadline: action.actionDeadline,
    reasonHash: action.reasonHash,
  });
}

export function computeActionHash(input: {
  requestId: string;
  agentId: string;
  walletId: string;
  networkId: string;
  action: NormalizedPrecheckActionRequest;
  policy: PolicyRecord | null;
  aegisNonce: bigint | null;
}): Hex32 {
  return hashCanonicalValue({
    schema: ACTION_HASH_SCHEMA,
    requestId: input.requestId,
    agentId: input.agentId,
    walletId: input.walletId,
    networkId: input.networkId,
    actionType: input.action.actionType,
    destination: input.action.destination,
    assetId: input.action.assetId,
    amount: input.action.amount,
    policyId: input.policy?.policyId ?? null,
    policyVersion: input.policy?.policyVersion ?? null,
    policyHash: input.policy?.policyHash ?? null,
    aegisNonce: input.aegisNonce?.toString() ?? null,
    actionDeadline: input.action.actionDeadline,
    reasonHash: input.action.reasonHash,
  });
}

export function hashSecret(value: string): Hex32 {
  return keccak256(stringToHex(value)) as Hex32;
}

export function utcDayStart(now: number): number {
  return Math.floor(now / 86_400) * 86_400;
}

export class InMemoryPrecheckRepository implements PrecheckRepository {
  readonly agents = new Map<string, AgentRecord>();
  readonly wallets = new Map<string, WalletRecord>();
  readonly policies = new Map<string, PolicyRecord>();
  readonly assets = new Map<string, AssetCatalogEntry>();
  readonly actionRequests = new Map<string, ActionRequestRecord>();
  readonly precheckRecords = new Map<string, PrecheckRecordRecord>();
  readonly usageHolds = new Map<string, UsageHoldRecord>();
  readonly auditEvents = new Map<string, AuditEventRecord>();
  readonly nextNonces = new Map<string, bigint>();
  failOn: "action_request" | "precheck_record" | "usage_hold" | "audit_event" | null = null;

  constructor() {
    this.assets.set("hedera:testnet:hbar", {
      canonicalAssetId: "hedera:testnet:hbar",
      networkId: NETWORK_ID,
      kind: "HBAR",
      active: true,
      decimals: 8,
      symbol: "HBAR",
    });
  }

  async runInTransaction<T>(run: (tx: PrecheckTransaction) => Promise<T>): Promise<T> {
    const snapshot = this.snapshot();
    try {
      return await run(new InMemoryPrecheckTransaction(this));
    } catch (error) {
      this.restore(snapshot);
      throw error;
    }
  }

  private snapshot() {
    return {
      actionRequests: cloneMap(this.actionRequests),
      precheckRecords: cloneMap(this.precheckRecords),
      usageHolds: cloneMap(this.usageHolds),
      auditEvents: cloneMap(this.auditEvents),
      nextNonces: cloneMap(this.nextNonces),
    };
  }

  private restore(snapshot: ReturnType<InMemoryPrecheckRepository["snapshot"]>): void {
    replaceMap(this.actionRequests, snapshot.actionRequests);
    replaceMap(this.precheckRecords, snapshot.precheckRecords);
    replaceMap(this.usageHolds, snapshot.usageHolds);
    replaceMap(this.auditEvents, snapshot.auditEvents);
    replaceMap(this.nextNonces, snapshot.nextNonces);
  }
}

class InMemoryPrecheckTransaction implements PrecheckTransaction {
  constructor(private readonly repository: InMemoryPrecheckRepository) {}

  async lockIdempotencyKey(): Promise<void> {}
  async lockWalletPolicyScope(): Promise<void> {}

  async getActionRequestByIdempotency(agentId: string, idempotencyKeyHash: Hex32): Promise<ActionRequestRecord | null> {
    return clone(
      [...this.repository.actionRequests.values()].find(
        request => request.agentId === agentId && request.idempotencyKeyHash === idempotencyKeyHash,
      ) ?? null,
    );
  }

  async getAgent(agentId: string): Promise<AgentRecord | null> {
    return clone(this.repository.agents.get(agentId) ?? null);
  }

  async getWallet(walletId: string): Promise<WalletRecord | null> {
    return clone(this.repository.wallets.get(walletId) ?? null);
  }

  async getActivePolicy(agentId: string, walletId: string): Promise<PolicyRecord | null> {
    return clone(
      [...this.repository.policies.values()].find(policy => policy.agentId === agentId && policy.walletId === walletId && policy.status === "ACTIVE") ?? null,
    );
  }

  async getAssetCatalogEntry(assetId: string): Promise<AssetCatalogEntry | null> {
    return clone(this.repository.assets.get(assetId) ?? null);
  }

  async expireUsageHolds(now: number): Promise<void> {
    for (const hold of this.repository.usageHolds.values()) {
      if (hold.status === "HELD" && hold.expiresAt <= now) {
        this.repository.usageHolds.set(hold.usageHoldId, { ...hold, status: "EXPIRED", expiredAt: now, updatedAt: now });
      }
    }
  }

  async getUsageSnapshot(input: { agentId: string; walletId: string; policyId: string | null; windowStart: number; windowEnd: number; now: number }): Promise<UsageSnapshot> {
    let committedAmount = 0n;
    let committedCount = 0n;
    let heldAmount = 0n;
    let heldCount = 0n;
    for (const hold of this.repository.usageHolds.values()) {
      if (hold.agentId !== input.agentId || hold.walletId !== input.walletId || hold.policyId !== input.policyId) continue;
      if (hold.status === "COMMITTED" && hold.heldAt >= input.windowStart && hold.heldAt < input.windowEnd) {
        committedAmount += BigInt(hold.amount);
        committedCount += BigInt(hold.actionCount);
      }
      if (hold.status === "HELD" && hold.expiresAt > input.now) {
        heldAmount += BigInt(hold.amount);
        heldCount += BigInt(hold.actionCount);
      }
    }
    return {
      periodAmountUsed: committedAmount.toString(),
      periodAmountHeld: heldAmount.toString(),
      periodActionCountUsed: committedCount.toString(),
      periodActionCountHeld: heldCount.toString(),
    };
  }

  async allocateNonce(walletId: string, now: number): Promise<bigint> {
    const nonce = this.repository.nextNonces.get(walletId) ?? 1n;
    this.repository.nextNonces.set(walletId, nonce + 1n);
    void now;
    return nonce;
  }

  async insertActionRequest(record: ActionRequestRecord): Promise<void> {
    this.failIf("action_request");
    if ([...this.repository.actionRequests.values()].some(existing => existing.agentId === record.agentId && existing.idempotencyKeyHash === record.idempotencyKeyHash)) {
      conflict("database_unique_constraint", "database unique constraint rejected the write");
    }
    if (record.aegisNonce !== null && [...this.repository.actionRequests.values()].some(existing => existing.walletId === record.walletId && existing.aegisNonce === record.aegisNonce)) {
      conflict("database_unique_constraint", "database unique constraint rejected the write");
    }
    this.repository.actionRequests.set(record.requestId, clone(record));
  }

  async insertPrecheckRecord(record: PrecheckRecordRecord): Promise<void> {
    this.failIf("precheck_record");
    if ([...this.repository.precheckRecords.values()].some(existing => existing.requestId === record.requestId)) {
      conflict("database_unique_constraint", "database unique constraint rejected the write");
    }
    this.repository.precheckRecords.set(record.precheckId, clone(record));
  }

  async insertUsageHold(record: UsageHoldRecord): Promise<void> {
    this.failIf("usage_hold");
    this.repository.usageHolds.set(record.usageHoldId, clone(record));
  }

  async insertAuditEvent(record: AuditEventRecord): Promise<void> {
    this.failIf("audit_event");
    this.repository.auditEvents.set(record.eventId, clone(record));
  }

  private failIf(point: NonNullable<InMemoryPrecheckRepository["failOn"]>): void {
    if (this.repository.failOn === point) {
      throw new PolicyEngineError(500, `forced_${point}_failure`, `forced ${point} failure`);
    }
  }
}

function buildPendingTeemlResponse(result: PassToTeeMlResult, requestId: string, precheckId: string, usageHoldId: string, usageHoldExpiresAt: number): PendingTeemlResponse {
  return {
    requestId,
    precheckId,
    status: "PENDING_TEEML",
    policyId: result.policyId,
    policyVersion: result.policyVersion,
    policyHash: result.policyHash,
    actionHash: result.actionHash,
    aegisNonce: result.aegisNonce,
    usageHoldId,
    usageHoldExpiresAt,
    evaluatedAt: result.evaluatedAt,
  };
}

function buildDenyPrecheckResponse(
  result: Exclude<ReturnType<typeof evaluateDeterministicPolicy>, PassToTeeMlResult>,
  requestId: string,
  precheckId: string,
  nonce: bigint | null,
): DenyPrecheckHttpResponse {
  return {
    requestId,
    precheckId,
    stage: "PRECHECK",
    status: DENY_PRECHECK,
    code: result.code,
    policyId: result.policyId,
    policyVersion: result.policyVersion,
    policyHash: result.policyHash,
    actionHash: requireActionHash(result.actionHash),
    aegisNonce: nonce?.toString() ?? null,
    evaluatedAt: result.evaluatedAt,
  };
}

function toEvaluatorAction(action: NormalizedPrecheckActionRequest): NormalizedAction {
  return {
    actionType: action.actionType,
    agentId: action.agentId,
    walletId: action.walletId,
    networkId: NETWORK_ID,
    destination: action.destination,
    assetId: action.assetId,
    amount: action.amount,
    deadline: action.actionDeadline,
  };
}

function buildPrivatePayload(action: NormalizedPrecheckActionRequest): Record<string, unknown> {
  return {
    schema: PRECHECK_REQUEST_SCHEMA,
    agentId: action.agentId,
    walletId: action.walletId,
    actionType: action.actionType,
    destination: action.destination,
    assetId: action.assetId,
    amount: action.amount,
    actionDeadline: action.actionDeadline,
    reason: action.reason,
    reasonHash: action.reasonHash,
  };
}

function normalizeIdempotencyKey(value: string | null): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 512) {
    badRequest("missing_idempotency_key", "Idempotency-Key header is required");
  }
  return value.trim();
}

function objectOf(input: unknown, path: string): Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    badRequest("invalid_object", `${path} must be an object`);
  }
  return input as Record<string, unknown>;
}

function rejectUnknownKeys(input: Record<string, unknown>, allowedKeys: string[], path: string): void {
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) badRequest("unknown_property", `${path}.${key} is not allowed`);
  }
}

function requiredString(input: unknown, path: string): string {
  if (typeof input !== "string" || input.trim().length === 0) {
    badRequest("invalid_string", `${path} must be a non-empty string`);
  }
  return input.trim();
}

function normalizeIdentifier(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeReason(input: unknown): string {
  const reason = requiredString(input, "body.reason");
  if (reason.length > 2_000) badRequest("invalid_reason", "body.reason must be at most 2000 characters");
  return reason;
}

function positiveBaseUnitAmount(input: unknown, path: string): string {
  if (typeof input !== "string" || !/^[1-9]\d*$/.test(input)) {
    badRequest("invalid_base_unit_amount", `${path} must be a positive integer base-unit string`);
  }
  return BigInt(input).toString();
}

function unixSeconds(input: unknown, path: string): number {
  if (!Number.isInteger(input) || (input as number) < 0) {
    badRequest("invalid_unix_seconds", `${path} must be a non-negative integer Unix timestamp in seconds`);
  }
  return input as number;
}

function normalizeDestination(input: unknown, path: string): DestinationIdentity {
  const destination = objectOf(input, path);
  const kind = destination.kind;
  if (kind === "EVM_ADDRESS") {
    rejectUnknownKeys(destination, ["kind", "value", "chainId"], path);
    const value = requiredString(destination.value, `${path}.value`);
    if (!/^0x[a-fA-F0-9]{40}$/.test(value)) badRequest("invalid_evm_address", `${path}.value must be a 20-byte EVM address`);
    return { kind, value: value.toLowerCase() as `0x${string}`, chainId: destinationChainId(destination.chainId, `${path}.chainId`) };
  }
  if (kind === "HEDERA_ACCOUNT_ID") {
    rejectUnknownKeys(destination, ["kind", "value", "chainId"], path);
    const value = requiredString(destination.value, `${path}.value`);
    if (!/^\d+\.\d+\.\d+$/.test(value)) badRequest("invalid_hedera_account_id", `${path}.value must use shard.realm.num format`);
    const chainId = destination.chainId === undefined ? undefined : destinationChainId(destination.chainId, `${path}.chainId`);
    return { kind, value, ...(chainId === undefined ? {} : { chainId }) };
  }
  if (kind === "URL_ORIGIN") {
    rejectUnknownKeys(destination, ["kind", "value"], path);
    try {
      const url = new URL(requiredString(destination.value, `${path}.value`));
      if (url.protocol !== "http:" && url.protocol !== "https:") badRequest("invalid_url_origin", `${path}.value must use http or https`);
      return { kind, value: url.origin.toLowerCase() };
    } catch (error) {
      if (error instanceof PolicyEngineError) throw error;
      badRequest("invalid_url_origin", `${path}.value must be a valid URL origin`);
    }
  }
  badRequest("unsupported_destination_kind", `${path}.kind must be EVM_ADDRESS, HEDERA_ACCOUNT_ID, or URL_ORIGIN`);
}

function destinationChainId(input: unknown, path: string): number {
  if (input === undefined) return HEDERA_TESTNET_CHAIN_ID;
  if (input !== HEDERA_TESTNET_CHAIN_ID) badRequest("unsupported_chain_id", `${path} must be ${HEDERA_TESTNET_CHAIN_ID} for ${NETWORK_ID}`);
  return HEDERA_TESTNET_CHAIN_ID;
}

function positiveConfigInteger(value: number, path: string): number {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${path} must be a positive integer`);
  return value;
}

function requireGeneratedId(value: string | null, name: string): string {
  if (!value) throw new Error(`${name} was not generated`);
  return value;
}

function requireActionHash(value: Hex32 | null): Hex32 {
  if (!value) throw new Error("actionHash was not generated");
  return value;
}

function clone<T>(value: T): T {
  return value === null ? value : structuredClone(value);
}

function cloneMap<T>(input: Map<string, T>): Map<string, T> {
  return new Map([...input.entries()].map(([key, value]) => [key, clone(value)]));
}

function replaceMap<T>(target: Map<string, T>, source: Map<string, T>): void {
  target.clear();
  for (const [key, value] of source.entries()) target.set(key, clone(value));
}
