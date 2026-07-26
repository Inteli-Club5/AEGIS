import type { AgentOnchainSummary, AgenticIdentity, CrossChainAgentView, Hex, SuppliedAgentLink } from "./types.ts";
import { keccak256, stringToHex } from "viem";

export function hashCanonicalAgentId(agentId: string): Hex {
  return keccak256(stringToHex(agentId.trim()));
}

export function agenticIdentityEntityId(contractAddress: string, tokenId: string): Hex {
  const canonicalContract = normalizeAddress(contractAddress);
  const canonicalTokenId = normalizeTokenId(tokenId);
  return keccak256(stringToHex(`${canonicalContract}:${canonicalTokenId}`));
}

export function buildCrossChainAgentViews(input: {
  hedera: AgentOnchainSummary[];
  zeroG: AgenticIdentity[];
  suppliedLinks?: SuppliedAgentLink[];
  sourceComplete?: { hedera: boolean; zeroG: boolean };
}): CrossChainAgentView[] {
  const links = (input.suppliedLinks ?? []).map(normalizeSuppliedLink);
  const sourceComplete = input.sourceComplete ?? { hedera: true, zeroG: true };
  const usedZeroG = new Set<string>();
  const views: CrossChainAgentView[] = [];
  const hederaTokenCounts = input.hedera.reduce((counts, agent) => {
    const tokenId = normalizeTokenId(agent.agenticIdTokenId);
    counts.set(tokenId, (counts.get(tokenId) ?? 0) + 1);
    return counts;
  }, new Map<string, number>());
  const zeroGTokenCounts = input.zeroG.reduce((counts, identity) => {
    const tokenId = normalizeTokenId(identity.tokenId);
    counts.set(tokenId, (counts.get(tokenId) ?? 0) + 1);
    return counts;
  }, new Map<string, number>());

  for (const hedera of input.hedera) {
    const hederaTokenId = normalizeTokenId(hedera.agenticIdTokenId);
    const canonicalAgentLinks = links.filter(
      link => normalizeHex(link.agentIdHash) === normalizeHex(hedera.agentIdHash),
    );
    const supplied = canonicalAgentLinks.length === 1 ? canonicalAgentLinks[0] : undefined;
    const tokenCandidates = uniqueIdentities(
      input.zeroG.filter(identity => normalizeTokenId(identity.tokenId) === hederaTokenId),
    );
    const identityClaimCount = tokenCandidates.reduce(
      (count, identity) => Math.max(count, links.filter(link => link.agenticIdKey === identityKey(identity)).length),
      0,
    );

    if (
      canonicalAgentLinks.length > 1 ||
      tokenCandidates.length > 1 ||
      identityClaimCount > 1 ||
      (tokenCandidates.length > 0 && (hederaTokenCounts.get(hederaTokenId) ?? 0) > 1)
    ) {
      views.push({
        id: `hedera:${hedera.id}`,
        agentId: supplied?.agentId,
        agentIdHash: hedera.agentIdHash,
        safe: hedera.safe,
        hedera,
        zeroG: null,
        state: "ambiguous",
        matchedBy: ["agenticId"],
        missingSources: ["0g-galileo"],
        warnings: [
          "Multiple configured Agentic ID candidates or application claims compete for this Hedera identity; no relationship was selected.",
        ],
      });
      continue;
    }

    const tokenCandidate = tokenCandidates[0];
    const suppliedCandidate = findSuppliedIdentityCandidate(canonicalAgentLinks, input.zeroG);
    const candidate = tokenCandidate ?? suppliedCandidate;
    const conflicts = candidate ? findConflicts(hedera, candidate, supplied, links) : [];

    if (tokenCandidate && (!sourceComplete.hedera || !sourceComplete.zeroG)) {
      views.push({
        id: `hedera:${hedera.id}`,
        agentId: supplied?.agentId,
        agentIdHash: hedera.agentIdHash,
        safe: hedera.safe,
        hedera,
        zeroG: null,
        state: "ambiguous",
        matchedBy: [],
        missingSources: [],
        warnings: [
          "A matching Agentic ID exists in the bounded query window, but global uniqueness cannot be established until both source collections are complete.",
        ],
      });
      continue;
    }

    if (candidate && (conflicts.length > 0 || candidate !== tokenCandidate)) {
      usedZeroG.add(candidate.id);
      views.push({
        id: `mismatch:${hedera.id}:${candidate.id}`,
        agentId: supplied?.agentId,
        agentIdHash: hedera.agentIdHash,
        safe: hedera.safe,
        hedera,
        zeroG: candidate,
        state: "mismatch",
        matchedBy: ["agenticId"],
        missingSources: [],
        warnings:
          conflicts.length > 0
            ? conflicts
            : ["The supplied Agentic ID token conflicts with the Hedera registry token."],
      });
      continue;
    }

    if (tokenCandidate) {
      usedZeroG.add(tokenCandidate.id);
      views.push({
        id: `cross-chain:${hedera.id}:${tokenCandidate.id}`,
        agentId: supplied?.agentId,
        agentIdHash: hedera.agentIdHash,
        safe: hedera.safe,
        hedera,
        zeroG: tokenCandidate,
        state: "complete",
        matchedBy: ["agenticId"],
        missingSources: [],
        warnings: [],
      });
      continue;
    }

    const counterpartIncomplete = !sourceComplete.zeroG;
    views.push({
      id: `hedera:${hedera.id}`,
      agentId: supplied?.agentId,
      agentIdHash: hedera.agentIdHash,
      safe: hedera.safe,
      hedera,
      zeroG: null,
      state: counterpartIncomplete ? "ambiguous" : "hedera-only",
      matchedBy: [],
      missingSources: ["0g-galileo"],
      warnings: [
        sourceComplete.zeroG
          ? "No 0G identity with the registry Agentic ID token was indexed in the configured deployment."
          : "The 0G counterpart query is incomplete or unavailable; absence of a matching identity is not definitive.",
      ],
    });
  }

  for (const identity of input.zeroG) {
    if (usedZeroG.has(identity.id)) continue;
    const identityLinks = links.filter(link => link.agenticIdKey === identityKey(identity));
    const supplied = identityLinks.length === 1 ? identityLinks[0] : undefined;
    const competingHederaAgents = hederaTokenCounts.get(normalizeTokenId(identity.tokenId)) ?? 0;
    const competingZeroGIdentities = zeroGTokenCounts.get(normalizeTokenId(identity.tokenId)) ?? 0;
    const windowLimitedCandidate = competingHederaAgents > 0 && (!sourceComplete.hedera || !sourceComplete.zeroG);
    const counterpartIncomplete = !sourceComplete.hedera;
    const ambiguous =
      identityLinks.length > 1 ||
      competingHederaAgents > 1 ||
      competingZeroGIdentities > 1 ||
      windowLimitedCandidate ||
      counterpartIncomplete;
    views.push({
      id: `0g:${identity.id}`,
      agentId: supplied?.agentId,
      agentIdHash: supplied?.agentIdHash ?? null,
      safe: supplied?.safe ?? null,
      hedera: null,
      zeroG: identity,
      state: ambiguous ? "ambiguous" : "zero-g-only",
      matchedBy: [],
      missingSources: ["hedera-testnet"],
      warnings: [
        ambiguous
          ? competingHederaAgents > 1
            ? "Multiple Hedera agents claim this Agentic ID token; no cross-chain relationship was selected."
            : competingZeroGIdentities > 1
              ? "Multiple 0G identities share this Agentic ID token; no cross-chain relationship was selected."
              : windowLimitedCandidate
                ? "A matching Hedera token exists in the bounded query window, but global uniqueness cannot be established."
                : counterpartIncomplete
                  ? "The Hedera counterpart query is incomplete or unavailable; absence of a matching agent is not definitive."
                  : "Multiple application records claim this Agentic ID; no Hedera relationship was selected."
          : sourceComplete.hedera
            ? "No Hedera agent summary with this Agentic ID token was indexed."
            : "No matching Hedera agent was found in this bounded query window; no relationship was inferred.",
      ],
    });
  }

  return views.sort((left, right) => lastActivity(right) - lastActivity(left) || left.id.localeCompare(right.id));
}

type NormalizedSuppliedLink = {
  agentId: string;
  agentIdHash: Hex;
  safe: Hex | null;
  agenticIdTokenId: string | null;
  agenticIdKey: string | null;
};

function normalizeSuppliedLink(link: SuppliedAgentLink): NormalizedSuppliedLink {
  const agentId = link.agentId.trim();
  if (!agentId) throw new Error("A supplied cross-chain link requires a non-empty agentId.");
  const agenticIdTokenId = link.agenticIdTokenId ? normalizeTokenId(link.agenticIdTokenId) : null;
  const contract = link.agenticIdContract ? normalizeAddress(link.agenticIdContract) : null;
  const agenticIdKey =
    agenticIdTokenId && contract && link.agenticIdNetwork
      ? `${link.agenticIdNetwork}:${contract}:${agenticIdTokenId}`
      : null;
  return {
    agentId,
    agentIdHash: hashCanonicalAgentId(agentId),
    safe: link.safe ? normalizeAddress(link.safe) : null,
    agenticIdTokenId,
    agenticIdKey,
  };
}

function findSuppliedIdentityCandidate(
  links: NormalizedSuppliedLink[],
  identities: AgenticIdentity[],
): AgenticIdentity | undefined {
  const candidates = uniqueIdentities(
    links.flatMap(link => identities.filter(identity => link.agenticIdKey === identityKey(identity))),
  );
  return candidates.length === 1 ? candidates[0] : undefined;
}

function findConflicts(
  hedera: AgentOnchainSummary,
  identity: AgenticIdentity,
  supplied: NormalizedSuppliedLink | undefined,
  allLinks: NormalizedSuppliedLink[],
): string[] {
  const conflicts: string[] = [];
  const identityClaims = allLinks.filter(link => link.agenticIdKey === identityKey(identity));
  if (identityClaims.length === 1 && normalizeHex(identityClaims[0].agentIdHash) !== normalizeHex(hedera.agentIdHash)) {
    conflicts.push("The application Agentic ID claim has a different canonical agentIdHash.");
  }
  if (supplied?.safe && normalizeHex(supplied.safe) !== normalizeHex(hedera.safe)) {
    conflicts.push("The application Safe address conflicts with the Hedera registry Safe.");
  }
  if (supplied?.agenticIdTokenId && supplied.agenticIdTokenId !== normalizeTokenId(hedera.agenticIdTokenId)) {
    conflicts.push("The application Agentic ID token conflicts with the Hedera registry token.");
  }
  if (supplied?.agenticIdKey && supplied.agenticIdKey !== identityKey(identity)) {
    conflicts.push("The application Agentic ID contract, network, or token conflicts with the indexed 0G identity.");
  }
  return conflicts;
}

function identityKey(identity: AgenticIdentity): string {
  return `${identity.sourceChain}:${normalizeAddress(identity.contract)}:${normalizeTokenId(identity.tokenId)}`;
}

function normalizeAddress(value: string): Hex {
  const normalized = normalizeHex(value);
  if (!/^0x[0-9a-f]{40}$/.test(normalized)) throw new Error("Expected a 20-byte EVM address.");
  return normalized as Hex;
}

function normalizeTokenId(value: string): string {
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) throw new Error("Expected an unsigned decimal Agentic ID token.");
  return BigInt(normalized).toString();
}

function normalizeHex(value: string): string {
  return value.trim().toLowerCase();
}

function uniqueIdentities(identities: AgenticIdentity[]): AgenticIdentity[] {
  return [...new Map(identities.map(identity => [identity.id, identity])).values()];
}

function lastActivity(view: CrossChainAgentView): number {
  return Math.max(Number(view.hedera?.lastActivityAt ?? 0), Number(view.zeroG?.lastUpdatedAt ?? 0));
}
