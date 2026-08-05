import {
  buildCanonicalAgentProfileMetadata,
  buildCanonicalAgenticIdIntelligentData,
  stableStringify,
} from "../../../agentic-id-contract/index.js";
import type { AgentProfileMetadata, AgenticIdIntelligentData, CreateAgenticIdForAegisAgentInput } from "./types";
import { type Hex, keccak256, stringToHex } from "viem";

export { stableStringify };

export const hashAgenticField = (value: unknown): Hex => {
  const normalizedValue = typeof value === "string" ? value.trim() : stableStringify(value);
  return keccak256(stringToHex(normalizedValue));
};

export const buildAgentProfileMetadata = (
  input: CreateAgenticIdForAegisAgentInput,
): AgentProfileMetadata & Record<string, unknown> =>
  buildCanonicalAgentProfileMetadata(input) as AgentProfileMetadata & Record<string, unknown>;

export const buildMetadataHash = (metadata: Record<string, unknown>): Hex =>
  keccak256(stringToHex(stableStringify(metadata)));

export const buildAgenticIdIntelligentData = (
  input: CreateAgenticIdForAegisAgentInput,
  metadataHash: Hex,
): AgenticIdIntelligentData[] => buildCanonicalAgenticIdIntelligentData(input, metadataHash, hashAgenticField);
