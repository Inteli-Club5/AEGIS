"use client";

import { useConnectWallet } from "./ConnectWalletProvider";
import { Button } from "@/components/ui/Button";
import { Wallet } from "lucide-react";

export function ConnectGate({
  description = "The dashboard shows the agents protected by the operator wallet you connect.",
}: {
  description?: string;
}) {
  const { openModal, status } = useConnectWallet();
  return (
    <div className="flex flex-1 items-center justify-center px-6 py-24">
      <div className="flex max-w-md flex-col items-center rounded-xl bg-surface px-8 py-14 text-center shadow-md">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-soft">
          <Wallet className="h-6 w-6 text-brand-strong" />
        </span>
        <h1 className="mt-6 text-h3">Connect your wallet</h1>
        <p className="mt-2 max-w-[32ch] text-body-sm text-muted">{description}</p>
        <Button className="mt-8" onClick={openModal} disabled={status === "connecting"}>
          Connect wallet
        </Button>
      </div>
    </div>
  );
}
