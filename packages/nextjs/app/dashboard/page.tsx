"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useSignTypedData } from "wagmi";
import { AppTopbar } from "~~/components/layout/AppTopbar";
import { AddAgentCard, AgentCard, AgentCardSkeleton } from "~~/features/dashboard/components/AgentCard";
import { OnchainStatStrip, StatStripSkeleton } from "~~/features/dashboard/components/StatStrip";
import { TeeMLValidationTable } from "~~/features/dashboard/components/TeeMLValidationTable";
import { ConnectGate } from "~~/features/wallet/components/ConnectGate";
import { useConnectWallet } from "~~/features/wallet/components/ConnectWalletProvider";
import { deleteAgent, getAgentDetail } from "~~/lib/api/agents";
import { listAgentIdsByOwner } from "~~/lib/api/onboarding";
import { removeCreatedAgent } from "~~/lib/onboarding/localAgentDraftStore";
import { fetchOnchainOverview } from "~~/lib/onchain-data/browser";
import type { SignAgentCommitment } from "~~/lib/policy/agent-commitment";
import type { AgentDetail } from "~~/lib/types/aegis";

export default function DashboardPage() {
  const router = useRouter();
  const { status, address } = useConnectWallet();
  const { signTypedDataAsync } = useSignTypedData();
  const signAgentAction: SignAgentCommitment = params => signTypedDataAsync(params);
  const [myAgents, setMyAgents] = useState<AgentDetail[] | null>(null);
  const [agentsLoadError, setAgentsLoadError] = useState(false);
  const [partialAgentLoadFailures, setPartialAgentLoadFailures] = useState(0);
  const overview = useQuery({
    queryKey: ["aegis-onchain-overview"],
    queryFn: ({ signal }) => fetchOnchainOverview(signal),
    enabled: status === "connected",
    refetchInterval: 15_000,
  });

  useEffect(() => {
    if (status !== "connected" || !address) return;
    let cancelled = false;
    setAgentsLoadError(false);
    setPartialAgentLoadFailures(0);

    // The backend's owner-indexed agent list is the source of truth -- a
    // browser-local cache would silently lose real, backend-persisted agents
    // (with a deployed Safe) the moment someone switches browser or device.
    listAgentIdsByOwner(address)
      .then(async agentIds => {
        // allSettled, not all: one agent failing to load (a transient error,
        // not a 404 -- getAgentDetail already resolves those to null) must
        // not hide every other successfully loaded agent behind it.
        const results = await Promise.allSettled(agentIds.map(id => getAgentDetail(id)));
        if (cancelled) return;
        const details = results
          .filter((result): result is PromiseFulfilledResult<AgentDetail | null> => result.status === "fulfilled")
          .map(result => result.value)
          .filter((agent): agent is AgentDetail => agent !== null);
        const failures = results.filter(result => result.status === "rejected").length;
        setMyAgents(details);
        setPartialAgentLoadFailures(failures);
      })
      .catch(() => {
        if (cancelled) return;
        setMyAgents([]);
        setAgentsLoadError(true);
      });

    return () => {
      cancelled = true;
    };
  }, [status, address]);

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
        {agentsLoadError && (
          <p className="mt-2 text-body-sm text-danger">
            Couldn&apos;t load your agents from the agent service -- this is not the same as having zero agents. Please
            retry once the service is reachable.
          </p>
        )}
        {!agentsLoadError && partialAgentLoadFailures > 0 && (
          <p className="mt-2 text-body-sm text-danger">
            {partialAgentLoadFailures} agent{partialAgentLoadFailures > 1 ? "s" : ""} failed to load and{" "}
            {partialAgentLoadFailures > 1 ? "are" : "is"} hidden below -- reload to retry.
          </p>
        )}

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
              <AgentCard
                key={agent.id}
                agent={agent}
                onOpen={() =>
                  router.push(agent.status === "protected" ? `/agents/${agent.id}` : `/onboarding?resume=${agent.id}`)
                }
                onDelete={async () => {
                  if (!address) throw new Error("Your wallet disconnected -- reconnect to delete this agent.");
                  await deleteAgent(agent.id, address as `0x${string}`, signAgentAction);
                  removeCreatedAgent(agent.id);
                  setMyAgents(previous =>
                    previous ? previous.filter(candidate => candidate.id !== agent.id) : previous,
                  );
                }}
              />
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
