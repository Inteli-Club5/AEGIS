"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { UserRejectedRequestError, formatUnits, parseEther } from "viem";
import { hederaTestnet } from "viem/chains";
import { useBalance, useSendTransaction } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { Button } from "~~/components/ui/Button";
import { useConnectWallet } from "~~/features/wallet/components/ConnectWalletProvider";
import { formatHbar, truncateAddress } from "~~/lib/utils/format";
import { wagmiConfig } from "~~/services/web3/wagmiConfig";

const inputClass =
  "mt-2 min-h-11 w-full rounded-md border border-border bg-surface-raised px-3 text-body-sm transition-colors duration-[120ms] focus-visible:border-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-strong";

type Phase = "idle" | "pending" | "confirming" | "success" | "error";

export function FundWalletCard({ safeAddress }: { safeAddress: `0x${string}` }) {
  const { address: senderAddress } = useConnectWallet();
  const [amount, setAmount] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);

  const safeBalance = useBalance({ address: safeAddress });
  const senderBalance = useBalance({ address: senderAddress ?? undefined });

  const { sendTransactionAsync } = useSendTransaction();

  if (!senderAddress) return null;

  const busy = phase === "pending" || phase === "confirming";

  function handleAmountChange(value: string) {
    setAmount(value);
    if (!busy) setPhase("idle");
  }

  async function handleSend() {
    setError(null);
    const trimmed = amount.trim();
    const numeric = Number(trimmed);
    if (!trimmed || !Number.isFinite(numeric) || numeric <= 0) {
      setPhase("error");
      setError("Enter an amount greater than zero.");
      return;
    }

    setPhase("pending");
    try {
      const value = parseEther(trimmed);
      const hash = await sendTransactionAsync({ to: safeAddress, value, chainId: hederaTestnet.id });
      setPhase("confirming");
      await waitForTransactionReceipt(wagmiConfig, { hash, chainId: hederaTestnet.id });
      setPhase("success");
      setAmount("");
      safeBalance.refetch();
      senderBalance.refetch();
    } catch (err) {
      setPhase("error");
      setError(describeSendError(err));
    }
  }

  return (
    <div className="mt-4 rounded-md border border-border bg-surface-raised p-4">
      <p className="text-label text-muted">Fund this wallet</p>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-caption text-subtle">From {truncateAddress(senderAddress)}</p>
        <p className="font-mono text-caption text-subtle">
          Balance:{" "}
          {senderBalance.data
            ? formatHbar(Number(formatUnits(senderBalance.data.value, senderBalance.data.decimals)))
            : "—"}
        </p>
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="min-w-0 flex-1 text-label" htmlFor="fund-wallet-amount">
          Amount (HBAR)
          <input
            id="fund-wallet-amount"
            value={amount}
            onChange={event => handleAmountChange(event.target.value)}
            inputMode="decimal"
            placeholder="0.00"
            disabled={busy}
            className={`${inputClass} font-mono`}
          />
        </label>
        <Button onClick={handleSend} disabled={busy || !amount.trim()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : "Send"}
        </Button>
      </div>

      {phase === "confirming" && (
        <p className="mt-2 flex items-center gap-1.5 text-caption text-muted">
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
          Waiting for confirmation…
        </p>
      )}
      {phase === "success" && (
        <p className="mt-2 flex items-center gap-1.5 text-caption text-success">
          <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
          Sent. The wallet balance will update shortly.
        </p>
      )}
      {phase === "error" && error && (
        <p className="mt-2 flex items-center gap-1.5 text-caption text-danger">
          <AlertCircle className="h-3 w-3" aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  );
}

function describeSendError(err: unknown): string {
  if (err instanceof UserRejectedRequestError) {
    return "Transaction was rejected.";
  }
  return "Couldn't send the transaction. Please try again.";
}
