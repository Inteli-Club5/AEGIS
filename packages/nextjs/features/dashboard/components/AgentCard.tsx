"use client";

import { useState } from "react";
import { Bot, ChevronRight, Loader2, Pause, Plus, ShieldCheck, ShieldOff, Trash2, TriangleAlert } from "lucide-react";
import { Badge, type BadgeTone } from "~~/components/ui/Badge";
import { ConfirmDialog } from "~~/components/ui/ConfirmDialog";
import type { Agent, AgentStatus } from "~~/lib/types/aegis";
import { truncateAddress } from "~~/lib/utils/format";

const STATUS_META: Record<AgentStatus, { label: string; tone: BadgeTone; icon: typeof ShieldCheck }> = {
  protected: { label: "Protected", tone: "success", icon: ShieldCheck },
  unprotected: { label: "Unprotected", tone: "neutral", icon: ShieldOff },
  paused: { label: "Paused", tone: "warning", icon: Pause },
  compromised: { label: "Compromised", tone: "danger", icon: TriangleAlert },
};

export function AgentCard({
  agent,
  onOpen,
  onDelete,
}: {
  agent: Agent;
  onOpen: () => void;
  onDelete?: () => Promise<void> | void;
}) {
  const status = STATUS_META[agent.status];
  const StatusIcon = status.icon;
  const showDelete = Boolean(onDelete) && agent.status !== "protected";
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleConfirmDelete() {
    if (!onDelete) return;
    setDeleting(true);
    try {
      await onDelete();
    } finally {
      setDeleting(false);
      setConfirmOpen(false);
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => {
        if (confirmOpen || deleting) return;
        onOpen();
      }}
      onKeyDown={event => {
        if ((event.key === "Enter" || event.key === " ") && !confirmOpen && !deleting) {
          event.preventDefault();
          onOpen();
        }
      }}
      className="group relative flex cursor-pointer flex-col rounded-lg border border-border bg-surface p-4 text-left shadow-md transition-all duration-[160ms] hover:-translate-y-0.5 hover:border-brand hover:shadow-lg motion-reduce:hover:translate-y-0"
    >
      <div className="flex w-full items-start justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-soft">
            <Bot className="h-4 w-4 text-brand-strong" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-body-sm font-semibold">{agent.name}</span>
            <span className="block truncate text-caption text-muted">{agent.type}</span>
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          <Badge tone={status.tone}>
            <StatusIcon className="h-3 w-3" />
            {status.label}
          </Badge>
          {showDelete && (
            <button
              type="button"
              onClick={event => {
                event.stopPropagation();
                setConfirmOpen(true);
              }}
              aria-label={`Delete ${agent.name}`}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-danger-soft hover:text-danger focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-strong"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </span>
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

      {showDelete && (
        <ConfirmDialog
          open={confirmOpen}
          title={`Delete ${agent.name}?`}
          description="This removes the agent from AEGIS's records and your dashboard. Its Hedera account and any deployed Safe wallet are on-chain and stay exactly as they are -- this can't be undone on AEGIS's side."
          confirmLabel={deleting ? "Deleting…" : "Delete"}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={handleConfirmDelete}
        />
      )}
      {deleting && (
        <span className="absolute inset-0 flex items-center justify-center rounded-lg bg-surface/70">
          <Loader2 className="h-5 w-5 animate-spin text-muted" />
        </span>
      )}
    </div>
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
