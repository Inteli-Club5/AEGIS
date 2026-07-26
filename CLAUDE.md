> **START HERE, EVERY SESSION:** read `PLAYBOOK.md`, then `TASKS.md`, then the latest entry in `DEVLOG.md` before doing anything. On `feat/policy-engine-level-1`, also read `docs/aegis-current-scope.md`; it overrides older architecture, bounty, demo, and implementation notes for this branch. Follow the playbook workflow and log your work to `DEVLOG.md` at the end of the session.

# CLAUDE.md

## AEGIS

This repo is AEGIS, built at ETHGlobal Lisbon on top of scaffold-hbar (Hedera),
with the 0G Compute starter kit used as a public reference and a Safe-based
co-signer skeleton. The unintegrated 0G starter service is not runtime code.

- `PLAYBOOK.md` - workflow, ownership lanes, commit/DEVLOG conventions (source of truth).
- `TASKS.md` - each owner's priority-ordered task list; top unchecked item = current focus.
- `DEVLOG.md` - append-only session log; read the newest entries before working.
- `docs/aegis-current-scope.md` - current `feat/policy-engine-level-1` scope overlay; it wins over older docs on this branch.
- `docs/AEGIS_ARCHITECTURE.md` - product/technical architecture (EN, production-locked: Safe, The Graph, no ENS for agent identity).
- `docs/decisions.md` - ADR-lite log of locked decisions.

```
packages/nextjs             dashboard (Next.js + RainbowKit + wagmi)
packages/foundry            contracts (PolicyRegistry, AgentVault...)
services/agent-service      policy engine + verified TeeML registry writer port
services/cosigner           policy re-check + co-signature (Safe SDK)
```

Everything below this section is generic scaffold-hbar guidance, kept for the
Hedera/Next.js/Foundry mechanics (commands, hooks, styling conventions).

@AGENTS.md

This repository keeps agent guidance in `AGENTS.md` to avoid duplication. Please refer to `AGENTS.md` for the full instructions.
