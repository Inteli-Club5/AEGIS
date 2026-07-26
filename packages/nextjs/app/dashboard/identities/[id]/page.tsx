"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AppTopbar } from "~~/components/layout/AppTopbar";
import { Badge } from "~~/components/ui/Badge";
import { Button } from "~~/components/ui/Button";
import { IndexedFact } from "~~/features/dashboard/components/IndexedFact";
import { ConnectGate } from "~~/features/wallet/components/ConnectGate";
import { useConnectWallet } from "~~/features/wallet/components/ConnectWalletProvider";
import { fetchAgenticIdentity } from "~~/lib/onchain-data/browser";
import { getZeroGExplorerAddressLink, getZeroGExplorerTxLink } from "~~/lib/onchain-data/explorers";
import type { AgenticIdentityOwnerChange } from "~~/lib/onchain-data/types";
import { formatDateTime, truncateAddress } from "~~/lib/utils/format";

export default function AgenticIdentityDetailPage() {
  const { status } = useConnectWallet();
  const params = useParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const [cursorHistory, setCursorHistory] = useState<Array<string | null>>([null]);
  const cursor = cursorHistory.at(-1) ?? null;
  const identity = useQuery({
    queryKey: ["aegis-0g-identity", id, cursor],
    queryFn: ({ signal }) => fetchAgenticIdentity(id, { ownerChangeLimit: 25, ownerChangeCursor: cursor }, signal),
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
        <Link href="/dashboard/identities" className="text-body-sm font-medium text-brand-strong hover:underline">
          ← All Agentic Identities
        </Link>

        {identity.isPending ? (
          <div className="mt-6 h-96 animate-pulse rounded-lg bg-surface" />
        ) : identity.isError ? (
          <section role="alert" className="mt-6 rounded-lg border border-danger/25 bg-danger-soft p-6">
            <h1 className="text-h3 text-danger">Agentic Identity unavailable</h1>
            <p className="mt-2 text-body-sm text-muted">
              {identity.error instanceof Error ? identity.error.message : "The 0G Subgraph query failed."}
            </p>
            <Button className="mt-4" variant="secondary" onClick={() => identity.refetch()}>
              Retry GraphQL
            </Button>
          </section>
        ) : (
          <IdentityDetail
            data={identity.data}
            page={cursorHistory.length}
            hasPrevious={cursorHistory.length > 1}
            previous={() => setCursorHistory(history => history.slice(0, -1))}
            next={nextCursor => setCursorHistory(history => [...history, nextCursor])}
          />
        )}
      </main>
    </>
  );
}

function IdentityDetail({
  data,
  page,
  hasPrevious,
  previous,
  next,
}: {
  data: Awaited<ReturnType<typeof fetchAgenticIdentity>>;
  page: number;
  hasPrevious: boolean;
  previous: () => void;
  next: (cursor: string) => void;
}) {
  const { item, freshness, ownerChanges } = data;
  return (
    <article className="mt-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-overline uppercase text-subtle">0G Galileo · The Graph</p>
          <h1 className="mt-1 text-h2">Agentic Identity #{item.tokenId}</h1>
          <p className="mt-2 break-all font-mono text-mono-sm text-muted">{item.id}</p>
        </div>
        <Badge tone={item.status === "ACTIVE" ? "success" : "neutral"}>{item.status}</Badge>
      </div>

      {(!freshness.available || freshness.stale || freshness.hasIndexingErrors === true) && (
        <div
          role="status"
          className="mt-5 rounded-md border border-warning/30 bg-warning-soft px-4 py-3 text-body-sm text-warning"
        >
          {!freshness.available
            ? "The 0G Subgraph is unavailable; no RPC or application database fallback was used."
            : freshness.hasIndexingErrors === true
              ? "The 0G Subgraph reports indexing errors; ownership may lag confirmed events."
              : "The 0G Subgraph is stale relative to its indexed timestamp."}
        </div>
      )}

      <section className="mt-6 rounded-lg border border-border bg-surface-raised p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-h4">Current indexed identity</h2>
            <p className="mt-1 text-caption text-muted">Ownership is derived only from public Transfer events.</p>
          </div>
          <Link
            href={`/dashboard/agents?agenticIdTokenId=${encodeURIComponent(item.tokenId)}`}
            className="text-body-sm font-medium text-brand-strong hover:underline"
          >
            Find Hedera agent candidate
          </Link>
        </div>
        <dl className="mt-5 grid gap-x-8 gap-y-5 md:grid-cols-2">
          <IndexedFact label="Entity ID" value={item.id} />
          <IndexedFact label="Token ID" value={item.tokenId} />
          <IndexedFact label="Contract" value={item.contract} href={getZeroGExplorerAddressLink(item.contract)} />
          <IndexedFact label="Owner" value={item.owner} href={getZeroGExplorerAddressLink(item.owner)} />
          <IndexedFact label="Status" value={item.status} />
          <IndexedFact label="Mint event observed" value={item.seenMint ? "Yes" : "No"} />
          <IndexedFact label="Current usage authorizations" value={item.currentAuthorizationCount} />
          <IndexedFact label="Authorization events" value={item.totalAuthorizationEvents} />
          <IndexedFact label="First seen" value={formatDateTime(Number(item.firstSeenAt))} />
          <IndexedFact label="Last updated" value={formatDateTime(Number(item.lastUpdatedAt))} />
        </dl>
      </section>

      <section className="mt-6 rounded-lg border border-border bg-surface-raised p-6 shadow-sm">
        <h2 className="text-h4">Chain references</h2>
        <dl className="mt-5 grid gap-x-8 gap-y-5 md:grid-cols-2">
          <IndexedFact label="Source chain" value="0G Galileo" />
          <IndexedFact label="Current block" value={item.blockNumber} />
          <IndexedFact label="Current timestamp" value={formatDateTime(Number(item.blockTimestamp))} />
          <IndexedFact label="Current log index" value={item.logIndex} />
          <IndexedFact
            label="Current transaction"
            value={item.transactionHash}
            href={getZeroGExplorerTxLink(item.transactionHash)}
          />
          <IndexedFact label="Indexed block" value={freshness.indexedBlock?.toString() ?? "Unknown"} />
          {item.mintTransactionHash && (
            <IndexedFact
              label="Mint transaction"
              value={item.mintTransactionHash}
              href={getZeroGExplorerTxLink(item.mintTransactionHash)}
            />
          )}
          {item.mintBlockNumber && <IndexedFact label="Mint block" value={item.mintBlockNumber} />}
          {item.mintBlockTimestamp && (
            <IndexedFact label="Mint timestamp" value={formatDateTime(Number(item.mintBlockTimestamp))} />
          )}
          <IndexedFact label="Last GraphQL refresh" value={new Date(freshness.checkedAt).toLocaleString()} />
        </dl>
      </section>

      <section className="mt-8">
        <div>
          <h2 className="text-h3">Owner changes</h2>
          <p className="mt-1 text-body-sm text-muted">
            Immutable mint, transfer, and burn facts in stable entity-ID order.
          </p>
        </div>
        <div className="mt-5">
          <OwnerChangeTable items={ownerChanges.items} />
        </div>
        <nav className="mt-5 flex items-center justify-between" aria-label="Identity owner change pages">
          <Button variant="secondary" disabled={!hasPrevious} onClick={previous}>
            Previous
          </Button>
          <span className="font-mono text-mono-sm text-muted">Page {page}</span>
          <Button
            variant="secondary"
            disabled={!ownerChanges.nextCursor}
            onClick={() => ownerChanges.nextCursor && next(ownerChanges.nextCursor)}
          >
            Next
          </Button>
        </nav>
      </section>

      <p className="mt-5 text-caption text-muted">
        This Subgraph indexes fixed-width ownership, usage-authorization, delegation, and transaction facts. It does not
        fetch metadata URIs, dynamic descriptions, private metadata, storage payloads, or decrypted content.
      </p>
    </article>
  );
}

function OwnerChangeTable({ items }: { items: AgenticIdentityOwnerChange[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface-raised px-5 py-8 text-center shadow-sm">
        <p className="text-body-sm font-semibold">No indexed owner changes</p>
        <p className="mt-1 text-caption text-muted">The 0G Subgraph returned no transfer facts for this page.</p>
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface-raised shadow-sm">
      <table className="w-full min-w-[920px]" aria-label="Agentic Identity owner changes">
        <thead>
          <tr className="border-b border-border">
            <Header>Timestamp</Header>
            <Header>Type</Header>
            <Header>Previous owner</Header>
            <Header>New owner</Header>
            <Header>Block / log</Header>
            <Header>Transaction</Header>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {items.map(item => (
            <tr key={item.id} className="transition-colors hover:bg-brand-soft/30">
              <Cell>{formatDateTime(Number(item.blockTimestamp))}</Cell>
              <Cell>
                <Badge tone={item.changeType === "MINT" ? "success" : item.changeType === "BURN" ? "danger" : "info"}>
                  {item.changeType}
                </Badge>
              </Cell>
              <Cell title={item.previousOwner}>{truncateAddress(item.previousOwner)}</Cell>
              <Cell title={item.newOwner}>{truncateAddress(item.newOwner)}</Cell>
              <Cell>
                {item.blockNumber} / {item.logIndex}
              </Cell>
              <Cell title={item.transactionHash}>
                <a
                  className="text-brand-strong underline-offset-4 hover:underline"
                  href={getZeroGExplorerTxLink(item.transactionHash)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {truncateAddress(item.transactionHash)}
                </a>
              </Cell>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Header({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-3 text-left font-mono text-overline uppercase text-muted">{children}</th>;
}

function Cell({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <td className="px-4 py-3.5 font-mono text-mono-sm" title={title}>
      {children}
    </td>
  );
}
