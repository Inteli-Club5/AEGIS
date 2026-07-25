"use client";

import { useState, useSyncExternalStore } from "react";
import { AppTopbar } from "@/components/layout/AppTopbar";
import { Button } from "@/components/ui/Button";
import { OnboardingWizard } from "@/features/onboarding/components/OnboardingWizard";
import { clearDraft, readDraft, readDraftServer, subscribeDraft } from "@/features/onboarding/draft";
import { ConnectGate } from "@/features/wallet/components/ConnectGate";
import { useConnectWallet } from "@/features/wallet/components/ConnectWalletProvider";

export default function OnboardingPage() {
  const { status } = useConnectWallet();
  const draft = useSyncExternalStore(subscribeDraft, readDraft, readDraftServer);
  const [choice, setChoice] = useState<"pending" | "resume" | "fresh">("pending");

  const unfinishedAgent = draft && draft.step > 0 ? draft.agent : undefined;

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
        ) : unfinishedAgent && choice === "pending" ? (
          <ResumeDraftPrompt
            agentName={unfinishedAgent.name}
            onResume={() => setChoice("resume")}
            onStartFresh={() => {
              clearDraft();
              setChoice("fresh");
            }}
          />
        ) : (
          <OnboardingWizard initialDraft={choice === "fresh" ? null : draft} />
        )}
      </main>
    </>
  );
}

function ResumeDraftPrompt({
  agentName,
  onResume,
  onStartFresh,
}: {
  agentName: string;
  onResume: () => void;
  onStartFresh: () => void;
}) {
  return (
    <div className="mx-auto flex w-full max-w-[560px] flex-1 flex-col items-center justify-center px-6 py-16 text-center">
      <h1 className="text-h3">Continue setting up {agentName}?</h1>
      <p className="mt-3 text-body-sm text-muted">
        You have an unfinished protection setup for this agent. Continue where you left off, or start protecting a
        different agent instead &mdash; {agentName} stays registered and listed as Unprotected on your dashboard either
        way.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button size="lg" onClick={onResume}>
          Continue {agentName}
        </Button>
        <Button size="lg" variant="secondary" onClick={onStartFresh}>
          Protect a different agent
        </Button>
      </div>
    </div>
  );
}
