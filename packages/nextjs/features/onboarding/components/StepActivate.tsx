"use client";

import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Ban,
  Bot,
  CheckCircle2,
  CircleDashed,
  History,
  Loader2,
  ScrollText,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useSignTypedData } from "wagmi";
import { Button } from "~~/components/ui/Button";
import { useConnectWallet } from "~~/features/wallet/components/ConnectWalletProvider";
import { type PolicyPhase, type SignPolicyCommitment, activateProtection } from "~~/lib/api/onboarding";
import { type AgentProfile, CAPABILITY_LABELS, type Policy, type ProtectedWalletInfo } from "~~/lib/types/aegis";
import { formatDateTime, formatPolicyAmount } from "~~/lib/utils/format";

const PHASE_LABEL: Record<PolicyPhase, string> = {
  wallet: "Confirming the protected wallet…",
  "sign-policy": "Waiting for the policy signature…",
  "sign-activation": "Waiting for the activation signature…",
};

const ACTION_LABEL: Record<string, string> = {
  HEDERA_HBAR_TRANSFER: "HBAR transfer",
  HEDERA_HTS_FUNGIBLE_TRANSFER: "HTS fungible-token transfer",
};

const STATUS_PRESENTATION: Record<Policy["status"], { label: string; className: string; icon: LucideIcon }> = {
  DRAFT: {
    label: "Draft",
    className: "bg-warning-soft text-warning",
    icon: CircleDashed,
  },
  ACTIVE: {
    label: "Active",
    className: "bg-success-soft text-success",
    icon: CheckCircle2,
  },
  SUPERSEDED: {
    label: "Superseded",
    className: "bg-surface-raised text-muted",
    icon: History,
  },
  REVOKED: {
    label: "Revoked",
    className: "bg-danger-soft text-danger",
    icon: Ban,
  },
};

type StepActivateProps = {
  agent: AgentProfile;
  wallet: ProtectedWalletInfo;
  policy: Policy;
  onBack: () => void;
  onActivated: (activePolicy: Policy) => void;
};

export function StepActivate({ agent, wallet, policy, onBack, onActivated }: StepActivateProps) {
  const { address } = useConnectWallet();
  const { signTypedDataAsync } = useSignTypedData();
  const signCommitment: SignPolicyCommitment = params => signTypedDataAsync(params);

  const [acknowledged, setAcknowledged] = useState(false);
  const [currentPolicy, setCurrentPolicy] = useState(policy);
  const [phase, setPhase] = useState<PolicyPhase | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasAttempted, setHasAttempted] = useState(false);

  useEffect(() => {
    setCurrentPolicy(policy);
    setError(null);
    setHasAttempted(false);
  }, [policy]);

  const isActive = currentPolicy.status === "ACTIVE";
  const canProceed = currentPolicy.status === "DRAFT" || isActive;
  const asset = currentPolicy.rules.allowedAssets[0];

  async function handleActivate() {
    setError(null);
    setHasAttempted(true);
    if (!address) {
      setError("Your wallet disconnected. Reconnect it to confirm this policy.");
      return;
    }

    try {
      const activePolicy = await activateProtection(
        agent.id,
        currentPolicy,
        address as `0x${string}`,
        signCommitment,
        setPhase,
      );
      setCurrentPolicy(activePolicy);
      onActivated(activePolicy);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Activation could not be confirmed. Try again.");
    } finally {
      setPhase(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-2">
        <SummaryCard icon={Bot} eyebrow="Agent" title={agent.name}>
          <SummaryRow label="Agent ID" value={agent.id} mono />
          <SummaryRow label="Type" value={agent.type} />
          <SummaryRow
            label="Capabilities"
            value={agent.capabilities.map(capability => CAPABILITY_LABELS[capability]).join(" · ") || "None declared"}
          />
        </SummaryCard>

        <SummaryCard icon={WalletCards} eyebrow="Protected wallet" title={wallet.threshold}>
          <SummaryRow label="Status" value={wallet.status} status />
          <SummaryRow label="Wallet ID" value={wallet.walletId} mono />
          <SummaryRow label="Address" value={wallet.address} mono />
          <SummaryRow label="Network" value={wallet.networkId} />
        </SummaryCard>
      </div>

      <section aria-labelledby="activation-policy-heading" className="rounded-lg bg-surface p-5 shadow-md">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-brand-soft">
              <ScrollText aria-hidden="true" className="h-4 w-4 text-brand-strong" />
            </span>
            <div>
              <p className="text-caption font-semibold uppercase tracking-wide text-subtle">Policy</p>
              <h2 id="activation-policy-heading" className="mt-1 text-h4">
                Version {currentPolicy.policyVersion}
              </h2>
            </div>
          </div>
          <PolicyStatusBadge status={currentPolicy.status} />
        </div>

        <div className="mt-5 grid gap-x-8 gap-y-5 border-t border-border pt-5 md:grid-cols-2">
          <PolicySection title="Allowed actions">
            <ul className="space-y-1.5">
              {currentPolicy.rules.allowedActionTypes.map(action => (
                <li key={action} className="flex items-start gap-2 text-body-sm text-foreground">
                  <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  <span>
                    {ACTION_LABEL[action] ?? action}
                    <span className="mt-0.5 block font-mono text-mono-sm text-subtle">{action}</span>
                  </span>
                </li>
              ))}
            </ul>
          </PolicySection>

          <PolicySection title="Allowed asset">
            {asset ? (
              <dl className="space-y-2">
                <SummaryRow
                  label="Asset"
                  value={asset.kind === "NATIVE" ? "HBAR" : asset.tokenId}
                  mono={asset.kind === "HTS"}
                />
                <SummaryRow label="Type" value={asset.kind === "NATIVE" ? "Native" : "HTS fungible token"} />
                <SummaryRow label="Decimals" value={String(asset.decimals)} />
                <SummaryRow label="Chain ID" value={String(asset.chainId)} mono />
              </dl>
            ) : (
              <p className="text-body-sm text-danger">No asset configured.</p>
            )}
          </PolicySection>

          <PolicySection title="Allowed destinations">
            {currentPolicy.rules.allowedDestinations.length > 0 ? (
              <ul className="space-y-2">
                {currentPolicy.rules.allowedDestinations.map((destination, index) => (
                  <li
                    key={`${destination.kind}-${destination.value}-${index}`}
                    className="rounded-md bg-surface-raised p-3"
                  >
                    <span className="text-caption font-semibold text-subtle">{destinationLabel(destination.kind)}</span>
                    <code className="mt-1 block break-all text-mono-sm text-foreground">{destination.value}</code>
                    {"chainId" in destination && destination.chainId !== undefined && (
                      <span className="mt-1 block text-caption text-muted">Chain ID {destination.chainId}</span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-body-sm text-danger">No destinations configured.</p>
            )}
          </PolicySection>

          <PolicySection title="Amount and frequency limits">
            <dl className="space-y-2">
              <SummaryRow
                label="Minimum"
                value={
                  currentPolicy.rules.amount.min === null
                    ? "No minimum"
                    : formatPolicyAmount(currentPolicy.rules.amount.min, asset)
                }
              />
              <SummaryRow
                label="Maximum per action"
                value={formatPolicyAmount(currentPolicy.rules.amount.max, asset)}
              />
              <SummaryRow
                label="Daily amount"
                value={formatPolicyAmount(currentPolicy.rules.amount.dailyLimit, asset)}
              />
              <SummaryRow
                label="Daily action count"
                value={
                  currentPolicy.rules.actionCount.dailyLimit === null
                    ? "No limit"
                    : String(currentPolicy.rules.actionCount.dailyLimit)
                }
              />
            </dl>
          </PolicySection>

          <PolicySection title="Validity">
            <dl className="space-y-2">
              <SummaryRow label="Valid from" value={formatDateTime(currentPolicy.validFrom)} />
              <SummaryRow
                label="Valid until"
                value={currentPolicy.validUntil === null ? "No expiry" : formatDateTime(currentPolicy.validUntil)}
              />
            </dl>
          </PolicySection>

          <div className="md:col-span-2">
            <PolicySection title="Commitment">
              <dl className="grid gap-3 md:grid-cols-2">
                <div>
                  <dt className="text-caption text-subtle">Policy ID</dt>
                  <dd>
                    <code className="mt-1 block break-all text-mono-sm text-foreground">{currentPolicy.policyId}</code>
                  </dd>
                </div>
                <div>
                  <dt className="text-caption text-subtle">Policy hash</dt>
                  <dd>
                    <code className="mt-1 block break-all text-mono-sm text-foreground">
                      {currentPolicy.policyHash}
                    </code>
                  </dd>
                </div>
              </dl>
            </PolicySection>
          </div>
        </div>
      </section>

      <fieldset className="rounded-md border border-border bg-surface-raised p-4">
        <legend className="sr-only">Activation acknowledgement</legend>
        <label className="flex cursor-pointer items-start gap-3 text-body-sm">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={event => setAcknowledged(event.target.checked)}
            className="mt-0.5 h-5 w-5 shrink-0 accent-(--color-brand-strong) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-strong"
          />
          <span className="text-muted">
            I reviewed this policy and understand that Level 1 activation records the enforceable policy for evaluation.
            It does not by itself execute transactions, co-sign them, insure funds, or remediate counterparty failures.
          </span>
        </label>
      </fieldset>

      <div aria-live="polite" aria-atomic="true" className="min-h-6">
        {phase && (
          <p role="status" className="flex items-center gap-2 font-mono text-mono-sm text-muted">
            <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
            {PHASE_LABEL[phase]}
          </p>
        )}
        {!phase && error && (
          <p role="alert" className="rounded-md bg-danger-soft px-4 py-3 text-body-sm text-danger">
            {error}
            <span className="mt-1 block text-caption">
              A retry checks the authoritative policy status before requesting another signature.
            </span>
          </p>
        )}
        {!phase && !error && isActive && (
          <p role="status" className="flex items-center gap-2 text-body-sm text-success">
            <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
            Policy active. Continue to finish setup.
          </p>
        )}
      </div>

      <div className="flex flex-col-reverse items-stretch justify-between gap-3 sm:flex-row sm:items-center">
        <Button variant="secondary" size="sm" onClick={onBack} disabled={phase !== null}>
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          Back
        </Button>
        <Button
          size="lg"
          onClick={handleActivate}
          disabled={!acknowledged || phase !== null || !canProceed}
          className="min-h-11"
        >
          {phase ? (
            <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
          ) : (
            <ShieldCheck aria-hidden="true" className="h-4 w-4" />
          )}
          {activationButtonLabel(currentPolicy.status, hasAttempted, phase !== null)}
        </Button>
      </div>
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  eyebrow,
  title,
  children,
}: {
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg bg-surface p-5 shadow-md">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-brand-soft">
          <Icon aria-hidden="true" className="h-4 w-4 text-brand-strong" />
        </span>
        <div className="min-w-0">
          <p className="text-caption font-semibold uppercase tracking-wide text-subtle">{eyebrow}</p>
          <h2 className="mt-1 break-words text-h4">{title}</h2>
        </div>
      </div>
      <dl className="mt-4 space-y-2 border-t border-border pt-4">{children}</dl>
    </section>
  );
}

function PolicySection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-body-sm font-semibold text-foreground">{title}</h3>
      {children}
    </section>
  );
}

function SummaryRow({
  label,
  value,
  mono = false,
  status = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
  status?: boolean;
}) {
  return (
    <div className="grid min-w-0 grid-cols-[minmax(7rem,0.42fr)_minmax(0,1fr)] gap-3 text-body-sm">
      <dt className="text-subtle">{label}</dt>
      <dd className={`min-w-0 break-all text-right text-foreground ${mono ? "font-mono text-mono-sm" : ""}`}>
        {status ? (
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck aria-hidden="true" className="h-4 w-4 text-success" />
            {value}
          </span>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}

function PolicyStatusBadge({ status }: { status: Policy["status"] }) {
  const presentation = STATUS_PRESENTATION[status];
  const Icon = presentation.icon;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-caption font-semibold ${presentation.className}`}
    >
      <Icon aria-hidden="true" className="h-3.5 w-3.5" />
      {presentation.label}
    </span>
  );
}

function destinationLabel(kind: Policy["rules"]["allowedDestinations"][number]["kind"]) {
  if (kind === "EVM_ADDRESS") return "EVM address";
  if (kind === "HEDERA_ACCOUNT_ID") return "Hedera account ID";
  return "URL origin";
}

function activationButtonLabel(status: Policy["status"], hasAttempted: boolean, isLoading: boolean) {
  if (isLoading) return "Confirming policy…";
  if (status === "ACTIVE") return "Continue with active policy";
  if (status === "DRAFT") return hasAttempted ? "Retry activation" : "Activate policy";
  return `Policy ${status.toLowerCase()}`;
}
