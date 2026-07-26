import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const NEXTJS_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const BOUNDARIES = [
  join(NEXTJS_ROOT, "app/dashboard"),
  join(NEXTJS_ROOT, "app/agents"),
  join(NEXTJS_ROOT, "app/api/onchain"),
  join(NEXTJS_ROOT, "features/dashboard"),
  join(NEXTJS_ROOT, "features/agents"),
  join(NEXTJS_ROOT, "lib/onchain-data"),
];

const FORBIDDEN_RUNTIME_PATTERNS = [
  { pattern: /(?:from|import\()\s*["'][^"']*lib\/fixtures/, reason: "runtime fixture import" },
  { pattern: /\blistActivity\b|\bgetDashboardStats\b/, reason: "legacy localStorage agent history" },
  { pattern: /\/api\/hedera\/account/i, reason: "Mirror Node proxy fallback" },
  { pattern: /mirrornode|mirror-node|mainnet-public\.mirrornode/i, reason: "Mirror Node read" },
  { pattern: /\beth_getLogs\b|\bgetPastEvents\b|\bgetLogs\s*\(/, reason: "historical RPC log read" },
  {
    pattern: /\buseBalance\b|\buseReadContract\b|\buseScaffoldReadContract\b/,
    reason: "confirmed RPC contract/balance read",
  },
  { pattern: /\busePublicClient\b|\bcreatePublicClient\b|\bJsonRpcProvider\b/, reason: "direct RPC client" },
  { pattern: /@hiero-ledger\/sdk|(?:from|import\()\s*["']ethers["']/, reason: "chain SDK/RPC client" },
  { pattern: /NEXT_PUBLIC_HEDERA_(?:MAINNET|TESTNET)_RPC_URL|ZERO_G_GALILEO_RPC_URL/, reason: "direct RPC endpoint" },
  { pattern: /fetch\s*\([^)]*(?:hashscan|chainscan|explorer)/is, reason: "explorer scraping" },
  { pattern: /\bDATABASE_URL\b|\bdrizzle\b|(?:from|require\()["']pg["']/, reason: "private database fallback" },
  { pattern: /fakeSubgraph|mockSubgraph|fallbackData|hardcodedOnchain/i, reason: "runtime fake or fallback" },
];

describe("dashboard onchain read boundary", () => {
  it("keeps confirmed and historical reads behind The Graph GraphQL API", () => {
    const violations: string[] = [];
    for (const file of BOUNDARIES.flatMap(walkRuntimeFiles)) {
      const source = readFileSync(file, "utf8");
      for (const forbidden of FORBIDDEN_RUNTIME_PATTERNS) {
        if (forbidden.pattern.test(source)) {
          violations.push(`${file.slice(NEXTJS_ROOT.length + 1)}: ${forbidden.reason}`);
        }
      }
    }

    assert.deepEqual(violations, []);
  });

  it("routes dashboard reads through same-origin APIs backed by configured Subgraph endpoints", () => {
    const browser = readFileSync(join(NEXTJS_ROOT, "lib/onchain-data/browser.ts"), "utf8");
    const serverClients = readFileSync(join(NEXTJS_ROOT, "lib/onchain-data/serverClients.ts"), "utf8");
    const transport = readFileSync(join(NEXTJS_ROOT, "lib/onchain-data/transport.ts"), "utf8");

    assert.match(browser, /\/api\/onchain\/overview/);
    assert.match(browser, /\/api\/onchain\/audit-copilot/);
    assert.match(browser, /\/api\/onchain\/validations/);
    assert.match(browser, /\/api\/onchain\/agents/);
    assert.match(browser, /\/api\/onchain\/identities/);
    assert.match(serverClients, /THEGRAPH_HEDERA_SUBGRAPH_URL/);
    assert.match(serverClients, /THEGRAPH_0G_SUBGRAPH_URL/);
    assert.match(transport, /JSON\.stringify\(\{ query: input\.document, variables:/);
  });

  it("keeps Audit Copilot behind static GraphQL operations and indexed citations", () => {
    const copilot = readFileSync(join(NEXTJS_ROOT, "lib/onchain-data/auditCopilot.ts"), "utf8");

    assert.match(copilot, /AUDIT_ZERO_G_REGISTRY_SUMMARY_QUERY/);
    assert.match(copilot, /AUDIT_ZERO_G_AUTHORIZATIONS_QUERY/);
    assert.match(copilot, /AUDIT_ZERO_G_DELEGATIONS_QUERY/);
    assert.match(copilot, /transactionHash/);
    assert.match(copilot, /blockNumber/);
    assert.doesNotMatch(copilot, /query\s*:\s*(?:question|input\.request\.question)/);
  });

  it("does not retain simulated activity or dashboard metrics in the agent profile API", () => {
    const agentsApi = readFileSync(join(NEXTJS_ROOT, "lib/api/agents.ts"), "utf8");
    const onboardingApi = readFileSync(join(NEXTJS_ROOT, "lib/api/onboarding.ts"), "utf8");

    assert.doesNotMatch(
      agentsApi,
      /lib\/fixtures|fixtures\/activity|\bACTIVITY\b|\blistActivity\b|\bgetDashboardStats\b/,
    );
    assert.doesNotMatch(onboardingApi, /if\s*\(existing\?\.walletInfo\)\s*return/);
    assert.match(onboardingApi, /\/api\/agent-service\/agents\/\$\{encodeURIComponent\(agentId\)\}\/wallet/);
  });

  it("does not retain unused direct-RPC history hooks", () => {
    for (const filename of [
      "useContractLogs.ts",
      "useFetchBlocks.ts",
      "useScaffoldEventHistory.ts",
      "useScaffoldReadContract.ts",
      "useScaffoldWatchContractEvent.ts",
    ]) {
      assert.equal(existsSync(join(NEXTJS_ROOT, "hooks/scaffold-hbar", filename)), false, filename);
    }
  });

  it("hashes plaintext agent searches before the same-origin request URL", () => {
    const page = readFileSync(join(NEXTJS_ROOT, "app/dashboard/agents/page.tsx"), "utf8");
    const route = readFileSync(join(NEXTJS_ROOT, "app/api/onchain/agents/route.ts"), "utf8");

    assert.match(page, /filters\.agentIdHash = hashCanonicalAgentId\(agent\)/);
    assert.doesNotMatch(page, /filters\.agentId\s*=/);
    assert.doesNotMatch(page, /searchParams\.get\(["']agentId["']\)/);
    assert.doesNotMatch(route, /optional\(params, ["']agentId["']\)/);
  });
});

function walkRuntimeFiles(path: string): string[] {
  return readdirSync(path, { withFileTypes: true }).flatMap(entry => {
    const child = join(path, entry.name);
    if (entry.isDirectory()) return walkRuntimeFiles(child);
    if (![".ts", ".tsx"].includes(extname(entry.name)) || entry.name.includes(".test.")) return [];
    return [child];
  });
}
