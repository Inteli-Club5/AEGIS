"use client";

import Link from "next/link";
import { Fingerprint, ShieldCheck } from "lucide-react";
import { Button } from "~~/components/ui/Button";
import { FundWalletCard } from "~~/features/agents/components/FundWalletCard";
import type { AgentServiceProfile } from "~~/lib/api/onboarding";
import type { AgentProfile, Policy, ProtectedWalletInfo } from "~~/lib/types/aegis";
import { truncateAddress } from "~~/lib/utils/format";

export function SuccessScreen({
  agent,
  policy,
  wallet,
  agenticId,
  onRestart,
}: {
  agent: AgentProfile;
  policy?: Policy;
  wallet: ProtectedWalletInfo;
  agenticId?: AgentServiceProfile["agenticId"];
  onRestart: () => void;
}) {
  return (
    <div className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="flex w-full max-w-lg flex-col items-center rounded-xl bg-surface px-8 py-14 text-center shadow-md">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-success-soft">
          <ShieldCheck className="h-8 w-8 text-success" />
        </span>
        <p className="mt-6 rounded-full bg-success-soft px-4 py-1.5 font-mono text-mono-sm font-medium text-success">
          Policy ACTIVE
        </p>
        <h1 className="mt-4 text-h2">{agent.name} is fully protected</h1>
        <p className="mt-3 max-w-[42ch] text-body-sm text-muted">
          AEGIS now evaluates every proposed transfer against this policy, verifies it through 0G TeeML, and only
          executes it once the Safe co-signs. Run and monitor actions from the agent page.
        </p>
        {policy && (
          <p className="mt-4 font-mono text-mono-sm text-subtle">policy {truncateAddress(policy.policyHash)}</p>
        )}
        {agenticId && (
          <p className="mt-2 flex items-center gap-1.5 font-mono text-mono-sm text-subtle">
            <Fingerprint className="h-3.5 w-3.5" aria-hidden="true" />
            0G Agentic ID #{agenticId.tokenId}
          </p>
        )}

        <div className="mt-6 w-full text-left">
          <FundWalletCard safeAddress={wallet.address as `0x${string}`} />
        </div>

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href={`/agents/${agent.id}`}>
            <Button size="lg">Go to agent</Button>
          </Link>
          <Button size="lg" variant="secondary" onClick={onRestart}>
            Protect another agent
          </Button>
        </div>
      </div>
    </div>
  );
}
