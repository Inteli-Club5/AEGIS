import type { DashboardStats } from "@/lib/types/aegis";
import { cn } from "@/lib/utils/cn";
import { Activity, Coins, ShieldCheck, ShieldX } from "lucide-react";

const ITEMS = (stats: DashboardStats) => [
  {
    key: "trades",
    label: "Trades executed",
    value: stats.totalTrades.toLocaleString("en-US"),
    icon: Activity,
  },
  {
    key: "approved",
    label: "Approved",
    value: stats.approved.toLocaleString("en-US"),
    icon: ShieldCheck,
  },
  {
    key: "denied",
    label: "Denied",
    value: stats.denied.toLocaleString("en-US"),
    icon: ShieldX,
  },
  {
    key: "volume",
    label: "HBAR transacted",
    value: `${stats.hbarTransacted.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ℏ`,
    icon: Coins,
  },
];

export function StatStrip({ stats }: { stats: DashboardStats }) {
  const items = ITEMS(stats);
  return (
    <div className="grid grid-cols-2 rounded-lg border border-border bg-surface-raised shadow-sm lg:grid-cols-4">
      {items.map((item, i) => {
        const Icon = item.icon;
        return (
          <div
            key={item.key}
            className={cn("relative px-5 py-4", i > 0 && "border-t border-border lg:border-t-0 lg:border-l")}
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

export function StatStripSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-[92px] animate-pulse bg-surface" />
      ))}
    </div>
  );
}
