"use client";

import { Bot, ChevronRight } from "lucide-react";
import { Badge, type BadgeTone } from "~~/components/ui/Badge";
import { validationCountLabel } from "~~/lib/onchain-data/presentation";
import type { CrossChainAgentView } from "~~/lib/onchain-data/types";
import { truncateAddress } from "~~/lib/utils/format";

const STATE_META: Record<CrossChainAgentView["state"], { label: string; tone: BadgeTone }> = {
  complete: { label: "Hedera + 0G", tone: "success" },
  "hedera-only": { label: "Hedera only", tone: "warning" },
  "zero-g-only": { label: "0G only", tone: "warning" },
  ambiguous: { label: "Ambiguous", tone: "danger" },
  mismatch: { label: "Mismatch", tone: "danger" },
};

export function OnchainAgentCard({
  agent,
  hederaAvailable,
  onOpen,
}: {
  agent: CrossChainAgentView;
  hederaAvailable: boolean;
  onOpen: () => void;
}) {
  const state = STATE_META[agent.state];
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative flex min-h-[168px] flex-col rounded-lg border border-border bg-surface p-4 text-left shadow-md transition-all duration-[160ms] hover:-translate-y-0.5 hover:border-brand hover:shadow-lg"
    >
      <div className="flex w-full items-start justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-soft">
            <Bot className="h-4 w-4 text-brand-strong" aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-body-sm font-semibold">{agent.agentId ?? "Indexed agent"}</span>
            <span className="block truncate font-mono text-mono-sm text-muted">
              {agent.agentIdHash ? truncateAddress(agent.agentIdHash) : "No agent hash"}
            </span>
          </span>
        </span>
        <Badge tone={state.tone}>{state.label}</Badge>
      </div>
      <dl className="mt-4 space-y-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-label text-muted">Safe</dt>
          <dd className="font-mono text-mono-sm">{agent.safe ? truncateAddress(agent.safe) : "Not indexed"}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-label text-muted">Agentic ID</dt>
          <dd className="font-mono text-mono-sm">
            {agent.zeroG ? `#${agent.zeroG.tokenId} · ${agent.zeroG.status}` : "Not indexed"}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-label text-muted">0G owner</dt>
          <dd className="font-mono text-mono-sm">{agent.zeroG ? truncateAddress(agent.zeroG.owner) : "Not indexed"}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-label text-muted">Validations</dt>
          <dd className="font-mono text-mono-sm">{validationCountLabel(agent, hederaAvailable)}</dd>
        </div>
      </dl>
      {agent.warnings[0] && <p className="mt-3 pr-6 text-caption text-warning">{agent.warnings[0]}</p>}
      <ChevronRight className="absolute bottom-4 right-4 h-4 w-4 text-subtle group-hover:text-brand-strong" />
    </button>
  );
}
