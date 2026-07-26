"use client";

import { Bot, ChevronRight, Pause, Plus, ShieldCheck, ShieldOff, TriangleAlert } from "lucide-react";
import { Badge, type BadgeTone } from "~~/components/ui/Badge";
import type { Agent, AgentStatus } from "~~/lib/types/aegis";
import { truncateAddress } from "~~/lib/utils/format";

const STATUS_META: Record<AgentStatus, { label: string; tone: BadgeTone; icon: typeof ShieldCheck }> = {
  protected: { label: "Protected", tone: "success", icon: ShieldCheck },
  unprotected: { label: "Unprotected", tone: "neutral", icon: ShieldOff },
  paused: { label: "Paused", tone: "warning", icon: Pause },
  compromised: { label: "Compromised", tone: "danger", icon: TriangleAlert },
};

export function AgentCard({ agent, onOpen }: { agent: Agent; onOpen: () => void }) {
  const status = STATUS_META[agent.status];
  const StatusIcon = status.icon;

  return (
    <button
      onClick={onOpen}
      className="group relative flex cursor-pointer flex-col rounded-lg border border-border bg-surface p-4 text-left shadow-md transition-all duration-[160ms] hover:-translate-y-0.5 hover:border-brand hover:shadow-lg motion-reduce:hover:translate-y-0"
    >
      <div className="flex w-full items-start justify-between gap-3">
        <span className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-soft">
            <Bot className="h-4 w-4 text-brand-strong" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-body-sm font-semibold">{agent.name}</span>
            <span className="block truncate text-caption text-muted">{agent.type}</span>
          </span>
        </span>
        <Badge tone={status.tone}>
          <StatusIcon className="h-3 w-3" />
          {status.label}
        </Badge>
      </div>

      <dl className="mt-4 w-full space-y-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-label text-muted">Protected wallet</dt>
          <dd className="font-mono text-mono-sm" title={agent.wallet || undefined}>
            {agent.wallet ? truncateAddress(agent.wallet) : "—"}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-label text-muted">Policy</dt>
          <dd className="max-w-[16ch] truncate text-body-sm font-medium" title={agent.policySummary}>
            {agent.policySummary}
          </dd>
        </div>
      </dl>

      <ChevronRight className="absolute bottom-4 right-4 h-4 w-4 text-subtle transition-all duration-[160ms] group-hover:translate-x-0.5 group-hover:text-brand-strong" />
    </button>
  );
}

export function AddAgentCard({ onAdd }: { onAdd: () => void }) {
  return (
    <button
      onClick={onAdd}
      className="flex min-h-[148px] cursor-pointer flex-col items-center justify-center gap-2.5 rounded-lg border-2 border-dashed border-border-strong bg-transparent p-4 text-center shadow-sm transition-all duration-[160ms] hover:-translate-y-0.5 hover:border-brand hover:bg-brand-soft/40 hover:shadow-md motion-reduce:hover:translate-y-0"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-soft">
        <Plus className="h-4 w-4 text-brand-strong" />
      </span>
      <span className="text-body-sm font-semibold">Protect a new agent</span>
      <span className="max-w-[24ch] text-caption text-muted">Connect the agent and set its policy</span>
    </button>
  );
}

export function AgentCardSkeleton() {
  return <div className="h-[148px] animate-pulse rounded-lg bg-surface shadow-sm" />;
}
