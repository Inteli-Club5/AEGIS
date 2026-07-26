import { Activity, Bot, Coins, FileKey2, Fingerprint, Play, ShieldCheck, ShieldX } from "lucide-react";
import type { OnchainOverviewMetrics } from "~~/lib/onchain-data/types";
import { cn } from "~~/lib/utils/cn";

export function OnchainStatStrip({ metrics }: { metrics: OnchainOverviewMetrics }) {
  return (
    <div>
      <MetricGrid
        items={[
          { key: "agents", label: "Hedera agents", value: formatOnchainMetric(metrics.totalAgents), icon: Bot },
          {
            key: "agentic-ids",
            label: "Agentic IDs",
            value: formatOnchainMetric(metrics.agenticIds),
            icon: Fingerprint,
          },
          {
            key: "validations",
            label: "TEE validations",
            value: formatOnchainMetric(metrics.teeMLValidations),
            icon: Activity,
          },
          { key: "allow", label: "ALLOW", value: formatOnchainMetric(metrics.allow), icon: ShieldCheck },
          { key: "deny", label: "DENY", value: formatOnchainMetric(metrics.deny), icon: ShieldX },
          {
            key: "executions",
            label: "Safe executions",
            value: formatOnchainMetric(metrics.executions),
            icon: Play,
          },
          {
            key: "payments",
            label: "Payments",
            value: metrics.payments === null ? "Not indexed" : metrics.payments.toLocaleString("en-US"),
            icon: Coins,
          },
          {
            key: "policies",
            label: "Policies referenced",
            value: formatOnchainMetric(metrics.policiesReferenced),
            icon: FileKey2,
          },
        ]}
      />
    </div>
  );
}

function formatOnchainMetric(value: number | null): string {
  return value === null ? "Unavailable" : value.toLocaleString("en-US");
}

type MetricItem = {
  key: string;
  label: string;
  value: string;
  icon: typeof Activity;
};

function MetricGrid({ items }: { items: MetricItem[] }) {
  return (
    <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-border bg-surface-raised shadow-sm lg:grid-cols-4">
      {items.map((item, i) => {
        const Icon = item.icon;
        return (
          <div
            key={item.key}
            className={cn(
              "relative min-h-[92px] px-5 py-4",
              i > 0 && "border-t border-border",
              i % 2 !== 0 && "border-l border-border",
              i >= 2 && "lg:border-t-0",
              i % 4 !== 0 && "lg:border-l",
            )}
          >
            <Icon className="absolute right-4 top-4 h-4 w-4 text-subtle" />
            <p className="font-mono text-overline uppercase text-muted">{item.label}</p>
            <p className="mt-1.5 text-h2 font-extrabold tabular-nums">{item.value}</p>
          </div>
        );
      })}
    </div>
  );
}

export function StatStripSkeleton({ count = 4 }: { count?: number } = {}) {
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="h-[92px] animate-pulse bg-surface" />
      ))}
    </div>
  );
}
