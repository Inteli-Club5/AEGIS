import type { AgentDetail } from "@/lib/types/aegis";

const AEGIS_COSIGNER = "0xAE61f3a2C09d5c8B71e04D22b9F6a3E8c4B15c1d";
const AEGIS_GUARDIAN = "0x6B29aF0e83C441d2A7b90D1c5E8F4a6203eD22A0";

export const AGENTS: AgentDetail[] = [
  {
    id: "agt_treasurybot",
    name: "TreasuryBot",
    type: "Treasury Agent",
    status: "protected",
    wallet: "0x3f8Ab2D91c04E7a5F06d1B22C9e4A81D7c5f9C21",
    balanceHbar: 128.4,
    policySummary: "max 1 ℏ / action · 3 destinations",
    lastActionAgo: "2h ago",
    description: "Pays approved service providers on a recurring schedule under AEGIS policies.",
    capabilities: ["pay_service_provider", "transfer_tokens"],
    createdAt: "2026-06-08T14:20:00Z",
    walletInfo: {
      address: "0x3f8Ab2D91c04E7a5F06d1B22C9e4A81D7c5f9C21",
      agentSigner: "0x71C7656EC7ab88b098defB751B7401B5f6d8976F",
      aegisCosigner: AEGIS_COSIGNER,
      guardian: AEGIS_GUARDIAN,
      guardianManaged: true,
      threshold: "2-of-3",
    },
    policy: {
      policyHash: "0x2b91e4c7a05d38f1b6e2470c9d8a15f3e07bc42d9a6510f8c37e2b4d90a17e0f",
      fields: {
        field1: "Approved providers only",
        field2: "HBAR",
        field3: "Magna aliqua",
        field4: "1",
        field5: "Recurring settlement window, business days only.",
      },
    },
  },
  {
    id: "agt_databuyer",
    name: "DataBuyer",
    type: "API Buyer",
    status: "paused",
    wallet: "0x9d4B7eA10f52C83b6D0E14aF27b9c6E85D1222A0",
    balanceHbar: 42.05,
    policySummary: "max 0.25 ℏ / call · 1 provider",
    lastActionAgo: "6h ago",
    description: "Buys market-data API calls from a single approved provider.",
    capabilities: ["call_api", "pay_service_provider"],
    createdAt: "2026-06-14T09:05:00Z",
    walletInfo: {
      address: "0x9d4B7eA10f52C83b6D0E14aF27b9c6E85D1222A0",
      agentSigner: "0xC44f19bE7d3A08e5216fB9042dA7c8351E9b7733",
      aegisCosigner: AEGIS_COSIGNER,
      guardian: "0x2E7a91Cd40B6f83A15e0D274cB9f6183aD05e441",
      guardianManaged: false,
      threshold: "2-of-3",
    },
    policy: {
      policyHash: "0x7f10ac93b528e6d4013fa87c25be9016d3c4780ea915f2b6c08d4319ae7250bb",
      fields: {
        field1: "Market data endpoint",
        field2: "HBAR",
        field3: "Enim ad minim veniam",
        field4: "0.25",
        field5: "Per-call billing, capped daily.",
      },
    },
  },
];
