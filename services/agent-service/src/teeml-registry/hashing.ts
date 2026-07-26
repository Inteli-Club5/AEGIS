import { keccak256, stringToHex } from "viem";
import type { Hex32 } from "../policy-engine/types.js";

export function hashCanonicalAgentId(agentId: string): Hex32 {
  return hashCanonicalIdentifier(agentId, "agentId");
}

export function hashCanonicalRequestId(requestId: string): Hex32 {
  return hashCanonicalIdentifier(requestId, "requestId");
}

function hashCanonicalIdentifier(value: string, name: string): Hex32 {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new TeeMLRegistryInputError(`${name} must not be empty.`);
  }
  return keccak256(stringToHex(normalized)) as Hex32;
}

export class TeeMLRegistryInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TeeMLRegistryInputError";
  }
}
