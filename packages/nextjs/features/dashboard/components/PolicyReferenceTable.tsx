import Link from "next/link";
import type { PolicyReference } from "~~/lib/onchain-data/types";
import { formatDateTime, truncateAddress } from "~~/lib/utils/format";

export function PolicyReferenceTable({ items }: { items: PolicyReference[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface-raised px-5 py-8 text-center">
        <p className="text-body-sm font-semibold">No indexed policy references match these filters</p>
        <p className="mt-1 text-caption text-muted">The Hedera Subgraph returned an empty result.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface-raised shadow-sm">
      <table className="table table-zebra w-full">
        <thead>
          <tr>
            <th>Policy hash</th>
            <th>Validations</th>
            <th>ALLOW</th>
            <th>DENY</th>
            <th>Last referenced</th>
            <th aria-label="Details" />
          </tr>
        </thead>
        <tbody>
          {items.map(item => (
            <tr key={item.id}>
              <td className="font-mono text-mono-sm" title={item.policyHash}>
                {truncateAddress(item.policyHash)}
              </td>
              <td className="font-mono text-mono-sm">{item.validationCount}</td>
              <td className="font-mono text-mono-sm text-success">{item.allowCount}</td>
              <td className="font-mono text-mono-sm text-danger">{item.denyCount}</td>
              <td className="whitespace-nowrap font-mono text-mono-sm">
                {formatDateTime(Number(item.lastReferencedAt))}
              </td>
              <td className="text-right">
                <Link className="font-medium text-brand-strong hover:underline" href={`/dashboard/policies/${item.id}`}>
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
