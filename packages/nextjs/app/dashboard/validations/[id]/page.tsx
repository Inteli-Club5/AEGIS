"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { AppTopbar } from "~~/components/layout/AppTopbar";
import { Badge } from "~~/components/ui/Badge";
import { Button } from "~~/components/ui/Button";
import { ConnectGate } from "~~/features/wallet/components/ConnectGate";
import { useConnectWallet } from "~~/features/wallet/components/ConnectWalletProvider";
import { fetchTeeMLValidation } from "~~/lib/onchain-data/browser";
import type { TeeMLValidation } from "~~/lib/onchain-data/types";
import { formatDateTime } from "~~/lib/utils/format";
import { getBlockExplorerTxLink } from "~~/utils/scaffold-hbar/networks";

export default function TeeMLValidationDetailPage() {
  const { status } = useConnectWallet();
  const params = useParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const validation = useQuery({
    queryKey: ["aegis-teeml-validation", id],
    queryFn: ({ signal }) => fetchTeeMLValidation(id, signal),
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
        <Link href="/dashboard/validations" className="text-body-sm font-medium text-brand-strong hover:underline">
          ← All TeeML validations
        </Link>

        {validation.isPending ? (
          <div className="mt-6 h-96 animate-pulse rounded-lg bg-surface" />
        ) : validation.isError ? (
          <section role="alert" className="mt-6 rounded-lg border border-danger/25 bg-danger-soft p-6">
            <h1 className="text-h3 text-danger">Validation unavailable</h1>
            <p className="mt-2 text-body-sm text-muted">
              {validation.error instanceof Error ? validation.error.message : "The Hedera Subgraph query failed."}
            </p>
            <Button className="mt-4" variant="secondary" onClick={() => validation.refetch()}>
              Retry GraphQL
            </Button>
          </section>
        ) : (
          <ValidationDetail item={validation.data.item} freshness={validation.data.freshness} />
        )}
      </main>
    </>
  );
}

function ValidationDetail({
  item,
  freshness,
}: {
  item: TeeMLValidation;
  freshness: Awaited<ReturnType<typeof fetchTeeMLValidation>>["freshness"];
}) {
  const transactionUrl = getBlockExplorerTxLink(296, item.transactionHash);
  return (
    <article className="mt-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-overline uppercase text-subtle">Hedera testnet · TeeML registry</p>
          <h1 className="mt-1 text-h2">Validation detail</h1>
          <p className="mt-2 break-all font-mono text-mono-sm text-muted">{item.id}</p>
        </div>
        <Badge tone={item.verdict === "ALLOW" ? "success" : "danger"}>{item.verdict}</Badge>
      </div>

      {(!freshness.available || freshness.stale || freshness.hasIndexingErrors === true) && (
        <div
          role="status"
          className="mt-5 rounded-md border border-warning/30 bg-warning-soft px-4 py-3 text-body-sm text-warning"
        >
          {!freshness.available
            ? "The Hedera Subgraph is unavailable; no alternate read source was used."
            : freshness.hasIndexingErrors === true
              ? "The Subgraph reports indexing errors; this entity may not reflect the current indexed head."
              : "The indexed block is stale relative to its timestamp."}
        </div>
      )}

      <section className="mt-6 rounded-lg border border-border bg-surface-raised p-6 shadow-sm">
        <h2 className="text-h4">Indexed evidence</h2>
        <dl className="mt-5 grid gap-x-8 gap-y-5 md:grid-cols-2">
          <Fact label="Request ID" value={item.requestId} />
          <Fact label="Agent ID hash" value={item.agentIdHash} />
          <Fact label="Agentic ID token" value={item.agenticIdTokenId} />
          <Fact label="Safe" value={item.safe} />
          <Fact label="Policy hash" value={item.policyHash} />
          <Fact label="Action hash" value={item.actionHash} />
          <Fact label="Semantic context hash" value={item.semanticContextHash} />
          <Fact label="TeeML request hash" value={item.teemlRequestHash} />
          <Fact label="Artifact hash" value={item.artifactHash} />
          <Fact label="Model ID hash" value={item.modelIdHash} />
          <Fact label="Reason code hash" value={item.reasonCodeHash} />
          <Fact label="Recorder" value={item.recorder} />
          <Fact label="Schema version" value={String(item.schemaVersion)} />
        </dl>
      </section>

      <section className="mt-6 rounded-lg border border-border bg-surface-raised p-6 shadow-sm">
        <h2 className="text-h4">Chain reference</h2>
        <dl className="mt-5 grid gap-x-8 gap-y-5 md:grid-cols-2">
          <Fact label="Source chain" value="Hedera testnet" />
          <Fact label="Block" value={item.blockNumber} />
          <Fact label="Timestamp" value={formatDateTime(Number(item.blockTimestamp))} />
          <Fact label="Log index" value={item.logIndex} />
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
          <Fact label="Indexed block" value={freshness.indexedBlock?.toString() ?? "Unknown"} />
          <Fact label="Last GraphQL refresh" value={new Date(freshness.checkedAt).toLocaleString()} />
        </dl>
      </section>

      <p className="mt-5 text-caption text-muted">
        This page contains only fixed-size public hashes, structured verdict data, and chain references. No prompt,
        detailed reason, raw TeeML output, private attestation, or private metadata is indexed.
      </p>
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
