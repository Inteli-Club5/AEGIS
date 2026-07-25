import { getAddress, hashTypedData, isAddress, verifyTypedData } from "viem";
import { forbidden, unauthorized } from "./errors.js";
import {
  HEDERA_TESTNET_CHAIN_ID,
  NETWORK_ID,
  OPERATOR_MESSAGE_SCHEMA,
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
