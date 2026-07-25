"use client";

import { type ReactNode, createContext, useCallback, useContext, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ConnectModal } from "./ConnectModal";
import { type Address, UserRejectedRequestError } from "viem";
import { hederaTestnet } from "viem/chains";
import { type Connector, useAccount, useConnect, useDisconnect } from "wagmi";

export type WalletId = "metamask" | "walletconnect" | "coinbase";
type Status = "disconnected" | "connecting" | "connected" | "error";

type RkConnector = Connector & {
  rkDetails?: { id?: string; isWalletConnectModalConnector?: boolean; showQrModal?: boolean };
};

function findConnector(connectors: readonly Connector[], wallet: WalletId): Connector | undefined {
  const rkConnectors = connectors as RkConnector[];
  if (wallet === "walletconnect") {
    return rkConnectors.find(c => c.rkDetails?.id === "walletConnect" && c.rkDetails.isWalletConnectModalConnector);
  }
  const rkId = wallet === "metamask" ? "metaMask" : "coinbase";
  const connector = rkConnectors.find(c => c.rkDetails?.id === rkId);
  if (connector && connector.id === "walletConnect" && !connector.rkDetails?.showQrModal) {
    return undefined;
  }
  return connector;
}

type ConnectWalletContextValue = {
  status: Status;
  address: Address | null;
  error: string | null;
  openModal: () => void;
  closeModal: () => void;
  connect: (wallet: WalletId) => void;
  disconnect: () => void;
};

const ConnectWalletContext = createContext<ConnectWalletContextValue | null>(null);

export function useConnectWallet() {
  const ctx = useContext(ConnectWalletContext);
  if (!ctx) {
    throw new Error("useConnectWallet must be used within ConnectWalletProvider");
  }
  return ctx;
}

function describeConnectError(err: unknown): string {
  if (err instanceof UserRejectedRequestError) {
    return "Connection request was rejected.";
  }
  return "Couldn't connect. Please try again.";
}

export function ConnectWalletProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { address, status: accountStatus } = useAccount();
  const { connectors, connectAsync, isPending } = useConnect();
  const { disconnectAsync } = useDisconnect();

  if (process.env.NODE_ENV !== "production" && connectors.length > 0) {
    const hasRkDetails = connectors.some(c => (c as RkConnector).rkDetails);
    if (!hasRkDetails) {
      console.warn(
        "[ConnectWalletProvider] No connector carries RainbowKit's `rkDetails` -- findConnector() " +
          "may be broken by a @rainbow-me/rainbowkit version bump. See the comment above findConnector().",
      );
    }
  }

  const [modalOpen, setModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openModal = useCallback(() => {
    setError(null);
    setModalOpen(true);
  }, []);

  const closeModal = useCallback(() => setModalOpen(false), []);

  const connect = useCallback(
    (wallet: WalletId) => {
      const connector = findConnector(connectors, wallet);
      if (!connector) {
        setError("That wallet isn't available in this browser -- try WalletConnect, or install the extension.");
        return;
      }
      setError(null);
      connectAsync({ connector, chainId: hederaTestnet.id }).catch(err => setError(describeConnectError(err)));
    },
    [connectors, connectAsync],
  );

  const disconnect = useCallback(() => {
    disconnectAsync()
      .catch(() => {})
      .finally(() => router.push("/"));
  }, [disconnectAsync, router]);

  const status: Status = error
    ? "error"
    : isPending || accountStatus === "reconnecting"
      ? "connecting"
      : accountStatus === "connected"
        ? "connected"
        : "disconnected";

  const value = useMemo(
    () => ({ status, address: address ?? null, error, openModal, closeModal, connect, disconnect }),
    [status, address, error, openModal, closeModal, connect, disconnect],
  );

  return (
    <ConnectWalletContext.Provider value={value}>
      {children}
      <ConnectModal open={modalOpen} />
    </ConnectWalletContext.Provider>
  );
}
