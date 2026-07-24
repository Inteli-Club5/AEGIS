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
- Real metadata upload to 0G Storage through `@0glabs/0g-ts-sdk`.
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
- 0G Galileo and 0G Storage variables in `packages/nextjs/.env.example`.

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

- Real mint test with a funded wallet on 0G Galileo.
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
