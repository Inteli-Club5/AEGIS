"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { type WalletId, useConnectWallet } from "./ConnectWalletProvider";
import { Button } from "@/components/ui/Button";
import { truncateAddress } from "@/lib/utils/format";
import { Check, Copy, Loader2, ShieldCheck, X } from "lucide-react";

const WALLETS: Array<{ id: WalletId; name: string; initials: string }> = [
  { id: "metamask", name: "MetaMask", initials: "MM" },
  { id: "walletconnect", name: "WalletConnect", initials: "WC" },
  { id: "coinbase", name: "Coinbase Wallet", initials: "CB" },
];

export function ConnectModal({ open }: { open: boolean }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const { status, address, closeModal, connect } = useConnectWallet();
  const [pendingWallet, setPendingWallet] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  function handleDialogClose() {
    setPendingWallet(null);
    setCopied(false);
    closeModal();
  }

  function handlePick(wallet: (typeof WALLETS)[number]) {
    setPendingWallet(wallet.name);
    connect(wallet.id);
  }

  async function handleCopy() {
    if (!address) return;
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={handleDialogClose}
      onClick={e => {
        if (e.target === dialogRef.current) handleDialogClose();
      }}
      className="m-auto w-[min(480px,calc(100vw-32px))] rounded-xl bg-surface-raised p-8 text-foreground shadow-xl backdrop:bg-foreground/25 backdrop:backdrop-blur-sm"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-h3">{status === "connected" ? "Wallet connected" : "Connect your wallet"}</h2>
          <p className="mt-1 text-body-sm text-muted">
            {status === "connected"
              ? "You’re set. The dashboard picks it up from here."
              : "Connect the operator wallet you’ll protect agents with."}
          </p>
        </div>
        <button
          onClick={closeModal}
          aria-label="Close dialog"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted transition-colors duration-[120ms] hover:bg-brand-soft hover:text-brand-strong"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {status === "connected" && address ? (
        <div className="mt-6 space-y-4">
          <div className="flex items-center gap-3 rounded-lg bg-success-soft p-4">
            <ShieldCheck className="h-5 w-5 shrink-0 text-success" />
            <div className="min-w-0">
              <p className="text-label text-success">Connected</p>
              <p className="mt-0.5 flex items-center gap-2 font-mono text-mono-md">
                <span title={address}>{truncateAddress(address)}</span>
                <button
                  onClick={handleCopy}
                  aria-label="Copy address"
                  className="text-muted transition-colors duration-[120ms] hover:text-brand-strong"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </p>
            </div>
          </div>
          {/* TODO(backend): remove once the real wagmi connection lands. */}
          <p className="text-caption text-subtle">
            This session is simulated locally — wallet connection isn’t wired to a real provider yet.
          </p>
          <div className="flex justify-end">
            <Button
              onClick={() => {
                handleDialogClose();
                router.push("/dashboard");
              }}
            >
              Open dashboard
            </Button>
          </div>
        </div>
      ) : (
        <ul className="mt-6 space-y-2">
          {WALLETS.map(wallet => {
            const isPending = status === "connecting" && pendingWallet === wallet.name;
            return (
              <li key={wallet.id}>
                <button
                  onClick={() => handlePick(wallet)}
                  disabled={status === "connecting"}
                  className="flex h-14 w-full items-center gap-3 rounded-lg border border-border bg-surface-raised px-4 text-left transition-colors duration-[120ms] hover:border-border-strong hover:bg-brand-soft/40 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-soft font-mono text-mono-sm font-medium text-brand-strong">
                    {wallet.initials}
                  </span>
                  <span className="flex-1 text-body-sm font-semibold">{wallet.name}</span>
                  {isPending && (
                    <span className="flex items-center gap-2 text-caption text-muted">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Waiting…
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </dialog>
  );
}
