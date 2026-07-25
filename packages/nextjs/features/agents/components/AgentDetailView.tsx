"use client";

import { type KeyboardEvent, type ReactNode, useState } from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowLeft,
  Bot,
  Check,
  Clock,
  Copy,
  FileText,
  History,
  KeyRound,
  MoonStar,
  Pause,
  ShieldCheck,
  ShieldOff,
  TriangleAlert,
  Wallet,
  XCircle,
} from "lucide-react";
import { formatUnits } from "viem";
import { useBalance } from "wagmi";
import { Badge, type BadgeTone } from "~~/components/ui/Badge";
import { FundWalletCard } from "~~/features/agents/components/FundWalletCard";
import { ActivityTable } from "~~/features/dashboard/components/ActivityTable";
import {
  type ActivityEntry,
  type AgentDetail,
  type AgentLifecycleStatus,
  CAPABILITY_LABELS,
  type EffectivePolicyStatus,
  type Policy,
  type ProtectedWalletInfo,
} from "~~/lib/types/aegis";
import { cn } from "~~/lib/utils/cn";
import {
  formatDateTime,
  formatHbar,
  formatPolicyAmount,
  formatPolicyValidity,
  truncateAddress,
} from "~~/lib/utils/format";

const AGENT_STATUS_META: Record<AgentLifecycleStatus, { label: string; tone: BadgeTone; icon: typeof ShieldCheck }> = {
  ACTIVE: { label: "Active", tone: "success", icon: Bot },
  PAUSED: { label: "Paused", tone: "warning", icon: Pause },
  RETIRED: { label: "Retired", tone: "neutral", icon: ShieldOff },
};

const POLICY_STATUS_META: Record<EffectivePolicyStatus, { label: string; tone: BadgeTone; icon: typeof ShieldCheck }> =
  {
    DRAFT: { label: "Draft", tone: "neutral", icon: FileText },
    ACTIVE: { label: "Active", tone: "success", icon: ShieldCheck },
    SUPERSEDED: { label: "Superseded", tone: "info", icon: History },
    REVOKED: { label: "Revoked", tone: "danger", icon: ShieldOff },
    EXPIRED: { label: "Expired", tone: "warning", icon: Clock },
  };

const WALLET_STATUS_META: Record<
  ProtectedWalletInfo["status"],
  { label: string; tone: BadgeTone; icon: typeof ShieldCheck }
> = {
  PROTECTED: { label: "Protected", tone: "success", icon: ShieldCheck },
  PAUSED: { label: "Paused", tone: "warning", icon: Pause },
  RETIRED: { label: "Retired", tone: "neutral", icon: ShieldOff },
  DEAD: { label: "Unavailable", tone: "danger", icon: XCircle },
};

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "wallet", label: "Wallet" },
  { id: "policies", label: "Policies" },
  { id: "activity", label: "Activity" },
] as const;
type TabId = (typeof TABS)[number]["id"];

type ProtectionStatus = "active" | "draft" | "expired" | "paused" | "retired" | "unavailable" | "unprotected";

const PROTECTION_STATUS_META: Record<ProtectionStatus, { label: string; tone: BadgeTone; icon: typeof ShieldCheck }> = {
  active: { label: "Protection active", tone: "success", icon: ShieldCheck },
  draft: { label: "Policy not active", tone: "warning", icon: FileText },
  expired: { label: "Policy expired", tone: "warning", icon: Clock },
  paused: { label: "Protection paused", tone: "warning", icon: Pause },
  retired: { label: "Wallet retired", tone: "neutral", icon: ShieldOff },
  unavailable: { label: "Protection unavailable", tone: "danger", icon: XCircle },
  unprotected: { label: "Protection not configured", tone: "neutral", icon: ShieldOff },
};

export function AgentDetailView({ agent, activity }: { agent: AgentDetail; activity: ActivityEntry[] }) {
  const [tab, setTab] = useState<TabId>("overview");
  const agentStatus = AGENT_STATUS_META[agent.agentLifecycleStatus];
  const AgentStatusIcon = agentStatus.icon;
  const protectionStatus = getProtectionStatus(agent);
  const protectionMeta = PROTECTION_STATUS_META[protectionStatus];
  const ProtectionStatusIcon = protectionMeta.icon;

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, tabIndex: number) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;

    event.preventDefault();
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? TABS.length - 1
          : (tabIndex + (event.key === "ArrowRight" ? 1 : -1) + TABS.length) % TABS.length;
    const nextTab = TABS[nextIndex];
    setTab(nextTab.id);
    document.getElementById(`agent-tab-${nextTab.id}`)?.focus();
  }

  return (
    <div className="mx-auto w-full max-w-[1200px] flex-1 px-6 py-10">
      <Link
        href="/dashboard"
        className="inline-flex min-h-11 items-center gap-2 text-body-sm text-muted transition-colors duration-[120ms] hover:text-brand-strong focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to dashboard
      </Link>

      <header className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-soft">
            <Bot className="h-6 w-6 text-brand-strong" aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-h2">{agent.name}</h1>
            <p className="mt-1 text-body-sm text-muted">{agent.type}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2" aria-label="Agent and protection statuses">
          <Badge tone={agentStatus.tone}>
            <AgentStatusIcon className="h-3 w-3" aria-hidden="true" />
            Agent: {agentStatus.label}
          </Badge>
          <Badge tone={protectionMeta.tone}>
            <ProtectionStatusIcon className="h-3 w-3" aria-hidden="true" />
            {protectionMeta.label}
          </Badge>
        </div>
      </header>

      <nav className="mt-8 border-b border-border" aria-label="Agent sections">
        <div className="flex gap-1 overflow-x-auto" role="tablist" aria-label="Agent details">
          {TABS.map((item, index) => (
            <button
              key={item.id}
              id={`agent-tab-${item.id}`}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              aria-controls={`agent-panel-${item.id}`}
              tabIndex={tab === item.id ? 0 : -1}
              onClick={() => setTab(item.id)}
              onKeyDown={event => handleTabKeyDown(event, index)}
              className={cn(
                "-mb-px min-h-11 cursor-pointer whitespace-nowrap border-b-2 px-4 py-2.5 text-body-sm transition-colors duration-[120ms] focus-visible:rounded-t-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
                tab === item.id
                  ? "border-brand font-semibold text-foreground"
                  : "border-transparent text-muted hover:text-foreground",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </nav>

      <div className="mt-8">
        {tab === "overview" && (
          <TabPanel id="overview">
            <OverviewTab agent={agent} />
          </TabPanel>
        )}
        {tab === "wallet" && (
          <TabPanel id="wallet">
            <WalletTab agent={agent} />
          </TabPanel>
        )}
        {tab === "policies" && (
          <TabPanel id="policies">
            <PoliciesTab agent={agent} />
          </TabPanel>
        )}
        {tab === "activity" && (
          <TabPanel id="activity">
            <ActivityTab entries={activity} />
          </TabPanel>
        )}
      </div>
    </div>
  );
}

function TabPanel({ id, children }: { id: TabId; children: ReactNode }) {
  return (
    <div id={`agent-panel-${id}`} role="tabpanel" aria-labelledby={`agent-tab-${id}`} tabIndex={0}>
      {children}
    </div>
  );
}

function Card({ title, children, className }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-lg bg-surface p-6 shadow-md", className)}>
      {title && <h2 className="text-h4">{title}</h2>}
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 border-b border-border py-2.5 last:border-0">
      <dt className="shrink-0 text-label text-muted">{label}</dt>
      <dd className="min-w-0 text-right">{children}</dd>
    </div>
  );
}

function EmptyNote({ children }: { children: ReactNode }) {
  return <p className="rounded-md bg-info-soft px-4 py-3 text-body-sm text-info">{children}</p>;
}

function CopyValue({ value, displayValue, label }: { value: string; displayValue?: string; label: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1_500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <span className="inline-flex max-w-full items-center justify-end gap-1.5">
      <span className="min-w-0 break-all font-mono text-mono-sm" title={value}>
        {displayValue ?? value}
      </span>
      <button
        type="button"
        onClick={handleCopy}
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-brand-soft hover:text-brand-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        aria-label={copied ? `${label} copied` : `Copy ${label}`}
        title={copied ? "Copied" : `Copy ${label}`}
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-success" aria-hidden="true" />
        ) : (
          <Copy className="h-3.5 w-3.5" aria-hidden="true" />
        )}
      </button>
    </span>
  );
}

function StatusBadge({ status, prefix }: { status: EffectivePolicyStatus; prefix?: "Stored" | "Effective" }) {
  const meta = POLICY_STATUS_META[status];
  const Icon = meta.icon;
  return (
    <Badge tone={meta.tone}>
      <Icon className="h-3 w-3" aria-hidden="true" />
      {prefix ? `${prefix}: ${meta.label}` : meta.label}
    </Badge>
  );
}

function WalletStatusBadge({ status }: { status: ProtectedWalletInfo["status"] }) {
  const meta = WALLET_STATUS_META[status];
  const Icon = meta.icon;
  return (
    <Badge tone={meta.tone}>
      <Icon className="h-3 w-3" aria-hidden="true" />
      {meta.label}
    </Badge>
  );
}

function OverviewTab({ agent }: { agent: AgentDetail }) {
  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Agent">
          <dl className="mt-4">
            <Row label="Agent ID">
              <CopyValue value={agent.id} label="agent ID" />
            </Row>
            <Row label="Type">
              <span className="text-body-sm">{agent.type}</span>
            </Row>
            {agent.hederaAccountId && (
              <Row label="Hedera account">
                <CopyValue value={agent.hederaAccountId} label="Hedera account" />
              </Row>
            )}
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
          {agent.agenticId && (
            <a
              href={agent.agenticId.explorerUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex min-h-11 items-center border-t border-border pt-4 text-body-sm font-medium text-brand-strong underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              View 0G Agentic ID (token #{agent.agenticId.tokenId})
            </a>
          )}
        </Card>

        <ProtectionChain agent={agent} />
      </div>

      <Card title="Capabilities">
        <p className="mt-1 text-body-sm text-muted">
          What this agent may request. The effective policy still prechecks every supported transfer.
        </p>
        {agent.capabilities.length === 0 ? (
          <p className="mt-4 text-body-sm text-subtle">No capabilities recorded for this agent.</p>
        ) : (
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {agent.capabilities.map(capability => (
              <li
                key={capability}
                className="flex items-center gap-2.5 rounded-md border border-border bg-surface-raised px-3 py-2 text-body-sm"
              >
                <ShieldCheck className="h-4 w-4 shrink-0 text-brand-strong" aria-hidden="true" />
                {CAPABILITY_LABELS[capability]}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function ProtectionChain({ agent }: { agent: AgentDetail }) {
  const activePolicy = agent.activePolicy;
  const effectiveStatus = agent.effectivePolicyStatus;

  return (
    <Card title="Protection chain">
      <p className="mt-1 text-body-sm text-muted">
        A request belongs to an agent, is scoped to one protected wallet, and is checked against its effective policy.
      </p>
      <ol className="mt-4">
        <li className="rounded-md border border-border bg-surface-raised p-3">
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-body-sm font-semibold">
              <Bot className="h-4 w-4 text-brand-strong" aria-hidden="true" />
              1. Agent
            </span>
            <Badge tone={AGENT_STATUS_META[agent.agentLifecycleStatus].tone}>
              {(() => {
                const Icon = AGENT_STATUS_META[agent.agentLifecycleStatus].icon;
                return <Icon className="h-3 w-3" aria-hidden="true" />;
              })()}
              {AGENT_STATUS_META[agent.agentLifecycleStatus].label}
            </Badge>
          </div>
          <div className="mt-2">
            <CopyValue value={agent.id} label="agent ID" />
          </div>
        </li>
        <li className="flex h-7 items-center pl-5" aria-hidden="true">
          <ArrowDown className="h-4 w-4 text-subtle" />
        </li>
        <li className="rounded-md border border-border bg-surface-raised p-3">
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-body-sm font-semibold">
              <Wallet className="h-4 w-4 text-brand-strong" aria-hidden="true" />
              2. Protected wallet
            </span>
            {agent.walletInfo ? (
              <WalletStatusBadge status={agent.walletInfo.status} />
            ) : (
              <Badge tone="neutral">
                <ShieldOff className="h-3 w-3" aria-hidden="true" />
                Not configured
              </Badge>
            )}
          </div>
          <div className="mt-2">
            {agent.walletInfo ? (
              <CopyValue
                value={agent.walletInfo.walletId}
                displayValue={truncateAddress(agent.walletInfo.walletId)}
                label="wallet ID"
              />
            ) : (
              <span className="text-body-sm text-subtle">No wallet identity</span>
            )}
          </div>
        </li>
        <li className="flex h-7 items-center pl-5" aria-hidden="true">
          <ArrowDown className="h-4 w-4 text-subtle" />
        </li>
        <li className="rounded-md border border-border bg-surface-raised p-3">
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-body-sm font-semibold">
              <FileText className="h-4 w-4 text-brand-strong" aria-hidden="true" />
              3. Effective policy
            </span>
            {effectiveStatus ? (
              <StatusBadge status={effectiveStatus} />
            ) : (
              <Badge tone="neutral">
                <ShieldOff className="h-3 w-3" aria-hidden="true" />
                None
              </Badge>
            )}
          </div>
          <div className="mt-2">
            {activePolicy ? (
              <CopyValue
                value={activePolicy.policyHash}
                displayValue={`v${activePolicy.policyVersion} · ${truncateAddress(activePolicy.policyHash)}`}
                label="policy hash"
              />
            ) : (
              <span className="text-body-sm text-subtle">No active policy version</span>
            )}
          </div>
        </li>
      </ol>
    </Card>
  );
}

type WalletOwner = {
  name: string;
  address: string;
  role: string;
  dormant: boolean;
};

function WalletTab({ agent }: { agent: AgentDetail }) {
  const wallet = agent.walletInfo;
  const safeBalance = useBalance({ address: wallet?.address as `0x${string}` | undefined });

  if (!wallet) {
    return (
      <EmptyNote>
        No protected wallet is linked to this agent. Wallet and policy identities appear here after onboarding.
      </EmptyNote>
    );
  }

  const owners = [
    wallet.agentSigner
      ? {
          name: "Agent signer",
          address: wallet.agentSigner,
          role: "Signs routine agent requests",
          dormant: false,
        }
      : null,
    wallet.aegisCosigner
      ? {
          name: "AEGIS co-signer",
          address: wallet.aegisCosigner,
          role: "Required by the protected wallet threshold",
          dormant: false,
        }
      : null,
    wallet.guardian
      ? {
          name: "Recovery guardian",
          address: wallet.guardian,
          role: wallet.guardianManaged ? "AEGIS-managed · recovery only" : "Operator-managed · recovery only",
          dormant: true,
        }
      : null,
  ].filter((owner): owner is WalletOwner => owner !== null);

  return (
    <div className="space-y-5">
      <Card title="Protected wallet">
        <div className="mt-3 flex flex-wrap gap-2">
          <WalletStatusBadge status={wallet.status} />
          <Badge tone="info">
            <KeyRound className="h-3 w-3" aria-hidden="true" />
            Threshold {wallet.threshold}
          </Badge>
        </div>
        <dl className="mt-4">
          <Row label="Wallet ID">
            <CopyValue value={wallet.walletId} label="wallet ID" />
          </Row>
          <Row label="Safe address">
            <CopyValue value={wallet.address} displayValue={truncateAddress(wallet.address)} label="Safe address" />
          </Row>
          <Row label="Network">
            <span className="font-mono text-mono-sm text-muted">{wallet.networkId}</span>
          </Row>
          <Row label="Wallet status">
            <WalletStatusBadge status={wallet.status} />
          </Row>
          <Row label="Threshold">
            <span className="font-mono text-mono-sm">{wallet.threshold}</span>
          </Row>
          <Row label="Balance">
            <span className="font-mono text-mono-md font-medium tabular-nums">
              {safeBalance.data
                ? formatHbar(Number(formatUnits(safeBalance.data.value, safeBalance.data.decimals)))
                : "—"}
            </span>
          </Row>
        </dl>

        <FundWalletCard safeAddress={wallet.address as `0x${string}`} />

        <a
          href={`https://hashscan.io/testnet/account/${wallet.address}`}
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-flex min-h-11 items-center text-body-sm font-medium text-brand-strong underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          View account on HashScan
        </a>
      </Card>

      <Card title="Wallet owners">
        {owners.length === 0 ? (
          <p className="mt-3 text-body-sm text-subtle">
            Owner addresses were not returned by the wallet service for this record.
          </p>
        ) : (
          <ul className="mt-4 space-y-2.5">
            {owners.map(owner => (
              <li
                key={owner.name}
                className={cn(
                  "flex flex-wrap items-center gap-3 rounded-md border p-3",
                  owner.dormant ? "border-dashed border-border-strong" : "border-border bg-surface-raised",
                )}
              >
                <span
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                    owner.dormant ? "bg-surface" : "bg-brand-soft",
                  )}
                >
                  {owner.dormant ? (
                    <MoonStar className="h-4 w-4 text-subtle" aria-hidden="true" />
                  ) : (
                    <KeyRound className="h-4 w-4 text-brand-strong" aria-hidden="true" />
                  )}
                </span>
                <span className="min-w-48 flex-1">
                  <span className="block text-body-sm font-semibold">{owner.name}</span>
                  <span className="block text-caption text-muted">{owner.role}</span>
                </span>
                <CopyValue
                  value={owner.address}
                  displayValue={truncateAddress(owner.address)}
                  label={`${owner.name} address`}
                />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function PoliciesTab({ agent }: { agent: AgentDetail }) {
  const versions = collectPolicyVersions(agent);
  const activePolicy = agent.activePolicy;
  const [selectedPolicyId, setSelectedPolicyId] = useState(activePolicy?.policyId ?? versions[0]?.policyId ?? "");
  const selectedPolicy =
    versions.find(policy => policy.policyId === selectedPolicyId) ?? activePolicy ?? versions[0] ?? null;

  if (versions.length === 0) {
    return (
      <div className="space-y-4">
        {agent.policyLoadError && <PolicyLoadError message={agent.policyLoadError} />}
        <EmptyNote>No policy versions are attached to this protected wallet yet.</EmptyNote>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {agent.policyLoadError && <PolicyLoadError message={agent.policyLoadError} />}

      <Card title="Effective policy">
        {activePolicy ? (
          <>
            <div className="mt-3 flex flex-wrap gap-2">
              <StatusBadge status={activePolicy.status} prefix="Stored" />
              <StatusBadge status={agent.effectivePolicyStatus ?? activePolicy.status} prefix="Effective" />
            </div>
            <dl className="mt-4 grid gap-x-8 md:grid-cols-2">
              <Row label="Version">
                <span className="font-mono text-mono-sm">v{activePolicy.policyVersion}</span>
              </Row>
              <Row label="Policy ID">
                <CopyValue value={activePolicy.policyId} label="policy ID" />
              </Row>
              <Row label="Policy hash">
                <CopyValue
                  value={activePolicy.policyHash}
                  displayValue={truncateAddress(activePolicy.policyHash)}
                  label="policy hash"
                />
              </Row>
              <Row label="Effective until">
                <span className="font-mono text-mono-sm">{formatPolicyValidity(activePolicy.validUntil)}</span>
              </Row>
            </dl>
          </>
        ) : (
          <div className="mt-4">
            <EmptyNote>
              These versions are historical or draft records. This wallet currently has no active policy.
            </EmptyNote>
          </div>
        )}
      </Card>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(240px,0.75fr)_minmax(0,2fr)]">
        <Card title="Version history">
          <p className="mt-1 text-body-sm text-muted">Newest version first. Select one to inspect its full rules.</p>
          <ol className="mt-4 space-y-2">
            {versions.map(policy => (
              <li key={policy.policyId}>
                <button
                  type="button"
                  onClick={() => setSelectedPolicyId(policy.policyId)}
                  aria-pressed={selectedPolicy?.policyId === policy.policyId}
                  className={cn(
                    "w-full rounded-md border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
                    selectedPolicy?.policyId === policy.policyId
                      ? "border-brand bg-brand-soft/40"
                      : "border-border bg-surface-raised hover:border-border-strong",
                  )}
                >
                  <span className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-mono-md font-semibold">v{policy.policyVersion}</span>
                    <StatusBadge
                      status={
                        policy.policyId === activePolicy?.policyId && agent.effectivePolicyStatus === "EXPIRED"
                          ? "EXPIRED"
                          : policy.status
                      }
                    />
                  </span>
                  <span className="mt-2 block truncate font-mono text-mono-sm text-muted" title={policy.policyId}>
                    {policy.policyId}
                  </span>
                  <span className="mt-1 block text-caption text-subtle">
                    Updated {formatDateTime(policy.updatedAt)}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </Card>

        {selectedPolicy && (
          <PolicyVersionDetails
            policy={selectedPolicy}
            effectiveStatus={selectedPolicy.policyId === activePolicy?.policyId ? agent.effectivePolicyStatus : null}
          />
        )}
      </div>
    </div>
  );
}

function PolicyLoadError({ message }: { message: string }) {
  return (
    <div role="alert" className="flex gap-3 rounded-md border border-warning/25 bg-warning-soft px-4 py-3">
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
      <div>
        <p className="text-body-sm font-semibold text-warning">Policy data may be incomplete</p>
        <p className="mt-0.5 text-body-sm text-muted">{message}</p>
      </div>
    </div>
  );
}

function PolicyVersionDetails({
  policy,
  effectiveStatus,
}: {
  policy: Policy;
  effectiveStatus: EffectivePolicyStatus | null;
}) {
  const rules = policy.rules;
  const amountAsset = rules.allowedAssets.length === 1 ? rules.allowedAssets[0] : undefined;

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-label text-muted">Selected version</p>
          <h2 className="mt-1 text-h4">Policy v{policy.policyVersion}</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusBadge status={policy.status} prefix="Stored" />
          {effectiveStatus && <StatusBadge status={effectiveStatus} prefix="Effective" />}
        </div>
      </div>

      <section className="mt-6 border-t border-border pt-5">
        <h3 className="text-body font-semibold">Identity</h3>
        <dl className="mt-2">
          <Row label="Policy ID">
            <CopyValue value={policy.policyId} label="policy ID" />
          </Row>
          <Row label="Policy hash">
            <CopyValue
              value={policy.policyHash}
              displayValue={truncateAddress(policy.policyHash)}
              label="policy hash"
            />
          </Row>
          <Row label="Agent ID">
            <CopyValue value={policy.agentId} label="agent ID" />
          </Row>
          <Row label="Wallet ID">
            <CopyValue value={policy.walletId} label="wallet ID" />
          </Row>
        </dl>
      </section>

      <section className="mt-6 border-t border-border pt-5">
        <h3 className="text-body font-semibold">Assets</h3>
        {rules.allowedAssets.length === 0 ? (
          <p className="mt-2 text-body-sm text-subtle">No allowed assets.</p>
        ) : (
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {rules.allowedAssets.map(asset => {
              const identity = asset.kind === "NATIVE" ? asset.assetId : asset.tokenId;
              return (
                <li
                  key={`${asset.kind}:${identity}:${asset.chainId}`}
                  className="rounded-md border border-border bg-surface-raised p-3"
                >
                  <span className="block text-body-sm font-semibold">
                    {asset.kind === "NATIVE" ? "Native HBAR" : "HTS fungible token"}
                  </span>
                  <span className="mt-1 block break-all font-mono text-mono-sm text-muted">{identity}</span>
                  <span className="mt-1 block text-caption text-subtle">
                    Chain {asset.chainId} · {asset.decimals} decimals
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="mt-6 border-t border-border pt-5">
        <h3 className="text-body font-semibold">Allowed actions</h3>
        {rules.allowedActionTypes.length === 0 ? (
          <p className="mt-2 text-body-sm text-subtle">No allowed action types.</p>
        ) : (
          <ul className="mt-3 flex flex-wrap gap-2">
            {rules.allowedActionTypes.map(actionType => (
              <li key={actionType} className="rounded-full bg-info-soft px-3 py-1.5 text-body-sm text-info">
                {formatActionType(actionType)}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-6 border-t border-border pt-5">
        <h3 className="text-body font-semibold">Allowed destinations</h3>
        {rules.allowedDestinations.length === 0 ? (
          <p className="mt-2 text-body-sm text-subtle">No allowed destinations.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {rules.allowedDestinations.map(destination => (
              <li
                key={`${destination.kind}:${destination.value}`}
                className="rounded-md border border-border bg-surface-raised p-3"
              >
                <span className="block text-label text-muted">{formatDestinationKind(destination.kind)}</span>
                <span className="mt-1 block break-all font-mono text-mono-sm">{destination.value}</span>
                {"chainId" in destination && destination.chainId !== undefined && (
                  <span className="mt-1 block text-caption text-subtle">Chain {destination.chainId}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-6 border-t border-border pt-5">
        <h3 className="text-body font-semibold">Limits</h3>
        {rules.allowedAssets.length > 1 && (
          <p className="mt-1 text-caption text-muted">
            Multiple assets are present, so amount limits are shown in canonical base units.
          </p>
        )}
        <dl className="mt-2">
          <Row label="Minimum per action">
            <span className="font-mono text-mono-sm">{formatPolicyAmount(rules.amount.min, amountAsset)}</span>
          </Row>
          <Row label="Maximum per action">
            <span className="font-mono text-mono-sm">{formatPolicyAmount(rules.amount.max, amountAsset)}</span>
          </Row>
          <Row label="Daily amount">
            <span className="font-mono text-mono-sm">{formatPolicyAmount(rules.amount.dailyLimit, amountAsset)}</span>
          </Row>
          <Row label="Daily action count">
            <span className="font-mono text-mono-sm">{rules.actionCount.dailyLimit ?? "No limit"}</span>
          </Row>
        </dl>
      </section>

      <section className="mt-6 border-t border-border pt-5">
        <h3 className="text-body font-semibold">Validity</h3>
        <dl className="mt-2">
          <Row label="Valid from">
            <span className="font-mono text-mono-sm">{formatDateTime(policy.validFrom)}</span>
          </Row>
          <Row label="Valid until">
            <span className="font-mono text-mono-sm">{formatPolicyValidity(policy.validUntil)}</span>
          </Row>
        </dl>
      </section>

      <section className="mt-6 border-t border-border pt-5">
        <h3 className="text-body font-semibold">Semantic rules</h3>
        {policy.semanticRules.length === 0 ? (
          <p className="mt-2 text-body-sm text-subtle">No semantic rules stored in this version.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {policy.semanticRules.map(rule => (
              <li key={rule.ruleId} className="rounded-md border border-border bg-surface-raised p-3">
                <span className="text-body-sm font-semibold">{rule.kind}</span>
                <span className="ml-2 font-mono text-mono-sm text-muted">{rule.ruleId}</span>
                <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words font-mono text-mono-sm text-muted">
                  {JSON.stringify(rule.params, null, 2)}
                </pre>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-6 border-t border-border pt-5">
        <h3 className="text-body font-semibold">Audit metadata</h3>
        <dl className="mt-2">
          <Row label="Created">
            <AuditTimestamp value={policy.createdAt} />
          </Row>
          <Row label="Updated">
            <AuditTimestamp value={policy.updatedAt} />
          </Row>
          <Row label="Activated">
            <AuditTimestamp value={policy.activatedAt} />
          </Row>
          <Row label="Revoked">
            <AuditTimestamp value={policy.revokedAt} />
          </Row>
          <Row label="Superseded">
            <AuditTimestamp value={policy.supersededAt} />
          </Row>
          <Row label="Superseded by">
            {policy.supersededByPolicyId ? (
              <CopyValue value={policy.supersededByPolicyId} label="superseding policy ID" />
            ) : (
              <span className="text-body-sm text-subtle">Not applicable</span>
            )}
          </Row>
        </dl>
      </section>
    </Card>
  );
}

function AuditTimestamp({ value }: { value: number | null }) {
  return (
    <span className="font-mono text-mono-sm text-muted">
      {value === null ? "Not applicable" : formatDateTime(value)}
    </span>
  );
}

function ActivityTab({ entries }: { entries: ActivityEntry[] }) {
  if (entries.length === 0) {
    return <EmptyNote>No activity yet for this agent.</EmptyNote>;
  }
  return <ActivityTable entries={entries} />;
}

function collectPolicyVersions(agent: AgentDetail): Policy[] {
  const byPolicyId = new Map<string, Policy>();
  for (const policy of [...agent.policyVersions, agent.policy, agent.activePolicy]) {
    if (policy) byPolicyId.set(policy.policyId, policy);
  }
  return [...byPolicyId.values()].sort(
    (left, right) => right.policyVersion - left.policyVersion || right.updatedAt - left.updatedAt,
  );
}

function getProtectionStatus(agent: AgentDetail): ProtectionStatus {
  if (!agent.walletInfo) return "unprotected";
  if (agent.walletInfo.status === "PAUSED") return "paused";
  if (agent.walletInfo.status === "RETIRED") return "retired";
  if (agent.walletInfo.status === "DEAD") return "unavailable";
  if (agent.effectivePolicyStatus === "ACTIVE") return "active";
  if (agent.effectivePolicyStatus === "EXPIRED") return "expired";
  if (agent.policy?.status === "DRAFT" || agent.policyVersions.some(policy => policy.status === "DRAFT")) {
    return "draft";
  }
  return "unprotected";
}

function formatActionType(actionType: string): string {
  const labels: Record<string, string> = {
    HEDERA_HBAR_TRANSFER: "HBAR transfer",
    HEDERA_HTS_FUNGIBLE_TRANSFER: "HTS fungible token transfer",
  };
  return labels[actionType] ?? actionType.toLowerCase().replaceAll("_", " ");
}

function formatDestinationKind(kind: string): string {
  const labels: Record<string, string> = {
    EVM_ADDRESS: "EVM address",
    HEDERA_ACCOUNT_ID: "Hedera account ID",
    URL_ORIGIN: "URL origin",
  };
  return labels[kind] ?? kind.toLowerCase().replaceAll("_", " ");
}
