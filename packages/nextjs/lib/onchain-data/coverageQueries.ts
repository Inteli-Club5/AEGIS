import { createPageRequest } from "./pagination.ts";

const GRAPH_META_FIELDS = /* GraphQL */ `
  block {
    number
    hash
    timestamp
  }
  deployment
  hasIndexingErrors
`;

const SAFE_EXECUTION_FIELDS = /* GraphQL */ `
  id
  safe
  agentIdHash
  safeTxHash
  success
  refundPayment
  transactionHash
  blockNumber
  blockTimestamp
  logIndex
`;

const POLICY_REFERENCE_FIELDS = /* GraphQL */ `
  id
  policyHash
  validationCount
  allowCount
  denyCount
  firstReferencedAt
  lastReferencedAt
`;

export const SAFE_EXECUTIONS_QUERY = /* GraphQL */ `
  query SafeExecutions($first: Int!, $where: SafeExecution_filter!) {
    safeExecutions(first: $first, orderBy: id, orderDirection: asc, where: $where) {
      ${SAFE_EXECUTION_FIELDS}
    }
    _meta {
      ${GRAPH_META_FIELDS}
    }
  }
`;

export const SAFE_EXECUTION_BY_ID_QUERY = /* GraphQL */ `
  query SafeExecutionById($id: ID!) {
    safeExecution(id: $id) {
      ${SAFE_EXECUTION_FIELDS}
    }
    _meta {
      ${GRAPH_META_FIELDS}
    }
  }
`;

export const POLICY_REFERENCES_QUERY = /* GraphQL */ `
  query PolicyReferences($first: Int!, $where: PolicyReference_filter!) {
    policyReferences(first: $first, orderBy: id, orderDirection: asc, where: $where) {
      ${POLICY_REFERENCE_FIELDS}
    }
    _meta {
      ${GRAPH_META_FIELDS}
    }
  }
`;

export const POLICY_REFERENCE_BY_ID_QUERY = /* GraphQL */ `
  query PolicyReferenceById($id: ID!) {
    policyReference(id: $id) {
      ${POLICY_REFERENCE_FIELDS}
    }
    _meta {
      ${GRAPH_META_FIELDS}
    }
  }
`;

export type SafeExecutionFilters = {
  safe?: string;
  agentIdHash?: string;
  success?: boolean;
  safeTxHash?: string;
  transactionHash?: string;
  dateFrom?: number;
  dateTo?: number;
};

export type PolicyReferenceFilters = {
  policyHash?: string;
  dateFrom?: number;
  dateTo?: number;
};

export function buildSafeExecutionVariables(input: {
  limit?: number;
  cursor?: string | null;
  filters?: SafeExecutionFilters;
}) {
  const page = createPageRequest(input);
  const filters = input.filters ?? {};
  return {
    first: page.first + 1,
    where: compactObject({
      id_gt: page.afterId,
      safe: normalizeBytes(filters.safe, 20),
      agentIdHash: normalizeBytes(filters.agentIdHash, 32),
      success: filters.success,
      safeTxHash: normalizeBytes(filters.safeTxHash, 32),
      transactionHash: normalizeBytes(filters.transactionHash, 32),
      blockTimestamp_gte: normalizeTimestamp(filters.dateFrom),
      blockTimestamp_lte: normalizeTimestamp(filters.dateTo),
    }),
  };
}

export function buildPolicyReferenceVariables(input: {
  limit?: number;
  cursor?: string | null;
  filters?: PolicyReferenceFilters;
}) {
  const page = createPageRequest(input);
  const filters = input.filters ?? {};
  return {
    first: page.first + 1,
    where: compactObject({
      id_gt: page.afterId,
      policyHash: normalizeBytes(filters.policyHash, 32),
      lastReferencedAt_gte: normalizeTimestamp(filters.dateFrom),
      lastReferencedAt_lte: normalizeTimestamp(filters.dateTo),
    }),
  };
}

function normalizeTimestamp(value: number | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("Onchain date filters must be Unix seconds.");
  return String(value);
}

function normalizeBytes(value: string | undefined, byteLength: number): string | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  const normalized = value.trim().toLowerCase();
  if (!new RegExp(`^0x[0-9a-f]{${byteLength * 2}}$`).test(normalized)) {
    throw new Error(`Expected a ${byteLength}-byte 0x-prefixed value.`);
  }
  return normalized;
}

function compactObject<T extends Record<string, unknown>>(input: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined && value !== null),
  ) as Partial<T>;
}
