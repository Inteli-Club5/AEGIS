"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AppTopbar } from "~~/components/layout/AppTopbar";
import { Badge, type BadgeTone } from "~~/components/ui/Badge";
import { Button } from "~~/components/ui/Button";
import { ConnectGate } from "~~/features/wallet/components/ConnectGate";
import { useConnectWallet } from "~~/features/wallet/components/ConnectWalletProvider";
import { hashCanonicalAgentId } from "~~/lib/onchain-data/aggregate";
import { fetchCrossChainAgents } from "~~/lib/onchain-data/browser";
import type { CrossChainAgentFilters, CrossChainAgentView, IndexerFreshness } from "~~/lib/onchain-data/types";
import { formatDateTime, truncateAddress } from "~~/lib/utils/format";

type DraftFilters = {
  agent: string;
  safe: string;
  owner: string;
  status: "" | "ACTIVE" | "BURNED";
  tokenId: string;
  contract: string;
  dateFrom: string;
  dateTo: string;
};

const STATE_META: Record<CrossChainAgentView["state"], { label: string; tone: BadgeTone }> = {
  complete: { label: "Hedera + 0G", tone: "success" },
  "hedera-only": { label: "Hedera only", tone: "warning" },
  "zero-g-only": { label: "0G only", tone: "warning" },
  ambiguous: { label: "Ambiguous", tone: "danger" },
  mismatch: { label: "Mismatch", tone: "danger" },
};

export default function CrossChainAgentsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <CrossChainAgentsContent />
    </Suspense>
  );
}

function CrossChainAgentsContent() {
  const searchParams = useSearchParams();
  const { status } = useConnectWallet();
  const [draft, setDraft] = useState<DraftFilters>(() => ({
    agent: searchParams.get("agentIdHash") ?? "",
    safe: searchParams.get("safe") ?? "",
    owner: searchParams.get("owner") ?? "",
    status: readStatus(searchParams.get("status")),
    tokenId: searchParams.get("tokenId") ?? searchParams.get("agenticIdTokenId") ?? "",
    contract: searchParams.get("contract") ?? "",
    dateFrom: "",
    dateTo: "",
  }));
  const [filters, setFilters] = useState<CrossChainAgentFilters>(() => buildFilters(draft));
  const [cursorHistory, setCursorHistory] = useState<Array<string | null>>([null]);
  const cursor = cursorHistory.at(-1) ?? null;
  const stableFilters = useMemo(() => JSON.stringify(filters), [filters]);
  const agents = useQuery({
    queryKey: ["aegis-cross-chain-agents", cursor, stableFilters],
    queryFn: ({ signal }) => fetchCrossChainAgents({ limit: 25, cursor, filters }, signal),
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
      <main className="mx-auto w-full max-w-[1280px] flex-1 px-6 py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-overline uppercase text-subtle">Hedera + 0G Subgraphs</p>
            <h1 className="mt-1 text-h2">Cross-chain agents</h1>
            <p className="mt-1 text-body-sm text-muted">
              Canonical bounded windows are joined before filtering; uncertain relationships remain explicit.
            </p>
          </div>
          <div className="flex gap-4 text-body-sm font-medium">
            <Link href="/dashboard/identities" className="text-brand-strong hover:underline">
              0G identities
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
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <TextField
              label="Agent ID or agentIdHash"
              value={draft.agent}
              placeholder="agent-name or 0x…"
              onChange={agent => setDraft(current => ({ ...current, agent }))}
            />
            <TextField
              label="Safe address"
              value={draft.safe}
              placeholder="0x…"
              onChange={safe => setDraft(current => ({ ...current, safe }))}
            />
            <TextField
              label="0G owner"
              value={draft.owner}
              placeholder="0x…"
              onChange={owner => setDraft(current => ({ ...current, owner }))}
            />
            <Field label="Identity status">
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
            <TextField
              label="Agentic ID token"
              value={draft.tokenId}
              placeholder="e.g. 7"
              inputMode="numeric"
              onChange={tokenId => setDraft(current => ({ ...current, tokenId }))}
            />
            <TextField
              label="0G identity contract"
              value={draft.contract}
              placeholder="0x…"
              onChange={contract => setDraft(current => ({ ...current, contract }))}
            />
            <Field label="Activity from (UTC)">
              <input
                className="input input-bordered w-full"
                type="date"
                value={draft.dateFrom}
                onChange={event => setDraft(current => ({ ...current, dateFrom: event.target.value }))}
              />
            </Field>
            <Field label="Activity to (UTC)">
              <input
                className="input input-bordered w-full"
                type="date"
                value={draft.dateTo}
                onChange={event => setDraft(current => ({ ...current, dateTo: event.target.value }))}
              />
            </Field>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button type="submit">Apply combined filters</Button>
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
          {agents.isPending ? (
            <div className="h-64 animate-pulse rounded-lg bg-surface" />
          ) : agents.isError ? null : (
            <>
              <FreshnessLine freshness={agents.data.freshness} />
              <CrossChainAgentTable items={agents.data.items} hasNextPage={agents.data.nextCursor !== null} />
              <Pagination
                page={cursorHistory.length}
                hasPrevious={cursorHistory.length > 1}
                nextCursor={agents.data.nextCursor}
                previous={() => setCursorHistory(history => history.slice(0, -1))}
                next={nextCursor => setCursorHistory(history => [...history, nextCursor])}
              />
            </>
          )}
        </section>
      </main>
    </>
  );
}

function CrossChainAgentTable({ items, hasNextPage }: { items: CrossChainAgentView[]; hasNextPage: boolean }) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface-raised px-5 py-8 text-center shadow-sm">
        <p className="text-body-sm font-semibold">
          {hasNextPage ? "No matches in this pinned source window" : "No indexed agents match these filters"}
        </p>
        <p className="mt-1 text-caption text-muted">
          {hasNextPage
            ? "Continue to the next window; the snapshot and filters remain fixed."
            : "No RPC, explorer, fixture, or database fallback was queried."}
        </p>
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface-raised shadow-sm">
      <table className="w-full min-w-[1120px]" aria-label="Cross-chain indexed agents">
        <thead>
          <tr className="border-b border-border">
            <Header>Agent</Header>
            <Header>Safe</Header>
            <Header>Agentic ID</Header>
            <Header>0G owner</Header>
            <Header>State</Header>
            <Header>ALLOW / DENY</Header>
            <Header>Last activity</Header>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {items.map(item => {
            const state = STATE_META[item.state];
            const tokenId = item.hedera?.agenticIdTokenId ?? item.zeroG?.tokenId;
            const lastActivity = Math.max(
              Number(item.hedera?.lastActivityAt ?? 0),
              Number(item.zeroG?.lastUpdatedAt ?? 0),
            );
            return (
              <tr key={item.id} className="transition-colors hover:bg-brand-soft/30">
                <Cell title={item.agentIdHash ?? undefined}>
                  {item.hedera ? (
                    <Link
                      href={`/dashboard/agents/${encodeURIComponent(item.hedera.id)}`}
                      className="text-brand-strong underline-offset-4 hover:underline"
                    >
                      {truncateAddress(item.hedera.agentIdHash)}
                    </Link>
                  ) : (
                    "Not indexed"
                  )}
                </Cell>
                <Cell title={item.safe ?? undefined}>{item.safe ? truncateAddress(item.safe) : "Not indexed"}</Cell>
                <Cell>
                  {item.zeroG ? (
                    <Link
                      href={`/dashboard/identities/${encodeURIComponent(item.zeroG.id)}`}
                      className="text-brand-strong underline-offset-4 hover:underline"
                    >
                      #{item.zeroG.tokenId}
                    </Link>
                  ) : tokenId ? (
                    `#${tokenId}`
                  ) : (
                    "Not indexed"
                  )}
                </Cell>
                <Cell title={item.zeroG?.owner}>{item.zeroG ? truncateAddress(item.zeroG.owner) : "Not indexed"}</Cell>
                <Cell title={item.warnings.join(" ") || undefined}>
                  <Badge tone={state.tone}>{state.label}</Badge>
                  {item.warnings[0] && (
                    <p className="mt-1 max-w-64 font-sans text-caption text-muted">{item.warnings[0]}</p>
                  )}
                </Cell>
                <Cell>{item.hedera ? `${item.hedera.allowCount} / ${item.hedera.denyCount}` : "Not indexed"}</Cell>
                <Cell>{lastActivity > 0 ? formatDateTime(lastActivity) : "Unknown"}</Cell>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function buildFilters(draft: DraftFilters): CrossChainAgentFilters {
  const filters: CrossChainAgentFilters = {};
  const agent = draft.agent.trim();
  if (agent) {
    if (/^0x[0-9a-fA-F]{64}$/.test(agent)) filters.agentIdHash = agent;
    else filters.agentIdHash = hashCanonicalAgentId(agent);
  }
  if (draft.safe.trim()) filters.safe = draft.safe.trim();
  if (draft.owner.trim()) filters.owner = draft.owner.trim();
  if (draft.status) filters.status = draft.status;
  if (draft.tokenId.trim()) filters.tokenId = draft.tokenId.trim();
  if (draft.contract.trim()) filters.contract = draft.contract.trim();
  if (draft.dateFrom) filters.dateFrom = toUnixSeconds(draft.dateFrom, false);
  if (draft.dateTo) filters.dateTo = toUnixSeconds(draft.dateTo, true);
  return filters;
}

function emptyDraft(): DraftFilters {
  return { agent: "", safe: "", owner: "", status: "", tokenId: "", contract: "", dateFrom: "", dateTo: "" };
}

function readStatus(value: string | null): DraftFilters["status"] {
  return value === "ACTIVE" || value === "BURNED" ? value : "";
}

function toUnixSeconds(date: string, endOfDay: boolean): number {
  return Math.floor(new Date(`${date}T${endOfDay ? "23:59:59" : "00:00:00"}Z`).getTime() / 1_000);
}

function TextField({
  label,
  value,
  placeholder,
  inputMode,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  inputMode?: "numeric";
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label}>
      <input
        className="input input-bordered w-full font-mono"
        value={value}
        placeholder={placeholder}
        inputMode={inputMode}
        onChange={event => onChange(event.target.value)}
      />
    </Field>
  );
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

function FreshnessLine({ freshness }: { freshness: { hedera: IndexerFreshness; zeroG: IndexerFreshness } }) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3 text-caption text-muted">
      <span>Hedera: {freshnessLabel(freshness.hedera)}</span>
      <span>0G: {freshnessLabel(freshness.zeroG)}</span>
      <span>Stable cursor: immutable source entity ID</span>
    </div>
  );
}

function freshnessLabel(freshness: IndexerFreshness): string {
  const state = !freshness.available
    ? "Unavailable"
    : freshness.hasIndexingErrors === true
      ? "Indexing errors reported"
      : freshness.stale
        ? "Stale"
        : "Fresh";
  return `${state} · block ${freshness.indexedBlock?.toLocaleString() ?? "unknown"}`;
}

function Pagination({
  page,
  hasPrevious,
  nextCursor,
  previous,
  next,
}: {
  page: number;
  hasPrevious: boolean;
  nextCursor: string | null;
  previous: () => void;
  next: (cursor: string) => void;
}) {
  return (
    <nav className="mt-5 flex items-center justify-between" aria-label="Cross-chain agent pages">
      <Button variant="secondary" disabled={!hasPrevious} onClick={previous}>
        Previous
      </Button>
      <span className="font-mono text-mono-sm text-muted">Page {page}</span>
      <Button variant="secondary" disabled={!nextCursor} onClick={() => nextCursor && next(nextCursor)}>
        Next
      </Button>
    </nav>
  );
}

function PageSkeleton() {
  return (
    <>
      <AppTopbar />
      <main className="mx-auto w-full max-w-[1280px] flex-1 px-6 py-10">
        <div className="h-80 animate-pulse rounded-lg bg-surface" />
      </main>
    </>
  );
}
