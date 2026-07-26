"use client";

import Link from "next/link";
import { AppTopbar } from "~~/components/layout/AppTopbar";
import { ConnectGate } from "~~/features/wallet/components/ConnectGate";
import { useConnectWallet } from "~~/features/wallet/components/ConnectWalletProvider";

export default function PaymentsPage() {
  // TODO(TG-EVENTS-001): Enable this onchain business view after the execution module emits the documented sanitized event and the Hedera Subgraph indexes it. Do not replace the missing event with RPC, database, or fixture data. Remove this TODO after the producer, mapping, live indexing, GraphQL, and dashboard acceptance tests pass.
  const { status } = useConnectWallet();
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
      <main className="mx-auto w-full max-w-[760px] flex-1 px-6 py-10">
        <Link href="/dashboard" className="text-body-sm font-medium text-brand-strong hover:underline">
          ← Back to overview
        </Link>
        <section className="mt-6 rounded-lg border border-border bg-surface p-6 shadow-sm">
          <h1 className="text-h2">Payments</h1>
          <p className="mt-3 text-body-sm text-muted">
            The current Hedera contracts do not emit a dedicated AEGIS payment event that can be indexed into an
            unambiguous Payment entity. The dashboard therefore does not infer payments from Safe value transfers,
            private databases, RPC traces, or explorer data.
          </p>
          <p className="mt-3 text-body-sm text-muted">
            A separate contract/event task is required before payment list, filters, metrics, and detail pages can be
            implemented honestly through The Graph.
          </p>
        </section>
      </main>
    </>
  );
}
