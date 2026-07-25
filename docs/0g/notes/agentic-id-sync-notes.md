# 0G Agentic ID Sync — Notes

## Objective

Branch: `feat/0g-agentic-id-sync`

AEGIS must create/link a 0G Agentic ID when the backend registers an agent.

## Referenced Resources

- 0G Agent Skills: https://github.com/0gfoundation/0g-agent-skills
- 0G AI Context: https://docs.0g.ai/ai-context
- 0G Agentic ID Builder Hub: https://build.0g.ai/agentic-id
- Agentic ID Examples: https://github.com/0gfoundation/agenticID-examples
- 0G Zero Coding: https://build.0g.ai/zero-coding

## Decision

For this branch, use the official Agentic ID examples as the baseline.

Do not implement TeeML/DecisionVerifier here.

The 0G Galileo integration stays isolated in
`packages/nextjs/integrations/0g/agentic-id/` and must not be mixed with
Scaffold-HBAR Hedera contracts/deployments.

This branch's flow must be backend-first: no registration dashboard, no
localStorage, and no fallback that looks like success. If 0G Storage, the
network, the contract, or the service key fails, the API returns an explicit
error.

## Expected Artifacts

- Agent metadata
- Metadata hash
- Agentic ID token id
- Contract address
- Mint/link transaction hash

## Implemented In This Branch

- Backend route `POST /api/0g/agentic-id` to register/link the Agentic ID.
- Isolated integration in `packages/nextjs/integrations/0g/agentic-id/`.
- `AgentProfile` type and integration function input/output types.
- Offchain metadata generation and `metadataHash`.
- Real metadata upload to 0G Storage through
  `@0gfoundation/0g-storage-ts-sdk`.
- Merkle tree generation before upload.
- Verification of the root hash returned by upload against the local root.
- Verified download of the metadata sent to 0G Storage.
- `datas` generation for `iMint(to, datas)` with hashes of:
  `aegisAgentId`, `agentName`, `agentDescription`, `agentType`,
  `capabilities`, `agentWalletAddress`, `policyHash`, and `metadataHash`.
- Minimal AgenticID ABI with `iMint`, `mintFee`, `setTokenURI`, `ownerOf`,
  `transferFrom`, `tokenURI`, `getIntelligentDatas`, and `Transfer`.
- Real `mintFee()` and `iMint(to, datas)` calls against the 0G Galileo
  AgenticID contract using the backend signer configured by env.
- `tokenId` parsing from the `Transfer` event, filtering by the AgenticID
  contract, zero address `from`, and `to` equal to the backend signer.
- Real `setTokenURI(tokenId, metadataURI)` call using a URI derived from the 0G
  Storage root hash.
- Real token transfer to `ownerAddress` when `ownerAddress` differs from the
  backend signer.
- Final `ownerOf(tokenId)` and `tokenURI(tokenId)` verification.
- 0G Galileo and 0G Storage variables in `.env.example` and
  `packages/nextjs/.env.example`. The backend can read `ZERO_G_*` names, or
  the shorter root `.env` aliases used by the 0G examples:
  `PRIVATE_KEY`, `RPC_URL`, `CHAIN_ID`, `STORAGE_INDEXER`,
  `AGENTIC_ID_CONTRACT`, `EXPLORER_BASE_URL`, and `STORAGE_URI_PREFIX`.

## Live Galileo Validation

Validated on 0G Galileo testnet with a funded backend signer on
2026-07-24.

- Storage SDK: `@0gfoundation/0g-storage-ts-sdk@1.2.10`.
- Storage smoke-test tx:
  `0x3898c18847355075c64a6fc1e99958f2532f1f3b23cbaee79dba6cd00a176c6f`.
- Storage smoke-test root:
  `0x02c1121d25ebc1f81f731acc2a1b3c072f10182cd9c2431a0aca2f24a45c35ff`.
- Agentic ID token id: `102`.
- Agentic ID contract:
  `0x2700F6A3e505402C9daB154C5c6ab9cAEC98EF1F`.
- Metadata upload tx:
  `0xdf0bd7f4daa62bf5a0f7baf1c3246e4c1ea9414b66197eb46f6f560f3ca1310a`.
- Metadata root:
  `0x69158f7794b985cb6ffb9eead9df7a71dfa32f053ae62113b615b2c936623cf0`.
- Metadata URI:
  `0g-storage://0x69158f7794b985cb6ffb9eead9df7a71dfa32f053ae62113b615b2c936623cf0`.
- Metadata hash:
  `0x8adffe45df38a4e448b59c751aff7a9ea76e76843acae4a59230762e31476304`.
- Mint tx:
  `0x9f132d14dd4071eea5b7bb29eee83d76631b00c0aab8234c3fefddf093a69a51`.
- `setTokenURI` tx:
  `0x983206304c90fa39d657c223348fb163b8f2109a8a9f0750b8527ca40ab34984`.
- Final owner:
  `0x7F9FD465790184955cc9B8bf3B5e0AAabdfD8c97`.
- Independent onchain read confirmed `ownerOf(102)`, `tokenURI(102)`, and
  eight intelligent data hashes for `aegisAgentId`, `agentName`,
  `agentDescription`, `agentType`, `capabilities`, `agentWalletAddress`,
  `policyHash`, and `metadataHash`.

## Real vs not implemented

### Real

- AEGIS normalizes and validates input in the backend.
- AEGIS computes metadata and `metadataHash` deterministically.
- AEGIS uploads metadata to 0G Storage.
- AEGIS verifies the local Merkle root, the root returned by upload, and the
  verified download.
- AEGIS mints on the AgenticID contract using `iMint(to, datas)`.
- AEGIS reads `mintFee()` and sends that value with the mint.
- AEGIS mints to the backend signer so it can call `setTokenURI`.
- AEGIS sets `tokenURI` with the 0G Storage metadata URI.
- AEGIS transfers the token to the final `ownerAddress`.
- AEGIS retrieves `agenticIdTokenId` from the `Transfer` event.
- AEGIS returns `agenticIdTokenId`, contract, `metadataHash`,
  `metadataRootHash`, `metadataURI`, upload tx, mint tx, `setTokenURI` tx,
  transfer tx, and explorer URL.

### Removed local/fallback behavior

- No successful fallback.
- No local persistence.
- No public static example metadata.
- No `mode: "fallback"`.
- If any real step fails, the route returns an HTTP error.

## Not Done In This Branch

- Database/indexer to persist the result after success.
- API route authentication/authorization.
- Later onchain read in a separate routine to compare
  `getIntelligentDatas(tokenId)` against the expected hashes again.
- Text display of `agenticIdContractAddress` and `txHash`; they are returned by
  the API, but there is no frontend in this branch.
- Indexing through The Graph or a persistent database.
- ERC-8004 registry/discoverability.
- ERC-7857 transfer with re-encryption, TEE, ZKP, clone, or authorized usage.
- DecisionVerifier.
- TeeML or 0G Compute verdict.
- Hedera payment.
- Safe, Recovery, Insurance, or PolicyRegistry.
- AgenticID contract deployment; uses an external/predeployed 0G contract.
- Change to `packages/nextjs/contracts/deployedContracts.ts` or Hedera
  deployments.

## Git policy

Raw docs, cloned third-party repos, and local skills stay out of git.
What goes into git is curated notes, implemented code, `.env.example`, and the
devlog.
