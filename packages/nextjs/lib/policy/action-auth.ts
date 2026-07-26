// Proves the connected operator wallet actually owns the agent it is asking this
// dashboard's server to act on behalf of. An agentId is not a secret -- it's
// visible in the URL and returned by the unauthenticated GET /agents/:agentId
// route -- so without this, the four agent-bearer routes (register-agentic-id,
// precheck, TeeML verify, execute) would let anyone who names an agent fetch its
// real bearer token and run a real payment from its Safe. Mirrors the existing
// PolicyCommitment EIP-712 pattern (services/agent-service/src/policy-engine/auth.ts)
// but is verified entirely in this Next.js server; services/agent-service never
// sees it and doesn't need to.
import { stableStringify } from "./hash";
import { type Hex, keccak256, recoverTypedDataAddress, stringToHex } from "viem";

export const AGENT_ACTION_AUTH_SCHEMA = "aegis.agent-action.v1";

export const AGENT_ACTION_AUTH_DOMAIN = {
  name: "AEGIS Agent Action",
  version: "1",
  chainId: 296,
} as const;

export const AGENT_ACTION_AUTH_TYPES = {
  AgentActionAuthorization: [
    { name: "schema", type: "string" },
    { name: "agentId", type: "string" },
    { name: "operatorAddress", type: "address" },
    { name: "action", type: "string" },
    { name: "contextHash", type: "bytes32" },
    { name: "issuedAt", type: "uint256" },
  ],
} as const;

export type AgentAction = "REGISTER_AGENTIC_ID" | "PRECHECK" | "TEEML_VERIFY" | "EXECUTE";

export type AgentActionAuthorizationMessage = {
  schema: typeof AGENT_ACTION_AUTH_SCHEMA;
  agentId: string;
  operatorAddress: `0x${string}`;
  action: AgentAction;
  contextHash: `0x${string}`;
  issuedAt: bigint;
};

export function buildAgentActionAuthorization(input: {
  agentId: string;
  operatorAddress: `0x${string}`;
  action: AgentAction;
  contextHash: `0x${string}`;
  issuedAt: number;
}): AgentActionAuthorizationMessage {
  return {
    schema: AGENT_ACTION_AUTH_SCHEMA,
    agentId: input.agentId.trim().toLowerCase(),
    operatorAddress: input.operatorAddress.toLowerCase() as `0x${string}`,
    action: input.action,
    contextHash: input.contextHash,
    issuedAt: BigInt(input.issuedAt),
  };
}

// Binds the signature to the exact call being made, so a captured signature
// can't be replayed against a different destination/amount/service within its
// freshness window. `{}` for actions with no meaningful body (register-agentic-id).
export function hashActionContext(payload: unknown): `0x${string}` {
  return keccak256(stringToHex(stableStringify(payload ?? {})));
}

export async function recoverAgentActionSigner(
  message: AgentActionAuthorizationMessage,
  signature: Hex,
): Promise<`0x${string}`> {
  const recovered = await recoverTypedDataAddress({
    domain: AGENT_ACTION_AUTH_DOMAIN,
    types: AGENT_ACTION_AUTH_TYPES,
    primaryType: "AgentActionAuthorization",
    message,
    signature,
  });
  return recovered as `0x${string}`;
}

const AGENT_ACTION_AUTH_MAX_AGE_SECONDS = 300;
const AGENT_ACTION_AUTH_MAX_FUTURE_SKEW_SECONDS = 30;
const EVM_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const HEX_SIGNATURE_RE = /^0x[a-fA-F0-9]+$/;

export type VerifiedAgentActionSigner = { ok: true; operatorAddress: `0x${string}` };
export type AgentActionAuthFailure = {
  ok: false;
  code: "missing_operator_authorization" | "invalid_operator_authorization" | "operator_authorization_expired";
};

// Pure, transport-agnostic signature/freshness check -- does not know about the
// agent's actual owner (that requires an agent-service lookup only the
// server-only wrapper in lib/server/agentService.ts can make).
export async function verifySignedAgentAction(
  headers: { operatorAddress: string | null; signature: string | null; issuedAt: string | null },
  input: { agentId: string; action: AgentAction; contextHash: `0x${string}` },
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<VerifiedAgentActionSigner | AgentActionAuthFailure> {
  const { operatorAddress, signature, issuedAt: issuedAtHeader } = headers;
  if (!operatorAddress || !signature || !issuedAtHeader) {
    return { ok: false, code: "missing_operator_authorization" };
  }
  if (!EVM_ADDRESS_RE.test(operatorAddress) || !HEX_SIGNATURE_RE.test(signature)) {
    return { ok: false, code: "invalid_operator_authorization" };
  }
  const issuedAt = Number(issuedAtHeader);
  if (!Number.isSafeInteger(issuedAt) || issuedAt <= 0) {
    return { ok: false, code: "invalid_operator_authorization" };
  }
  if (
    issuedAt > nowSeconds + AGENT_ACTION_AUTH_MAX_FUTURE_SKEW_SECONDS ||
    nowSeconds - issuedAt > AGENT_ACTION_AUTH_MAX_AGE_SECONDS
  ) {
    return { ok: false, code: "operator_authorization_expired" };
  }

  const message = buildAgentActionAuthorization({
    agentId: input.agentId,
    operatorAddress: operatorAddress as `0x${string}`,
    action: input.action,
    contextHash: input.contextHash,
    issuedAt,
  });
  let recovered: `0x${string}`;
  try {
    recovered = await recoverAgentActionSigner(message, signature as `0x${string}`);
  } catch {
    return { ok: false, code: "invalid_operator_authorization" };
  }
  if (recovered.toLowerCase() !== operatorAddress.toLowerCase()) {
    return { ok: false, code: "invalid_operator_authorization" };
  }

  return { ok: true, operatorAddress: operatorAddress as `0x${string}` };
}
