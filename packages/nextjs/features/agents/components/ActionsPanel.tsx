"use client";

import { useState } from "react";
import { CheckCircle2, CircleDashed, Loader2, ShieldAlert, ShieldCheck, XCircle } from "lucide-react";
import { useSignTypedData } from "wagmi";
import { Badge } from "~~/components/ui/Badge";
import { Button } from "~~/components/ui/Button";
import { useConnectWallet } from "~~/features/wallet/components/ConnectWalletProvider";
import {
  type ExecuteActionResult,
  type PrecheckResult,
  type SignAgentAction,
  type TeeMlVerifyResult,
  executeAction,
  precheckAction,
  registerAgenticId,
  verifyTeeml,
} from "~~/lib/api/actions";
import { ApiError } from "~~/lib/api/http";
import { parseDisplayAmount } from "~~/lib/policy/amount";
import {
  type DestinationIdentity,
  TRUSTED_SERVICE_DESCRIPTOR_RULE_KIND,
  type TrustedServiceDescriptorV1,
  evmAddressDestination,
  hederaAccountDestination,
} from "~~/lib/policy/hash";
import type { AgentDetail } from "~~/lib/types/aegis";
import { formatPolicyAmount } from "~~/lib/utils/format";

const inputClass =
  "mt-2 min-h-11 w-full rounded-md border border-border bg-surface-raised px-3 text-body-sm transition-colors duration-[120ms] focus-visible:border-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-strong";

const EVM_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const HEDERA_ACCOUNT_ID_RE = /^\d+\.\d+\.\d+$/;

function parseActionDestination(kind: "HEDERA_ACCOUNT_ID" | "EVM_ADDRESS", rawValue: string): DestinationIdentity {
  const value = rawValue.trim();
  if (kind === "EVM_ADDRESS" && EVM_ADDRESS_RE.test(value)) return evmAddressDestination(value as `0x${string}`);
  if (kind === "HEDERA_ACCOUNT_ID" && HEDERA_ACCOUNT_ID_RE.test(value)) return hederaAccountDestination(value);
  const expected = kind === "EVM_ADDRESS" ? "a 0x-prefixed EVM address" : "a Hedera account ID (0.0.x)";
  throw new Error(`"${value}" must be ${expected}.`);
}

type StepStatus = "pending" | "active" | "pass" | "deny" | "error";

type StepResult = {
  key: "precheck" | "teeml" | "execute";
  label: string;
  status: StepStatus;
  detail?: string;
};

function defaultDeadline(): string {
  const inOneHour = new Date(Date.now() + 60 * 60 * 1000);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${inOneHour.getFullYear()}-${pad(inOneHour.getMonth() + 1)}-${pad(inOneHour.getDate())}T${pad(inOneHour.getHours())}:${pad(inOneHour.getMinutes())}`;
}

export function ActionsPanel({ agent }: { agent: AgentDetail }) {
  const { address } = useConnectWallet();
  const { signTypedDataAsync } = useSignTypedData();
  const signAgentAction: SignAgentAction = params => signTypedDataAsync(params);
  const [agenticId, setAgenticId] = useState(agent.agenticId);
  const [registering, setRegistering] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);

  const walletProtected = agent.walletInfo?.status === "PROTECTED";
  const policyActive = agent.effectivePolicyStatus === "ACTIVE" && agent.activePolicy !== null;
  const nativeAsset = agent.activePolicy?.rules.allowedAssets[0];
  const isNativeHbarPolicy = nativeAsset?.kind === "NATIVE";
  const trustedServiceRule = agent.activePolicy?.semanticRules.find(
    rule => rule.kind === TRUSTED_SERVICE_DESCRIPTOR_RULE_KIND,
  );
  const trustedService = trustedServiceRule?.params as TrustedServiceDescriptorV1 | undefined;

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

  const preconditions = [
    { label: "Protected wallet (Safe) deployed", met: walletProtected },
    { label: "Active policy", met: policyActive },
    { label: "Policy covers native HBAR", met: isNativeHbarPolicy },
    { label: "0G Agentic ID registered", met: agenticId !== undefined },
  ];
  const allMet = preconditions.every(item => item.met);

  return (
    <div className="space-y-5">
      <section className="rounded-lg bg-surface p-6 shadow-md">
        <h2 className="text-h4">Before running an action</h2>
        <p className="mt-1 text-body-sm text-muted">
          The same gate a real autonomous run of this agent would go through: Level 1 precheck, 0G TeeML semantic
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
            (docs/aegis-current-scope.md); create an HBAR policy version to run an action here.
          </p>
        )}
        {walletProtected && policyActive && isNativeHbarPolicy && agenticId === undefined && (
          <div className="mt-4">
            {registerError && <p className="mb-3 text-body-sm text-danger">{registerError}</p>}
            <Button onClick={handleRegisterAgenticId} disabled={registering}>
              {registering && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {registering ? "Registering…" : "Register 0G Agentic ID"}
            </Button>
          </div>
        )}
      </section>

      {allMet && agent.walletInfo && agent.activePolicy && (
        <RunActionForm
          agentId={agent.id}
          walletId={agent.walletInfo.walletId}
          defaultDestination={agent.activePolicy.rules.allowedDestinations[0]}
          trustedService={trustedService}
          maxAmountLabel={formatPolicyAmount(agent.activePolicy.rules.amount.max, nativeAsset)}
        />
      )}
    </div>
  );
}

function RunActionForm({
  agentId,
  walletId,
  defaultDestination,
  trustedService,
  maxAmountLabel,
}: {
  agentId: string;
  walletId: string;
  defaultDestination: { kind: string; value: string } | undefined;
  trustedService: TrustedServiceDescriptorV1 | undefined;
  maxAmountLabel: string;
}) {
  const { address } = useConnectWallet();
  const { signTypedDataAsync } = useSignTypedData();
  const signAgentAction: SignAgentAction = params => signTypedDataAsync(params);
  const [destinationKind, setDestinationKind] = useState<"HEDERA_ACCOUNT_ID" | "EVM_ADDRESS">(
    defaultDestination?.kind === "EVM_ADDRESS" ? "EVM_ADDRESS" : "HEDERA_ACCOUNT_ID",
  );
  const [destinationValue, setDestinationValue] = useState(defaultDestination?.value ?? "");
  const [amount, setAmount] = useState("");
  const [deadlineLocal, setDeadlineLocal] = useState(defaultDeadline());
  const [serviceId, setServiceId] = useState(trustedService?.serviceId ?? "");
  const [productId, setProductId] = useState(trustedService?.productId ?? "");
  const [formError, setFormError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<StepResult[]>([]);
  const [finalResult, setFinalResult] = useState<ExecuteActionResult | null>(null);

  function updateStep(step: StepResult) {
    setSteps(previous => [...previous.filter(existing => existing.key !== step.key), step]);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    setFinalResult(null);
    setSteps([]);

    if (!address) {
      setFormError("Your wallet disconnected. Reconnect it to sign each step.");
      return;
    }
    const operatorAddress = address as `0x${string}`;

    let amountBaseUnits: string;
    let actionDeadline: number;
    try {
      amountBaseUnits = parseDisplayAmount(amount, 8);
      if (amountBaseUnits === "0") throw new Error("Enter an amount greater than zero.");
      const deadlineMs = new Date(deadlineLocal).getTime();
      if (!Number.isFinite(deadlineMs)) throw new Error("Enter a valid deadline.");
      actionDeadline = Math.floor(deadlineMs / 1000);
    } catch (parseError) {
      setFormError(parseError instanceof Error ? parseError.message : "Review the action fields.");
      return;
    }
    let destination: DestinationIdentity;
    try {
      destination = parseActionDestination(destinationKind, destinationValue);
    } catch (destinationError) {
      setFormError(destinationError instanceof Error ? destinationError.message : "Enter a valid destination.");
      return;
    }
    if (!serviceId.trim()) {
      setFormError("Enter a service ID for the TeeML verification step.");
      return;
    }

    setRunning(true);
    try {
      updateStep({ key: "precheck", label: "Level 1 precheck", status: "active" });
      const precheck = await precheckAction(
        agentId,
        walletId,
        {
          actionType: "HEDERA_HBAR_TRANSFER",
          destination,
          assetId: "hedera:testnet:hbar",
          amount: amountBaseUnits,
          actionDeadline,
        },
        crypto.randomUUID(),
        operatorAddress,
        signAgentAction,
      );
      if (!reportPrecheck(precheck, updateStep)) return;

      updateStep({ key: "teeml", label: "0G TeeML verify", status: "active" });
      const verify = await verifyTeeml(
        agentId,
        precheck.requestId,
        { serviceId: serviceId.trim(), ...(productId.trim() ? { productId: productId.trim() } : {}) },
        operatorAddress,
        signAgentAction,
      );
      if (!reportTeeml(verify, updateStep)) return;

      updateStep({ key: "execute", label: "Safe co-signed execution", status: "active" });
      const executed = await executeAction(agentId, precheck.requestId, operatorAddress, signAgentAction);
      updateStep({
        key: "execute",
        label: "Safe co-signed execution",
        status: "pass",
        detail: `Executed · tx ${executed.transactionHash}`,
      });
      setFinalResult(executed);
    } catch (error) {
      const message =
        error instanceof ApiError ? `${error.message} (${error.code ?? error.status})` : "The action failed.";
      setSteps(previous => {
        const last = previous[previous.length - 1];
        if (!last || last.status !== "active")
          return [...previous, { key: "execute", label: "Error", status: "error", detail: message }];
        return previous.map(step => (step.key === last.key ? { ...step, status: "error", detail: message } : step));
      });
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className="rounded-lg bg-surface p-6 shadow-md">
      <h2 className="text-h4">Run an action through the gate</h2>
      <p className="mt-1 text-body-sm text-muted">
        Simulates the agent proposing a real HBAR transfer. Maximum per action under the active policy: {maxAmountLabel}
        .
      </p>

      <form onSubmit={handleSubmit} noValidate className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="text-label">
          Destination type
          <select
            value={destinationKind}
            onChange={event => setDestinationKind(event.target.value as typeof destinationKind)}
            className={`${inputClass} mt-2`}
          >
            <option value="HEDERA_ACCOUNT_ID">Hedera account</option>
            <option value="EVM_ADDRESS">EVM address</option>
          </select>
        </label>
        <label className="text-label">
          Destination
          <input
            value={destinationValue}
            onChange={event => setDestinationValue(event.target.value)}
            placeholder={destinationKind === "HEDERA_ACCOUNT_ID" ? "0.0.123456" : "0x…"}
            className={`${inputClass} font-mono`}
          />
        </label>
        <label className="text-label">
          Amount (HBAR)
          <input
            value={amount}
            onChange={event => setAmount(event.target.value)}
            inputMode="decimal"
            placeholder="1.0"
            className={`${inputClass} font-mono`}
          />
        </label>
        <label className="text-label">
          Deadline
          <input
            type="datetime-local"
            value={deadlineLocal}
            onChange={event => setDeadlineLocal(event.target.value)}
            className={`${inputClass} font-mono`}
          />
        </label>
        <label className="text-label">
          Service ID
          <input
            value={serviceId}
            onChange={event => setServiceId(event.target.value)}
            placeholder="market-data-api"
            className={`${inputClass} font-mono`}
          />
        </label>
        <label className="text-label">
          Product ID (optional)
          <input
            value={productId}
            onChange={event => setProductId(event.target.value)}
            placeholder="realtime-tier"
            className={`${inputClass} font-mono`}
          />
        </label>
        {!trustedService && (
          <p className="text-caption text-subtle sm:col-span-2">
            This policy has no trusted service configured yet, so TeeML verification is expected to deny with
            insufficient trusted context. Add one on a new policy version to test an ALLOW path.
          </p>
        )}

        {formError && (
          <p role="alert" className="text-body-sm text-danger sm:col-span-2">
            {formError}
          </p>
        )}

        <div className="sm:col-span-2">
          <Button type="submit" size="lg" disabled={running}>
            {running && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {running ? "Running…" : "Run action"}
          </Button>
        </div>
      </form>

      {steps.length > 0 && (
        <ol className="mt-6 space-y-2 border-t border-border pt-5">
          {steps.map(step => (
            <StepRow key={step.key} step={step} />
          ))}
        </ol>
      )}

      {finalResult && (
        <div className="mt-5 rounded-md bg-success-soft p-4 text-body-sm text-success">
          <p className="font-semibold">Executed on Hedera testnet</p>
          <p className="mt-1 font-mono text-mono-sm break-all">Safe tx: {finalResult.safeTxHash}</p>
          <p className="mt-1 font-mono text-mono-sm break-all">Transaction: {finalResult.transactionHash}</p>
          <p className="mt-1">
            Amount {finalResult.amount} tinybar · AEGIS fee {finalResult.feeAmount} tinybar
          </p>
        </div>
      )}
    </section>
  );
}

function reportPrecheck(result: PrecheckResult, updateStep: (step: StepResult) => void): boolean {
  if (result.status === "DENY_PRECHECK") {
    updateStep({ key: "precheck", label: "Level 1 precheck", status: "deny", detail: `Denied · ${result.code}` });
    return false;
  }
  updateStep({ key: "precheck", label: "Level 1 precheck", status: "pass", detail: "Passed to TeeML" });
  return true;
}

function reportTeeml(result: TeeMlVerifyResult, updateStep: (step: StepResult) => void): boolean {
  if (result.status === "TEEML_PROCESSING") {
    updateStep({
      key: "teeml",
      label: "0G TeeML verify",
      status: "error",
      detail: "Still processing upstream; try again shortly.",
    });
    return false;
  }
  if (result.status === "TEEML_DENIED") {
    updateStep({ key: "teeml", label: "0G TeeML verify", status: "deny", detail: `Denied · ${result.reasonCode}` });
    return false;
  }
  updateStep({
    key: "teeml",
    label: "0G TeeML verify",
    status: "pass",
    detail: `${result.status === "TEETLS_HACKATHON_ALLOWED" ? "Allowed (hackathon TeeTLS)" : "Allowed (TeeML)"} · ${result.reasonCode}`,
  });
  return true;
}

function StepRow({ step }: { step: StepResult }) {
  const icon =
    step.status === "active" ? (
      <Loader2 className="h-4 w-4 animate-spin text-brand-strong" aria-hidden="true" />
    ) : step.status === "pass" ? (
      <ShieldCheck className="h-4 w-4 text-success" aria-hidden="true" />
    ) : step.status === "deny" ? (
      <ShieldAlert className="h-4 w-4 text-warning" aria-hidden="true" />
    ) : step.status === "error" ? (
      <XCircle className="h-4 w-4 text-danger" aria-hidden="true" />
    ) : (
      <CircleDashed className="h-4 w-4 text-subtle" aria-hidden="true" />
    );
  const tone =
    step.status === "pass"
      ? "success"
      : step.status === "deny"
        ? "warning"
        : step.status === "error"
          ? "danger"
          : "neutral";

  return (
    <li className="flex flex-wrap items-center gap-2.5 text-body-sm">
      {icon}
      <span className="font-medium">{step.label}</span>
      {step.detail && <Badge tone={tone}>{step.detail}</Badge>}
    </li>
  );
}
