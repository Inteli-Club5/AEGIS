"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppTopbar } from "@/components/layout/AppTopbar";
import { ActivityTable, ActivityTableSkeleton } from "@/features/dashboard/components/ActivityTable";
import { AddAgentCard, AgentCard, AgentCardSkeleton } from "@/features/dashboard/components/AgentCard";
import { PeriodFilter } from "@/features/dashboard/components/PeriodFilter";
import { StatStrip, StatStripSkeleton } from "@/features/dashboard/components/StatStrip";
import { ConnectGate } from "@/features/wallet/components/ConnectGate";
import { useConnectWallet } from "@/features/wallet/components/ConnectWalletProvider";
import { getDashboardStats, listActivity, listAgents } from "@/lib/api/agents";
import type { ActivityEntry, Agent, DashboardStats, StatsPeriod } from "@/lib/types/aegis";

export default function DashboardPage() {
  const router = useRouter();
  const { status } = useConnectWallet();
  const [agents, setAgents] = useState<Agent[] | null>(null);
  const [activity, setActivity] = useState<ActivityEntry[] | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [period, setPeriod] = useState<StatsPeriod>(30);

  useEffect(() => {
    if (status !== "connected") return;
    let mounted = true;
    Promise.all([listAgents(), listActivity()]).then(([a, entries]) => {
      if (!mounted) return;
      setAgents(a);
      setActivity(entries);
    });
    return () => {
      mounted = false;
    };
  }, [status]);

  useEffect(() => {
    if (status !== "connected") return;
    let mounted = true;
    getDashboardStats(period).then(s => {
      if (mounted) setStats(s);
    });
    return () => {
      mounted = false;
    };
  }, [status, period]);

  if (status !== "connected") {
    return (
      <>
        <AppTopbar />
        <main className="flex flex-1 flex-col">
          <ConnectGate />
        </main>
      </>
    );
  }

  return (
    <>
      <AppTopbar />
      <main className="mx-auto w-full max-w-[1200px] flex-1 px-6 py-10">
        <div className="flex items-center justify-between gap-4">
          <p className="font-mono text-overline uppercase text-subtle">Overview</p>
          <PeriodFilter value={period} onChange={setPeriod} />
        </div>
        <div className="mt-3">{stats === null ? <StatStripSkeleton /> : <StatStrip stats={stats} />}</div>
        <h1 className="mt-12 text-h2">Your agents</h1>

        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <AddAgentCard onAdd={() => router.push("/onboarding")} />
          {agents === null ? (
            <>
              <AgentCardSkeleton />
              <AgentCardSkeleton />
              <AgentCardSkeleton />
            </>
          ) : (
            agents.map(agent => (
              <AgentCard key={agent.id} agent={agent} onOpen={() => router.push(`/agents/${agent.id}`)} />
            ))
          )}
        </div>
        <section className="mt-14">
          <h2 className="text-h3">Last activities</h2>
          <p className="mt-1 text-body-sm text-muted">Every decision — approved or denied — indexed via The Graph.</p>
          <div className="mt-5">
            {activity === null ? <ActivityTableSkeleton /> : <ActivityTable entries={activity} />}
          </div>
        </section>
      </main>
    </>
  );
}
