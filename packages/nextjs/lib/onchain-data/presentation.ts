import type { CrossChainAgentView } from "./types.ts";

export function validationCountLabel(agent: CrossChainAgentView, hederaAvailable: boolean): string {
  if (agent.hedera) return agent.hedera.validationCount;
  return hederaAvailable ? "Not indexed" : "Unavailable";
}

export function validationFeedState(
  hederaSourceError: string | null,
  itemCount: number,
): "unavailable" | "empty" | "ready" {
  if (hederaSourceError) return "unavailable";
  return itemCount === 0 ? "empty" : "ready";
}
