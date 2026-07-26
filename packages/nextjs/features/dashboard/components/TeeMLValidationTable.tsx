"use client";

import Link from "next/link";
import { Badge } from "~~/components/ui/Badge";
import type { TeeMLValidation } from "~~/lib/onchain-data/types";
import { formatDateTime, truncateAddress } from "~~/lib/utils/format";

export function TeeMLValidationTable({ items }: { items: TeeMLValidation[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface-raised px-5 py-8 text-center shadow-sm">
        <p className="text-body-sm font-semibold">No indexed TeeML validations</p>
        <p className="mt-1 text-caption text-muted">The Hedera Subgraph returned an empty result for these filters.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface-raised shadow-sm">
      <table className="w-full min-w-[900px]" aria-label="Indexed TeeML validations">
        <thead>
          <tr className="border-b border-border">
            <Header>Timestamp</Header>
            <Header>Agent</Header>
            <Header>Verdict</Header>
            <Header>Request</Header>
            <Header>Policy</Header>
            <Header>Source</Header>
            <Header>Transaction</Header>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {items.map(item => (
            <tr key={item.id} className="transition-colors hover:bg-brand-soft/30">
              <Cell>{formatDateTime(Number(item.blockTimestamp))}</Cell>
              <Cell title={item.agentIdHash}>{truncateAddress(item.agentIdHash)}</Cell>
              <Cell>
                <Badge tone={item.verdict === "ALLOW" ? "success" : "danger"}>{item.verdict}</Badge>
              </Cell>
              <Cell title={item.requestId}>{truncateAddress(item.requestId)}</Cell>
              <Cell title={item.policyHash}>{truncateAddress(item.policyHash)}</Cell>
              <Cell>
                <Badge tone="info">Hedera testnet</Badge>
              </Cell>
              <Cell>
                <Link
                  href={`/dashboard/validations/${encodeURIComponent(item.id)}`}
                  className="font-mono text-mono-sm text-brand-strong underline-offset-4 hover:underline"
                  title={item.transactionHash}
                >
                  {truncateAddress(item.transactionHash)}
                </Link>
              </Cell>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Header({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-3 text-left font-mono text-overline uppercase text-muted">{children}</th>;
}

function Cell({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <td className="px-4 py-3.5 font-mono text-mono-sm" title={title}>
      {children}
    </td>
  );
}
