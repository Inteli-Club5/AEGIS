"use client";

import { useEffect, useState } from "react";
import { RainbowKitProvider, darkTheme, lightTheme } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppProgressBar as ProgressBar } from "next-nprogress-bar";
import { useTheme } from "next-themes";
import { Toaster } from "react-hot-toast";
import { hederaTestnet } from "viem/chains";
import { WagmiProvider } from "wagmi";
import { BlockieAvatar } from "~~/components/scaffold-hbar";
import { wagmiConfig } from "~~/services/web3/wagmiConfig";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
    },
  },
});

export const ScaffoldHbarAppWithProviders = ({ children }: { children: React.ReactNode }) => {
  const { resolvedTheme } = useTheme();
  const isDarkMode = resolvedTheme === "dark";
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const rainbowKitTheme = mounted
    ? isDarkMode
      ? darkTheme({
          accentColor: "#62affc",
          accentColorForeground: "#0f2a47",
          borderRadius: "medium",
          fontStack: "system",
          overlayBlur: "small",
        })
      : lightTheme({
          accentColor: "#62affc",
          accentColorForeground: "#0f2a47",
          borderRadius: "medium",
          fontStack: "system",
          overlayBlur: "small",
        })
    : lightTheme({
        accentColor: "#62affc",
        accentColorForeground: "#0f2a47",
        borderRadius: "medium",
        fontStack: "system",
        overlayBlur: "small",
      });

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <ProgressBar height="3px" color="#62affc" />
        <RainbowKitProvider avatar={BlockieAvatar} coolMode initialChain={hederaTestnet} theme={rainbowKitTheme}>
          {children}
          <Toaster />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
};
