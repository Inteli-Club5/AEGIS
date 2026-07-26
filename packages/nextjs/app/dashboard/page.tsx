"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AppTopbar } from "~~/components/layout/AppTopbar";
import { AddAgentCard, AgentCard, AgentCardSkeleton } from "~~/features/dashboard/components/AgentCard";
import { OnchainStatStrip, StatStripSkeleton } from "~~/features/dashboard/components/StatStrip";
import { TeeMLValidationTable } from "~~/features/dashboard/components/TeeMLValidationTable";
import { ConnectGate } from "~~/features/wallet/components/ConnectGate";
import { useConnectWallet } from "~~/features/wallet/components/ConnectWalletProvider";
import { ApiError } from "~~/lib/api/http";
import { getAgentServiceProfile } from "~~/lib/api/onboarding";
import { readCreatedAgentDetails, removeCreatedAgent } from "~~/lib/onboarding/localAgentDraftStore";
import { fetchOnchainOverview } from "~~/lib/onchain-data/browser";
import type { AgentDetail } from "~~/lib/types/aegis";

export default function DashboardPage() {
  const router = useRouter();
  const { status } = useConnectWallet();
  const [myAgents, setMyAgents] = useState<AgentDetail[] | null>(null);
  const overview = useQuery({
    queryKey: ["aegis-onchain-overview"],
    queryFn: ({ signal }) => fetchOnchainOverview(signal),
    enabled: status === "connected",
    refetchInterval: 15_000,
  });

  useEffect(() => {
    if (status !== "connected") return;
    let cancelled = false;
    const cached = readCreatedAgentDetails();

    Promise.all(
      cached.map(async agent => {
        try {
          await getAgentServiceProfile(agent.id);
          return agent;
        } catch (error) {
          if (error instanceof ApiError && error.status === 404) {
            removeCreatedAgent(agent.id);
            return null;
          }
          // Unreachable/other error: keep showing the cached entry rather than
          // hiding a real agent just because this one status check failed.
          return agent;
        }
      }),
    ).then(results => {
      if (!cancelled) setMyAgents(results.filter((agent): agent is AgentDetail => agent !== null));
    });

    return () => {
      cancelled = true;
    };
  }, [status]);

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
        </div>

        <div className="mt-3">
          {overview.isPending ? (
            <StatStripSkeleton />
          ) : overview.isError ? null : (
            <OnchainStatStrip metrics={overview.data.metrics} />
          )}
        </div>

        <h1 className="mt-12 text-h2">Your agents</h1>

        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <AddAgentCard onAdd={() => router.push("/onboarding")} />
          {myAgents === null ? (
            <>
              <AgentCardSkeleton />
              <AgentCardSkeleton />
              <AgentCardSkeleton />
            </>
          ) : (
            myAgents.map(agent => (
              <AgentCard key={agent.id} agent={agent} onOpen={() => router.push(`/agents/${agent.id}`)} />
            ))
          )}
        </div>

        <section className="mt-14">
          <h2 className="text-h3">Last activities</h2>
          <p className="mt-1 text-body-sm text-muted">Every decision — approved or denied — indexed via The Graph.</p>
          <div className="mt-5">
            {overview.isPending ? (
              <div className="h-56 animate-pulse rounded-lg bg-surface" />
            ) : (
              <TeeMLValidationTable items={overview.isError ? [] : overview.data.recentValidations} />
            )}
          </div>
        </section>
      </main>
    </>
  );
}
