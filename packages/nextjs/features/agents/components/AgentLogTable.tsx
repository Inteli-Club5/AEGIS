"use client";

import { Badge } from "@/components/ui/Badge";
import type { ActivityEntry } from "@/lib/types/aegis";
import { formatDateTime, formatHbar } from "@/lib/utils/format";
import { Check, X } from "lucide-react";

/**
 * Decision log for a single agent. Same data as the dashboard's activity table,
 * minus the agent column (redundant here) and plus the verifier's reason.
 */
export function AgentLogTable({ entries }: { entries: ActivityEntry[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface-raised shadow-sm">
      <table className="w-full min-w-[720px]" aria-label="Agent decision log">
        <thead>
          <tr className="border-b border-border">
            <th className="px-5 py-3 text-left font-mono text-overline uppercase text-muted">When</th>
            <th className="px-5 py-3 text-left font-mono text-overline uppercase text-muted">Action</th>
            <th className="px-5 py-3 text-left font-mono text-overline uppercase text-muted">Verdict</th>
            <th className="px-5 py-3 text-left font-mono text-overline uppercase text-muted">Reason</th>
            <th className="px-5 py-3 text-right font-mono text-overline uppercase text-muted">Amount</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {entries.map(entry => (
            <tr key={entry.id} className="transition-colors duration-[120ms] hover:bg-brand-soft/40">
              <td className="px-5 py-3.5 align-top">
                <span className="block font-mono text-mono-sm">{formatDateTime(entry.timestamp)}</span>
                <span className="block font-mono text-mono-sm text-subtle">{entry.id}</span>
              </td>
              <td className="px-5 py-3.5 align-top font-mono text-mono-sm">{entry.actionType}</td>
              <td className="px-5 py-3.5 align-top">
                {entry.verdict === "ALLOW" ? (
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
                ) : (
                  <Badge tone="danger">
                    <X className="h-3 w-3" />
                    Denied
                  </Badge>
                )}
              </td>
              <td className="px-5 py-3.5 align-top text-body-sm text-muted">{entry.reason ?? "—"}</td>
              <td className="px-5 py-3.5 align-top text-right font-mono text-mono-md tabular-nums">
                {formatHbar(entry.amountHbar)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
