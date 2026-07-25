"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { LogoWordmark } from "@/components/ui/LogoMark";
import { useConnectWallet } from "@/features/wallet/components/ConnectWalletProvider";
import { cn } from "@/lib/utils/cn";
import { truncateAddress } from "@/lib/utils/format";

const LINKS = [
  { href: "#flow", label: "How it works" },
  { href: "#docs", label: "Docs" },
];

export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const { status, address, openModal } = useConnectWallet();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-40 transition-colors duration-[160ms]",
        scrolled
          ? "border-b border-border bg-background/85 backdrop-blur-md"
          : "border-b border-transparent bg-transparent",
      )}
    >
      <div className="mx-auto flex h-16 w-full max-w-[1200px] items-center justify-between gap-6 px-6">
        <a href="#top" aria-label="AEGIS — back to top" className="rounded-sm">
          <LogoWordmark />
        </a>

        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {LINKS.map(link => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-md px-3 py-2 text-body-sm font-medium text-muted transition-colors duration-[120ms] hover:bg-brand-soft hover:text-brand-strong"
            >
              {link.label}
            </a>
          ))}
        </nav>

        {status === "connected" && address ? (
          <Link
            href="/dashboard"
            title="Open dashboard"
            className="rounded-full bg-success-soft px-4 py-1.5 font-mono text-mono-sm font-medium text-success transition-colors duration-[120ms] hover:bg-success-soft/70"
          >
            {truncateAddress(address)}
          </Link>
        ) : (
          <Button size="sm" onClick={openModal}>
            Connect wallet
          </Button>
        )}
      </div>
    </header>
  );
}
