"use client";

import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { Button } from "~~/components/ui/Button";
import { FundWalletCard } from "~~/features/agents/components/FundWalletCard";
import type { AgentProfile, Policy, ProtectedWalletInfo } from "~~/lib/types/aegis";
import { truncateAddress } from "~~/lib/utils/format";

export function SuccessScreen({
  agent,
  policy,
  wallet,
  onRestart,
}: {
  agent: AgentProfile;
  policy?: Policy;
  wallet: ProtectedWalletInfo;
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
        <h1 className="mt-4 text-h2">{agent.name}&apos;s policy is active</h1>
        <p className="mt-3 max-w-[40ch] text-body-sm text-muted">
          AEGIS Level 1 can now evaluate this agent&apos;s proposed HBAR or HTS transfers against the active policy.
          TeeML verification, Safe co-signing and transaction execution are separate stages.
        </p>
        {policy && (
          <p className="mt-4 font-mono text-mono-sm text-subtle">policy {truncateAddress(policy.policyHash)}</p>
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
