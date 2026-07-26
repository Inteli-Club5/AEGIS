"use client";

import { useEffect } from "react";
import { AppTopbar } from "@/components/layout/AppTopbar";
import { OnboardingWizard } from "@/features/onboarding/components/OnboardingWizard";
import { clearDraft } from "@/features/onboarding/draft";
import { ConnectGate } from "@/features/wallet/components/ConnectGate";
import { useConnectWallet } from "@/features/wallet/components/ConnectWalletProvider";

export default function OnboardingPage() {
  const { status } = useConnectWallet();

  useEffect(() => {
    clearDraft();
  }, []);

  return (
    <>
      <AppTopbar />
      <main className="flex flex-1 flex-col">
        {status !== "connected" ? (
          <ConnectGate description="Connect the operator wallet that will own this agent’s protection." />
        ) : (
          <OnboardingWizard initialDraft={null} />
        )}
      </main>
    </>
  );
}
