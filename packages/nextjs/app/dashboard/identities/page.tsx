"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AppTopbar } from "~~/components/layout/AppTopbar";
import { Badge } from "~~/components/ui/Badge";
import { Button } from "~~/components/ui/Button";
import { ConnectGate } from "~~/features/wallet/components/ConnectGate";
import { useConnectWallet } from "~~/features/wallet/components/ConnectWalletProvider";
import { fetchAgenticIdentities } from "~~/lib/onchain-data/browser";
import type { IdentityFilters } from "~~/lib/onchain-data/queries";
import type { AgenticIdentity } from "~~/lib/onchain-data/types";
import { formatDateTime, truncateAddress } from "~~/lib/utils/format";

type DraftFilters = {
  owner: string;
  contract: string;
  tokenId: string;
  status: "" | "ACTIVE" | "BURNED";
  dateFrom: string;
  dateTo: string;
};

export default function AgenticIdentitiesPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <AgenticIdentitiesContent />
    </Suspense>
  );
}

function AgenticIdentitiesContent() {
  const searchParams = useSearchParams();
  const { status } = useConnectWallet();
  const [draft, setDraft] = useState<DraftFilters>(() => ({
    owner: searchParams.get("owner") ?? "",
    contract: searchParams.get("contract") ?? "",
    tokenId: searchParams.get("tokenId") ?? "",
    status: readStatus(searchParams.get("status")),
    dateFrom: "",
    dateTo: "",
  }));
  const [filters, setFilters] = useState<IdentityFilters>(() => buildFilters(draft));
  const [cursorHistory, setCursorHistory] = useState<Array<string | null>>([null]);
  const cursor = cursorHistory.at(-1) ?? null;
  const stableFilters = useMemo(() => JSON.stringify(filters), [filters]);
  const identities = useQuery({
    queryKey: ["aegis-0g-identities", cursor, stableFilters],
    queryFn: ({ signal }) => fetchAgenticIdentities({ limit: 25, cursor, filters }, signal),
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
            <p className="font-mono text-overline uppercase text-subtle">0G Galileo Subgraph</p>
            <h1 className="mt-1 text-h2">Agentic Identities</h1>
            <p className="mt-1 text-body-sm text-muted">
              Public ERC-721 ownership facts only; private or decrypted metadata is never queried.
            </p>
          </div>
          <div className="flex gap-4 text-body-sm font-medium">
            <Link href="/dashboard/agents" className="text-brand-strong hover:underline">
              Browse Hedera agents
            </Link>
            <Link href="/dashboard" className="text-brand-strong hover:underline">
              Overview
            </Link>
          </div>
        </div>

        <form
          className="mt-7 rounded-lg border border-border bg-surface-raised p-5 shadow-sm"
          onSubmit={event => {
            event.preventDefault();
            setFilters(buildFilters(draft));
            setCursorHistory([null]);
          }}
        >
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Field label="Owner address">
              <input
                className="input input-bordered w-full font-mono"
                value={draft.owner}
                placeholder="0x…"
                onChange={event => setDraft(current => ({ ...current, owner: event.target.value }))}
              />
            </Field>
            <Field label="Agentic ID contract">
              <input
                className="input input-bordered w-full font-mono"
                value={draft.contract}
                placeholder="0x…"
                onChange={event => setDraft(current => ({ ...current, contract: event.target.value }))}
              />
            </Field>
            <Field label="Token ID">
              <input
                className="input input-bordered w-full font-mono"
                inputMode="numeric"
                value={draft.tokenId}
                placeholder="e.g. 7"
                onChange={event => setDraft(current => ({ ...current, tokenId: event.target.value }))}
              />
            </Field>
            <Field label="Status">
              <select
                className="select select-bordered w-full"
                value={draft.status}
                onChange={event =>
                  setDraft(current => ({ ...current, status: event.target.value as DraftFilters["status"] }))
                }
              >
                <option value="">Active and burned</option>
                <option value="ACTIVE">ACTIVE</option>
                <option value="BURNED">BURNED</option>
              </select>
            </Field>
            <Field label="Updated from (UTC)">
              <input
                className="input input-bordered w-full"
                type="date"
                value={draft.dateFrom}
                onChange={event => setDraft(current => ({ ...current, dateFrom: event.target.value }))}
              />
            </Field>
            <Field label="Updated to (UTC)">
              <input
                className="input input-bordered w-full"
                type="date"
                value={draft.dateTo}
                onChange={event => setDraft(current => ({ ...current, dateTo: event.target.value }))}
              />
            </Field>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button type="submit">Apply filters</Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                const empty = emptyDraft();
                setDraft(empty);
                setFilters({});
                setCursorHistory([null]);
              }}
            >
              Clear
            </Button>
          </div>
        </form>

        <section className="mt-7" aria-live="polite">
          {identities.isPending ? (
            <div className="h-64 animate-pulse rounded-lg bg-surface" />
          ) : identities.isError ? (
            <div role="alert" className="rounded-lg border border-danger/25 bg-danger-soft p-5">
              <h2 className="text-h4 text-danger">GraphQL query failed</h2>
              <p className="mt-2 text-body-sm text-muted">
                {identities.error instanceof Error ? identities.error.message : "The 0G Subgraph is unavailable."}
              </p>
              <Button className="mt-4" variant="secondary" onClick={() => identities.refetch()}>
                Retry
              </Button>
            </div>
          ) : (
            <>
              <FreshnessLine freshness={identities.data.freshness} />
              <IdentityTable items={identities.data.items} />
              <nav className="mt-5 flex items-center justify-between" aria-label="Agentic Identity pages">
                <Button
                  variant="secondary"
                  disabled={cursorHistory.length === 1}
                  onClick={() => setCursorHistory(history => history.slice(0, -1))}
                >
                  Previous
                </Button>
                <span className="font-mono text-mono-sm text-muted">Page {cursorHistory.length}</span>
                <Button
                  variant="secondary"
                  disabled={!identities.data.nextCursor}
                  onClick={() => {
                    if (identities.data.nextCursor) {
                      setCursorHistory(history => [...history, identities.data.nextCursor]);
                    }
                  }}
                >
                  Next
                </Button>
              </nav>
            </>
          )}
        </section>
      </main>
    </>
  );
}

function IdentityTable({ items }: { items: AgenticIdentity[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface-raised px-5 py-8 text-center shadow-sm">
        <p className="text-body-sm font-semibold">No indexed Agentic Identities</p>
        <p className="mt-1 text-caption text-muted">The 0G Subgraph returned no identity matching these filters.</p>
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface-raised shadow-sm">
      <table className="w-full min-w-[940px]" aria-label="0G Agentic Identities">
        <thead>
          <tr className="border-b border-border">
            <Header>Token</Header>
            <Header>Owner</Header>
            <Header>Contract</Header>
            <Header>Status</Header>
            <Header>Mint observed</Header>
            <Header>Last update</Header>
            <Header>Source</Header>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {items.map(item => (
            <tr key={item.id} className="transition-colors hover:bg-brand-soft/30">
              <Cell>
                <Link
                  href={`/dashboard/identities/${encodeURIComponent(item.id)}`}
                  className="text-brand-strong underline-offset-4 hover:underline"
                >
                  #{item.tokenId}
                </Link>
              </Cell>
              <Cell title={item.owner}>{truncateAddress(item.owner)}</Cell>
              <Cell title={item.contract}>{truncateAddress(item.contract)}</Cell>
              <Cell>
                <Badge tone={item.status === "ACTIVE" ? "success" : "neutral"}>{item.status}</Badge>
              </Cell>
              <Cell>{item.seenMint ? "Yes" : "No"}</Cell>
              <Cell>{formatDateTime(Number(item.lastUpdatedAt))}</Cell>
              <Cell>
                <Badge tone="info">0G Galileo</Badge>
              </Cell>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function buildFilters(draft: DraftFilters): IdentityFilters {
  const filters: IdentityFilters = {};
  if (draft.owner.trim()) filters.owner = draft.owner.trim();
  if (draft.contract.trim()) filters.contract = draft.contract.trim();
  if (draft.tokenId.trim()) filters.tokenId = draft.tokenId.trim();
  if (draft.status) filters.status = draft.status;
  if (draft.dateFrom) filters.dateFrom = toUnixSeconds(draft.dateFrom, false);
  if (draft.dateTo) filters.dateTo = toUnixSeconds(draft.dateTo, true);
  return filters;
}

function emptyDraft(): DraftFilters {
  return { owner: "", contract: "", tokenId: "", status: "", dateFrom: "", dateTo: "" };
}

function readStatus(value: string | null): DraftFilters["status"] {
  return value === "ACTIVE" || value === "BURNED" ? value : "";
}

function toUnixSeconds(date: string, endOfDay: boolean): number {
  return Math.floor(new Date(`${date}T${endOfDay ? "23:59:59" : "00:00:00"}Z`).getTime() / 1_000);
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-label text-muted">{label}</span>
      {children}
    </label>
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

function FreshnessLine({ freshness }: { freshness: Awaited<ReturnType<typeof fetchAgenticIdentities>>["freshness"] }) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3 text-caption text-muted">
      <span>
        Indexed block {freshness.indexedBlock?.toLocaleString() ?? "unknown"} ·{" "}
        {!freshness.available
          ? "Unavailable"
          : freshness.hasIndexingErrors === true
            ? "Indexing errors reported"
            : freshness.stale
              ? "Stale"
              : "Fresh"}
      </span>
      <span>Stable cursor order: indexed identity ID</span>
    </div>
  );
}

function PageSkeleton() {
  return (
    <>
      <AppTopbar />
      <main className="mx-auto w-full max-w-[1200px] flex-1 px-6 py-10">
        <div className="h-80 animate-pulse rounded-lg bg-surface" />
      </main>
    </>
  );
}
