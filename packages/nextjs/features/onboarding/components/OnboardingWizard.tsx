"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { type OnboardingDraft, clearDraft, writeDraft } from "../draft";
import { StepActivate } from "./StepActivate";
import { StepCreatePolicy } from "./StepCreatePolicy";
import { StepRegisterAgent } from "./StepRegisterAgent";
import { SuccessScreen } from "./SuccessScreen";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Stepper } from "@/components/ui/Stepper";
import type { AgentProfile, PolicyRecord } from "@/lib/types/aegis";

const STEPS = ["Register agent", "Policy", "Activate"];

export function OnboardingWizard({ initialDraft }: { initialDraft: OnboardingDraft | null }) {
  const router = useRouter();
  const [step, setStep] = useState(initialDraft?.step ?? 0);
  const [agent, setAgent] = useState<AgentProfile | undefined>(initialDraft?.agent);
  const [policy, setPolicy] = useState<PolicyRecord | undefined>(initialDraft?.policy);
  const [done, setDone] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  function handleAgentCreated(created: AgentProfile) {
    setAgent(created);
    setStep(1);
    writeDraft({ step: 1, agent: created, policy });
  }

  function handlePolicyCreated(created: PolicyRecord) {
    setPolicy(created);
    setStep(2);
    writeDraft({ step: 2, agent, policy: created });
  }

  function handleBack() {
    const prev = Math.max(0, step - 1);
    setStep(prev);
    writeDraft({ step: prev, agent, policy });
  }

  function handleActivated() {
    clearDraft();
    setDone(true);
  }

  function handleRestart() {
    clearDraft();
    setAgent(undefined);
    setPolicy(undefined);
    setStep(0);
    setDone(false);
  }

  const hasProgress = Boolean(agent || policy);

  if (done && agent) {
    return <SuccessScreen agent={agent} policy={policy} onRestart={handleRestart} />;
  }

  return (
    <div className="mx-auto w-full max-w-[860px] flex-1 px-6 py-10">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-h2">Protect an agent</h1>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => (hasProgress ? setCancelOpen(true) : router.push("/dashboard"))}
        >
          Cancel
        </Button>
      </div>

      <div className="mt-6">
        <Stepper steps={STEPS} current={step} />
      </div>

      <div className="mt-10">
        {step === 0 && <StepRegisterAgent initial={agent} onCreated={handleAgentCreated} />}
        {step === 1 && agent && (
          <StepCreatePolicy agent={agent} initial={policy} onBack={handleBack} onCreated={handlePolicyCreated} />
        )}
        {step === 2 && agent && policy && (
          <StepActivate agent={agent} policy={policy} onBack={handleBack} onActivated={handleActivated} />
        )}
      </div>

      <ConfirmDialog
        open={cancelOpen}
        title="Discard this setup?"
        description={
          agent
            ? `${agent.name} was already registered and will stay listed as Unprotected on your dashboard. The remaining steps will be discarded.`
            : "Your progress in this wizard will be discarded."
        }
        confirmLabel="Discard"
        onCancel={() => setCancelOpen(false)}
        onConfirm={() => {
          clearDraft();
          router.push("/dashboard");
        }}
      />
    </div>
  );
}
