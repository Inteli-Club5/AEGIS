"use client";

import { useState } from "react";
import { CheckCircle2, CircleDashed, Loader2 } from "lucide-react";
import { useSignTypedData } from "wagmi";
import { Button } from "~~/components/ui/Button";
import { useConnectWallet } from "~~/features/wallet/components/ConnectWalletProvider";
import { type SignAgentAction, registerAgenticId } from "~~/lib/api/actions";
import type { AgentDetail } from "~~/lib/types/aegis";

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
    </div>
  );
}
