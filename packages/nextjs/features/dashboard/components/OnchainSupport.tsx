import Link from "next/link";
import { Badge } from "~~/components/ui/Badge";
import type { OnchainOverview } from "~~/lib/onchain-data/types";

export function OnchainSupport({ support }: { support: OnchainOverview["support"] }) {
  const items = [
    {
      label: "Safe executions",
      state: support.executions,
      indexedNote: "Success and failure events are available through paginated GraphQL list and detail views.",
      unavailableNote: "The Hedera Subgraph is unavailable or reports indexing errors; no alternate history is shown.",
      href: "/dashboard/executions",
    },
    {
      label: "Payments",
      state: support.payments,
      indexedNote: "Dedicated payment events are available through GraphQL.",
      unavailableNote: "No dedicated payment event/entity is available; no value is inferred from private data.",
      href: "/dashboard/payments",
    },
    {
      label: "Policy references",
      state: support.policies,
      indexedNote: "Public policy hash aggregates are available through paginated GraphQL list and detail views.",
      unavailableNote:
        "The Hedera Subgraph is unavailable or reports indexing errors; no alternate policy history is shown.",
      href: "/dashboard/policies",
    },
  ];
  return (
    <section>
      <h2 className="text-h4">Onchain coverage and blockers</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        {items.map(item => (
          <article key={item.label} className="rounded-lg border border-border bg-surface-raised p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-body-sm font-semibold">{item.label}</h3>
              <Badge tone={item.state === "indexed" ? "success" : item.state === "blocked" ? "warning" : "neutral"}>
                {item.state === "indexed" ? "Indexed" : item.state === "blocked" ? "Source unavailable" : "Unsupported"}
              </Badge>
            </div>
            <p className="mt-2 text-caption text-muted">
              {item.state === "indexed" ? item.indexedNote : item.unavailableNote}
            </p>
            <Link
              className="mt-3 inline-flex text-body-sm font-medium text-brand-strong hover:underline"
              href={item.href}
            >
              {item.state === "indexed"
                ? "Open indexed view"
                : item.state === "blocked"
                  ? "View unavailable state"
                  : "View limitation"}
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}
