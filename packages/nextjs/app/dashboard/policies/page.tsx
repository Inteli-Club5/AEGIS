"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AppTopbar } from "~~/components/layout/AppTopbar";
import { Button } from "~~/components/ui/Button";
import { PolicyReferenceTable } from "~~/features/dashboard/components/PolicyReferenceTable";
import { ConnectGate } from "~~/features/wallet/components/ConnectGate";
import { useConnectWallet } from "~~/features/wallet/components/ConnectWalletProvider";
import { fetchPolicyReferences } from "~~/lib/onchain-data/coverageBrowser";
import type { PolicyReferenceFilters } from "~~/lib/onchain-data/coverageQueries";

type DraftFilters = { policyHash: string; dateFrom: string; dateTo: string };

export default function PolicyReferencesPage() {
  return (
    <Suspense fallback={<LoadingPage />}>
      <PolicyReferencesContent />
    </Suspense>
  );
}

function PolicyReferencesContent() {
  const params = useSearchParams();
  const { status } = useConnectWallet();
  const [draft, setDraft] = useState<DraftFilters>(() => ({
    policyHash: params.get("policyHash") ?? "",
    dateFrom: "",
    dateTo: "",
  }));
  const [filters, setFilters] = useState<PolicyReferenceFilters>(() => buildFilters(draft));
  const [cursorHistory, setCursorHistory] = useState<Array<string | null>>([null]);
  const cursor = cursorHistory.at(-1) ?? null;
  const stableFilters = useMemo(() => JSON.stringify(filters), [filters]);
  const policies = useQuery({
    queryKey: ["aegis-policy-references", cursor, stableFilters],
    queryFn: ({ signal }) => fetchPolicyReferences({ limit: 25, cursor, filters }, signal),
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
      <main className="mx-auto w-full max-w-[1100px] flex-1 px-6 py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-overline uppercase text-subtle">Hedera Subgraph</p>
            <h1 className="mt-1 text-h2">Policy references</h1>
            <p className="mt-1 text-body-sm text-muted">
              Public policy hashes and aggregate ALLOW/DENY references derived from indexed registry events.
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
          <div className="grid gap-4 md:grid-cols-[minmax(260px,2fr)_1fr_1fr]">
            <Field label="Exact policy hash">
              <input
                className="input input-bordered w-full font-mono"
                value={draft.policyHash}
                placeholder="0x…"
                onChange={event => setDraft(current => ({ ...current, policyHash: event.target.value }))}
              />
            </Field>
            <DateField
              label="Last referenced from (UTC)"
              value={draft.dateFrom}
              onChange={dateFrom => setDraft(current => ({ ...current, dateFrom }))}
            />
            <DateField
              label="Last referenced to (UTC)"
              value={draft.dateTo}
              onChange={dateTo => setDraft(current => ({ ...current, dateTo }))}
            />
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button type="submit">Apply filters</Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setDraft({ policyHash: "", dateFrom: "", dateTo: "" });
                setFilters({});
                setCursorHistory([null]);
              }}
            >
              Clear
            </Button>
          </div>
        </form>

        <section className="mt-7" aria-live="polite">
          {policies.isPending ? (
            <div className="h-64 animate-pulse rounded-lg bg-surface" />
          ) : policies.isError ? null : (
            <>
              <div className="mb-3 flex flex-wrap justify-between gap-3 text-caption text-muted">
                <span>Indexed block {policies.data.freshness.indexedBlock?.toLocaleString() ?? "unknown"}</span>
                <span>
                  {!policies.data.freshness.available
                    ? "Unavailable"
                    : policies.data.freshness.hasIndexingErrors
                      ? "Indexing errors reported"
                      : policies.data.freshness.stale
                        ? "Stale"
                        : "Fresh"}
                </span>
              </div>
              <PolicyReferenceTable items={policies.data.items} />
              <nav className="mt-5 flex items-center justify-between" aria-label="Policy reference pages">
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
                  disabled={!policies.data.nextCursor}
                  onClick={() => {
                    if (policies.data.nextCursor) {
                      setCursorHistory(history => [...history, policies.data.nextCursor]);
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

function buildFilters(draft: DraftFilters): PolicyReferenceFilters {
  const filters: PolicyReferenceFilters = {};
  if (draft.policyHash.trim()) filters.policyHash = draft.policyHash.trim();
  if (draft.dateFrom) filters.dateFrom = toUnixDate(draft.dateFrom, false);
  if (draft.dateTo) filters.dateTo = toUnixDate(draft.dateTo, true);
  return filters;
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

function LoadingPage() {
  return (
    <>
      <AppTopbar />
      <main className="mx-auto w-full max-w-[1100px] flex-1 px-6 py-10">
        <div className="h-80 animate-pulse rounded-lg bg-surface" />
      </main>
    </>
  );
}
