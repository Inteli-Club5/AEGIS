"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AppTopbar } from "~~/components/layout/AppTopbar";
import { Button } from "~~/components/ui/Button";
import { IndexerFreshness } from "~~/features/dashboard/components/IndexerFreshness";
import { OnchainAgentCard } from "~~/features/dashboard/components/OnchainAgentCard";
import { OnchainSupport } from "~~/features/dashboard/components/OnchainSupport";
import { OnchainStatStrip, StatStripSkeleton } from "~~/features/dashboard/components/StatStrip";
import { TeeMLValidationTable } from "~~/features/dashboard/components/TeeMLValidationTable";
import { ConnectGate } from "~~/features/wallet/components/ConnectGate";
import { useConnectWallet } from "~~/features/wallet/components/ConnectWalletProvider";
import { fetchOnchainOverview } from "~~/lib/onchain-data/browser";
import { validationFeedState } from "~~/lib/onchain-data/presentation";

export default function DashboardPage() {
  const router = useRouter();
  const { status } = useConnectWallet();
  const overview = useQuery({
    queryKey: ["aegis-onchain-overview"],
    queryFn: ({ signal }) => fetchOnchainOverview(signal),
    enabled: status === "connected",
    refetchInterval: 15_000,
  });

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
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-overline uppercase text-subtle">The Graph · GraphQL</p>
            <h1 className="mt-1 text-h2">Onchain overview</h1>
            <p className="mt-1 text-body-sm text-muted">
              Confirmed Hedera and 0G history comes only from the two AEGIS Subgraphs.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => router.push("/dashboard/agents")}>
              Browse agents
            </Button>
            <Button variant="secondary" onClick={() => router.push("/dashboard/identities")}>
              Browse identities
            </Button>
            <Button variant="secondary" onClick={() => router.push("/dashboard/validations")}>
              Browse validations
            </Button>
            <Button variant="secondary" onClick={() => router.push("/dashboard/audit-copilot")}>
              Audit Copilot
            </Button>
            <Button onClick={() => router.push("/onboarding")}>Protect a new agent</Button>
          </div>
        </div>

        {overview.isPending ? (
          <div className="mt-7 space-y-10">
            <StatStripSkeleton count={8} />
            <div className="h-56 animate-pulse rounded-lg bg-surface" />
          </div>
        ) : overview.isError ? (
          <section role="alert" className="mt-7 rounded-lg border border-danger/25 bg-danger-soft p-6">
            <h2 className="text-h4 text-danger">Indexed onchain data is unavailable</h2>
            <p className="mt-2 text-body-sm text-muted">
              {overview.error instanceof Error ? overview.error.message : "The Graph query failed."} Execution and
              policy enforcement remain independent from this read layer.
            </p>
            <Button className="mt-4" variant="secondary" onClick={() => overview.refetch()}>
              Retry GraphQL
            </Button>
          </section>
        ) : (
          <div className="mt-7 space-y-12">
            <OnchainStatStrip metrics={overview.data.metrics} />
            {(overview.data.sourceErrors.hedera || overview.data.sourceErrors.zeroG) && (
              <div
                role="status"
                className="rounded-lg border border-warning/30 bg-warning-soft px-5 py-4 text-body-sm text-warning"
              >
                {[overview.data.sourceErrors.hedera, overview.data.sourceErrors.zeroG].filter(Boolean).join(" ")} The
                available source remains visible; no fallback read path was used.
              </div>
            )}
            <IndexerFreshness freshness={overview.data.freshness} />

            <section>
              <div className="flex items-end justify-between gap-3">
                <div>
                  <h2 className="text-h3">Indexed agents</h2>
                  <p className="mt-1 text-body-sm text-muted">
                    Cross-chain relationships are joined in the client and partial states remain visible.
                  </p>
                  {(!overview.data.agentCollection.hederaComplete || !overview.data.agentCollection.zeroGComplete) && (
                    <p className="mt-1 text-caption text-warning">
                      Showing a deterministic window of up to {overview.data.agentCollection.limitPerSource} records per
                      source; missing-side labels are limited to this window.
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-4 text-body-sm font-medium">
                  <Link href="/dashboard/agents" className="text-brand-strong hover:underline">
                    All Hedera agents
                  </Link>
                  <Link href="/dashboard/identities" className="text-brand-strong hover:underline">
                    All 0G identities
                  </Link>
                </div>
              </div>
              {overview.data.agents.length === 0 ? (
                <div className="mt-5 rounded-lg border border-border bg-surface-raised px-5 py-8 text-center">
                  <p className="text-body-sm font-semibold">No onchain agents indexed yet</p>
                  <p className="mt-1 text-caption text-muted">
                    {overview.data.sourceErrors.hedera || overview.data.sourceErrors.zeroG
                      ? "The available Subgraph returned no agent entities; the unavailable source was not replaced."
                      : "Both Subgraphs returned empty agent collections."}
                  </p>
                </div>
              ) : (
                <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {overview.data.agents.slice(0, 9).map(agent => (
                    <OnchainAgentCard
                      key={agent.id}
                      agent={agent}
                      hederaAvailable={overview.data.freshness.hedera.available}
                      onOpen={() =>
                        router.push(
                          agent.agentIdHash
                            ? `/dashboard/agents/${encodeURIComponent(agent.agentIdHash)}`
                            : agent.zeroG
                              ? `/dashboard/identities/${encodeURIComponent(agent.zeroG.id)}`
                              : "/dashboard/agents",
                        )
                      }
                    />
                  ))}
                </div>
              )}
            </section>

            <section>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-h3">Recent TeeML validations</h2>
                  <p className="mt-1 text-body-sm text-muted">
                    Only sanitized ALLOW and DENY records verified before registry submission.
                  </p>
                </div>
                <Link
                  href="/dashboard/validations"
                  className="text-body-sm font-medium text-brand-strong hover:underline"
                >
                  View filters and search
                </Link>
              </div>
              <div className="mt-5">
                {validationFeedState(overview.data.sourceErrors.hedera, overview.data.recentValidations.length) ===
                "unavailable" ? (
                  <div className="rounded-lg border border-warning/25 bg-warning-soft px-5 py-6">
                    <p className="text-body-sm font-semibold text-warning">Hedera Subgraph unavailable</p>
                    <p className="mt-1 text-caption text-muted">
                      Recent validations could not be queried. No empty result or fallback history is being shown.
                    </p>
                  </div>
                ) : (
                  <TeeMLValidationTable items={overview.data.recentValidations} />
                )}
              </div>
            </section>

            <OnchainSupport support={overview.data.support} />
          </div>
        )}
      </main>
    </>
  );
}
