import { JetBrains_Mono, Manrope } from "next/font/google";
import "./globals.css";
import { ConnectWalletProvider } from "@/features/wallet/components/ConnectWalletProvider";
import "@rainbow-me/rainbowkit/styles.css";
import type { Metadata } from "next";
import { ScaffoldHbarAppWithProviders } from "~~/components/ScaffoldHbarAppWithProviders";
import { ThemeProvider } from "~~/components/ThemeProvider";

const manrope = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "600", "800"],
  variable: "--font-manrope",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "AEGIS — A safety layer for agents that move value",
  description:
    "AEGIS wraps AI agents in a protected Safe wallet. Policy, TEE-verified decisions, and AEGIS co-signature must all line up — or nothing executes.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${manrope.variable} ${jetbrainsMono.variable} antialiased`}>
      <body className="flex min-h-dvh flex-col">
        <ThemeProvider enableSystem>
          <ScaffoldHbarAppWithProviders>
            <ConnectWalletProvider>{children}</ConnectWalletProvider>
          </ScaffoldHbarAppWithProviders>
        </ThemeProvider>
      </body>
    </html>
  );
}
