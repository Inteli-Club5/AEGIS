"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { AgentLogTable } from "@/features/agents/components/AgentLogTable";
import { RevealPrivateKeyDialog } from "@/features/agents/components/RevealPrivateKeyDialog";
import { PeriodFilter } from "@/features/dashboard/components/PeriodFilter";
import { StatStrip } from "@/features/dashboard/components/StatStrip";
import {
  type ActivityEntry,
  type AgentDetail,
  type AgentStatus,
  CAPABILITY_LABELS,
  type StatsPeriod,
} from "@/lib/types/aegis";
import { cn } from "@/lib/utils/cn";
import { formatDateTime, formatHbar, truncateAddress } from "@/lib/utils/format";
import { filterByPeriod, summarizeActivity } from "@/lib/utils/stats";
import {
  ArrowLeft,
  Bot,
  ExternalLink,
  KeyRound,
  MoonStar,
  Pause,
  ShieldCheck,
  ShieldOff,
  TriangleAlert,
} from "lucide-react";

const STATUS_META: Record<AgentStatus, { label: string; tone: BadgeTone; icon: typeof ShieldCheck }> = {
  protected: { label: "Protected", tone: "success", icon: ShieldCheck },
  unprotected: { label: "Unprotected", tone: "neutral", icon: ShieldOff },
  paused: { label: "Paused", tone: "warning", icon: Pause },
  compromised: { label: "Compromised", tone: "danger", icon: TriangleAlert },
};

const TABS = ["Overview", "Policy", "Settings"] as const;
type Tab = (typeof TABS)[number];

export function AgentDetailView({ agent, activity }: { agent: AgentDetail; activity: ActivityEntry[] }) {
  const [tab, setTab] = useState<Tab>("Overview");

  return (
    <div className="mx-auto w-full max-w-[1200px] flex-1 px-6 py-10">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-2 text-body-sm text-muted transition-colors duration-[120ms] hover:text-brand-strong"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to dashboard
      </Link>

      <AgentHeader agent={agent} />

      <nav className="mt-8 flex gap-1 border-b border-border" aria-label="Agent sections">
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "-mb-px cursor-pointer border-b-2 px-4 py-2.5 text-body-sm transition-colors duration-[120ms]",
              tab === t
                ? "border-brand font-semibold text-foreground"
                : "border-transparent text-muted hover:text-foreground",
            )}
          >
            {t}
          </button>
        ))}
      </nav>

      <div className="mt-8">
        {tab === "Overview" && <OverviewTab activity={activity} />}
        {tab === "Policy" && <PolicyTab agent={agent} />}
        {tab === "Settings" && <SettingsTab agent={agent} />}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Card({ title, children, className }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-lg bg-surface p-6 shadow-md", className)}>
      {title && <h2 className="text-h4">{title}</h2>}
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border py-2.5 last:border-0">
      <dt className="shrink-0 text-label text-muted">{label}</dt>
      <dd className="min-w-0 text-right">{children}</dd>
    </div>
  );
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return <p className="rounded-md bg-info-soft px-4 py-3 text-body-sm text-info">{children}</p>;
}

/* ------------------------------------------------------------------ */

/** Identity on the left, wallet facts on the right — the Wallet tab lives here now. */
function AgentHeader({ agent }: { agent: AgentDetail }) {
  const status = STATUS_META[agent.status];
  const StatusIcon = status.icon;
  const w = agent.walletInfo;

  const facts = [
    {
      key: "balance",
      label: "Balance",
      value: <span className="font-mono text-h4 tabular-nums">{formatHbar(agent.balanceHbar)}</span>,
    },
    {
      key: "connected",
      label: "Connected",
      value: <span className="font-mono text-mono-md text-muted">{formatDateTime(agent.createdAt)}</span>,
    },
    {
      key: "wallet",
      label: w ? "Protected wallet · Hedera testnet" : "Protected wallet",
      value: w ? (
        <a
          href={`https://hashscan.io/testnet/account/${w.address}`}
          target="_blank"
          rel="noreferrer"
          title={w.address}
          className="inline-flex items-center gap-1.5 font-mono text-mono-md text-brand-strong underline-offset-4 hover:underline"
        >
          {truncateAddress(w.address)}
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      ) : (
        <span className="text-body-sm text-subtle">Not provisioned yet</span>
      ),
    },
  ];

  return (
    <section className="mt-6 overflow-hidden rounded-lg border border-border bg-surface-raised shadow-sm">
      <div className="flex flex-col gap-6 p-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-soft">
            <Bot className="h-6 w-6 text-brand-strong" />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-h2">{agent.name}</h1>
              <Badge tone={status.tone}>
                <StatusIcon className="h-3 w-3" />
                {status.label}
              </Badge>
            </div>
            <p className="mt-1 text-body-sm text-muted">
              {agent.type} · <span className="font-mono text-mono-sm">{agent.id}</span>
            </p>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-x-8 gap-y-5 lg:flex lg:items-center lg:gap-0">
          {facts.map((fact, i) => (
            <div
              key={fact.key}
              className={cn("lg:px-6", i > 0 && "lg:border-l lg:border-border", i === 2 && "lg:pr-0")}
            >
              <dt className="font-mono text-overline uppercase text-muted">{fact.label}</dt>
              <dd className="mt-1">{fact.value}</dd>
            </div>
          ))}
        </dl>
      </div>

      {w ? (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-border bg-surface/60 px-6 py-3">
          <span className="font-mono text-overline uppercase text-subtle">Owners · {w.threshold}</span>
          {[
            { name: "Agent signer", address: w.agentSigner, dormant: false },
            { name: "AEGIS co-signer", address: w.aegisCosigner, dormant: false },
            {
              name: w.guardianManaged ? "Guardian · AEGIS-managed" : "Guardian · your address",
              address: w.guardian,
              dormant: true,
            },
          ].map(owner => (
            <span key={owner.name} className="inline-flex items-center gap-2 text-caption">
              {owner.dormant ? (
                <MoonStar className="h-3.5 w-3.5 shrink-0 text-subtle" />
              ) : (
                <KeyRound className="h-3.5 w-3.5 shrink-0 text-brand-strong" />
              )}
              <span className="text-muted">{owner.name}</span>
              <span className="font-mono text-mono-sm text-subtle" title={owner.address}>
                {truncateAddress(owner.address)}
              </span>
            </span>
          ))}
        </div>
      ) : (
        <p className="border-t border-border bg-surface/60 px-6 py-3 text-caption text-subtle">
          The Safe smart account is provisioned by the backend once protection is activated.
        </p>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */

const VERDICT_FILTERS = [
  { value: "all", label: "All" },
  { value: "ALLOW", label: "Approved" },
  { value: "DENY", label: "Denied" },
] as const;

type VerdictFilter = (typeof VERDICT_FILTERS)[number]["value"];

function OverviewTab({ activity }: { activity: ActivityEntry[] }) {
  const [period, setPeriod] = useState<StatsPeriod>(30);
  const [verdict, setVerdict] = useState<VerdictFilter>("all");

  const inWindow = useMemo(() => filterByPeriod(activity, period), [activity, period]);
  const stats = useMemo(() => summarizeActivity(inWindow), [inWindow]);
  const logs = useMemo(
    () => (verdict === "all" ? inWindow : inWindow.filter(e => e.verdict === verdict)),
    [inWindow, verdict],
  );

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <p className="font-mono text-overline uppercase text-subtle">Overview</p>
        <PeriodFilter value={period} onChange={setPeriod} />
      </div>
      <div className="mt-3">
        <StatStrip stats={stats} />
      </div>

      <section className="mt-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-h3">Logs</h2>
            <p className="mt-1 text-body-sm text-muted">
              Every decision this agent triggered — approved or denied — indexed via The Graph.
            </p>
          </div>
          <div className="flex gap-1 rounded-md border border-border bg-surface-raised p-1" role="group">
            {VERDICT_FILTERS.map(f => (
              <button
                key={f.value}
                onClick={() => setVerdict(f.value)}
                aria-pressed={verdict === f.value}
                className={cn(
                  "cursor-pointer rounded px-3 py-1.5 text-body-sm transition-colors duration-[120ms]",
                  verdict === f.value
                    ? "bg-brand-soft font-semibold text-brand-strong"
                    : "text-muted hover:text-foreground",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-5">
          {logs.length === 0 ? (
            <EmptyNote>
              {activity.length === 0
                ? "No activity yet for this agent."
                : "No log entries match the selected period and verdict."}
            </EmptyNote>
          ) : (
            <AgentLogTable entries={logs} />
          )}
        </div>
      </section>
    </div>
  );
}

function PolicyTab({ agent }: { agent: AgentDetail }) {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {agent.policy ? (
        <Card title="Active policy">
          <p className="mt-1 text-body-sm text-muted">
            Field names are placeholders until the policy schema is defined with the backend team.
          </p>
          <dl className="mt-4">
            <Row label="policyHash">
              <span className="font-mono text-mono-sm" title={agent.policy.policyHash}>
                {truncateAddress(agent.policy.policyHash)}
              </span>
            </Row>
            {Object.entries(agent.policy.fields).map(([key, value]) => (
              <Row key={key} label={key}>
                <span className="font-mono text-mono-sm">{value || "—"}</span>
              </Row>
            ))}
          </dl>
        </Card>
      ) : (
        <EmptyNote>No policy attached yet. Finish the Protect Agent wizard to create one.</EmptyNote>
      )}

      <Card title="Capabilities">
        <p className="mt-1 text-body-sm text-muted">
          What this agent is allowed to attempt. Every attempt is still gated by the policy.
        </p>
        {agent.capabilities.length === 0 ? (
          <p className="mt-4 text-body-sm text-subtle">No capabilities recorded for this agent.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {agent.capabilities.map(c => (
              <li
                key={c}
                className="flex items-center gap-2.5 rounded-md border border-border bg-surface-raised px-3 py-2 text-body-sm"
              >
                <ShieldCheck className="h-4 w-4 shrink-0 text-brand-strong" />
                {CAPABILITY_LABELS[c]}
              </li>
            ))}
          </ul>
        )}
        {agent.description && (
          <p className="mt-4 border-t border-border pt-4 text-body-sm text-muted">{agent.description}</p>
        )}
      </Card>
    </div>
  );
}

function SettingsTab({ agent }: { agent: AgentDetail }) {
  const [revealOpen, setRevealOpen] = useState(false);

  return (
    <div className="space-y-5">
      <Card title="Agent settings">
        <p className="mt-1 text-body-sm text-muted">
          Renaming, endpoint changes and capability edits are handled by the backend — wired here once those endpoints
          exist.
        </p>
      </Card>

      <section className="rounded-lg border border-danger/25 bg-danger-soft/40 p-6">
        <h2 className="flex items-center gap-2 text-h4 text-danger">
          <KeyRound className="h-5 w-5" />
          Reveal AEGIS private key
        </h2>
        <p className="mt-2 max-w-[70ch] text-body-sm text-muted">
          The private key of {agent.name} is held under the AEGIS 2-of-3 setup so no single signer can move funds. You
          can take it back — but the moment it leaves the platform, AEGIS can no longer vouch for this agent:{" "}
          <strong className="font-semibold text-foreground">
            {agent.name} becomes permanently unavailable on AEGIS
          </strong>{" "}
          and you have to register a new one.
        </p>
        <Button variant="destructive" className="mt-4" onClick={() => setRevealOpen(true)}>
          <KeyRound className="h-4 w-4" />
          Reveal private key
        </Button>
        <p className="mt-2 text-caption text-subtle">
          Protected by a three-step confirmation and a 2FA challenge (placeholder until the authenticator flow is
          wired).
        </p>
      </section>

      <section className="rounded-lg border border-danger/25 bg-danger-soft/40 p-6">
        <h2 className="text-h4 text-danger">Danger zone</h2>
        <p className="mt-1 max-w-[60ch] text-body-sm text-muted">
          Disconnecting removes {agent.name} from AEGIS. Its protected wallet stops requiring the AEGIS co-signature,
          and the agent is no longer gated by your policy.
        </p>
        <Button variant="destructive" className="mt-4" disabled>
          Disconnect agent
        </Button>
        <p className="mt-2 text-caption text-subtle">Disabled until the backend exposes the disconnect endpoint.</p>
      </section>

      <RevealPrivateKeyDialog open={revealOpen} agent={agent} onClose={() => setRevealOpen(false)} />
    </div>
  );
}
