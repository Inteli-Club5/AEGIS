"use client";

import { useState } from "react";
import { ArrowLeft, CheckCircle2, Loader2, Plus, Trash2 } from "lucide-react";
import { useSignTypedData } from "wagmi";
import { Button } from "~~/components/ui/Button";
import { useConnectWallet } from "~~/features/wallet/components/ConnectWalletProvider";
import { type PolicyPhase, type SignPolicyCommitment, createPolicy } from "~~/lib/api/onboarding";
import {
  type PolicyDestinationFormValue,
  type PolicyFormValues,
  emptyPolicyFormValues,
  parsePolicyForm,
  policyToFormValues,
} from "~~/lib/policy/form";
import type { AgentProfile, Policy, ProtectedWalletInfo } from "~~/lib/types/aegis";

const PHASE_LABEL: Record<PolicyPhase, string> = {
  wallet: "Preparing the protected wallet…",
  "sign-policy": "Waiting for your policy signature…",
  "sign-activation": "Waiting for your activation signature…",
};

const inputClass =
  "mt-2 min-h-11 w-full rounded-md border border-border bg-surface-raised px-3 text-body-sm transition-colors duration-[120ms] focus-visible:border-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-strong";

export function StepCreatePolicy({
  agent,
  initial,
  onBack,
  onCreated,
}: {
  agent: AgentProfile;
  initial?: Policy;
  onBack: () => void;
  onCreated: (policy: Policy, wallet: ProtectedWalletInfo) => void;
}) {
  const { address } = useConnectWallet();
  const { signTypedDataAsync } = useSignTypedData();
  const signCommitment: SignPolicyCommitment = params => signTypedDataAsync(params);
  const [values, setValues] = useState<PolicyFormValues>(() =>
    initial ? policyToFormValues(initial) : emptyPolicyFormValues(),
  );
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<PolicyPhase | null>(null);

  const assetLabel =
    values.assetKind === "HBAR"
      ? "HBAR · 8 decimals"
      : values.htsTokenId.trim()
        ? `${values.htsTokenId.trim()} · ${values.htsDecimals || "?"} decimals`
        : "HTS token";
  const actionLabel = values.assetKind === "HBAR" ? "Transfer HBAR" : "Transfer fungible HTS token";
  const submitLabel = initial ? `Create version v${initial.policyVersion + 1}` : "Create policy v1";

  function update<K extends keyof PolicyFormValues>(key: K, value: PolicyFormValues[K]) {
    setValues(previous => ({ ...previous, [key]: value }));
  }

  function updateDestination(index: number, patch: Partial<PolicyDestinationFormValue>) {
    update(
      "destinations",
      values.destinations.map((destination, destinationIndex) =>
        destinationIndex === index ? { ...destination, ...patch } : destination,
      ),
    );
  }

  function addDestination() {
    update("destinations", [...values.destinations, { kind: "HEDERA_ACCOUNT_ID", value: "" }]);
  }

  function removeDestination(index: number) {
    update(
      "destinations",
      values.destinations.filter((_, destinationIndex) => destinationIndex !== index),
    );
  }

  function updateTrustedService(patch: Partial<PolicyFormValues["trustedService"]>) {
    update("trustedService", { ...values.trustedService, ...patch });
  }

  function toggleTrustedService(enabled: boolean) {
    updateTrustedService({
      enabled,
      capabilityIds:
        enabled && !values.trustedService.capabilityIds
          ? agent.capabilities.join(", ")
          : values.trustedService.capabilityIds,
    });
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!address) {
      setError("Your wallet disconnected. Reconnect it to sign this policy version.");
      return;
    }

    let parsed: ReturnType<typeof parsePolicyForm>;
    try {
      parsed = parsePolicyForm(values);
    } catch (formError) {
      setError(formError instanceof Error ? formError.message : "Review the policy fields.");
      return;
    }

    try {
      const { policy, wallet } = await createPolicy(
        agent.id,
        address as `0x${string}`,
        parsed.rules,
        signCommitment,
        setPhase,
        {
          validFrom: parsed.validFrom,
          validUntil: parsed.validUntil,
          sourcePolicy: initial,
          recoveryGuardianAddress: parsed.recoveryGuardianAddress,
          semanticRules: parsed.semanticRules,
        },
      );
      onCreated(policy, wallet);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Creating this policy version failed.");
      setPhase(null);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <section className="rounded-lg bg-surface p-6 shadow-md">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-mono text-mono-sm text-brand-strong">
                {initial ? `Policy series · current v${initial.policyVersion}` : "New policy series"}
              </p>
              <h2 className="mt-1 text-h4">
                {submitLabel} for {agent.name}
              </h2>
              <p className="mt-1 text-body-sm text-muted">
                This version applies to agent <span className="font-mono">{agent.id}</span> and its protected wallet.
              </p>
            </div>
            {initial && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-info-soft px-3 py-1 font-mono text-mono-sm text-info">
                <CheckCircle2 className="h-3.5 w-3.5" />v{initial.policyVersion} remains immutable
              </span>
            )}
          </div>

          <div className="mt-7 space-y-8">
            <fieldset>
              <legend className="text-label">Asset and enforced action</legend>
              <p className="mt-1 text-caption text-subtle">
                Level 1 supports one asset per policy; its evaluator-compatible action is selected automatically.
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {(["HBAR", "HTS"] as const).map(kind => (
                  <label
                    key={kind}
                    className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md border border-border bg-surface-raised p-3 text-body-sm has-checked:border-brand"
                  >
                    <input
                      type="radio"
                      name="asset-kind"
                      value={kind}
                      checked={values.assetKind === kind}
                      onChange={() => update("assetKind", kind)}
                      className="mt-1 accent-(--color-brand-strong)"
                    />
                    <span>
                      <span className="block font-semibold">
                        {kind === "HBAR" ? "Native HBAR" : "Fungible HTS token"}
                      </span>
                      <span className="mt-0.5 block text-caption text-muted">
                        {kind === "HBAR" ? "Transfer HBAR · fixed 8 decimals" : "Transfer one pre-registered token"}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
              {values.assetKind === "HTS" && (
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <label className="text-label">
                    Token ID
                    <input
                      value={values.htsTokenId}
                      onChange={event => update("htsTokenId", event.target.value)}
                      placeholder="0.0.456789"
                      className={`${inputClass} font-mono`}
                      aria-describedby="hts-token-help"
                    />
                  </label>
                  <label className="text-label">
                    Token decimals
                    <input
                      value={values.htsDecimals}
                      onChange={event => update("htsDecimals", event.target.value)}
                      inputMode="numeric"
                      placeholder="6"
                      className={`${inputClass} font-mono`}
                    />
                  </label>
                  <p id="hts-token-help" className="text-caption text-subtle sm:col-span-2">
                    Use the token ID and decimals from its trusted registration metadata.
                  </p>
                </div>
              )}
            </fieldset>

            <fieldset>
              <legend className="text-label">Destination restriction (optional)</legend>
              <p className="mt-1 text-caption text-subtle">
                Leave this empty to allow any valid destination, or add Hedera account IDs and EVM addresses to create
                an allowlist.
              </p>
              <div className="mt-3 space-y-3">
                {values.destinations.map((destination, index) => (
                  <div key={index} className="grid gap-2 sm:grid-cols-[180px_minmax(0,1fr)_44px]">
                    <select
                      value={destination.kind}
                      onChange={event =>
                        updateDestination(index, {
                          kind: event.target.value as PolicyDestinationFormValue["kind"],
                        })
                      }
                      aria-label={`Destination ${index + 1} identity type`}
                      className={`${inputClass} mt-0`}
                    >
                      <option value="HEDERA_ACCOUNT_ID">Hedera account</option>
                      <option value="EVM_ADDRESS">EVM address</option>
                    </select>
                    <input
                      value={destination.value}
                      onChange={event => updateDestination(index, { value: event.target.value })}
                      placeholder={destination.kind === "HEDERA_ACCOUNT_ID" ? "0.0.123456" : "0x…"}
                      aria-label={`Destination ${index + 1}`}
                      className={`${inputClass} mt-0 font-mono`}
                    />
                    <button
                      type="button"
                      onClick={() => removeDestination(index)}
                      aria-label={`Remove destination ${index + 1}`}
                      className="flex h-11 w-11 items-center justify-center rounded-md text-muted transition-colors hover:bg-danger-soft hover:text-danger focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-strong"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
              <Button type="button" variant="secondary" size="sm" className="mt-3 min-h-11" onClick={addDestination}>
                <Plus className="h-4 w-4" />
                Add destination
              </Button>
            </fieldset>

            <fieldset>
              <legend className="text-label">Trusted service (optional)</legend>
              <p className="mt-1 text-caption text-subtle">
                Running an action through 0G TeeML verification requires the active policy to name exactly one trusted
                service. Leave this off if you only need Level 1 (deterministic) checks for now.
              </p>
              <label className="mt-3 flex min-h-11 cursor-pointer items-start gap-3 rounded-md border border-border bg-surface-raised p-3 text-body-sm has-checked:border-brand">
                <input
                  type="checkbox"
                  checked={values.trustedService.enabled}
                  onChange={event => toggleTrustedService(event.target.checked)}
                  className="mt-1 accent-(--color-brand-strong)"
                />
                <span>
                  <span className="block font-semibold">Name a trusted service for this policy</span>
                  <span className="mt-0.5 block text-caption text-muted">
                    Requires at least one destination configured above.
                  </span>
                </span>
              </label>
              {values.trustedService.enabled && (
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <label className="text-label">
                    Provider ID
                    <input
                      value={values.trustedService.providerId}
                      onChange={event => updateTrustedService({ providerId: event.target.value })}
                      placeholder="acme-market-data"
                      className={`${inputClass} font-mono`}
                    />
                  </label>
                  <label className="text-label">
                    Service ID
                    <input
                      value={values.trustedService.serviceId}
                      onChange={event => updateTrustedService({ serviceId: event.target.value })}
                      placeholder="market-data-api"
                      className={`${inputClass} font-mono`}
                    />
                  </label>
                  <label className="text-label">
                    Product ID (optional)
                    <input
                      value={values.trustedService.productId}
                      onChange={event => updateTrustedService({ productId: event.target.value })}
                      placeholder="realtime-tier"
                      className={`${inputClass} font-mono`}
                    />
                  </label>
                  <label className="text-label">
                    Categories (comma-separated)
                    <input
                      value={values.trustedService.categoryIds}
                      onChange={event => updateTrustedService({ categoryIds: event.target.value })}
                      placeholder="data, market-data"
                      className={`${inputClass} font-mono`}
                    />
                  </label>
                  <label className="text-label sm:col-span-2">
                    Required agent capabilities (comma-separated)
                    <input
                      value={values.trustedService.capabilityIds}
                      onChange={event => updateTrustedService({ capabilityIds: event.target.value })}
                      placeholder="call_api, pay_service_provider"
                      className={`${inputClass} font-mono`}
                    />
                  </label>
                  <label className="text-label sm:col-span-2">
                    Short description (optional)
                    <input
                      value={values.trustedService.shortDescription}
                      onChange={event => updateTrustedService({ shortDescription: event.target.value })}
                      placeholder="Real-time market data feed for treasury pricing"
                      className={inputClass}
                    />
                  </label>
                  <p className="text-caption text-subtle sm:col-span-2">
                    Matched against the exact <code>serviceId</code>/<code>productId</code> supplied when running an
                    action; destinations are taken from the allowlist above.
                  </p>
                </div>
              )}
            </fieldset>

            <fieldset>
              <legend className="text-label">Spending limits</legend>
              <p className="mt-1 text-caption text-subtle">
                Decimal text is converted exactly to integer base units; empty fields mean no limit.
              </p>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <AmountField
                  id="minimum-amount"
                  label="Minimum per action"
                  value={values.minAmount}
                  onChange={value => update("minAmount", value)}
                />
                <AmountField
                  id="maximum-amount"
                  label="Maximum per action"
                  value={values.maxAmount}
                  onChange={value => update("maxAmount", value)}
                />
                <AmountField
                  id="daily-amount"
                  label="Daily amount"
                  value={values.dailyAmount}
                  onChange={value => update("dailyAmount", value)}
                />
                <label htmlFor="daily-count" className="text-label">
                  Daily action count
                  <input
                    id="daily-count"
                    value={values.dailyActionCount}
                    onChange={event => update("dailyActionCount", event.target.value)}
                    inputMode="numeric"
                    placeholder="No limit"
                    className={`${inputClass} font-mono`}
                  />
                </label>
              </div>
            </fieldset>

            <fieldset>
              <legend className="text-label">Validity</legend>
              <p className="mt-1 text-caption text-subtle">
                Dates use your current timezone ({Intl.DateTimeFormat().resolvedOptions().timeZone}).
              </p>
              <div className="mt-3 grid gap-5 sm:grid-cols-2">
                <div>
                  <span className="text-body-sm font-semibold">Starts</span>
                  <label className="mt-2 flex min-h-11 items-center gap-2 text-body-sm">
                    <input
                      type="radio"
                      name="valid-from"
                      checked={values.validFromMode === "NOW"}
                      onChange={() => update("validFromMode", "NOW")}
                      className="accent-(--color-brand-strong)"
                    />
                    When this version is signed
                  </label>
                  <label className="flex min-h-11 items-center gap-2 text-body-sm">
                    <input
                      type="radio"
                      name="valid-from"
                      checked={values.validFromMode === "CUSTOM"}
                      onChange={() => update("validFromMode", "CUSTOM")}
                      className="accent-(--color-brand-strong)"
                    />
                    Custom start
                  </label>
                  {values.validFromMode === "CUSTOM" && (
                    <input
                      type="datetime-local"
                      value={values.validFromLocal}
                      onChange={event => update("validFromLocal", event.target.value)}
                      aria-label="Policy valid from"
                      className={`${inputClass} font-mono`}
                    />
                  )}
                </div>
                <div>
                  <span className="text-body-sm font-semibold">Expires</span>
                  <label className="mt-2 flex min-h-11 items-center gap-2 text-body-sm">
                    <input
                      type="radio"
                      name="valid-until"
                      checked={values.validUntilMode === "NONE"}
                      onChange={() => update("validUntilMode", "NONE")}
                      className="accent-(--color-brand-strong)"
                    />
                    No expiry
                  </label>
                  <label className="flex min-h-11 items-center gap-2 text-body-sm">
                    <input
                      type="radio"
                      name="valid-until"
                      checked={values.validUntilMode === "CUSTOM"}
                      onChange={() => update("validUntilMode", "CUSTOM")}
                      className="accent-(--color-brand-strong)"
                    />
                    Custom expiry
                  </label>
                  {values.validUntilMode === "CUSTOM" && (
                    <input
                      type="datetime-local"
                      value={values.validUntilLocal}
                      onChange={event => update("validUntilLocal", event.target.value)}
                      aria-label="Policy valid until"
                      className={`${inputClass} font-mono`}
                    />
                  )}
                </div>
              </div>
            </fieldset>

            {!initial && (
              <fieldset>
                <legend className="text-label">Protected wallet recovery guardian</legend>
                <p className="mt-1 text-caption text-subtle">
                  A break-glass signer for this agent&rsquo;s Safe wallet, used only to recover access &mdash; never for
                  routine actions. This is set once, right now, when the wallet is created; later policy versions
                  can&rsquo;t change it.
                </p>
                <div className="mt-3 space-y-2">
                  <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md border border-border bg-surface-raised p-3 text-body-sm has-checked:border-brand">
                    <input
                      type="radio"
                      name="guardian-mode"
                      checked={values.recoveryGuardianMode === "DEFAULT"}
                      onChange={() => update("recoveryGuardianMode", "DEFAULT")}
                      className="mt-1 accent-(--color-brand-strong)"
                    />
                    <span>
                      <span className="block font-semibold">Use the AEGIS-configured default</span>
                      <span className="mt-0.5 block text-caption text-muted">
                        Recommended unless you&rsquo;re already managing your own recovery process.
                      </span>
                    </span>
                  </label>
                  <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md border border-border bg-surface-raised p-3 text-body-sm has-checked:border-brand">
                    <input
                      type="radio"
                      name="guardian-mode"
                      checked={values.recoveryGuardianMode === "CUSTOM"}
                      onChange={() => update("recoveryGuardianMode", "CUSTOM")}
                      className="mt-1 accent-(--color-brand-strong)"
                    />
                    <span>
                      <span className="block font-semibold">Use a specific wallet</span>
                      <span className="mt-0.5 block text-caption text-muted">
                        Any EVM address you control or trust.
                      </span>
                    </span>
                  </label>
                </div>
                {values.recoveryGuardianMode === "CUSTOM" && (
                  <input
                    value={values.recoveryGuardianAddress}
                    onChange={event => update("recoveryGuardianAddress", event.target.value)}
                    placeholder="0x…"
                    aria-label="Recovery guardian address"
                    className={`${inputClass} mt-3 font-mono`}
                  />
                )}
              </fieldset>
            )}
          </div>

          {error && (
            <p role="alert" className="mt-6 rounded-md bg-danger-soft px-4 py-3 text-body-sm text-danger">
              {error}
            </p>
          )}
        </section>

        <aside className="rounded-lg bg-surface p-5 shadow-md lg:sticky lg:top-24">
          <h3 className="text-h5">Version review</h3>
          <dl className="mt-4 space-y-4 text-body-sm">
            <ReviewItem label="Agent" value={agent.name} mono={agent.id} />
            <ReviewItem label="Asset" value={assetLabel} />
            <ReviewItem label="Enforced action" value={actionLabel} />
            <ReviewItem
              label="Destinations"
              value={
                values.destinations.some(destination => destination.value.trim())
                  ? `${values.destinations.filter(destination => destination.value.trim()).length} configured`
                  : "Any valid destination"
              }
            />
            <ReviewItem
              label="Limits"
              value={`min ${values.minAmount || "none"} · max ${values.maxAmount || "none"} · daily ${values.dailyAmount || "none"}`}
            />
            <ReviewItem
              label="Trusted service"
              value={
                values.trustedService.enabled
                  ? values.trustedService.serviceId || "Configured, service ID missing"
                  : "None (add one to enable running actions through this policy)"
              }
            />
            <ReviewItem
              label="Validity"
              value={`${values.validFromMode === "NOW" ? "starts on signature" : values.validFromLocal || "start missing"} · ${
                values.validUntilMode === "NONE" ? "no expiry" : values.validUntilLocal || "expiry missing"
              }`}
            />
            {!initial && (
              <ReviewItem
                label="Recovery guardian"
                value={values.recoveryGuardianMode === "DEFAULT" ? "AEGIS-configured default" : "Custom wallet"}
                mono={
                  values.recoveryGuardianMode === "CUSTOM" ? values.recoveryGuardianAddress || undefined : undefined
                }
              />
            )}
          </dl>
          <p className="mt-5 rounded-md bg-info-soft p-3 text-caption text-info">
            Saving creates an immutable DRAFT. Activation is a separate signed operation.
          </p>
        </aside>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="min-h-11"
          onClick={onBack}
          disabled={phase !== null}
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <div className="flex flex-wrap items-center justify-end gap-4">
          {phase && (
            <span
              role="status"
              aria-live="polite"
              className="flex items-center gap-2 font-mono text-mono-sm text-muted"
            >
              <Loader2 className="h-4 w-4 animate-spin" />
              {PHASE_LABEL[phase]}
            </span>
          )}
          <Button type="submit" size="lg" disabled={phase !== null}>
            {submitLabel}
          </Button>
        </div>
      </div>
    </form>
  );
}

function AmountField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label htmlFor={id} className="text-label">
      {label}
      <input
        id={id}
        value={value}
        onChange={event => onChange(event.target.value)}
        inputMode="decimal"
        placeholder="No limit"
        className={`${inputClass} font-mono`}
      />
    </label>
  );
}

function ReviewItem({ label, value, mono }: { label: string; value: string; mono?: string }) {
  return (
    <div>
      <dt className="text-caption text-subtle">{label}</dt>
      <dd className="mt-0.5 text-body-sm text-foreground">{value}</dd>
      {mono && (
        <dd className="mt-0.5 truncate font-mono text-mono-sm text-muted" title={mono}>
          {mono}
        </dd>
      )}
    </div>
  );
}
