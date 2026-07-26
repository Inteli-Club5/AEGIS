"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AppTopbar } from "~~/components/layout/AppTopbar";
import { ConnectGate } from "~~/features/wallet/components/ConnectGate";
import { useConnectWallet } from "~~/features/wallet/components/ConnectWalletProvider";
import { fetchPolicyReference } from "~~/lib/onchain-data/coverageBrowser";
import type { PolicyReference } from "~~/lib/onchain-data/types";
import { formatDateTime } from "~~/lib/utils/format";

export default function PolicyReferenceDetailPage() {
  const { status } = useConnectWallet();
  const params = useParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const policy = useQuery({
    queryKey: ["aegis-policy-reference", id],
    queryFn: ({ signal }) => fetchPolicyReference(id, signal),
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
      <main className="mx-auto w-full max-w-[900px] flex-1 px-6 py-10">
        <Link href="/dashboard/policies" className="text-body-sm font-medium text-brand-strong hover:underline">
          ← All policy references
        </Link>
        {policy.isPending ? (
          <div className="mt-6 h-80 animate-pulse rounded-lg bg-surface" />
        ) : policy.isError ? null : (
          <PolicyDetail item={policy.data.item} freshness={policy.data.freshness} />
        )}
      </main>
    </>
  );
}

function PolicyDetail({
  item,
  freshness,
}: {
  item: PolicyReference;
  freshness: Awaited<ReturnType<typeof fetchPolicyReference>>["freshness"];
}) {
  return (
    <article className="mt-6">
      <p className="font-mono text-overline uppercase text-subtle">Hedera testnet · Derived indexed aggregate</p>
      <h1 className="mt-1 text-h2">Policy reference detail</h1>
      <p className="mt-2 break-all font-mono text-mono-sm text-muted">{item.policyHash}</p>

      <section className="mt-6 rounded-lg border border-border bg-surface-raised p-6 shadow-sm">
        <h2 className="text-h4">Indexed policy metrics</h2>
        <dl className="mt-5 grid gap-x-8 gap-y-5 md:grid-cols-2">
          <Fact label="Policy hash" value={item.policyHash} />
          <Fact label="Validation count" value={item.validationCount} />
          <Fact label="ALLOW count" value={item.allowCount} />
          <Fact label="DENY count" value={item.denyCount} />
          <Fact label="First referenced" value={formatDateTime(Number(item.firstReferencedAt))} />
          <Fact label="Last referenced" value={formatDateTime(Number(item.lastReferencedAt))} />
          <Fact label="Source chain" value="Hedera testnet" />
          <Fact label="Indexed block" value={freshness.indexedBlock?.toString() ?? "Unknown"} />
        </dl>
      </section>

      <p className="mt-5 text-caption text-muted">
        This entity is a deterministic aggregate over TeeML validation events, so it has no invented transaction hash or
        block of its own. The linked validation facts provide the underlying transaction and block references.
      </p>
      <Link
        className="mt-4 inline-flex font-medium text-brand-strong hover:underline"
        href={`/dashboard/validations?policyHash=${encodeURIComponent(item.policyHash)}`}
      >
        View underlying TeeML validations
      </Link>
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
