import { getAddress, hashTypedData, isAddress, verifyTypedData, zeroAddress } from "viem";
import { forbidden, unauthorized } from "./errors.js";
import {
  AGENT_COMMITMENT_SCHEMA,
  HEDERA_TESTNET_CHAIN_ID,
  NETWORK_ID,
  OPERATOR_MESSAGE_SCHEMA,
  type AgentCommitment,
  type AgentCommitmentAuth,
  type AgentCommitmentOperation,
  type Hex32,
  type OperatorAuth,
  type OperatorProof,
  type PolicyCommitment,
  type PolicyOperation,
} from "./types.js";

export const POLICY_COMMITMENT_DOMAIN = {
  name: "AEGIS Policy Engine",
  version: "1",
  chainId: HEDERA_TESTNET_CHAIN_ID,
} as const;

export const POLICY_COMMITMENT_TYPES = {
  PolicyCommitment: [
    { name: "schema", type: "string" },
    { name: "operation", type: "string" },
    { name: "networkId", type: "string" },
    { name: "operatorAddress", type: "address" },
    { name: "agentId", type: "string" },
    { name: "walletId", type: "string" },
    { name: "policyId", type: "string" },
    { name: "sourcePolicyId", type: "string" },
    { name: "policyVersion", type: "uint256" },
    { name: "policyHash", type: "bytes32" },
    { name: "validFrom", type: "uint256" },
    { name: "validUntil", type: "uint256" },
    { name: "hasValidUntil", type: "bool" },
  ],
} as const;

export function buildPolicyCommitment(input: {
  operation: PolicyOperation;
  operatorAddress: `0x${string}`;
  agentId: string;
  walletId: string;
  policyId: string;
  sourcePolicyId?: string;
  policyVersion: number;
  policyHash: Hex32;
  validFrom: number;
  validUntil: number | null;
}): PolicyCommitment {
  return {
    schema: OPERATOR_MESSAGE_SCHEMA,
    operation: input.operation,
    networkId: NETWORK_ID,
    operatorAddress: input.operatorAddress,
    agentId: input.agentId.toLowerCase(),
    walletId: input.walletId.toLowerCase(),
    policyId: input.policyId.toLowerCase(),
    sourcePolicyId: input.sourcePolicyId?.toLowerCase() ?? "",
    policyVersion: BigInt(input.policyVersion),
    policyHash: input.policyHash,
    validFrom: BigInt(input.validFrom),
    validUntil: BigInt(input.validUntil ?? 0),
    hasValidUntil: input.validUntil !== null,
  };
}

export async function verifyOperatorProof(input: {
  commitment: PolicyCommitment;
  auth: OperatorAuth;
  ownerAddress: `0x${string}`;
}): Promise<OperatorProof> {
  const operatorAddress = normalizeOperatorAddress(input.auth.operatorAddress, "operatorAddress");
  const ownerAddress = normalizeOperatorAddress(input.ownerAddress, "ownerAddress");
  const signature = normalizeSignature(input.auth.signature);
  const commitment = { ...input.commitment, operatorAddress };

  const isValid = await verifyTypedData({
    address: operatorAddress,
    domain: POLICY_COMMITMENT_DOMAIN,
    types: POLICY_COMMITMENT_TYPES,
    primaryType: "PolicyCommitment",
    message: commitment,
    signature,
  });

  if (!isValid) {
    unauthorized("invalid_operator_signature", "operator signature does not match the operation payload");
  }

  if (operatorAddress !== ownerAddress) {
    forbidden("operator_not_owner", "operator is not the owner of this agent");
  }

  return {
    operatorAddress,
    operatorSignature: signature,
    operatorMessage: serializePolicyCommitment(commitment),
    operatorCommitment: hashTypedData({
      domain: POLICY_COMMITMENT_DOMAIN,
      types: POLICY_COMMITMENT_TYPES,
      primaryType: "PolicyCommitment",
      message: commitment,
    }) as Hex32,
  };
}

export function extractOperatorAuth(headers: Record<string, unknown>): OperatorAuth {
  const operatorAddress = firstHeader(headers["x-aegis-operator-address"]);
  const signature = firstHeader(headers["x-aegis-operator-signature"]);
  if (!operatorAddress || !signature) {
    unauthorized("missing_operator_signature", "x-aegis-operator-address and x-aegis-operator-signature headers are required");
  }
  return { operatorAddress, signature };
}

export const AGENT_COMMITMENT_DOMAIN = {
  name: "AEGIS Agent Lifecycle",
  version: "1",
  chainId: HEDERA_TESTNET_CHAIN_ID,
} as const;

export const AGENT_COMMITMENT_TYPES = {
  AgentCommitment: [
    { name: "schema", type: "string" },
    { name: "operation", type: "string" },
    { name: "networkId", type: "string" },
    { name: "operatorAddress", type: "address" },
    { name: "agentId", type: "string" },
    { name: "ownerWallet", type: "address" },
    { name: "name", type: "string" },
    { name: "agentType", type: "string" },
    { name: "endpoint", type: "string" },
    { name: "description", type: "string" },
    { name: "recoveryGuardianAddress", type: "address" },
    { name: "issuedAt", type: "uint256" },
  ],
} as const;

export const AGENT_COMMITMENT_MAX_AGE_SECONDS = 300;
export const AGENT_COMMITMENT_MAX_FUTURE_SKEW_SECONDS = 30;

export function buildAgentCommitment(input: {
  operation: AgentCommitmentOperation;
  operatorAddress: `0x${string}`;
  issuedAt: string;
  agentId?: string;
  ownerWallet?: `0x${string}`;
  name?: string;
  agentType?: string;
  endpoint?: string;
  description?: string;
  recoveryGuardianAddress?: `0x${string}`;
}): AgentCommitment {
  return {
    schema: AGENT_COMMITMENT_SCHEMA,
    operation: input.operation,
    networkId: NETWORK_ID,
    operatorAddress: input.operatorAddress,
    agentId: (input.agentId ?? "").toLowerCase(),
    ownerWallet: (input.ownerWallet ?? zeroAddress).toLowerCase() as `0x${string}`,
    name: input.name ?? "",
    agentType: input.agentType ?? "",
    endpoint: input.endpoint ?? "",
    description: input.description ?? "",
    recoveryGuardianAddress: (input.recoveryGuardianAddress ?? zeroAddress).toLowerCase() as `0x${string}`,
    issuedAt: BigInt(input.issuedAt),
  };
}

// Verifies the signature, its freshness (replaying a captured signature could
// otherwise let an attacker re-trigger a real Hedera account creation
// indefinitely), and that the signer is the claimed/existing owner. Returns
// only the recovered address -- unlike verifyOperatorProof, nothing here
// persists the proof for later audit.
export async function verifyAgentCommitmentProof(input: {
  commitment: AgentCommitment;
  auth: AgentCommitmentAuth;
  ownerAddress: `0x${string}`;
  now?: number;
}): Promise<{ operatorAddress: `0x${string}` }> {
  const operatorAddress = normalizeOperatorAddress(input.auth.operatorAddress, "operatorAddress");
  const ownerAddress = normalizeOperatorAddress(input.ownerAddress, "ownerAddress");
  const signature = normalizeSignature(input.auth.signature);
  const commitment = { ...input.commitment, operatorAddress };

  const isValid = await verifyTypedData({
    address: operatorAddress,
    domain: AGENT_COMMITMENT_DOMAIN,
    types: AGENT_COMMITMENT_TYPES,
    primaryType: "AgentCommitment",
    message: commitment,
    signature,
  });
  if (!isValid) {
    unauthorized("invalid_operator_signature", "operator signature does not match the operation payload");
  }

  const now = input.now ?? Math.floor(Date.now() / 1000);
  const issuedAt = Number(commitment.issuedAt);
  if (
    issuedAt > now + AGENT_COMMITMENT_MAX_FUTURE_SKEW_SECONDS ||
    now - issuedAt > AGENT_COMMITMENT_MAX_AGE_SECONDS
  ) {
    unauthorized("operator_authorization_expired", "operator signature has expired; sign a fresh request");
  }

  if (operatorAddress !== ownerAddress) {
    forbidden("operator_not_owner", "operator is not the owner of this agent");
  }

  return { operatorAddress };
}

export function extractAgentCommitmentAuth(headers: Record<string, unknown>): AgentCommitmentAuth {
  const operatorAddress = firstHeader(headers["x-aegis-operator-address"]);
  const signature = firstHeader(headers["x-aegis-operator-signature"]);
  const issuedAt = firstHeader(headers["x-aegis-operator-issued-at"]);
  if (!operatorAddress || !signature || !issuedAt) {
    unauthorized(
      "missing_operator_signature",
      "x-aegis-operator-address, x-aegis-operator-signature, and x-aegis-operator-issued-at headers are required",
    );
  }
  if (!/^[0-9]+$/.test(issuedAt)) {
    unauthorized("invalid_operator_signature", "x-aegis-operator-issued-at must be a positive integer of unix seconds");
  }
  return { operatorAddress, signature, issuedAt };
}

function firstHeader(value: unknown): string | undefined {
  if (Array.isArray(value)) return typeof value[0] === "string" ? value[0] : undefined;
  return typeof value === "string" ? value : undefined;
}

function normalizeOperatorAddress(value: string, path: string): `0x${string}` {
  if (!isAddress(value)) {
    unauthorized("invalid_operator_address", `${path} must be a valid EVM address`);
  }
  return getAddress(value).toLowerCase() as `0x${string}`;
}

function normalizeSignature(value: string): `0x${string}` {
  if (!/^0x[a-fA-F0-9]+$/.test(value)) {
    unauthorized("invalid_operator_signature", "operator signature must be 0x-prefixed hex");
  }
  return value as `0x${string}`;
}

function serializePolicyCommitment(commitment: PolicyCommitment): string {
  return JSON.stringify({
    domain: POLICY_COMMITMENT_DOMAIN,
    primaryType: "PolicyCommitment",
    message: {
      ...commitment,
      policyVersion: commitment.policyVersion.toString(),
      validFrom: commitment.validFrom.toString(),
      validUntil: commitment.validUntil.toString(),
    },
  });
}
