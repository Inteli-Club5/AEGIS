# Tasks

One priority-ordered list per owner. The top unchecked item is what you are doing
now. No parallel/ambiguous items within a lane. See PLAYBOOK.md.

## Shared (do first, together - day 1)
- [ ] **Freeze interfaces** in `docs/interfaces.md` - Decision Receipt schema, `/verify` + `/cosign` API shapes, ABI/`deployments.json` location
- [ ] **Repo up + everyone building** - SETUP.md done, dashboard runs, first commit pushed
- [ ] **Seed `docs/decisions.md`** - "all EVM on Hedera testnet (single-chain MVP)"

## Victor - contracts & web3 core
- [ ] **PolicyRegistry.sol** - store policyHash + constraints, emit events
- [ ] **AgentVault.sol** - 2-of-2 enforce (agent signer + AEGIS co-signer), execute on valid receipt
- [ ] **Deploy to Hedera testnet** - write `deployments.json`, verify contracts
- [ ] **Cosigner signing logic** - fill `services/cosigner` /cosign (verify TEE sig, re-check policy, Accepted/Denied)
- [ ] **HBAR payment path** - approved action triggers transfer to provider

## Leunam - dashboard & integration
- [ ] **Connect wallet + empty dashboard** - "no protected agents yet"
- [ ] **Protect Agent form** - register agent profile (name, type, signer, ENS optional)
- [ ] **Create Policy form** - destinations, tokens, max amount, deadline, nonce
- [ ] **Wire verifier + cosigner** - propose action -> /verify -> /cosign -> execute
- [ ] **Dashboard state** - green action + fee, blocked action, trust badge

## Rodrigo - product, pitch & demo
- [ ] **Demo script** - the 6-step sequence, who clicks what, timing under 3 min
- [ ] **Bounty checklists** - Hedera + 0G submission requirements mapped to tasks
- [ ] **Sponsor conversations** - confirm probable fits (ENS, World, The Graph, Uniswap)
- [ ] **3-min video** - record once steps 3-6 work end to end
- [ ] **Table narrative** - one-liner + problem/market gap (actuarial baseline for mandate violations)

## Waiting On

## Someday / stretch
- [ ] ENS runtime resolution + text records for trust badge
- [ ] Real Safe 2-of-2 on a supported chain
- [ ] ERC-7857 Agentic ID
- [ ] x402 / HCS logs / 0G Storage

## Done
