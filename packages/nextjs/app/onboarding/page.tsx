"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AppTopbar } from "@/components/layout/AppTopbar";
import { OnboardingWizard } from "@/features/onboarding/components/OnboardingWizard";
import { type OnboardingDraft, clearDraft } from "@/features/onboarding/draft";
import { ConnectGate } from "@/features/wallet/components/ConnectGate";
import { useConnectWallet } from "@/features/wallet/components/ConnectWalletProvider";
import { readCreatedAgentDetails } from "@/lib/onboarding/localAgentDraftStore";
import type { AgentProfile, AgentType } from "@/lib/types/aegis";

const AGENT_TYPES: AgentType[] = ["Payment Agent", "API Buyer", "Treasury Agent", "DeFi Agent", "Custom"];

export default function OnboardingPage() {
  return (
    <Suspense>
      <OnboardingPageInner />
    </Suspense>
  );
}

function OnboardingPageInner() {
  const { status } = useConnectWallet();
  const searchParams = useSearchParams();
  const resumeAgentId = searchParams.get("resume");
  const [initialDraft, setInitialDraft] = useState<OnboardingDraft | null | undefined>(
    resumeAgentId ? undefined : null,
  );

  useEffect(() => {
    if (!resumeAgentId) {
      clearDraft();
      setInitialDraft(null);
      return;
    }
    const cached = readCreatedAgentDetails().find(candidate => candidate.id === resumeAgentId);
    if (!cached) {
      setInitialDraft(null);
      return;
    }
    const agent: AgentProfile = {
      id: cached.id,
      name: cached.name,
      type: AGENT_TYPES.includes(cached.type as AgentProfile["type"])
        ? (cached.type as AgentProfile["type"])
        : "Custom",
      description: cached.description,
      capabilities: cached.capabilities,
      createdAt: cached.createdAt,
    };
    setInitialDraft({
      step: cached.policy && cached.walletInfo ? 2 : 1,
      agent,
      policy: cached.policy ?? undefined,
      wallet: cached.walletInfo ?? undefined,
    });
  }, [resumeAgentId]);

  return (
    <>
      <AppTopbar />
      <main className="flex flex-1 flex-col">
        {status !== "connected" ? (
          <ConnectGate description="Connect the operator wallet that will own this agent’s protection." />
        ) : initialDraft === undefined ? (
          <div className="mx-auto w-full max-w-[860px] flex-1 px-6 py-10">
            <div className="h-8 w-64 animate-pulse rounded-md bg-surface" />
            <div className="mt-10 h-[420px] animate-pulse rounded-lg bg-surface" />
          </div>
        ) : (
          <OnboardingWizard initialDraft={initialDraft} />
        )}
      </main>
    </>
  );
}
