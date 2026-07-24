# 0G Agentic ID Sync — Notes

## Objetivo

Branch: `feat/0g-agentic-id-sync`

AEGIS precisa criar/vincular um 0G Agentic ID quando o backend registra um
agent.

## Recursos consultados

- 0G Agent Skills: https://github.com/0gfoundation/0g-agent-skills
- 0G AI Context: https://docs.0g.ai/ai-context
- 0G Agentic ID Builder Hub: https://build.0g.ai/agentic-id
- Agentic ID Examples: https://github.com/0gfoundation/agenticID-examples
- 0G Zero Coding: https://build.0g.ai/zero-coding

## Decisão

Para esta branch, usar os exemplos oficiais de Agentic ID como base.

Não implementar TeeML/DecisionVerifier aqui.

A integração 0G Galileo fica isolada em `packages/nextjs/integrations/0g/agentic-id/`
e não deve ser misturada com os contratos/deployments Hedera do Scaffold-HBAR.

O fluxo desta branch deve ser backend-first: sem dashboard de cadastro, sem
localStorage e sem fallback que pareça sucesso. Se a 0G Storage, a rede, o
contrato ou a chave de serviço falhar, a API retorna erro explícito.

## Artefatos esperados

- Agent metadata
- Metadata hash
- Agentic ID token id
- Contract address
- Mint/link transaction hash

## Implementado nesta branch

- Rota backend `POST /api/0g/agentic-id` para registrar/vincular o Agentic ID.
- Integração isolada em `packages/nextjs/integrations/0g/agentic-id/`.
- Tipo `AgentProfile` e tipos de input/output da função de integração.
- Geração de metadata offchain e `metadataHash`.
- Upload real da metadata para 0G Storage via `@0glabs/0g-ts-sdk`.
- Geração de Merkle tree antes do upload.
- Verificação do root hash retornado pelo upload contra o root local.
- Download verificado da metadata enviada para 0G Storage.
- Geração de `datas` para `iMint(to, datas)` com hashes de:
  `aegisAgentId`, `agentName`, `agentDescription`, `agentType`,
  `capabilities`, `agentWalletAddress`, `policyHash` e `metadataHash`.
- ABI mínima do AgenticID com `iMint`, `mintFee`, `setTokenURI`, `ownerOf`,
  `transferFrom`, `tokenURI`, `getIntelligentDatas` e `Transfer`.
- Chamada real de `mintFee()` e `iMint(to, datas)` no contrato AgenticID da 0G
  Galileo usando signer backend configurado por env.
- Parse do `tokenId` pelo evento `Transfer`, filtrando pelo contrato AgenticID,
  `from` zero address e `to` igual ao signer backend.
- Chamada real de `setTokenURI(tokenId, metadataURI)` usando URI derivada do
  root hash da 0G Storage.
- Transferência real do token para `ownerAddress` quando `ownerAddress` é
  diferente do signer backend.
- Verificação final de `ownerOf(tokenId)` e `tokenURI(tokenId)`.
- Variáveis 0G Galileo e 0G Storage em `packages/nextjs/.env.example`.

## Real vs not implemented

### Real

- AEGIS normaliza e valida input no backend.
- AEGIS calcula metadata e `metadataHash` deterministicamente.
- AEGIS sobe a metadata para 0G Storage.
- AEGIS verifica Merkle root local, root retornado pelo upload e download
  verificado.
- AEGIS minta no contrato AgenticID usando `iMint(to, datas)`.
- AEGIS lê `mintFee()` e envia esse valor no mint.
- AEGIS minta para o signer backend para conseguir chamar `setTokenURI`.
- AEGIS seta `tokenURI` com a URI da metadata em 0G Storage.
- AEGIS transfere o token para o `ownerAddress` final.
- AEGIS recupera `agenticIdTokenId` a partir do evento `Transfer`.
- AEGIS retorna `agenticIdTokenId`, contrato, `metadataHash`,
  `metadataRootHash`, `metadataURI`, tx de upload, tx de mint, tx de
  `setTokenURI`, tx de transferência e explorer URL.

### Removed local/fallback behavior

- Nenhum fallback de sucesso.
- Nenhuma persistência local.
- Nenhuma metadata estática pública de exemplo.
- Nenhum `mode: "fallback"`.
- Se qualquer etapa real falhar, a rota retorna erro HTTP.

## Não feito nesta branch

- Teste de mint real com wallet financiada na 0G Galileo.
- Banco/indexador para persistir o resultado depois do sucesso.
- Autenticação/autorização da rota de API.
- Leitura onchain posterior em uma rotina separada para recomparar
  `getIntelligentDatas(tokenId)` contra os hashes esperados.
- Exibição textual do `agenticIdContractAddress` e do `txHash`; eles são
  retornados pela API, mas não há frontend nesta branch.
- Indexação via The Graph ou banco persistente.
- ERC-8004 registry/discoverability.
- Transferência ERC-7857 com re-encryption, TEE, ZKP, clone ou authorized usage.
- DecisionVerifier.
- TeeML ou 0G Compute verdict.
- Hedera payment.
- Safe, Recovery, Seguro ou PolicyRegistry.
- Deploy de contrato AgenticID; usa contrato externo/predeploy 0G.
- Alteração de `packages/nextjs/contracts/deployedContracts.ts` ou deployments
  Hedera.

## Git policy

Raw docs, cloned third-party repos e local skills ficam fora do git.
O que entra no git são notas curadas, código implementado, `.env.example` e devlog.
