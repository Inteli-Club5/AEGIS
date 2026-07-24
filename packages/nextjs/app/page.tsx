"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import type { NextPage } from "next";
import { useAccount } from "wagmi";

const Home: NextPage = () => {
  const router = useRouter();
  const { status } = useAccount();
  // Only the connect flow started from this screen sends the user to the dashboard,
  // so coming "Back" from the dashboard with a connected wallet stays here.
  const awaitingConnection = useRef(false);

  useEffect(() => {
    if (status === "connected" && awaitingConnection.current) {
      awaitingConnection.current = false;
      router.push("/dashboard");
    }
  }, [status, router]);

  return (
    <div className="flex flex-col items-center justify-center grow gap-10 px-5 py-24">
      <h1 className="text-6xl sm:text-7xl font-bold tracking-tight m-0">AEGIS</h1>

      <ConnectButton.Custom>
        {({ openConnectModal, mounted }) => (
          <button
            className="btn btn-primary btn-lg"
            disabled={!mounted}
            type="button"
            onClick={() => {
              if (status === "connected") {
                router.push("/dashboard");
                return;
              }
              awaitingConnection.current = true;
              openConnectModal();
            }}
          >
            {status === "connected" ? "Enter Dashboard" : "Connect your Wallet"}
          </button>
        )}
      </ConnectButton.Custom>
    </div>
  );
};

export default Home;
