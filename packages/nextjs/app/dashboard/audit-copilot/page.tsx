"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { AppTopbar } from "~~/components/layout/AppTopbar";
import { Button } from "~~/components/ui/Button";
import { ConnectGate } from "~~/features/wallet/components/ConnectGate";
import { useConnectWallet } from "~~/features/wallet/components/ConnectWalletProvider";
import {
  AUDIT_COPILOT_PRESET_QUESTIONS,
  type AuditCopilotIntent,
  type AuditCopilotResponse,
} from "~~/lib/onchain-data/auditCopilot";
import { fetchAuditCopilot } from "~~/lib/onchain-data/browser";
import { getZeroGExplorerTxLink } from "~~/lib/onchain-data/explorers";

const PRESETS = Object.entries(AUDIT_COPILOT_PRESET_QUESTIONS) as Array<[AuditCopilotIntent, string]>;

export default function AuditCopilotPage() {
  const { status } = useConnectWallet();
  const [question, setQuestion] = useState(AUDIT_COPILOT_PRESET_QUESTIONS.AGENTIC_ID_REGISTRY_SUMMARY);
  const [result, setResult] = useState<AuditCopilotResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsRunning(true);
    setError(null);
    try {
      setResult(await fetchAuditCopilot({ question, limit: 10 }));
    } catch (cause) {
      setResult(null);
      setError(cause instanceof Error ? cause.message : "The indexed audit analysis failed.");
    } finally {
      setIsRunning(false);
    }
  }

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
        <Link href="/dashboard" className="text-body-sm font-medium text-brand-strong hover:underline">
          ← Back to overview
        </Link>
        <div className="mt-6">
          <p className="font-mono text-overline uppercase text-subtle">The Graph · read-only evidence</p>
          <h1 className="mt-1 text-h2">AEGIS Audit Copilot</h1>
          <p className="mt-2 max-w-[760px] text-body-sm text-muted">
            Ask one of the allowlisted audit questions. The current minimum uses only live entities from the configured
            0G Agentic ID Subgraph; it cannot generate GraphQL, use RPC, or consult private AEGIS data.
          </p>
        </div>

        <form onSubmit={submit} className="mt-7 rounded-lg border border-border bg-surface-raised p-6 shadow-sm">
          <label htmlFor="audit-question" className="text-body-sm font-semibold">
            Indexed-data question
          </label>
          <textarea
            id="audit-question"
            value={question}
            maxLength={240}
            rows={3}
            onChange={event => setQuestion(event.target.value)}
            className="mt-2 w-full resize-y rounded-md border border-border bg-background px-4 py-3 text-body-sm outline-none focus:border-brand"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            {PRESETS.map(([intent, preset]) => (
              <button
                key={intent}
                type="button"
                onClick={() => setQuestion(preset)}
                className="rounded-full border border-border bg-surface px-3 py-1.5 text-caption font-medium text-muted hover:border-brand hover:text-brand-strong"
              >
                {intent.replaceAll("_", " ").toLowerCase()}
              </button>
            ))}
          </div>
          <Button type="submit" className="mt-5" disabled={isRunning || question.trim().length === 0}>
            {isRunning ? "Analyzing indexed evidence..." : "Analyze with The Graph"}
          </Button>
        </form>

        {error && (
          <section className="mt-6 rounded-lg border border-border bg-surface-raised p-5">
            <p className="text-body-sm text-muted">{error}</p>
          </section>
        )}

        {result && (
          <section className="mt-7 space-y-6" aria-live="polite">
            <div className="rounded-lg border border-success/25 bg-success-soft p-5">
              <p className="font-mono text-overline uppercase text-success">{result.intent.replaceAll("_", " ")}</p>
              <p className="mt-2 text-body font-semibold">{result.answer}</p>
              <p className="mt-2 text-caption text-muted">
                0G indexed block {result.freshness.indexedBlock?.toLocaleString() ?? "unknown"} · checked{" "}
                {new Date(result.freshness.checkedAt).toLocaleString()}
              </p>
            </div>

            <div className="space-y-4">
              {result.findings.map((finding, index) => (
                <article
                  key={`${result.intent}-${index}`}
                  className="rounded-lg border border-border bg-surface-raised p-5"
                >
                  <h2 className="text-body font-semibold">Finding {index + 1}</h2>
                  <p className="mt-2 text-body-sm text-muted">{finding.statement}</p>
                  <ul className="mt-4 space-y-2">
                    {finding.citations.map(citation => (
                      <li key={`${citation.entityType}:${citation.entityId}`} className="text-caption text-muted">
                        <span className="font-mono">{citation.sourceSubgraph}</span> · {citation.entityType}{" "}
                        <span className="break-all font-mono">{citation.entityId}</span> · block {citation.blockNumber}{" "}
                        ·{" "}
                        {citation.provenance === "EVENT_TRANSACTION" ? (
                          <a
                            href={getZeroGExplorerTxLink(citation.transactionHash)}
                            target="_blank"
                            rel="noreferrer"
                            className="font-mono text-brand-strong hover:underline"
                          >
                            transaction {citation.transactionHash}
                          </a>
                        ) : (
                          <span className="font-mono">indexed entity snapshot (no transaction attribution)</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>

            {result.warnings.length > 0 && (
              <div className="rounded-lg border border-border bg-surface-raised px-5 py-4 text-caption text-muted">
                {result.warnings.join(" ")}
              </div>
            )}
          </section>
        )}
      </main>
    </>
  );
}
