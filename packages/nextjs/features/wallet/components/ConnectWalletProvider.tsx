"use client";

import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useRouter } from "next/navigation";
import { ConnectModal } from "./ConnectModal";

export type WalletId = "metamask" | "walletconnect" | "coinbase";
type Status = "disconnected" | "connecting" | "connected";

const SESSION_KEY = "aegis.session";
const PLACEHOLDER_ADDRESS = "0x71C7656EC7ab88b098defB751B7401B5f6d8976F";

// TODO(backend): replace this whole provider with real wagmi/RainbowKit
// connection state. The session below is persisted to localStorage only so
// it survives route changes in the meantime.
const listeners = new Set<() => void>();

function readSession() {
  return localStorage.getItem(SESSION_KEY);
}

function readServerSession() {
  return null;
}

function writeSession(value: string | null) {
  if (value) localStorage.setItem(SESSION_KEY, value);
  else localStorage.removeItem(SESSION_KEY);
  listeners.forEach(notify => notify());
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

interface ConnectWalletContextValue {
  status: Status;
  address: string | null;
  openModal: () => void;
  closeModal: () => void;
  connect: (wallet: WalletId) => void;
  disconnect: () => void;
}

const ConnectWalletContext = createContext<ConnectWalletContextValue | null>(null);

export function useConnectWallet() {
  const ctx = useContext(ConnectWalletContext);
  if (!ctx) {
    throw new Error("useConnectWallet must be used within ConnectWalletProvider");
  }
  return ctx;
}

export function ConnectWalletProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const address = useSyncExternalStore(subscribe, readSession, readServerSession);
  const [connecting, setConnecting] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openModal = useCallback(() => setModalOpen(true), []);

  const closeModal = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setConnecting(false);
    setModalOpen(false);
  }, []);

  const connect = useCallback(
    (wallet: WalletId) => {
      void wallet; // TODO(backend): use this to pick the real connector (wagmi).
      setConnecting(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      // TODO(backend): simulated latency stands in for the real wallet extension round-trip.
      timerRef.current = setTimeout(() => {
        writeSession(PLACEHOLDER_ADDRESS);
        setConnecting(false);
        // Shows the success state briefly, then continues to the dashboard.
        timerRef.current = setTimeout(() => {
          router.push("/dashboard");
          setModalOpen(false);
        }, 900);
      }, 1100);
    },
    [router],
  );

  const disconnect = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setConnecting(false);
    writeSession(null);
    router.push("/");
  }, [router]);

  const status: Status = connecting ? "connecting" : address ? "connected" : "disconnected";

  const value = useMemo(
    () => ({ status, address, openModal, closeModal, connect, disconnect }),
    [status, address, openModal, closeModal, connect, disconnect],
  );

  return (
    <ConnectWalletContext.Provider value={value}>
      {children}
      <ConnectModal open={modalOpen} />
    </ConnectWalletContext.Provider>
  );
}
