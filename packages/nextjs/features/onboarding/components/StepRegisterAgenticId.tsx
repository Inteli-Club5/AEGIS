"use client";

import { useState } from "react";
import { ArrowLeft, CheckCircle2, Fingerprint, Loader2 } from "lucide-react";
import { useSignTypedData } from "wagmi";
import { Button } from "~~/components/ui/Button";
import { useConnectWallet } from "~~/features/wallet/components/ConnectWalletProvider";
import { type SignAgentAction, registerAgenticId } from "~~/lib/api/actions";
import type { AgentServiceProfile } from "~~/lib/api/onboarding";
import type { AgentProfile } from "~~/lib/types/aegis";

export function StepRegisterAgenticId({
  agent,
  onBack,
  onRegistered,
}: {
  agent: AgentProfile;
  onBack: () => void;
  onRegistered: (agenticId: NonNullable<AgentServiceProfile["agenticId"]>) => void;
}) {
  const { address } = useConnectWallet();
  const { signTypedDataAsync } = useSignTypedData();
  const signAgentAction: SignAgentAction = params => signTypedDataAsync(params);
  const [registering, setRegistering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRegister() {
    if (!address) {
      setError("Your wallet disconnected. Reconnect it to sign this request.");
      return;
    }
    setRegistering(true);
    setError(null);
    try {
      const profile = await registerAgenticId(agent.id, address as `0x${string}`, signAgentAction);
      if (!profile.agenticId) {
        throw new Error("The 0G Agentic ID registration did not return a token.");
      }
      onRegistered(profile.agenticId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registering the 0G Agentic ID failed. Try again.");
      setRegistering(false);
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-lg bg-surface p-6 shadow-md">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-brand-soft">
            <Fingerprint aria-hidden="true" className="h-4 w-4 text-brand-strong" />
          </span>
          <div>
            <p className="text-caption font-semibold uppercase tracking-wide text-subtle">0G Agentic ID</p>
            <h2 className="mt-1 text-h4">Register {agent.name} on 0G</h2>
          </div>
        </div>
        <p className="mt-4 text-body-sm text-muted">
          Mints an onchain 0G Agentic ID bound to this agent&rsquo;s active policy hash. TeeML semantic verification
          checks this registration before allowing any action &mdash; without it, the agent can never pass the
          verification gate. This is a real 0G Galileo testnet transaction and can take a few minutes.
        </p>

        {error && (
          <p role="alert" className="mt-4 rounded-md bg-danger-soft px-4 py-3 text-body-sm text-danger">
            {error}
          </p>
        )}

        {registering && (
          <p role="status" className="mt-4 flex items-center gap-2 font-mono text-mono-sm text-muted">
            <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
            Registering on 0G Galileo&hellip; this can take a few minutes.
          </p>
        )}
      </section>

      <div className="flex flex-col-reverse items-stretch justify-between gap-3 sm:flex-row sm:items-center">
        <Button variant="secondary" size="sm" onClick={onBack} disabled={registering}>
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          Back
        </Button>
        <Button size="lg" onClick={handleRegister} disabled={registering} className="min-h-11">
          {registering ? (
            <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
          )}
          {registering ? "Registering…" : "Register 0G Agentic ID"}
        </Button>
      </div>
    </div>
  );
}
