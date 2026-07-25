"use client";

import { useSyncExternalStore } from "react";
import { AppTopbar } from "@/components/layout/AppTopbar";
import { OnboardingWizard } from "@/features/onboarding/components/OnboardingWizard";
import { readDraft, readDraftServer, subscribeDraft } from "@/features/onboarding/draft";
import { ConnectGate } from "@/features/wallet/components/ConnectGate";
import { useConnectWallet } from "@/features/wallet/components/ConnectWalletProvider";

export default function OnboardingPage() {
  const { status } = useConnectWallet();
  const draft = useSyncExternalStore(subscribeDraft, readDraft, readDraftServer);

  return (
    <>
      <AppTopbar />
      <main className="flex flex-1 flex-col">
        {status !== "connected" ? (
          <ConnectGate description="Connect the operator wallet that will own this agent’s protection." />
        ) : draft === undefined ? (
          <div className="mx-auto w-full max-w-[860px] flex-1 px-6 py-10">
            <div className="h-8 w-64 animate-pulse rounded-md bg-surface" />
            <div className="mt-10 h-[420px] animate-pulse rounded-lg bg-surface" />
          </div>
        ) : (
          <OnboardingWizard initialDraft={draft} />
        )}
      </main>
    </>
  );
}
