"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { useConnectWallet } from "@/features/wallet/components/ConnectWalletProvider";
import { createAgent } from "@/lib/api/onboarding";
import type { SignAgentCommitment } from "@/lib/policy/agent-commitment";
import { type AgentProfile, type AgentType, CAPABILITY_LABELS, type Capability } from "@/lib/types/aegis";
import { Loader2 } from "lucide-react";
import { useSignTypedData } from "wagmi";

const AGENT_TYPES: AgentType[] = ["Payment Agent", "API Buyer", "Treasury Agent", "DeFi Agent", "Custom"];

const CAPABILITIES = Object.keys(CAPABILITY_LABELS) as Capability[];

interface FieldErrors {
  name?: string;
  capabilities?: string;
  submit?: string;
}

export function StepRegisterAgent({
  initial,
  onCreated,
}: {
  initial?: AgentProfile;
  onCreated: (agent: AgentProfile) => void;
}) {
  const { address } = useConnectWallet();
  const { signTypedDataAsync } = useSignTypedData();
  const signAgentAction: SignAgentCommitment = params => signTypedDataAsync(params);
  const [name, setName] = useState(initial?.name ?? "");
  const [type, setType] = useState<AgentType>(initial?.type ?? "Payment Agent");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [capabilities, setCapabilities] = useState<Capability[]>(initial?.capabilities ?? []);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);

  function toggleCapability(capability: Capability) {
    setCapabilities(prev => (prev.includes(capability) ? prev.filter(c => c !== capability) : [...prev, capability]));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const nextErrors: FieldErrors = {};
    const trimmed = name.trim();
    if (trimmed.length < 3 || trimmed.length > 32) {
      nextErrors.name = "Name must be between 3 and 32 characters.";
    }
    if (capabilities.length === 0) {
      nextErrors.capabilities = "Select at least one capability.";
    }
    if (!address) {
      nextErrors.submit = "Your wallet disconnected -- reconnect to register an agent.";
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0 || !address) return;

    setSubmitting(true);
    try {
      const profile = await createAgent(
        {
          name: trimmed,
          type,
          description: description || undefined,
          capabilities,
          ownerWallet: address as `0x${string}`,
        },
        signAgentAction,
      );
      onCreated(profile);
    } catch (err) {
      setErrors({
        submit: err instanceof Error ? err.message : "Connecting the agent failed. Try again.",
      });
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <section className="rounded-lg bg-surface p-6 shadow-md">
        <h2 className="text-h4">Agent details</h2>
        <p className="mt-1 text-body-sm text-muted">
          AEGIS creates and hosts this agent for you — a dedicated Hedera account, then a protected Safe wallet once you
          activate protection. Bringing an agent you already run is on the roadmap, not this version.
        </p>

        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="agent-name" className="text-label">
              Agent name
            </label>
            <input
              id="agent-name"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="TreasuryBot"
              className="mt-2 h-10 w-full rounded-md border border-border bg-surface-raised px-3 text-body-sm outline-none transition-colors duration-[120ms] focus:border-brand"
            />
            {errors.name && <p className="mt-1.5 text-caption text-danger">{errors.name}</p>}
          </div>

          <div>
            <label htmlFor="agent-type" className="text-label">
              Agent type
            </label>
            <select
              id="agent-type"
              value={type}
              onChange={e => setType(e.target.value as AgentType)}
              className="mt-2 h-10 w-full rounded-md border border-border bg-surface-raised px-3 text-body-sm outline-none transition-colors duration-[120ms] focus:border-brand"
            >
              {AGENT_TYPES.map(t => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="agent-description" className="text-label">
              Description <span className="text-subtle">(optional)</span>
            </label>
            <textarea
              id="agent-description"
              value={description}
              onChange={e => setDescription(e.target.value.slice(0, 280))}
              rows={3}
              placeholder="Agent that pays approved service providers under AEGIS policies."
              className="mt-2 w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-body-sm outline-none transition-colors duration-[120ms] focus:border-brand"
            />
            <p className="mt-1 text-caption text-subtle">{description.length}/280</p>
          </div>

          <div className="sm:col-span-2">
            <span className="text-label">Capabilities</span>
            <p className="mt-1 text-caption text-subtle">
              What this agent is allowed to attempt — AEGIS still gates every attempt against your policy.
            </p>
            <div className="mt-3 space-y-2">
              {CAPABILITIES.map(capability => (
                <label
                  key={capability}
                  className="flex cursor-pointer items-center gap-3 rounded-md border border-border bg-surface-raised px-3 py-2.5 text-body-sm"
                >
                  <input
                    type="checkbox"
                    checked={capabilities.includes(capability)}
                    onChange={() => toggleCapability(capability)}
                    className="accent-(--color-brand-strong)"
                  />
                  {CAPABILITY_LABELS[capability]}
                </label>
              ))}
            </div>
            {errors.capabilities && <p className="mt-1.5 text-caption text-danger">{errors.capabilities}</p>}
          </div>
        </div>

        {errors.submit && (
          <p className="mt-5 rounded-md bg-danger-soft px-4 py-3 text-body-sm text-danger">{errors.submit}</p>
        )}
      </section>

      <div className="mt-6 flex items-center justify-end gap-4">
        {submitting && (
          <span role="status" className="flex items-center gap-2 font-mono text-mono-sm text-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            Creating agent on Hedera…
          </span>
        )}
        <Button type="submit" disabled={submitting}>
          Register agent
        </Button>
      </div>
    </form>
  );
}
