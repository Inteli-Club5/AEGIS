"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AppTopbar } from "@/components/layout/AppTopbar";
import { Button } from "@/components/ui/Button";
import { AgentDetailView } from "@/features/agents/components/AgentDetailView";
import { ConnectGate } from "@/features/wallet/components/ConnectGate";
import { useConnectWallet } from "@/features/wallet/components/ConnectWalletProvider";
import { getAgentDetail, listActivity } from "@/lib/api/agents";
import type { ActivityEntry, AgentDetail } from "@/lib/types/aegis";

export default function AgentDetailPage() {
  const params = useParams<{ id: string }>();
  const { status } = useConnectWallet();
  const [agent, setAgent] = useState<AgentDetail | null>(null);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status !== "connected" || !params?.id) return;
    let mounted = true;
    Promise.all([getAgentDetail(params.id), listActivity(params.id)]).then(([detail, entries]) => {
      if (!mounted) return;
      setAgent(detail);
      setActivity(entries);
      setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, [status, params?.id]);

  return (
    <>
      <AppTopbar />
      <main className="flex flex-1 flex-col">
        {status !== "connected" ? (
          <ConnectGate description="Connect the operator wallet that owns this agent." />
        ) : loading ? (
          <div className="mx-auto w-full max-w-[1200px] flex-1 px-6 py-10">
            <div className="h-8 w-56 animate-pulse rounded-md bg-surface" />
            <div className="mt-8 h-[420px] animate-pulse rounded-lg bg-surface" />
          </div>
        ) : !agent ? (
          <div className="flex flex-1 items-center justify-center px-6 py-24">
            <div className="max-w-md text-center">
              <h1 className="text-h3">Agent not found</h1>
              <p className="mt-2 text-body-sm text-muted">
                This agent doesn’t exist, or it belongs to another operator wallet.
              </p>
              <Link href="/dashboard" className="mt-6 inline-block">
                <Button>Back to dashboard</Button>
              </Link>
            </div>
          </div>
        ) : (
          <AgentDetailView agent={agent} activity={activity} />
        )}
      </main>
    </>
  );
}
