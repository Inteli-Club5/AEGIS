import { AlertTriangle, CheckCircle2, Clock3 } from "lucide-react";
import type { IndexerFreshness as Freshness } from "~~/lib/onchain-data/types";

const SOURCE_LABELS: Record<Freshness["source"], string> = {
  "hedera-testnet": "Hedera Subgraph",
  "0g-galileo": "0G Subgraph",
};

export function IndexerFreshness({ freshness }: { freshness: { hedera: Freshness; zeroG: Freshness } }) {
  return (
    <section aria-labelledby="indexer-freshness-heading">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-overline uppercase text-subtle">Data sources</p>
          <h2 id="indexer-freshness-heading" className="mt-1 text-h4">
            Indexer freshness
          </h2>
        </div>
        <p className="text-caption text-muted">Confirmed onchain state is reconciled through GraphQL.</p>
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {[freshness.hedera, freshness.zeroG].map(source => {
          const unhealthy = !source.available || source.stale || source.hasIndexingErrors === true;
          const Icon = unhealthy ? AlertTriangle : CheckCircle2;
          return (
            <article key={source.source} className="rounded-lg border border-border bg-surface-raised p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Icon className={`h-4 w-4 ${unhealthy ? "text-warning" : "text-success"}`} aria-hidden="true" />
                  <h3 className="text-body-sm font-semibold">{SOURCE_LABELS[source.source]}</h3>
                </div>
                <span className={`text-label ${unhealthy ? "text-warning" : "text-success"}`}>
                  {!source.available
                    ? "Unavailable"
                    : source.hasIndexingErrors === true
                      ? "Indexing error"
                      : source.stale
                        ? "Stale"
                        : "Fresh"}
                </span>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-body-sm">
                <div>
                  <dt className="text-label text-muted">Indexed block</dt>
                  <dd className="mt-0.5 font-mono text-mono-sm">
                    {source.indexedBlock?.toLocaleString() ?? "Unknown"}
                  </dd>
                </div>
                <div>
                  <dt className="text-label text-muted">Chain head / lag</dt>
                  <dd className="mt-0.5 font-mono text-mono-sm">
                    {source.chainHeadBlock !== null
                      ? `${source.chainHeadBlock} / ${source.lagBlocks ?? "?"}`
                      : source.chainHeadStatus === "not-configured"
                        ? "Not exposed by deployment"
                        : "Status endpoint unavailable"}
                  </dd>
                </div>
                <div>
                  <dt className="text-label text-muted">Indexed age</dt>
                  <dd className="mt-0.5 flex items-center gap-1 font-mono text-mono-sm">
                    <Clock3 className="h-3 w-3" aria-hidden="true" />
                    {source.ageSeconds === null ? "Unknown" : `${source.ageSeconds}s`}
                  </dd>
                </div>
                <div>
                  <dt className="text-label text-muted">Last refresh</dt>
                  <dd className="mt-0.5 font-mono text-mono-sm">{new Date(source.checkedAt).toLocaleTimeString()}</dd>
                </div>
              </dl>
            </article>
          );
        })}
      </div>
    </section>
  );
}
