# AEGIS - repo setup

Follow this once, on your machine, so the git history is yours (ETHGlobal judges
look for commits made during the event). Everything below is public boilerplate;
all AEGIS-specific code you write during the hackathon.

## 0. Prerequisites

```bash
node -v            # v20+ (v22 fine)
corepack enable    # provides yarn (scaffold-hbar uses yarn berry)
git --version
# foundry:
curl -L https://foundry.paradigm.xyz | bash && foundryup
```

## 1. Base = scaffold-hbar (Hedera-wired scaffold-eth-2)

```bash
git clone --recurse-submodules https://github.com/hedera-dev/scaffold-hbar.git aegis
cd aegis
rm -rf .git        # drop upstream history; this becomes YOUR repo
```

This gives you `packages/nextjs` (dashboard), `packages/foundry` and
`packages/hardhat` (contracts). Hedera testnet + Hashio RPC are already set in
`packages/nextjs/scaffold.config.ts`. Strategy: deploy ALL EVM contracts on
Hedera testnet (kills the cross-chain atomicity gap; satisfies the Hedera bounty).

## 2. Decision verifier = 0G starter kit (off-chain, TEE-signed)

```bash
mkdir -p services
git clone --depth 1 https://github.com/0glabs/0g-compute-ts-starter-kit.git services/decision-verifier
rm -rf services/decision-verifier/.git
printf 'PRIVATE_KEY=0x_your_0g_testnet_key\nPORT=4000\n' > services/decision-verifier/.env.example
```

This is an Express service that calls 0G Compute; the model runs in a TEE and the
response is signed by the enclave. That signature becomes the `proofRef` in your
Decision Receipt.

## 3. Co-signer service (skeleton - you write the logic during the event)

```bash
mkdir -p services/cosigner/src

cat > services/cosigner/package.json <<'EOF'
{
  "name": "aegis-cosigner",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": { "dev": "tsx watch src/index.ts", "build": "tsc" },
  "dependencies": {
    "@safe-global/protocol-kit": "^6.1.0",
    "@safe-global/api-kit": "^4.0.0",
    "dotenv": "^16.4.5",
    "ethers": "^6.11.1",
    "express": "^4.18.2"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/node": "^22.0.0",
    "tsx": "^4.16.0",
    "typescript": "^5.5.0"
  }
}
EOF

cat > services/cosigner/src/index.ts <<'EOF'
// AEGIS co-signer (skeleton). Re-checks policy + identity + decision receipt,
// then co-signs (Safe 2-of-3: agent signer + AEGIS co-signer + recovery
// guardian). Key in .env for DEMO ONLY - never exposed to the user;
// local HSM/MPC/TEE in prod, always self-hosted, never a hosted service.
import "dotenv/config";
import express from "express";

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true, service: "aegis-cosigner" }));

// POST /cosign  { agentId, wallet, policyHash, action, decisionReceipt }
app.post("/cosign", async (_req, res) => {
  // TODO(aegis): verify decisionReceipt signature came from the 0G TEE
  // TODO(aegis): re-check policy (destination, token, amount, deadline, nonce)
  // TODO(aegis): check identity / policyHash; valid -> AcceptedReceipt + co-sign
  //              invalid -> DeniedReceipt, no signature, blocked
  res.status(501).json({ error: "not_implemented" });
});

app.listen(process.env.COSIGNER_PORT ?? 4100, () =>
  console.log(`aegis-cosigner on :${process.env.COSIGNER_PORT ?? 4100}`));
EOF

cat > services/cosigner/tsconfig.json <<'EOF'
{ "compilerOptions": { "target": "ES2022", "module": "ESNext",
  "moduleResolution": "Bundler", "esModuleInterop": true, "strict": true,
  "skipLibCheck": true, "outDir": "dist" }, "include": ["src"] }
EOF

printf 'COSIGNER_PRIVATE_KEY=0x_demo_key\nCOSIGNER_PORT=4100\nSAFE_ADDRESS=\nRPC_URL=https://testnet.hashio.io/api\n' > services/cosigner/.env.example
```

## 4. Docs + playbook

Place these files in the repo:
- `docs/AEGIS_ARCHITECTURE.md` (your architecture)
- `PLAYBOOK.md`, `TASKS.md`, `DEVLOG.md` (provided alongside this file)
- `STACK.md` optional (module -> location map)

## 5. Make AI agents always read the playbook

scaffold-hbar already ships `AGENTS.md` and `CLAUDE.md` (read by Claude Code,
Cursor, opencode). Prepend this block to BOTH so every agent session starts from
the playbook:

```bash
for f in AGENTS.md CLAUDE.md; do
  printf '> **START HERE, EVERY SESSION:** read `PLAYBOOK.md`, then `TASKS.md`, then the latest entry in `DEVLOG.md` before doing anything. Follow the playbook workflow and log your work to `DEVLOG.md` at the end of the session.\n\n%s' "$(cat "$f")" > "$f.tmp" && mv "$f.tmp" "$f"
done
```

## 6. Install, configure, run

```bash
yarn install
git submodule update --init --recursive     # if foundry libs are empty

# dashboard
yarn next:dev                                # http://localhost:3000

# contracts -> Hedera testnet (add your key first: yarn foundry:account:import)
yarn foundry:deploy --network hederaTestnet

# services
cd services/decision-verifier && npm install && cp .env.example .env && npm run dev
cd ../cosigner            && npm install && cp .env.example .env && npm run dev
```

Testnet account + HBAR: https://portal.hedera.com

## 7. First commit + push

```bash
git init
printf 'node_modules\ndist\n.next\n.env\n.env.*\n!.env.example\npackages/foundry/out\npackages/foundry/cache\npackages/foundry/broadcast\n' > .gitignore
git add -A
git commit -m "chore: bootstrap AEGIS (scaffold-hbar + 0G starter kit)"
# create an empty repo on GitHub, then:
git remote add origin <your-repo-url>
git push -u origin main
```

## Attribution (ETHGlobal transparency)

Keep a short note in `README.md`: built during ETHGlobal Lisbon on public starter
kits - scaffold-hbar (`packages/`), 0g-compute-ts-starter-kit
(`services/decision-verifier`), Safe{Core} SDK (`services/cosigner`). All AEGIS
logic written during the event. Commit in small steps so the history is visible.
