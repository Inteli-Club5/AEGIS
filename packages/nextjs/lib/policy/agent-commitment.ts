// Mirrors services/agent-service/src/policy-engine/{types,auth}.ts's AgentCommitment.
// Proves the connected operator wallet actually controls the address it claims
// to own before create-agents, create-wallets, or delete-agent runs -- those
// three routes spend real Hedera funds (account creation, Safe deployment) or
// remove an agent's own records, and previously had no proof-of-possession at
// all. If this file's domain/types/field order drifts from the backend's,
// every signature silently fails with "invalid_operator_signature".
import { type Hex, zeroAddress } from "viem";

export const AGENT_COMMITMENT_SCHEMA = "aegis.agent.commitment.v1";
export const NETWORK_ID = "hedera:testnet";
export const HEDERA_TESTNET_CHAIN_ID = 296;

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

export type AgentCommitmentOperation = "CREATE_AGENT" | "CREATE_WALLET" | "DELETE_AGENT";

export type AgentCommitment = {
  schema: typeof AGENT_COMMITMENT_SCHEMA;
  operation: AgentCommitmentOperation;
  networkId: typeof NETWORK_ID;
  operatorAddress: `0x${string}`;
  agentId: string;
  ownerWallet: `0x${string}`;
  name: string;
  agentType: string;
  endpoint: string;
  description: string;
  recoveryGuardianAddress: `0x${string}`;
  issuedAt: bigint;
};

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

export type SignAgentCommitment = (params: {
  domain: typeof AGENT_COMMITMENT_DOMAIN;
  types: typeof AGENT_COMMITMENT_TYPES;
  primaryType: "AgentCommitment";
  message: AgentCommitment;
}) => Promise<Hex>;

export async function signAgentCommitment(
  commitment: AgentCommitment,
  sign: SignAgentCommitment,
): Promise<`0x${string}`> {
  return sign({
    domain: AGENT_COMMITMENT_DOMAIN,
    types: AGENT_COMMITMENT_TYPES,
    primaryType: "AgentCommitment",
    message: commitment,
  });
}
