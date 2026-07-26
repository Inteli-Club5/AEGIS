"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useConnectWallet } from "@/features/wallet/components/ConnectWalletProvider";

function HeroBackdrop() {
  return (
    <div aria-hidden="true" className="absolute inset-0 -z-10 overflow-hidden">
      <div className="absolute -top-32 right-[-12%] h-[540px] w-[540px] rounded-full bg-brand-soft opacity-70 blur-3xl" />
      <svg
        viewBox="0 0 640 400"
        fill="none"
        className="absolute -right-24 top-24 hidden h-[420px] w-auto opacity-40 lg:block"
      >
        <path
          d="M60 250L320 110L580 250"
          stroke="var(--color-brand)"
          strokeOpacity="0.5"
          strokeWidth="40"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M60 330L320 190L580 330"
          stroke="var(--color-surface)"
          strokeWidth="40"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

export function Hero() {
  const router = useRouter();
  const { status, openModal } = useConnectWallet();

  function handleLaunch() {
    if (status === "connected") {
      router.push("/dashboard");
      return;
    }
    openModal();
  }

  return (
    <section id="top" className="relative pb-10 pt-40 lg:pb-14 lg:pt-48">
      <HeroBackdrop />
      <div className="mx-auto w-full max-w-[1200px] px-6">
        <p className="font-mono text-overline uppercase text-brand-strong">Safety layer for agents that move value</p>
        <h1 className="mt-5 max-w-[18ch] text-h1 lg:text-display">Your AI agent will never make a mistake again.</h1>
        <p className="mt-6 max-w-[56ch] text-body-lg text-muted">
          A new layer of security for AI agents that move money. You don’t have to worry whether your agent will
          hallucinate, get hacked, or fall for a prompt injection. You set it up — we take care of the rest.
        </p>

        <div className="mt-10 flex flex-wrap items-center gap-3">
          <Button
            size="xl"
            onClick={handleLaunch}
            className="ring-4 ring-brand-soft ring-offset-2 ring-offset-background"
          >
            Launch the app
          </Button>
        </div>
      </div>
    </section>
  );
}
