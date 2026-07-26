"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AppTopbar } from "~~/components/layout/AppTopbar";
import { Button } from "~~/components/ui/Button";
import { SafeExecutionTable } from "~~/features/dashboard/components/SafeExecutionTable";
import { ConnectGate } from "~~/features/wallet/components/ConnectGate";
import { useConnectWallet } from "~~/features/wallet/components/ConnectWalletProvider";
import { hashCanonicalAgentId } from "~~/lib/onchain-data/aggregate";
import { fetchSafeExecutions } from "~~/lib/onchain-data/coverageBrowser";
import type { SafeExecutionFilters } from "~~/lib/onchain-data/coverageQueries";

type DraftFilters = {
  safe: string;
  agentIdHash: string;
  success: "" | "true" | "false";
  safeTxHash: string;
  transactionHash: string;
  dateFrom: string;
  dateTo: string;
};

export default function SafeExecutionsPage() {
  return (
    <Suspense fallback={<LoadingPage />}>
      <SafeExecutionsContent />
    </Suspense>
  );
}

function SafeExecutionsContent() {
  const params = useSearchParams();
  const { status } = useConnectWallet();
  const [draft, setDraft] = useState<DraftFilters>(() => ({
    safe: params.get("safe") ?? "",
    agentIdHash: params.get("agentIdHash") ?? "",
    success: readSuccess(params.get("success")),
    safeTxHash: params.get("safeTxHash") ?? "",
    transactionHash: params.get("transactionHash") ?? "",
    dateFrom: "",
    dateTo: "",
  }));
  const [filters, setFilters] = useState<SafeExecutionFilters>(() => buildFilters(draft));
  const [cursorHistory, setCursorHistory] = useState<Array<string | null>>([null]);
  const cursor = cursorHistory.at(-1) ?? null;
  const stableFilters = useMemo(() => JSON.stringify(filters), [filters]);
  const executions = useQuery({
    queryKey: ["aegis-safe-executions", cursor, stableFilters],
    queryFn: ({ signal }) => fetchSafeExecutions({ limit: 25, cursor, filters }, signal),
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
            <p className="font-mono text-overline uppercase text-subtle">Hedera Subgraph</p>
            <h1 className="mt-1 text-h2">Safe executions</h1>
            <p className="mt-1 text-body-sm text-muted">
              Confirmed Safe success and failure events queried only through The Graph.
            </p>
          </div>
          <Link href="/dashboard" className="text-body-sm font-medium text-brand-strong hover:underline">
            Back to overview
          </Link>
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
            <TextField
              label="Safe address"
              value={draft.safe}
              onChange={safe => setDraft(current => ({ ...current, safe }))}
            />
            <TextField
              label="Agent ID or hash"
              value={draft.agentIdHash}
              onChange={agentIdHash => setDraft(current => ({ ...current, agentIdHash }))}
            />
            <Field label="Execution result">
              <select
                className="select select-bordered w-full"
                value={draft.success}
                onChange={event =>
                  setDraft(current => ({ ...current, success: event.target.value as DraftFilters["success"] }))
                }
              >
                <option value="">Success and failure</option>
                <option value="true">Success</option>
                <option value="false">Failure</option>
              </select>
            </Field>
            <TextField
              label="Safe transaction hash"
              value={draft.safeTxHash}
              onChange={safeTxHash => setDraft(current => ({ ...current, safeTxHash }))}
            />
            <TextField
              label="Transaction hash"
              value={draft.transactionHash}
              onChange={transactionHash => setDraft(current => ({ ...current, transactionHash }))}
            />
            <div className="grid grid-cols-2 gap-3">
              <DateField
                label="From (UTC)"
                value={draft.dateFrom}
                onChange={dateFrom => setDraft(current => ({ ...current, dateFrom }))}
              />
              <DateField
                label="To (UTC)"
                value={draft.dateTo}
                onChange={dateTo => setDraft(current => ({ ...current, dateTo }))}
              />
            </div>
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
          {executions.isPending ? (
            <div className="h-64 animate-pulse rounded-lg bg-surface" />
          ) : executions.isError ? (
            <GraphError error={executions.error} retry={() => executions.refetch()} />
          ) : (
            <>
              <FreshnessLine freshness={executions.data.freshness} />
              <SafeExecutionTable items={executions.data.items} />
              <Pagination
                history={cursorHistory}
                nextCursor={executions.data.nextCursor}
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

function buildFilters(draft: DraftFilters): SafeExecutionFilters {
  const filters: SafeExecutionFilters = {};
  if (draft.safe.trim()) filters.safe = draft.safe.trim();
  if (draft.agentIdHash.trim()) {
    const agent = draft.agentIdHash.trim();
    filters.agentIdHash = /^0x[0-9a-fA-F]{64}$/.test(agent) ? agent : hashCanonicalAgentId(agent);
  }
  if (draft.success) filters.success = draft.success === "true";
  if (draft.safeTxHash.trim()) filters.safeTxHash = draft.safeTxHash.trim();
  if (draft.transactionHash.trim()) filters.transactionHash = draft.transactionHash.trim();
  if (draft.dateFrom) filters.dateFrom = toUnixDate(draft.dateFrom, false);
  if (draft.dateTo) filters.dateTo = toUnixDate(draft.dateTo, true);
  return filters;
}

function emptyDraft(): DraftFilters {
  return { safe: "", agentIdHash: "", success: "", safeTxHash: "", transactionHash: "", dateFrom: "", dateTo: "" };
}

function readSuccess(value: string | null): DraftFilters["success"] {
  return value === "true" || value === "false" ? value : "";
}

function toUnixDate(value: string, endOfDay: boolean): number {
  return Math.floor(new Date(`${value}T${endOfDay ? "23:59:59" : "00:00:00"}Z`).getTime() / 1_000);
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-label text-muted">{label}</span>
      {children}
    </label>
  );
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <Field label={label}>
      <input
        className="input input-bordered w-full font-mono"
        value={value}
        placeholder="0x…"
        onChange={event => onChange(event.target.value)}
      />
    </Field>
  );
}

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <Field label={label}>
      <input
        className="input input-bordered w-full"
        type="date"
        value={value}
        onChange={event => onChange(event.target.value)}
      />
    </Field>
  );
}

function FreshnessLine({ freshness }: { freshness: Awaited<ReturnType<typeof fetchSafeExecutions>>["freshness"] }) {
  return (
    <div className="mb-3 flex flex-wrap justify-between gap-3 text-caption text-muted">
      <span>Indexed block {freshness.indexedBlock?.toLocaleString() ?? "unknown"}</span>
      <span>
        {!freshness.available
          ? "Unavailable"
          : freshness.hasIndexingErrors
            ? "Indexing errors reported"
            : freshness.stale
              ? "Stale"
              : "Fresh"}
      </span>
    </div>
  );
}

function GraphError({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <div role="alert" className="rounded-lg border border-danger/25 bg-danger-soft p-5">
      <h2 className="text-h4 text-danger">GraphQL query failed</h2>
      <p className="mt-2 text-body-sm text-muted">
        {error instanceof Error ? error.message : "The Hedera Subgraph is unavailable."}
      </p>
      <Button className="mt-4" variant="secondary" onClick={retry}>
        Retry
      </Button>
    </div>
  );
}

function Pagination({
  history,
  nextCursor,
  previous,
  next,
}: {
  history: Array<string | null>;
  nextCursor: string | null;
  previous: () => void;
  next: (cursor: string) => void;
}) {
  return (
    <nav className="mt-5 flex items-center justify-between" aria-label="Execution pages">
      <Button variant="secondary" disabled={history.length === 1} onClick={previous}>
        Previous
      </Button>
      <span className="font-mono text-mono-sm text-muted">Page {history.length}</span>
      <Button variant="secondary" disabled={!nextCursor} onClick={() => nextCursor && next(nextCursor)}>
        Next
      </Button>
    </nav>
  );
}

function LoadingPage() {
  return (
    <>
      <AppTopbar />
      <main className="mx-auto w-full max-w-[1200px] flex-1 px-6 py-10">
        <div className="h-80 animate-pulse rounded-lg bg-surface" />
      </main>
    </>
  );
}
