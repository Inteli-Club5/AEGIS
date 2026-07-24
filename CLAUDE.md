> **START HERE, EVERY SESSION:** read `PLAYBOOK.md`, then `TASKS.md`, then the latest entry in `DEVLOG.md` before doing anything. Follow the playbook workflow and log your work to `DEVLOG.md` at the end of the session.

# CLAUDE.md

## AEGIS

This repo is AEGIS, built at ETHGlobal Lisbon on top of scaffold-hbar (Hedera)
+ the 0G Compute starter kit + a Safe-based co-signer skeleton.

- `PLAYBOOK.md` - workflow, ownership lanes, commit/DEVLOG conventions (source of truth).
- `TASKS.md` - each owner's priority-ordered task list; top unchecked item = current focus.
- `DEVLOG.md` - append-only session log; read the newest entries before working.
- `docs/AEGIS_ARCHITECTURE.md` - product/technical architecture (EN, production-locked: Safe, The Graph, no ENS for agent identity).
- `docs/decisions.md` - ADR-lite log of locked decisions.
- `docs/interfaces.md` - frozen cross-lane contracts (created once the team freezes Day 1 interfaces; not yet done, see TASKS.md).

```
packages/nextjs             dashboard (Next.js + RainbowKit + wagmi)
packages/foundry            contracts (PolicyRegistry, AgentVault...)
services/decision-verifier  0G TEE inference -> signed ALLOW/DENY
services/cosigner           policy re-check + co-signature (Safe SDK)
```

Everything below this section is generic scaffold-hbar guidance, kept for the
Hedera/Next.js/Foundry mechanics (commands, hooks, styling conventions).

@AGENTS.md

This repository keeps agent guidance in `AGENTS.md` to avoid duplication. Please refer to `AGENTS.md` for the full instructions.