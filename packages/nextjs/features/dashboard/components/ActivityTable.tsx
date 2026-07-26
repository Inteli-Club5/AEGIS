"use client";

import { Badge } from "@/components/ui/Badge";
import type { ActivityEntry } from "@/lib/types/aegis";
import { formatDateTime, formatHbar } from "@/lib/utils/format";
import { Check, X } from "lucide-react";

function VerdictBadge({ entry }: { entry: ActivityEntry }) {
  if (entry.verdict === "ALLOW") {
    return (
      <span className="inline-flex items-center gap-1.5">
        <Badge tone="success">
          <Check className="h-3 w-3" />
          Approved
        </Badge>
        {entry.mode === "fallback" && (
          <Badge tone="warning" dashed>
            fallback
          </Badge>
        )}
      </span>
    );
  }
  return (
    <Badge tone="danger">
      <X className="h-3 w-3" />
      Denied
    </Badge>
  );
}

export function ActivityTable({ entries }: { entries: ActivityEntry[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface-raised shadow-sm">
      <table className="w-full min-w-[640px]" aria-label="Last activities">
        <thead>
          <tr className="border-b border-border">
            <th className="px-5 py-3 text-left font-mono text-overline uppercase text-muted">Agent</th>
            <th className="px-5 py-3 text-left font-mono text-overline uppercase text-muted">Action</th>
            <th className="px-5 py-3 text-left font-mono text-overline uppercase text-muted">When</th>
            <th className="px-5 py-3 text-left font-mono text-overline uppercase text-muted">Verdict</th>
            <th className="px-5 py-3 text-right font-mono text-overline uppercase text-muted">Amount</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {entries.map(entry => (
            <tr
              key={entry.id}
              title={entry.reason}
              className="transition-colors duration-[120ms] hover:bg-brand-soft/40"
            >
              <td className="px-5 py-3.5">
                <span className="block text-body-sm font-semibold">{entry.agentName}</span>
                <span className="block font-mono text-mono-sm text-subtle">{entry.agentId}</span>
              </td>
              <td className="px-5 py-3.5 font-mono text-mono-sm">{entry.actionType}</td>
              <td className="px-5 py-3.5 font-mono text-mono-sm text-muted">{formatDateTime(entry.timestamp)}</td>
              <td className="px-5 py-3.5">
                <VerdictBadge entry={entry} />
              </td>
              <td className="px-5 py-3.5 text-right font-mono text-mono-md tabular-nums">
                {formatHbar(entry.amountHbar)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ActivityTableSkeleton() {
  return (
    <div className="space-y-px overflow-hidden rounded-lg border border-border shadow-sm">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-14 animate-pulse bg-surface" />
      ))}
    </div>
  );
}
