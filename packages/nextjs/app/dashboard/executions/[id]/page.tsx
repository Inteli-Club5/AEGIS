"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { AppTopbar } from "~~/components/layout/AppTopbar";
import { Badge } from "~~/components/ui/Badge";
import { ConnectGate } from "~~/features/wallet/components/ConnectGate";
import { useConnectWallet } from "~~/features/wallet/components/ConnectWalletProvider";
import { fetchSafeExecution } from "~~/lib/onchain-data/coverageBrowser";
import type { SafeExecution } from "~~/lib/onchain-data/types";
import { formatDateTime } from "~~/lib/utils/format";
import { getBlockExplorerTxLink } from "~~/utils/scaffold-hbar/networks";

export default function SafeExecutionDetailPage() {
  const { status } = useConnectWallet();
  const params = useParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const execution = useQuery({
    queryKey: ["aegis-safe-execution", id],
    queryFn: ({ signal }) => fetchSafeExecution(id, signal),
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
      <main className="mx-auto w-full max-w-[960px] flex-1 px-6 py-10">
        <Link href="/dashboard/executions" className="text-body-sm font-medium text-brand-strong hover:underline">
          ← All Safe executions
        </Link>
        {execution.isPending ? (
          <div className="mt-6 h-96 animate-pulse rounded-lg bg-surface" />
        ) : execution.isError ? null : (
          <ExecutionDetail item={execution.data.item} freshness={execution.data.freshness} />
        )}
      </main>
    </>
  );
}

function ExecutionDetail({
  item,
  freshness,
}: {
  item: SafeExecution;
  freshness: Awaited<ReturnType<typeof fetchSafeExecution>>["freshness"];
}) {
  const transactionUrl = getBlockExplorerTxLink(296, item.transactionHash);
  return (
    <article className="mt-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-overline uppercase text-subtle">Hedera testnet · Safe event</p>
          <h1 className="mt-1 text-h2">Safe execution detail</h1>
          <p className="mt-2 break-all font-mono text-mono-sm text-muted">{item.id}</p>
        </div>
        <Badge tone={item.success ? "success" : "danger"}>{item.success ? "SUCCESS" : "FAILURE"}</Badge>
      </div>

      <section className="mt-6 rounded-lg border border-border bg-surface-raised p-6 shadow-sm">
        <h2 className="text-h4">Indexed execution</h2>
        <dl className="mt-5 grid gap-x-8 gap-y-5 md:grid-cols-2">
          <Fact label="Safe" value={item.safe} />
          <Fact label="Agent ID hash" value={item.agentIdHash ?? "Not linked by an indexed event"} />
          <Fact label="Safe transaction hash" value={item.safeTxHash} />
          <Fact label="Safe gas refund (raw base units; not a business payment)" value={item.refundPayment} />
          <Fact label="Block" value={item.blockNumber} />
          <Fact label="Timestamp" value={formatDateTime(Number(item.blockTimestamp))} />
          <Fact label="Log index" value={item.logIndex} />
          <Fact label="Indexed block" value={freshness.indexedBlock?.toString() ?? "Unknown"} />
          <div className="md:col-span-2">
            <dt className="text-label text-muted">Transaction hash</dt>
            <dd className="mt-1 break-all font-mono text-mono-sm">
              {transactionUrl ? (
                <a
                  className="inline-flex items-center gap-1 text-brand-strong hover:underline"
                  href={transactionUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  {item.transactionHash}
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                </a>
              ) : (
                item.transactionHash
              )}
            </dd>
          </div>
        </dl>
      </section>

      <div className="mt-5 flex flex-wrap gap-4 text-body-sm">
        {item.agentIdHash && (
          <Link
            className="font-medium text-brand-strong hover:underline"
            href={`/dashboard/validations?agentIdHash=${encodeURIComponent(item.agentIdHash)}`}
          >
            Validations for linked agent
          </Link>
        )}
        <Link
          className="font-medium text-brand-strong hover:underline"
          href={`/dashboard/executions?safe=${encodeURIComponent(item.safe)}`}
        >
          More executions by this Safe
        </Link>
      </div>
    </article>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-label text-muted">{label}</dt>
      <dd className="mt-1 break-all font-mono text-mono-sm">{value}</dd>
    </div>
  );
}
