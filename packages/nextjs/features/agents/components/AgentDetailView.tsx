"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ActivityTable } from "@/features/dashboard/components/ActivityTable";
import { type ActivityEntry, type AgentDetail, type AgentStatus, CAPABILITY_LABELS } from "@/lib/types/aegis";
import { cn } from "@/lib/utils/cn";
import { formatDateTime, formatHbar, truncateAddress } from "@/lib/utils/format";
import { ArrowLeft, Bot, KeyRound, MoonStar, Pause, ShieldCheck, ShieldOff, TriangleAlert } from "lucide-react";

const STATUS_META: Record<AgentStatus, { label: string; tone: BadgeTone; icon: typeof ShieldCheck }> = {
  protected: { label: "Protected", tone: "success", icon: ShieldCheck },
  unprotected: { label: "Unprotected", tone: "neutral", icon: ShieldOff },
  paused: { label: "Paused", tone: "warning", icon: Pause },
  compromised: { label: "Compromised", tone: "danger", icon: TriangleAlert },
};

const TABS = ["Overview", "Wallet", "Policy", "Activity", "Settings"] as const;
type Tab = (typeof TABS)[number];

export function AgentDetailView({ agent, activity }: { agent: AgentDetail; activity: ActivityEntry[] }) {
  const [tab, setTab] = useState<Tab>("Overview");

  const status = STATUS_META[agent.status];
  const StatusIcon = status.icon;

  return (
    <div className="mx-auto w-full max-w-[1200px] flex-1 px-6 py-10">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-2 text-body-sm text-muted transition-colors duration-[120ms] hover:text-brand-strong"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to dashboard
      </Link>

      {/* Header */}
      <div className="mt-6 flex items-center gap-3">
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
          <p className="mt-1 text-body-sm text-muted">{agent.type}</p>
        </div>
      </div>

      {/* Tabs */}
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
        {tab === "Overview" && <OverviewTab agent={agent} />}
        {tab === "Wallet" && <WalletTab agent={agent} />}
        {tab === "Policy" && <PolicyTab agent={agent} />}
        {tab === "Activity" && <ActivityTab entries={activity} />}
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

function OverviewTab({ agent }: { agent: AgentDetail }) {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card title="Agent">
        <dl className="mt-4">
          <Row label="Agent ID">
            <span className="font-mono text-mono-sm">{agent.id}</span>
          </Row>
          <Row label="Type">
            <span className="text-body-sm">{agent.type}</span>
          </Row>
          <Row label="Connected">
            <span className="font-mono text-mono-sm text-muted">{formatDateTime(agent.createdAt)}</span>
          </Row>
          <Row label="Balance">
            <span className="font-mono text-mono-md font-medium tabular-nums">{formatHbar(agent.balanceHbar)}</span>
          </Row>
        </dl>
        {agent.description && (
          <p className="mt-4 border-t border-border pt-4 text-body-sm text-muted">{agent.description}</p>
        )}
      </Card>

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
      </Card>
    </div>
  );
}

function WalletTab({ agent }: { agent: AgentDetail }) {
  const w = agent.walletInfo;

  if (!w) {
    return (
      <EmptyNote>
        No protected wallet yet. The Safe smart account is provisioned by the backend once protection is activated.
      </EmptyNote>
    );
  }

  const owners = [
    {
      name: "Agent signer",
      address: w.agentSigner,
      role: "Signs every routine action",
      dormant: false,
    },
    {
      name: "AEGIS co-signer",
      address: w.aegisCosigner,
      role: "Required on every execution",
      dormant: false,
    },
    {
      name: "Recovery guardian",
      address: w.guardian,
      role: w.guardianManaged ? "AEGIS-managed · break-glass only" : "Your address · break-glass only",
      dormant: true,
    },
  ];

  return (
    <div className="space-y-5">
      <Card title="Protected wallet">
        <dl className="mt-4">
          <Row label="Safe address">
            <span className="font-mono text-mono-sm" title={w.address}>
              {truncateAddress(w.address)}
            </span>
          </Row>
          <Row label="Network">
            <span className="font-mono text-mono-sm text-muted">Hedera testnet</span>
          </Row>
          <Row label="Balance">
            <span className="font-mono text-mono-md font-medium tabular-nums">{formatHbar(agent.balanceHbar)}</span>
          </Row>
          <Row label="Threshold">
            <span className="font-mono text-mono-sm">{w.threshold}</span>
          </Row>
        </dl>
        <a
          href={`https://hashscan.io/testnet/account/${w.address}`}
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-block text-body-sm font-medium text-brand-strong underline-offset-4 hover:underline"
        >
          View on HashScan
        </a>
      </Card>

      <Card title="Owners">
        <ul className="mt-4 space-y-2.5">
          {owners.map(o => (
            <li
              key={o.name}
              className={cn(
                "flex items-center gap-3 rounded-md border p-3",
                o.dormant ? "border-dashed border-border-strong" : "border-border bg-surface-raised",
              )}
            >
              <span
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                  o.dormant ? "bg-surface" : "bg-brand-soft",
                )}
              >
                {o.dormant ? (
                  <MoonStar className="h-4 w-4 text-subtle" />
                ) : (
                  <KeyRound className="h-4 w-4 text-brand-strong" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-body-sm font-semibold">{o.name}</span>
                <span className="block text-caption text-muted">{o.role}</span>
              </span>
              <span className="shrink-0 font-mono text-mono-sm text-muted" title={o.address}>
                {truncateAddress(o.address)}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function PolicyTab({ agent }: { agent: AgentDetail }) {
  if (!agent.policy) {
    return <EmptyNote>No policy attached yet. Finish the Protect Agent wizard to create one.</EmptyNote>;
  }

  return (
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
  );
}

function ActivityTab({ entries }: { entries: ActivityEntry[] }) {
  if (entries.length === 0) {
    return <EmptyNote>No activity yet for this agent.</EmptyNote>;
  }
  return <ActivityTable entries={entries} />;
}

function SettingsTab({ agent }: { agent: AgentDetail }) {
  return (
    <div className="space-y-5">
      <Card title="Agent settings">
        <p className="mt-1 text-body-sm text-muted">
          Renaming, endpoint changes and capability edits are handled by the backend — wired here once those endpoints
          exist.
        </p>
      </Card>

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
    </div>
  );
}
