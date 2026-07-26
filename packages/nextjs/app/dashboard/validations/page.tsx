"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AppTopbar } from "~~/components/layout/AppTopbar";
import { Button } from "~~/components/ui/Button";
import { TeeMLValidationTable } from "~~/features/dashboard/components/TeeMLValidationTable";
import { ConnectGate } from "~~/features/wallet/components/ConnectGate";
import { useConnectWallet } from "~~/features/wallet/components/ConnectWalletProvider";
import { hashCanonicalAgentId } from "~~/lib/onchain-data/aggregate";
import { fetchTeeMLValidations } from "~~/lib/onchain-data/browser";
import type { ValidationFilters } from "~~/lib/onchain-data/queries";

type SearchField = "requestId" | "actionHash" | "policyHash" | "transactionHash" | "safe";

type DraftFilters = {
  searchField: SearchField;
  searchValue: string;
  agentIdHash: string;
  verdict: "" | "ALLOW" | "DENY";
  reasonCodeHash: string;
  policyHash: string;
  actionHash: string;
  modelIdHash: string;
  recorder: string;
  dateFrom: string;
  dateTo: string;
};

export default function TeeMLValidationsPage() {
  return (
    <Suspense fallback={<ValidationsLoadingPage />}>
      <ValidationsContent />
    </Suspense>
  );
}

function ValidationsContent() {
  const params = useSearchParams();
  const { status } = useConnectWallet();
  const [draft, setDraft] = useState<DraftFilters>(() => ({
    searchField: readSearchField(params.get("searchField")),
    searchValue: params.get("searchValue") ?? "",
    agentIdHash: params.get("agentIdHash") ?? "",
    verdict: readVerdict(params.get("verdict")),
    reasonCodeHash: params.get("reasonCodeHash") ?? "",
    policyHash: params.get("policyHash") ?? "",
    actionHash: params.get("actionHash") ?? "",
    modelIdHash: params.get("modelIdHash") ?? "",
    recorder: params.get("recorder") ?? "",
    dateFrom: "",
    dateTo: "",
  }));
  const [filters, setFilters] = useState<ValidationFilters>(() => buildFilters(draft));
  const [cursorHistory, setCursorHistory] = useState<Array<string | null>>([null]);
  const cursor = cursorHistory.at(-1) ?? null;
  const stableFilters = useMemo(() => JSON.stringify(filters), [filters]);
  const validations = useQuery({
    queryKey: ["aegis-teeml-validations", cursor, stableFilters],
    queryFn: ({ signal }) => fetchTeeMLValidations({ limit: 25, cursor, filters }, signal),
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
            <h1 className="mt-1 text-h2">TeeML validations</h1>
            <p className="mt-1 text-body-sm text-muted">
              Sanitized registry facts queried through static GraphQL documents and variables.
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
          <div className="grid gap-4 lg:grid-cols-[180px_minmax(260px,1fr)_180px]">
            <Field label="Exact search field">
              <select
                className="select select-bordered w-full"
                value={draft.searchField}
                onChange={event =>
                  setDraft(current => ({ ...current, searchField: event.target.value as SearchField }))
                }
              >
                <option value="requestId">Request ID</option>
                <option value="actionHash">Action hash</option>
                <option value="policyHash">Policy hash</option>
                <option value="transactionHash">Transaction hash</option>
                <option value="safe">Safe address</option>
              </select>
            </Field>
            <Field label="Exact 0x value">
              <input
                className="input input-bordered w-full font-mono"
                value={draft.searchValue}
                placeholder="0x…"
                onChange={event => setDraft(current => ({ ...current, searchValue: event.target.value }))}
              />
            </Field>
            <Field label="Verdict">
              <select
                className="select select-bordered w-full"
                value={draft.verdict}
                onChange={event =>
                  setDraft(current => ({
                    ...current,
                    verdict: event.target.value as DraftFilters["verdict"],
                  }))
                }
              >
                <option value="">ALLOW and DENY</option>
                <option value="ALLOW">ALLOW</option>
                <option value="DENY">DENY</option>
              </select>
            </Field>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <TextFilter
              label="Agent ID or hash"
              value={draft.agentIdHash}
              onChange={agentIdHash => setDraft(current => ({ ...current, agentIdHash }))}
            />
            <TextFilter
              label="Reason code hash"
              value={draft.reasonCodeHash}
              onChange={reasonCodeHash => setDraft(current => ({ ...current, reasonCodeHash }))}
            />
            <TextFilter
              label="Policy hash"
              value={draft.policyHash}
              onChange={policyHash => setDraft(current => ({ ...current, policyHash }))}
            />
            <TextFilter
              label="Action hash"
              value={draft.actionHash}
              onChange={actionHash => setDraft(current => ({ ...current, actionHash }))}
            />
            <TextFilter
              label="Model ID hash"
              value={draft.modelIdHash}
              onChange={modelIdHash => setDraft(current => ({ ...current, modelIdHash }))}
            />
            <TextFilter
              label="Recorder"
              value={draft.recorder}
              onChange={recorder => setDraft(current => ({ ...current, recorder }))}
            />
            <Field label="From date (UTC)">
              <input
                className="input input-bordered w-full"
                type="date"
                value={draft.dateFrom}
                onChange={event => setDraft(current => ({ ...current, dateFrom: event.target.value }))}
              />
            </Field>
            <Field label="To date (UTC)">
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
          {validations.isPending ? (
            <div className="h-64 animate-pulse rounded-lg bg-surface" />
          ) : validations.isError ? null : (
            <>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3 text-caption text-muted">
                <span>
                  Indexed block {validations.data.freshness.indexedBlock?.toLocaleString() ?? "unknown"} ·{" "}
                  {!validations.data.freshness.available
                    ? "unavailable"
                    : validations.data.freshness.hasIndexingErrors === true
                      ? "indexing errors reported"
                      : validations.data.freshness.stale
                        ? "stale"
                        : "fresh"}
                </span>
                <span>Ordered by immutable entity ID for stable cursor pagination</span>
              </div>
              <TeeMLValidationTable items={validations.data.items} />
              <nav className="mt-5 flex items-center justify-between" aria-label="Validation pages">
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
                  disabled={!validations.data.nextCursor}
                  onClick={() => {
                    if (validations.data.nextCursor) {
                      setCursorHistory(history => [...history, validations.data.nextCursor]);
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-label text-muted">{label}</span>
      {children}
    </label>
  );
}

function TextFilter({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
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

function buildFilters(draft: DraftFilters): ValidationFilters {
  const filters: ValidationFilters = {};
  if (draft.agentIdHash.trim()) {
    const agent = draft.agentIdHash.trim();
    filters.agentIdHash = /^0x[0-9a-fA-F]{64}$/.test(agent) ? agent : hashCanonicalAgentId(agent);
  }
  if (draft.verdict) filters.verdict = draft.verdict;
  if (draft.reasonCodeHash.trim()) filters.reasonCodeHash = draft.reasonCodeHash.trim();
  if (draft.policyHash.trim()) filters.policyHash = draft.policyHash.trim();
  if (draft.actionHash.trim()) filters.actionHash = draft.actionHash.trim();
  if (draft.modelIdHash.trim()) filters.modelIdHash = draft.modelIdHash.trim();
  if (draft.recorder.trim()) filters.recorder = draft.recorder.trim();
  if (draft.dateFrom) filters.dateFrom = Math.floor(new Date(`${draft.dateFrom}T00:00:00Z`).getTime() / 1_000);
  if (draft.dateTo) filters.dateTo = Math.floor(new Date(`${draft.dateTo}T23:59:59Z`).getTime() / 1_000);
  const exactSearch = draft.searchValue.trim();
  if (exactSearch) {
    switch (draft.searchField) {
      case "requestId":
        filters.requestId = exactSearch;
        break;
      case "actionHash":
        filters.actionHash = exactSearch;
        break;
      case "policyHash":
        filters.policyHash = exactSearch;
        break;
      case "transactionHash":
        filters.transactionHash = exactSearch;
        break;
      case "safe":
        filters.safe = exactSearch;
        break;
    }
  }
  return filters;
}

function emptyDraft(): DraftFilters {
  return {
    searchField: "requestId",
    searchValue: "",
    agentIdHash: "",
    verdict: "",
    reasonCodeHash: "",
    policyHash: "",
    actionHash: "",
    modelIdHash: "",
    recorder: "",
    dateFrom: "",
    dateTo: "",
  };
}

function readSearchField(value: string | null): SearchField {
  return value === "actionHash" || value === "policyHash" || value === "transactionHash" || value === "safe"
    ? value
    : "requestId";
}

function readVerdict(value: string | null): DraftFilters["verdict"] {
  return value === "ALLOW" || value === "DENY" ? value : "";
}

function ValidationsLoadingPage() {
  return (
    <>
      <AppTopbar />
      <main className="mx-auto w-full max-w-[1200px] flex-1 px-6 py-10">
        <div className="h-80 animate-pulse rounded-lg bg-surface" />
      </main>
    </>
  );
}
