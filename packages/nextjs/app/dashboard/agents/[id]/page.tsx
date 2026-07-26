"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { hederaTestnet } from "viem/chains";
import { AppTopbar } from "~~/components/layout/AppTopbar";
import { Badge } from "~~/components/ui/Badge";
import { IndexedFact } from "~~/features/dashboard/components/IndexedFact";
import { TeeMLValidationTable } from "~~/features/dashboard/components/TeeMLValidationTable";
import { ConnectGate } from "~~/features/wallet/components/ConnectGate";
import { useConnectWallet } from "~~/features/wallet/components/ConnectWalletProvider";
import { fetchHederaAgentSummary } from "~~/lib/onchain-data/browser";
import { formatDateTime } from "~~/lib/utils/format";
import { getBlockExplorerAddressLink, getBlockExplorerTxLink } from "~~/utils/scaffold-hbar/networks";

export default function HederaAgentDetailPage() {
  const { status } = useConnectWallet();
  const params = useParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const agent = useQuery({
    queryKey: ["aegis-hedera-agent", id],
    queryFn: ({ signal }) => fetchHederaAgentSummary(id, signal),
    enabled: status === "connected" && Boolean(id),
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
      <main className="mx-auto w-full max-w-[1040px] flex-1 px-6 py-10">
        <Link href="/dashboard/agents" className="text-body-sm font-medium text-brand-strong hover:underline">
          ← All Hedera agent summaries
        </Link>

        {agent.isPending ? (
          <div className="mt-6 h-96 animate-pulse rounded-lg bg-surface" />
        ) : agent.isError ? null : (
          <AgentDetail data={agent.data} />
        )}
      </main>
    </>
  );
}

function AgentDetail({ data }: { data: Awaited<ReturnType<typeof fetchHederaAgentSummary>> }) {
  const { item, freshness, recentValidations } = data;
  const latestEvidence = recentValidations[0];
  const latestTransactionUrl = latestEvidence
    ? getBlockExplorerTxLink(hederaTestnet.id, latestEvidence.transactionHash)
    : "";

  return (
    <article className="mt-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-overline uppercase text-subtle">Hedera testnet · The Graph</p>
          <h1 className="mt-1 text-h2">Agent onchain summary</h1>
          <p className="mt-2 break-all font-mono text-mono-sm text-muted">{item.agentIdHash}</p>
        </div>
        <Badge tone="info">Indexed summary</Badge>
      </div>

      <section className="mt-6 rounded-lg border border-border bg-surface-raised p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-h4">Canonical indexed fields</h2>
            <p className="mt-1 text-caption text-muted">No plaintext agent metadata is present in this entity.</p>
          </div>
          <Link
            href={`/dashboard/identities?tokenId=${encodeURIComponent(item.agenticIdTokenId)}`}
            className="text-body-sm font-medium text-brand-strong hover:underline"
          >
            Reconcile Agentic ID #{item.agenticIdTokenId}
          </Link>
        </div>
        <dl className="mt-5 grid gap-x-8 gap-y-5 md:grid-cols-2">
          <IndexedFact label="Agent ID hash" value={item.agentIdHash} />
          <IndexedFact label="Safe" value={item.safe} href={getBlockExplorerAddressLink(hederaTestnet, item.safe)} />
          <IndexedFact label="Agentic ID token" value={item.agenticIdTokenId} />
          <IndexedFact label="Entity ID" value={item.id} />
          <IndexedFact label="First indexed activity" value={formatOptionalTimestamp(item.firstActivityAt)} />
          <IndexedFact label="Last indexed activity" value={formatOptionalTimestamp(item.lastActivityAt)} />
        </dl>
      </section>

      <section className="mt-6 rounded-lg border border-border bg-surface-raised p-6 shadow-sm">
        <h2 className="text-h4">Derived metrics</h2>
        <dl className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Validations" value={item.validationCount} />
          <Metric label="ALLOW" value={item.allowCount} />
          <Metric label="DENY" value={item.denyCount} />
          <Metric label="Policies" value={item.policyCount} />
          <Metric label="Executions" value={item.executionCount} />
          <Metric label="Execution success" value={item.executionSuccessCount} />
          <Metric label="Execution failure" value={item.executionFailureCount} />
        </dl>
      </section>

      <section className="mt-6 rounded-lg border border-border bg-surface-raised p-6 shadow-sm">
        <h2 className="text-h4">Latest source event reference</h2>
        {latestEvidence ? (
          <dl className="mt-5 grid gap-x-8 gap-y-5 md:grid-cols-2">
            <IndexedFact
              label="Transaction hash"
              value={latestEvidence.transactionHash}
              href={latestTransactionUrl || undefined}
            />
            <IndexedFact label="Block" value={latestEvidence.blockNumber} />
            <IndexedFact label="Timestamp" value={formatDateTime(Number(latestEvidence.blockTimestamp))} />
            <IndexedFact label="Log index" value={latestEvidence.logIndex} />
            <IndexedFact label="Source chain" value="Hedera testnet" />
            <IndexedFact label="Indexed block" value={freshness.indexedBlock?.toString() ?? "Unknown"} />
          </dl>
        ) : (
          <p className="mt-3 text-body-sm text-muted">
            No registry event was returned in the bounded evidence query. No RPC or private-data fallback was used.
          </p>
        )}
      </section>

      <section className="mt-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-h3">Recent TeeML evidence</h2>
            <p className="mt-1 text-body-sm text-muted">Latest ten immutable registry events for this agent hash.</p>
          </div>
          <Link
            href={`/dashboard/validations?agentIdHash=${encodeURIComponent(item.agentIdHash)}`}
            className="text-body-sm font-medium text-brand-strong hover:underline"
          >
            Browse all validations
          </Link>
        </div>
        <div className="mt-5">
          <TeeMLValidationTable items={recentValidations} />
        </div>
      </section>

      <p className="mt-5 text-caption text-muted">
        This page is reconstructed only from GraphQL entities. It contains hashes, counters, public addresses, and
        transaction references—never private TeeML context or detailed agent reasons.
      </p>
    </article>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-surface p-4">
      <dt className="text-label text-muted">{label}</dt>
      <dd className="mt-1 font-mono text-h4">{value}</dd>
    </div>
  );
}

function formatOptionalTimestamp(value: string | null | undefined): string {
  return value ? formatDateTime(Number(value)) : "Unknown";
}
