"use client";

import Link from "next/link";
import { Button } from "@/components/ui/Button";
import type { AgentProfile, PolicyRecord } from "@/lib/types/aegis";
import { truncateAddress } from "@/lib/utils/format";
import { ShieldCheck } from "lucide-react";

export function SuccessScreen({
  agent,
  policy,
  onRestart,
}: {
  agent: AgentProfile;
  policy?: PolicyRecord;
  onRestart: () => void;
}) {
  return (
    <div className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="flex w-full max-w-lg flex-col items-center rounded-xl bg-surface px-8 py-14 text-center shadow-md">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-success-soft">
          <ShieldCheck className="h-8 w-8 text-success" />
        </span>
        <p className="mt-6 rounded-full bg-success-soft px-4 py-1.5 font-mono text-mono-sm font-medium text-success">
          Protected by AEGIS
        </p>
        <h1 className="mt-4 text-h2">{agent.name} is protected</h1>
        <p className="mt-3 max-w-[40ch] text-body-sm text-muted">
          Every transaction now requires your policy, a verified decision and the AEGIS co-signature — or it doesn’t
          execute.
        </p>
        {policy && (
          <p className="mt-4 font-mono text-mono-sm text-subtle">policy {truncateAddress(policy.policyHash)}</p>
        )}
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/dashboard">
            <Button size="lg">Go to dashboard</Button>
          </Link>
          <Button size="lg" variant="secondary" onClick={onRestart}>
            Protect another agent
          </Button>
        </div>
      </div>
    </div>
  );
}
