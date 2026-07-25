"use client";

import Link from "next/link";
import { LogoWordmark } from "@/components/ui/LogoMark";
import { useConnectWallet } from "@/features/wallet/components/ConnectWalletProvider";
import { truncateAddress } from "@/lib/utils/format";
import { LogOut } from "lucide-react";

export function AppTopbar() {
  const { address, disconnect } = useConnectWallet();

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-[1200px] items-center justify-between gap-4 px-6">
        <Link href="/" aria-label="AEGIS home" className="rounded-sm">
          <LogoWordmark />
        </Link>

        <div className="flex items-center gap-3">
          <span className="hidden rounded-full bg-surface px-3 py-1.5 font-mono text-mono-sm text-muted sm:inline">
            Hedera testnet
          </span>
          {address && (
            <span
              title={address}
              className="rounded-full bg-success-soft px-4 py-1.5 font-mono text-mono-sm font-medium text-success"
            >
              {truncateAddress(address)}
            </span>
          )}
          <button
            onClick={disconnect}
            aria-label="Disconnect wallet"
            className="flex h-9 w-9 items-center justify-center rounded-md text-muted transition-colors duration-[120ms] hover:bg-brand-soft hover:text-brand-strong"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
