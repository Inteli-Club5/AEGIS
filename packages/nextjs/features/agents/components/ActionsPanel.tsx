"use client";

import { useMemo, useState } from "react";
import {
  CheckCircle2,
  CircleDashed,
  ExternalLink,
  Loader2,
  RefreshCw,
  Rocket,
  RotateCcw,
  Send,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { useSignTypedData } from "wagmi";
import { Badge } from "~~/components/ui/Badge";
import { Button } from "~~/components/ui/Button";
import { useConnectWallet } from "~~/features/wallet/components/ConnectWalletProvider";
import {
  type ExecuteActionResult,
  type PrecheckDenyResult,
  type PrecheckPassResult,
  type SignAgentAction,
  type TeeMlAllowResult,
  type TeeMlDenyResult,
  executeAction,
  precheckAction,
  registerAgenticId,
  verifyTeeml,
} from "~~/lib/api/actions";
import {
  type ActionFormValues,
  destinationFormKey,
  emptyActionFormValues,
  parseActionForm,
} from "~~/lib/policy/actionForm";
import { formatBaseUnitAmount } from "~~/lib/policy/amount";
import { TRUSTED_SERVICE_DESCRIPTOR_RULE_KIND, type TrustedServiceDescriptorV1 } from "~~/lib/policy/hash";
import type { AgentDetail } from "~~/lib/types/aegis";
import { truncateAddress } from "~~/lib/utils/format";

const inputClass =
  "mt-2 min-h-11 w-full rounded-md border border-border bg-surface-raised px-3 text-body-sm transition-colors duration-[120ms] focus-visible:border-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-strong";

type RunStage =
  | { kind: "FORM" }
  | { kind: "PRECHECK_DENIED"; result: PrecheckDenyResult }
  | { kind: "AWAITING_TEEML"; precheck: PrecheckPassResult }
  | { kind: "TEEML_PROCESSING"; precheck: PrecheckPassResult }
  | { kind: "TEEML_DENIED"; precheck: PrecheckPassResult; result: TeeMlDenyResult }
  | { kind: "AWAITING_EXECUTE"; precheck: PrecheckPassResult; verify: TeeMlAllowResult }
  | { kind: "EXECUTED"; result: ExecuteActionResult };

export function ActionsPanel({ agent }: { agent: AgentDetail }) {
  const { address } = useConnectWallet();
  const { signTypedDataAsync } = useSignTypedData();
  const signAgentAction: SignAgentAction = params => signTypedDataAsync(params);
  const [agenticId, setAgenticId] = useState(agent.agenticId);
  const [registering, setRegistering] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);

  const walletProtected = agent.walletInfo?.status === "PROTECTED";
  const policyActive = agent.effectivePolicyStatus === "ACTIVE" && agent.activePolicy !== null;
  const activePolicy = agent.activePolicy;
  const nativeAsset = activePolicy?.rules.allowedAssets[0];
  const isNativeHbarPolicy = nativeAsset?.kind === "NATIVE";
  const canRunActions = walletProtected && policyActive && isNativeHbarPolicy && agenticId !== undefined;

  const preconditions = [
    { label: "Protected wallet (Safe) deployed", met: walletProtected },
    { label: "Active policy", met: policyActive },
    { label: "Policy covers native HBAR", met: isNativeHbarPolicy },
    { label: "0G Agentic ID registered", met: agenticId !== undefined },
  ];

  async function handleRegisterAgenticId() {
    if (!address) {
      setRegisterError("Your wallet disconnected. Reconnect it to sign this request.");
      return;
    }
    setRegistering(true);
    setRegisterError(null);
    try {
      const profile = await registerAgenticId(agent.id, address as `0x${string}`, signAgentAction);
      setAgenticId(profile.agenticId ?? { tokenId: "", contractAddress: "", metadataURI: "", explorerUrl: "" });
    } catch (error) {
      setRegisterError(error instanceof Error ? error.message : "Registering the 0G Agentic ID failed.");
    } finally {
      setRegistering(false);
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-lg bg-surface p-6 shadow-md">
        <h2 className="text-h4">Gate status</h2>
        <p className="mt-1 text-body-sm text-muted">
          What every proposed action from this agent is checked against: Level 1 precheck, 0G TeeML semantic
          verification, then Safe co-signed execution on Hedera testnet.
        </p>
        <ul className="mt-4 space-y-2">
          {preconditions.map(item => (
            <li key={item.label} className="flex items-center gap-2.5 text-body-sm">
              {item.met ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
              ) : (
                <CircleDashed className="h-4 w-4 shrink-0 text-subtle" aria-hidden="true" />
              )}
              <span className={item.met ? "text-foreground" : "text-muted"}>{item.label}</span>
            </li>
          ))}
        </ul>
        {!isNativeHbarPolicy && policyActive && (
          <p className="mt-4 rounded-md bg-warning-soft px-4 py-3 text-body-sm text-warning">
            This policy&rsquo;s active version is configured for an HTS token. Execution today only supports native HBAR
            (docs/aegis-current-scope.md); create an HBAR policy version to unblock this agent.
          </p>
        )}
        {walletProtected && policyActive && isNativeHbarPolicy && agenticId === undefined && (
          <div className="mt-4">
            {registerError && <p className="mb-3 text-body-sm text-danger">{registerError}</p>}
            <Button onClick={handleRegisterAgenticId} disabled={registering}>
              {registering && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {registering ? "Registering…" : "Register 0G Agentic ID"}
            </Button>
            <p className="mt-2 text-caption text-subtle">
              New agents register this during onboarding; this is only needed if that step was skipped.
            </p>
          </div>
        )}
      </section>

      {canRunActions && activePolicy && nativeAsset && address && (
        <RunActionCard
          agent={agent}
          policy={activePolicy}
          asset={nativeAsset}
          operatorAddress={address as `0x${string}`}
          signAgentAction={signAgentAction}
        />
      )}

      {canRunActions && !address && (
        <p className="rounded-md bg-warning-soft px-4 py-3 text-body-sm text-warning">
          Reconnect your wallet to run an action for this agent.
        </p>
      )}
    </div>
  );
}

function RunActionCard({
  agent,
  policy,
  asset,
  operatorAddress,
  signAgentAction,
}: {
  agent: AgentDetail;
  policy: NonNullable<AgentDetail["activePolicy"]>;
  asset: NonNullable<AgentDetail["activePolicy"]>["rules"]["allowedAssets"][number];
  operatorAddress: `0x${string}`;
  signAgentAction: SignAgentAction;
}) {
  const walletId = agent.walletInfo?.walletId;
  const actionType = policy.rules.allowedActionTypes[0];
  const allowedDestinations = useMemo(
    () => policy.rules.allowedDestinations.filter(destination => destination.kind !== "URL_ORIGIN"),
    [policy.rules.allowedDestinations],
  );
  const trustedService = useMemo(() => {
    const rule = policy.semanticRules.find(candidate => candidate.kind === TRUSTED_SERVICE_DESCRIPTOR_RULE_KIND);
    if (!rule || typeof rule.params.serviceId !== "string") return undefined;
    const productId = rule.params.productId;
    if (productId !== undefined && typeof productId !== "string") return undefined;
    return rule.params as TrustedServiceDescriptorV1;
  }, [policy.semanticRules]);

  const [values, setValues] = useState<ActionFormValues>(() => emptyActionFormValues(allowedDestinations[0]));
  const [stage, setStage] = useState<RunStage>({ kind: "FORM" });
  const [precheckSubmitting, setPrecheckSubmitting] = useState(false);
  const [precheckError, setPrecheckError] = useState<string | null>(null);
  const [teemlSubmitting, setTeemlSubmitting] = useState(false);
  const [teemlError, setTeemlError] = useState<string | null>(null);
  const [executeSubmitting, setExecuteSubmitting] = useState(false);
  const [executeError, setExecuteError] = useState<string | null>(null);

  function update<K extends keyof ActionFormValues>(key: K, value: ActionFormValues[K]) {
    setValues(previous => ({ ...previous, [key]: value }));
  }

  function startOver() {
    setStage({ kind: "FORM" });
    setPrecheckError(null);
    setTeemlError(null);
    setExecuteError(null);
  }

  async function handlePrecheckSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (precheckSubmitting) return;
    if (!walletId || !actionType) {
      setPrecheckError("This agent has no protected wallet or enforced action type yet.");
      return;
    }
    let body: ReturnType<typeof parseActionForm>;
    try {
      body = parseActionForm(values, actionType, asset);
    } catch (formError) {
      setPrecheckError(formError instanceof Error ? formError.message : "Review the action fields.");
      return;
    }
    setPrecheckSubmitting(true);
    setPrecheckError(null);
    try {
      const idempotencyKey = crypto.randomUUID();
      const result = await precheckAction(agent.id, walletId, body, idempotencyKey, operatorAddress, signAgentAction);
      if (result.status === "DENY_PRECHECK") {
        setStage({ kind: "PRECHECK_DENIED", result });
      } else {
        setStage({ kind: "AWAITING_TEEML", precheck: result });
      }
    } catch (error) {
      setPrecheckError(error instanceof Error ? error.message : "Running the precheck failed.");
    } finally {
      setPrecheckSubmitting(false);
    }
  }

  async function handleVerifyTeeml(precheck: PrecheckPassResult) {
    if (!trustedService || teemlSubmitting) return;
    setTeemlSubmitting(true);
    setTeemlError(null);
    try {
      const result = await verifyTeeml(
        agent.id,
        precheck.requestId,
        { serviceId: trustedService.serviceId, productId: trustedService.productId },
        operatorAddress,
        signAgentAction,
      );
      if (result.status === "TEEML_PROCESSING") {
        setStage({ kind: "TEEML_PROCESSING", precheck });
      } else if (result.status === "TEEML_DENIED") {
        setStage({ kind: "TEEML_DENIED", precheck, result });
      } else {
        setStage({ kind: "AWAITING_EXECUTE", precheck, verify: result });
      }
    } catch (error) {
      setTeemlError(error instanceof Error ? error.message : "0G TeeML verification failed.");
    } finally {
      setTeemlSubmitting(false);
    }
  }

  async function handleExecute(precheck: PrecheckPassResult) {
    if (executeSubmitting) return;
    setExecuteSubmitting(true);
    setExecuteError(null);
    try {
      const result = await executeAction(agent.id, precheck.requestId, operatorAddress, signAgentAction);
      setStage({ kind: "EXECUTED", result });
    } catch (error) {
      setExecuteError(error instanceof Error ? error.message : "Executing this action failed.");
    } finally {
      setExecuteSubmitting(false);
    }
  }

  return (
    <section className="rounded-lg bg-surface p-6 shadow-md">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-h4">Run an action</h2>
          <p className="mt-1 text-body-sm text-muted">
            {formatActionType(actionType)} of native HBAR, checked against v{policy.policyVersion} of this agent&rsquo;s
            active policy.
          </p>
        </div>
        {stage.kind !== "FORM" && (
          <Button type="button" variant="ghost" size="sm" onClick={startOver}>
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            Start over
          </Button>
        )}
      </div>

      {stage.kind === "FORM" && (
        <form onSubmit={handlePrecheckSubmit} noValidate className="mt-5 space-y-4">
          <fieldset>
            <label className="text-label">Destination</label>
            {allowedDestinations.length > 0 ? (
              <select
                value={destinationFormKey(values.destination)}
                onChange={event => {
                  const next = allowedDestinations.find(
                    destination => destinationFormKey(destination) === event.target.value,
                  );
                  if (next && (next.kind === "HEDERA_ACCOUNT_ID" || next.kind === "EVM_ADDRESS")) {
                    update("destination", { kind: next.kind, value: next.value });
                  }
                }}
                className={inputClass}
              >
                {allowedDestinations.map(destination => (
                  <option key={destinationFormKey(destination)} value={destinationFormKey(destination)}>
                    {destination.kind === "HEDERA_ACCOUNT_ID" ? "Hedera account" : "EVM address"} · {destination.value}
                  </option>
                ))}
              </select>
            ) : (
              <div className="mt-2 grid gap-2 sm:grid-cols-[180px_minmax(0,1fr)]">
                <select
                  value={values.destination.kind}
                  onChange={event =>
                    update("destination", {
                      ...values.destination,
                      kind: event.target.value as ActionFormValues["destination"]["kind"],
                    })
                  }
                  aria-label="Destination identity type"
                  className={`${inputClass} mt-0`}
                >
                  <option value="HEDERA_ACCOUNT_ID">Hedera account</option>
                  <option value="EVM_ADDRESS">EVM address</option>
                </select>
                <input
                  value={values.destination.value}
                  onChange={event => update("destination", { ...values.destination, value: event.target.value })}
                  placeholder={values.destination.kind === "HEDERA_ACCOUNT_ID" ? "0.0.123456" : "0x…"}
                  aria-label="Destination"
                  className={`${inputClass} mt-0 font-mono`}
                />
              </div>
            )}
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-label">
              Amount (HBAR)
              <input
                value={values.amount}
                onChange={event => update("amount", event.target.value)}
                inputMode="decimal"
                placeholder="1.5"
                className={`${inputClass} font-mono`}
              />
            </label>
            <label className="text-label">
              Valid for (minutes from now)
              <input
                value={values.deadlineMinutes}
                onChange={event => update("deadlineMinutes", event.target.value)}
                inputMode="numeric"
                placeholder="30"
                className={`${inputClass} font-mono`}
              />
            </label>
          </div>

          {precheckError && (
            <p role="alert" className="rounded-md bg-danger-soft px-4 py-3 text-body-sm text-danger">
              {precheckError}
            </p>
          )}

          <Button type="submit" disabled={precheckSubmitting}>
            {precheckSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Send className="h-4 w-4" aria-hidden="true" />
            )}
            {precheckSubmitting ? "Running precheck…" : "Run precheck"}
          </Button>
        </form>
      )}

      {stage.kind === "PRECHECK_DENIED" && (
        <DeniedResult stage="Level 1 precheck" code={stage.result.code} requestId={stage.result.requestId} />
      )}

      {(stage.kind === "AWAITING_TEEML" || stage.kind === "TEEML_PROCESSING") && (
        <div className="mt-5 space-y-4">
          <div className="rounded-md border border-border bg-surface-raised p-4">
            <p className="text-body-sm font-semibold">Precheck passed &mdash; awaiting 0G TeeML verification</p>
            <dl className="mt-3 space-y-1.5 text-body-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Request ID</dt>
                <dd className="truncate font-mono text-mono-sm" title={stage.precheck.requestId}>
                  {truncateAddress(stage.precheck.requestId)}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Usage hold expires</dt>
                <dd className="font-mono text-mono-sm">
                  {new Date(stage.precheck.usageHoldExpiresAt * 1000).toLocaleTimeString()}
                </dd>
              </div>
            </dl>
          </div>

          {trustedService ? (
            <div className="rounded-md border border-border bg-surface-raised p-4">
              <p className="text-body-sm font-semibold">Trusted service to verify against</p>
              <dl className="mt-3 space-y-1.5 text-body-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Service ID</dt>
                  <dd className="font-mono text-mono-sm">{trustedService.serviceId}</dd>
                </div>
                {trustedService.productId && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted">Product ID</dt>
                    <dd className="font-mono text-mono-sm">{trustedService.productId}</dd>
                  </div>
                )}
              </dl>
            </div>
          ) : (
            <p className="rounded-md bg-warning-soft px-4 py-3 text-body-sm text-warning">
              The active policy names no trusted service, so 0G TeeML verification has nothing to match against. Add one
              to a policy version in the Policies tab to run this action through the gate.
            </p>
          )}

          {stage.kind === "TEEML_PROCESSING" && (
            <p className="rounded-md bg-info-soft px-4 py-3 text-body-sm text-info">
              A verification for this request is already in progress. Wait a few seconds, then retry.
            </p>
          )}

          {teemlError && (
            <p role="alert" className="rounded-md bg-danger-soft px-4 py-3 text-body-sm text-danger">
              {teemlError}
            </p>
          )}

          <Button onClick={() => handleVerifyTeeml(stage.precheck)} disabled={teemlSubmitting || !trustedService}>
            {teemlSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : stage.kind === "TEEML_PROCESSING" ? (
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
            ) : (
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            )}
            {teemlSubmitting
              ? "Verifying…"
              : stage.kind === "TEEML_PROCESSING"
                ? "Retry verification"
                : "Run TeeML verification"}
          </Button>
        </div>
      )}

      {stage.kind === "TEEML_DENIED" && (
        <DeniedResult
          stage="0G TeeML verification"
          code={stage.result.reasonCode}
          requestId={stage.precheck.requestId}
        />
      )}

      {stage.kind === "AWAITING_EXECUTE" && (
        <div className="mt-5 space-y-4">
          <div className="rounded-md border border-success/25 bg-success-soft p-4">
            <p className="flex items-center gap-2 text-body-sm font-semibold text-success">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              TeeML verdict: ALLOW
            </p>
            <dl className="mt-3 space-y-1.5 text-body-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Security profile</dt>
                <dd className="font-mono text-mono-sm">{stage.verify.securityProfile}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Model</dt>
                <dd className="font-mono text-mono-sm">{stage.verify.modelId}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">TEE verified</dt>
                <dd className="font-mono text-mono-sm">{stage.verify.teeVerified ? "yes" : "no"}</dd>
              </div>
            </dl>
          </div>

          {executeError && (
            <p role="alert" className="rounded-md bg-danger-soft px-4 py-3 text-body-sm text-danger">
              {executeError}
            </p>
          )}

          <Button onClick={() => handleExecute(stage.precheck)} disabled={executeSubmitting}>
            {executeSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Rocket className="h-4 w-4" aria-hidden="true" />
            )}
            {executeSubmitting ? "Executing…" : "Execute action"}
          </Button>
        </div>
      )}

      {stage.kind === "EXECUTED" && (
        <div className="mt-5 space-y-4">
          <div className="rounded-md border border-success/25 bg-success-soft p-4">
            <p className="flex items-center gap-2 text-body-sm font-semibold text-success">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              Executed on Hedera testnet
            </p>
            <dl className="mt-3 space-y-1.5 text-body-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Amount</dt>
                <dd className="font-mono text-mono-sm">
                  {formatBaseUnitAmount(stage.result.amount, asset.decimals)} ℏ
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Fee</dt>
                <dd className="font-mono text-mono-sm">
                  {formatBaseUnitAmount(stage.result.feeAmount, asset.decimals)} ℏ
                </dd>
              </div>
            </dl>
            <a
              href={`https://hashscan.io/testnet/transaction/${stage.result.transactionHash}`}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex min-h-11 items-center gap-1.5 text-body-sm font-medium text-brand-strong underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              View transaction on HashScan
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          </div>
          <Button type="button" variant="secondary" onClick={startOver}>
            Run another action
          </Button>
        </div>
      )}
    </section>
  );
}

function DeniedResult({ stage, code, requestId }: { stage: string; code: string; requestId: string }) {
  return (
    <div className="mt-5 rounded-md border border-danger/25 bg-danger-soft p-4">
      <p className="flex items-center gap-2 text-body-sm font-semibold text-danger">
        <XCircle className="h-4 w-4" aria-hidden="true" />
        Denied at {stage}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Badge tone="danger">{code}</Badge>
      </div>
      <p className="mt-2 truncate font-mono text-mono-sm text-muted" title={requestId}>
        Request {truncateAddress(requestId)}
      </p>
    </div>
  );
}

function formatActionType(actionType: string | undefined): string {
  if (!actionType) return "Action";
  const labels: Record<string, string> = {
    HEDERA_HBAR_TRANSFER: "HBAR transfer",
    HEDERA_HTS_FUNGIBLE_TRANSFER: "HTS fungible token transfer",
  };
  return labels[actionType] ?? actionType.toLowerCase().replaceAll("_", " ");
}
