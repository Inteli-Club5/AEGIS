import type { ActivityEntry, DashboardStats, StatsPeriod } from "@/lib/types/aegis";

export function filterByPeriod(entries: ActivityEntry[], period: StatsPeriod) {
  if (period === "all") return entries;
  const windowMs = period * 24 * 60 * 60 * 1000;
  return entries.filter(e => Date.now() - new Date(e.timestamp).getTime() <= windowMs);
}

export function summarizeActivity(entries: ActivityEntry[]): DashboardStats {
  const approved = entries.filter(e => e.verdict === "ALLOW");
  return {
    totalTrades: entries.length,
    approved: approved.length,
    denied: entries.length - approved.length,
    hbarTransacted: approved.reduce((sum, e) => sum + e.amountHbar, 0),
  };
}
