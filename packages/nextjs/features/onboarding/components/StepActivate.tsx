"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { type ActivationPhase, activateProtection } from "@/lib/api/onboarding";
import { type AgentProfile, CAPABILITY_LABELS, type PolicyRecord } from "@/lib/types/aegis";
import { truncateAddress } from "@/lib/utils/format";
import { ArrowLeft, Bot, Loader2, ScrollText, ShieldCheck } from "lucide-react";

const PHASE_LABEL: Record<ActivationPhase, string> = {
  wallet: "Deploying protected wallet (Safe 2-of-3)…",
  "agentic-id": "Registering 0G Agentic ID…",
};

export function StepActivate({
  agent,
  policy,
  onBack,
  onActivated,
}: {
  agent: AgentProfile;
  policy: PolicyRecord;
  onBack: () => void;
  onActivated: () => void;
}) {
  const [acknowledged, setAcknowledged] = useState(false);
  const [phase, setPhase] = useState<ActivationPhase | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleActivate() {
    setError(null);
    try {
      await activateProtection(agent.id, setPhase);
      onActivated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Activation failed. Try again.");
      setPhase(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <section className="rounded-lg bg-surface p-5 shadow-md">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-brand-soft">
            <Bot className="h-4 w-4 text-brand-strong" />
          </span>
          <h2 className="mt-3 text-h4">{agent.name}</h2>
          <p className="mt-1 text-caption text-subtle">{agent.type}</p>
          <p className="mt-1 text-caption text-muted">
            {agent.capabilities.map(c => CAPABILITY_LABELS[c]).join(" · ")}
          </p>
        </section>

        <section className="rounded-lg bg-surface p-5 shadow-md">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-brand-soft">
            <ScrollText className="h-4 w-4 text-brand-strong" />
          </span>
          <h2 className="mt-3 text-h4">Policy</h2>
          <p className="mt-1 font-mono text-mono-sm text-muted" title={policy.policyHash}>
            {truncateAddress(policy.policyHash)}
          </p>
          <p className="mt-1 text-caption text-subtle">
            {Object.keys(policy.fields).length} field
            {Object.keys(policy.fields).length === 1 ? "" : "s"} configured
          </p>
        </section>
      </div>

      <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border bg-surface-raised p-4 text-body-sm">
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={e => setAcknowledged(e.target.checked)}
          className="mt-1 accent-(--color-brand-strong)"
        />
        <span className="text-muted">
          I understand that AEGIS prevents unauthorized or non-compliant execution. It does not insure, compensate or
          remediate counterparty failures.
        </span>
      </label>

      {error && <p className="rounded-md bg-danger-soft px-4 py-3 text-body-sm text-danger">{error}</p>}

      <div className="flex items-center justify-between gap-4">
        <Button variant="secondary" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <span className="flex items-center gap-4">
          {phase && (
            <span role="status" className="flex items-center gap-2 font-mono text-mono-sm text-muted">
              <Loader2 className="h-4 w-4 animate-spin" />
              {PHASE_LABEL[phase]}
            </span>
          )}
          <Button size="lg" onClick={handleActivate} disabled={!acknowledged || phase !== null}>
            <ShieldCheck className="h-4 w-4" />
            Activate protection
          </Button>
        </span>
      </div>
    </div>
  );
}
