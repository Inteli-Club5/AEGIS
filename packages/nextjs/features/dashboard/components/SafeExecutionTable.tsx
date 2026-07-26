import Link from "next/link";
import { Badge } from "~~/components/ui/Badge";
import type { SafeExecution } from "~~/lib/onchain-data/types";
import { formatDateTime, truncateAddress } from "~~/lib/utils/format";

export function SafeExecutionTable({ items }: { items: SafeExecution[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface-raised px-5 py-8 text-center">
        <p className="text-body-sm font-semibold">No indexed Safe executions match these filters</p>
        <p className="mt-1 text-caption text-muted">The Hedera Subgraph returned an empty result.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface-raised shadow-sm">
      <table className="table table-zebra w-full">
        <thead>
          <tr>
            <th>Time</th>
            <th>Result</th>
            <th>Safe</th>
            <th>Agent hash</th>
            <th>Transaction</th>
            <th aria-label="Details" />
          </tr>
        </thead>
        <tbody>
          {items.map(item => (
            <tr key={item.id}>
              <td className="whitespace-nowrap font-mono text-mono-sm">
                {formatDateTime(Number(item.blockTimestamp))}
              </td>
              <td>
                <Badge tone={item.success ? "success" : "danger"}>{item.success ? "SUCCESS" : "FAILURE"}</Badge>
              </td>
              <td className="font-mono text-mono-sm" title={item.safe}>
                {truncateAddress(item.safe)}
              </td>
              <td className="font-mono text-mono-sm" title={item.agentIdHash ?? "Not linked"}>
                {item.agentIdHash ? truncateAddress(item.agentIdHash) : "Not linked"}
              </td>
              <td className="font-mono text-mono-sm" title={item.transactionHash}>
                {truncateAddress(item.transactionHash)}
              </td>
              <td className="text-right">
                <Link
                  className="font-medium text-brand-strong hover:underline"
                  href={`/dashboard/executions/${item.id}`}
                >
                  Details
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
