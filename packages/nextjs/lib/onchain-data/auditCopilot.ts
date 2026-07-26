import { buildIndexerFreshness } from "./freshness.ts";
import {
  AUDIT_ZERO_G_AUTHORIZATIONS_QUERY,
  AUDIT_ZERO_G_DELEGATIONS_QUERY,
  AUDIT_ZERO_G_IDENTITIES_QUERY,
  AUDIT_ZERO_G_OWNER_CHANGES_QUERY,
  AUDIT_ZERO_G_REGISTRY_SUMMARY_QUERY,
} from "./queries.ts";
import type { GraphClient } from "./serverClients.ts";
import type {
  AgenticIdentity,
  AgenticIdentityOwnerChange,
  GraphMeta,
  IndexerFreshness,
  ZeroGProtocolSummary,
} from "./types.ts";

export const AUDIT_COPILOT_INTENTS = [
  "AGENTIC_ID_REGISTRY_SUMMARY",
  "RECENT_AGENTIC_IDS",
  "AGENTIC_ID_OWNER_ACTIVITY",
  "RECENT_OWNERSHIP_CHANGES",
  "RECENT_USAGE_AUTHORIZATIONS",
  "RECENT_DELEGATIONS",
] as const;

export type AuditCopilotIntent = (typeof AUDIT_COPILOT_INTENTS)[number];

export const AUDIT_COPILOT_PRESET_QUESTIONS: Record<AuditCopilotIntent, string> = {
  AGENTIC_ID_REGISTRY_SUMMARY: "Summarize the indexed 0G Agentic ID registry.",
  RECENT_AGENTIC_IDS: "Show the most recent indexed Agentic IDs.",
  AGENTIC_ID_OWNER_ACTIVITY: "Group the most recently updated active Agentic IDs by owner within a bounded sample.",
  RECENT_OWNERSHIP_CHANGES: "Show the most recent indexed Agentic ID ownership changes.",
  RECENT_USAGE_AUTHORIZATIONS: "Show the most recent indexed Agentic ID usage authorizations.",
  RECENT_DELEGATIONS: "Show the most recent indexed Agentic ID delegations.",
};

type AuditCopilotCitationBase = {
  sourceSubgraph: "aegis-0g";
  sourceChain: "0g-galileo";
  entityId: string;
  blockNumber: string;
};

export type AuditCopilotTransactionCitation = AuditCopilotCitationBase & {
  provenance: "EVENT_TRANSACTION";
  entityType:
    | "AgenticIdentity"
    | "AgenticIdentityOwnerChange"
    | "AgenticIdentityAuthorization"
    | "AgenticIdentityDelegation";
  transactionHash: `0x${string}`;
};

export type AuditCopilotSnapshotCitation = AuditCopilotCitationBase & {
  provenance: "INDEXED_ENTITY_SNAPSHOT";
  entityType: "ZeroGProtocolSummary";
  transactionHash: null;
};

export type AuditCopilotCitation = AuditCopilotTransactionCitation | AuditCopilotSnapshotCitation;

export type AuditCopilotFinding = {
  statement: string;
  citations: AuditCopilotCitation[];
};

export type AuditCopilotResponse = {
  intent: AuditCopilotIntent;
  question: string;
  answer: string;
  findings: AuditCopilotFinding[];
  citations: AuditCopilotCitation[];
  freshness: IndexerFreshness;
  warnings: string[];
};

export type AuditCopilotRequest = {
  question: string;
  intent: AuditCopilotIntent;
  limit: number;
};

type RawMeta = {
  block?: { number?: number | string | null; hash?: string | null; timestamp?: number | string | null } | null;
  deployment?: string | null;
  hasIndexingErrors?: boolean | null;
};

type RawAgenticIdentity = Omit<AgenticIdentity, "sourceChain">;
type RawOwnerChange = Omit<AgenticIdentityOwnerChange, "sourceChain">;
type RawAuthorization = {
  id: string;
  tokenId: string;
  user: `0x${string}`;
  action: "AUTHORIZE" | "REVOKE";
  authorized: boolean;
  transactionHash: `0x${string}`;
  blockNumber: string;
};
type RawDelegation = {
  id: string;
  owner: `0x${string}`;
  assistant: `0x${string}`;
  action: "SET" | "REVOKE";
  active: boolean;
  transactionHash: `0x${string}`;
  blockNumber: string;
};

const MAX_RESULTS = 20;
const MAX_QUESTION_LENGTH = 240;
export const AUDIT_COPILOT_MAX_REQUEST_BYTES = 4_096;

export async function readAuditCopilotRequestBody(
  request: Request,
  maxBytes = AUDIT_COPILOT_MAX_REQUEST_BYTES,
): Promise<unknown> {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null && /^\d+$/.test(declaredLength) && Number(declaredLength) > maxBytes) {
    throw new AuditCopilotRequestTooLargeError(maxBytes);
  }
  if (!request.body) {
    throw new AuditCopilotInputError("Audit Copilot request body must be valid JSON.");
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel("Audit Copilot request body exceeded its byte limit.");
        throw new AuditCopilotRequestTooLargeError(maxBytes);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  } catch {
    throw new AuditCopilotInputError("Audit Copilot request body must be valid JSON.");
  }
}

export function parseAuditCopilotRequest(value: unknown): AuditCopilotRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AuditCopilotInputError("Audit Copilot input must be a JSON object.");
  }
  const record = value as Record<string, unknown>;
  const unknownKeys = Object.keys(record).filter(key => !["question", "intent", "limit"].includes(key));
  if (unknownKeys.length > 0) {
    throw new AuditCopilotInputError(`Unsupported Audit Copilot fields: ${unknownKeys.sort().join(", ")}.`);
  }

  if (typeof record.question !== "string") {
    throw new AuditCopilotInputError("question is required.");
  }
  const question = record.question.trim();
  if (question.length < 1 || question.length > MAX_QUESTION_LENGTH) {
    throw new AuditCopilotInputError(`question must contain 1 through ${MAX_QUESTION_LENGTH} characters.`);
  }

  const intent = record.intent === undefined ? classifyAuditCopilotQuestion(question) : parseIntent(record.intent);
  const limit = record.limit === undefined ? 10 : record.limit;
  if (!Number.isSafeInteger(limit) || Number(limit) < 1 || Number(limit) > MAX_RESULTS) {
    throw new AuditCopilotInputError(`limit must be an integer from 1 through ${MAX_RESULTS}.`);
  }

  return { question, intent, limit: Number(limit) };
}

export function classifyAuditCopilotQuestion(question: string): AuditCopilotIntent {
  const normalized = question
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (/authori[sz]ations?|usage access|autorizacoes?|permissoes? de uso/.test(normalized)) {
    return "RECENT_USAGE_AUTHORIZATIONS";
  }
  if (/delegations?|delegacoes?|delegados?|assistants?/.test(normalized)) {
    return "RECENT_DELEGATIONS";
  }
  if (
    /ownership changes?|owner changes?|transferencias?|mudancas? (?:de )?(?:owner|propriedade|titularidade)/.test(
      normalized,
    )
  ) {
    return "RECENT_OWNERSHIP_CHANGES";
  }
  if (/owners?|proprietarios?|titulares?|holders?|custodia/.test(normalized)) {
    return "AGENTIC_ID_OWNER_ACTIVITY";
  }
  if (/recent|latest|mais recentes|ultimos?/.test(normalized)) {
    return "RECENT_AGENTIC_IDS";
  }
  if (/summar|resum|registry|registro|quantos|overview|visao geral/.test(normalized)) {
    return "AGENTIC_ID_REGISTRY_SUMMARY";
  }
  throw new AuditCopilotInputError(
    "Question is outside the allowlisted Audit Copilot intents. Use registry summary, recent identities, owner activity, ownership changes, usage authorizations, or delegations.",
  );
}

export async function runAuditCopilot(input: {
  client: GraphClient;
  request: AuditCopilotRequest;
  nowSeconds?: number;
}): Promise<AuditCopilotResponse> {
  switch (input.request.intent) {
    case "AGENTIC_ID_REGISTRY_SUMMARY":
      return summarizeRegistry(input);
    case "RECENT_AGENTIC_IDS":
      return listRecentIdentities(input);
    case "AGENTIC_ID_OWNER_ACTIVITY":
      return summarizeOwners(input);
    case "RECENT_OWNERSHIP_CHANGES":
      return listRecentOwnerChanges(input);
    case "RECENT_USAGE_AUTHORIZATIONS":
      return listRecentAuthorizations(input);
    case "RECENT_DELEGATIONS":
      return listRecentDelegations(input);
  }
}

async function summarizeRegistry(input: RunInput): Promise<AuditCopilotResponse> {
  const data = await input.client.query<{
    zeroGProtocolSummary: ZeroGProtocolSummary | null;
    agenticIdentities: RawAgenticIdentity[];
    _meta?: RawMeta | null;
  }>(AUDIT_ZERO_G_REGISTRY_SUMMARY_QUERY, { first: input.request.limit });
  const summary = data.zeroGProtocolSummary;
  if (!summary) throw new AuditCopilotEvidenceError("The 0G Subgraph has no protocol summary entity yet.");
  const identityEvidence = data.agenticIdentities?.[0];
  if (!identityEvidence) {
    throw new AuditCopilotEvidenceError("The 0G Subgraph returned no transaction-backed registry evidence.");
  }

  const statement =
    `At the cited indexed block, the 0G protocol summary entity reports ${summary.distinctIdentityCount} identities, ` +
    `${summary.currentIdentityCount} currently active identities, ${summary.mintEventCount} mints, ` +
    `${summary.transferEventCount} transfers, and ${summary.burnEventCount} burns.`;
  return response(input, data._meta, statement, [
    { statement, citations: [protocolSummaryCitation(summary, data._meta)] },
    {
      statement:
        `Separately, Agentic ID ${identityEvidence.tokenId} provides transaction-backed indexed registry activity. ` +
        `This event citation does not prove the protocol-summary totals.`,
      citations: [identityCitation(identityEvidence)],
    },
  ]);
}

async function listRecentIdentities(input: RunInput): Promise<AuditCopilotResponse> {
  const data = await queryIdentities(input);
  const identities = requireIdentities(data.agenticIdentities);
  const findings = identities.map(identity => ({
    statement: `Agentic ID ${identity.tokenId} is ${identity.status} and its indexed owner is ${identity.owner}.`,
    citations: [identityCitation(identity)],
  }));
  const answer = `The 0G Subgraph returned ${identities.length} recent Agentic ID registry record(s).`;
  return response(input, data._meta, answer, findings);
}

async function summarizeOwners(input: RunInput): Promise<AuditCopilotResponse> {
  const data = await queryIdentities(input);
  const identities = requireIdentities(data.agenticIdentities);
  const activeIdentities = identities.filter(item => item.status === "ACTIVE");
  const byOwner = new Map<string, RawAgenticIdentity[]>();
  for (const identity of activeIdentities) {
    const key = identity.owner.toLowerCase();
    byOwner.set(key, [...(byOwner.get(key) ?? []), identity]);
  }
  const owners = [...byOwner.entries()].sort(
    ([leftOwner, left], [rightOwner, right]) => right.length - left.length || leftOwner.localeCompare(rightOwner),
  );
  if (owners.length === 0) {
    throw new AuditCopilotEvidenceError("The bounded 0G result contains no active Agentic ID owner evidence.");
  }
  const findings = owners.map(([owner, owned]) => ({
    statement:
      `Within the bounded most-recently updated active-identity sample, ${owner} accounts for ` +
      `${owned.length} active Agentic ID(s).`,
    citations: owned.map(identityCitation),
  }));
  const answer =
    `This is a bounded owner distribution over ${activeIdentities.length} cited active Agentic Identity ` +
    `entities from a query limited to ${input.request.limit}, not a registry-wide owner ranking.`;
  return response(input, data._meta, answer, findings);
}

async function listRecentOwnerChanges(input: RunInput): Promise<AuditCopilotResponse> {
  const data = await input.client.query<{
    agenticIdentityOwnerChanges: RawOwnerChange[];
    _meta?: RawMeta | null;
  }>(AUDIT_ZERO_G_OWNER_CHANGES_QUERY, { first: input.request.limit });
  const changes = data.agenticIdentityOwnerChanges ?? [];
  if (changes.length === 0) {
    throw new AuditCopilotEvidenceError("The 0G Subgraph returned no ownership-change evidence.");
  }
  const findings = changes.map(change => ({
    statement:
      `${change.changeType} for Agentic ID ${change.tokenId}: ` + `${change.previousOwner} -> ${change.newOwner}.`,
    citations: [ownerChangeCitation(change)],
  }));
  const answer = `The 0G Subgraph returned ${changes.length} recent ownership-change event(s).`;
  return response(input, data._meta, answer, findings);
}

async function listRecentAuthorizations(input: RunInput): Promise<AuditCopilotResponse> {
  const data = await input.client.query<{
    agenticIdentityAuthorizations: RawAuthorization[];
    _meta?: RawMeta | null;
  }>(AUDIT_ZERO_G_AUTHORIZATIONS_QUERY, { first: input.request.limit });
  const authorizations = data.agenticIdentityAuthorizations ?? [];
  if (authorizations.length === 0) {
    throw new AuditCopilotEvidenceError("The 0G Subgraph returned no usage-authorization evidence.");
  }
  const findings = authorizations.map(authorization => ({
    statement:
      `${authorization.action} usage access for Agentic ID ${authorization.tokenId} and user ` +
      `${authorization.user}.`,
    citations: [authorizationCitation(authorization)],
  }));
  const answer = `The 0G Subgraph returned ${authorizations.length} recent usage-authorization event(s).`;
  return response(input, data._meta, answer, findings);
}

async function listRecentDelegations(input: RunInput): Promise<AuditCopilotResponse> {
  const data = await input.client.query<{
    agenticIdentityDelegations: RawDelegation[];
    _meta?: RawMeta | null;
  }>(AUDIT_ZERO_G_DELEGATIONS_QUERY, { first: input.request.limit });
  const delegations = data.agenticIdentityDelegations ?? [];
  if (delegations.length === 0) {
    throw new AuditCopilotEvidenceError("The 0G Subgraph returned no delegation evidence.");
  }
  const findings = delegations.map(delegation => ({
    statement:
      `${delegation.action} delegated access from owner ${delegation.owner} to assistant ` + `${delegation.assistant}.`,
    citations: [delegationCitation(delegation)],
  }));
  const answer = `The 0G Subgraph returned ${delegations.length} recent delegation event(s).`;
  return response(input, data._meta, answer, findings);
}

type RunInput = {
  client: GraphClient;
  request: AuditCopilotRequest;
  nowSeconds?: number;
};

async function queryIdentities(input: RunInput) {
  return input.client.query<{
    agenticIdentities: RawAgenticIdentity[];
    _meta?: RawMeta | null;
  }>(AUDIT_ZERO_G_IDENTITIES_QUERY, { first: input.request.limit });
}

function response(
  input: RunInput,
  rawMeta: RawMeta | null | undefined,
  answer: string,
  findings: AuditCopilotFinding[],
): AuditCopilotResponse {
  const citations = uniqueCitations(findings.flatMap(finding => finding.citations));
  if (!citations.some(citation => citation.provenance === "EVENT_TRANSACTION")) {
    throw new AuditCopilotEvidenceError("Audit Copilot refuses to answer without indexed transaction evidence.");
  }
  const freshness = buildIndexerFreshness({
    source: "0g-galileo",
    meta: normalizeMeta(rawMeta),
    nowSeconds: input.nowSeconds,
  });
  if (freshness.hasIndexingErrors === true) {
    throw new AuditCopilotEvidenceError(
      "Audit Copilot refuses to answer because the 0G Subgraph reports indexing errors.",
    );
  }
  if (freshness.stale) {
    throw new AuditCopilotEvidenceError(
      "Audit Copilot refuses to answer because the 0G Subgraph freshness evidence is stale or incomplete.",
    );
  }
  return {
    intent: input.request.intent,
    question: input.request.question,
    answer,
    findings,
    citations,
    freshness,
    warnings: [
      "Do not label an indexed token as AEGIS-linked unless canonical public join keys establish that relationship.",
    ],
  };
}

function requireIdentities(value: RawAgenticIdentity[] | null | undefined): RawAgenticIdentity[] {
  const identities = value ?? [];
  if (identities.length === 0) {
    throw new AuditCopilotEvidenceError("The 0G Subgraph returned no Agentic Identity transaction evidence.");
  }
  return identities;
}

function protocolSummaryCitation(
  summary: ZeroGProtocolSummary,
  rawMeta: RawMeta | null | undefined,
): AuditCopilotSnapshotCitation {
  const meta = normalizeMeta(rawMeta);
  if (!meta) {
    throw new AuditCopilotEvidenceError("The 0G protocol summary has no indexed-block provenance.");
  }
  return {
    provenance: "INDEXED_ENTITY_SNAPSHOT",
    sourceSubgraph: "aegis-0g",
    sourceChain: "0g-galileo",
    entityType: "ZeroGProtocolSummary",
    entityId: summary.id,
    transactionHash: null,
    blockNumber: String(meta.block.number),
  };
}

function identityCitation(identity: RawAgenticIdentity): AuditCopilotTransactionCitation {
  return {
    provenance: "EVENT_TRANSACTION",
    sourceSubgraph: "aegis-0g",
    sourceChain: "0g-galileo",
    entityType: "AgenticIdentity",
    entityId: identity.id,
    transactionHash: identity.transactionHash,
    blockNumber: identity.blockNumber,
  };
}

function ownerChangeCitation(change: RawOwnerChange): AuditCopilotTransactionCitation {
  return {
    provenance: "EVENT_TRANSACTION",
    sourceSubgraph: "aegis-0g",
    sourceChain: "0g-galileo",
    entityType: "AgenticIdentityOwnerChange",
    entityId: change.id,
    transactionHash: change.transactionHash,
    blockNumber: change.blockNumber,
  };
}

function authorizationCitation(authorization: RawAuthorization): AuditCopilotTransactionCitation {
  return {
    provenance: "EVENT_TRANSACTION",
    sourceSubgraph: "aegis-0g",
    sourceChain: "0g-galileo",
    entityType: "AgenticIdentityAuthorization",
    entityId: authorization.id,
    transactionHash: authorization.transactionHash,
    blockNumber: authorization.blockNumber,
  };
}

function delegationCitation(delegation: RawDelegation): AuditCopilotTransactionCitation {
  return {
    provenance: "EVENT_TRANSACTION",
    sourceSubgraph: "aegis-0g",
    sourceChain: "0g-galileo",
    entityType: "AgenticIdentityDelegation",
    entityId: delegation.id,
    transactionHash: delegation.transactionHash,
    blockNumber: delegation.blockNumber,
  };
}

function uniqueCitations(citations: AuditCopilotCitation[]): AuditCopilotCitation[] {
  return [...new Map(citations.map(citation => [`${citation.entityType}:${citation.entityId}`, citation])).values()];
}

function normalizeMeta(meta: RawMeta | null | undefined): GraphMeta | null {
  if (
    meta?.block?.number === null ||
    meta?.block?.number === undefined ||
    meta.block.timestamp === null ||
    meta.block.timestamp === undefined ||
    typeof meta.hasIndexingErrors !== "boolean"
  ) {
    return null;
  }
  const blockNumber = Number(meta.block.number);
  const blockTimestamp = Number(meta.block.timestamp);
  if (!Number.isFinite(blockNumber) || !Number.isFinite(blockTimestamp)) return null;
  return {
    block: {
      number: blockNumber,
      hash: meta.block.hash ?? null,
      timestamp: blockTimestamp,
    },
    deployment: meta.deployment ?? null,
    hasIndexingErrors: meta.hasIndexingErrors,
  };
}

function parseIntent(value: unknown): AuditCopilotIntent {
  if (typeof value !== "string" || !AUDIT_COPILOT_INTENTS.includes(value as AuditCopilotIntent)) {
    throw new AuditCopilotInputError(`intent must be one of: ${AUDIT_COPILOT_INTENTS.join(", ")}.`);
  }
  return value as AuditCopilotIntent;
}

export class AuditCopilotInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuditCopilotInputError";
  }
}

export class AuditCopilotEvidenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuditCopilotEvidenceError";
  }
}

export class AuditCopilotRequestTooLargeError extends Error {
  readonly maxBytes: number;

  constructor(maxBytes: number) {
    super(`Request body must not exceed ${maxBytes} bytes.`);
    this.name = "AuditCopilotRequestTooLargeError";
    this.maxBytes = maxBytes;
  }
}

// TODO(TG-AUDIT-COPILOT-001): Enable the remaining Hedera-backed read-only Audit Copilot intents after the registry and required execution entities are live. Every answer must use constrained GraphQL tools and cite indexed entity IDs, transaction hashes, blocks, and source Subgraphs. Never use RPC, private AEGIS data, or fixture responses. Remove this TODO after the live Hedera intent, citation, limit, and invalid-question acceptance tests pass.
