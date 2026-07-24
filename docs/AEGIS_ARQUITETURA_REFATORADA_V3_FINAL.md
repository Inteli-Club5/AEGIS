# AEGIS — Arquitetura Refatorada v3 Final

> **Status:** versão refatorada a partir da decisão final do time.  
> **Regra de verdade:** este documento substitui o contexto técnico anterior quando houver conflito.  
> **Core:** Agent Safety Vault + Safe 2-of-2/co-signature + policy + 0G/TeeML decision verification + dashboard/logs + coverage para green actions elegíveis.

---

## 1. Tese final do produto

AEGIS é uma camada de segurança e garantia para agentes que movimentam valor.

O produto não cria o agente de IA do zero. O usuário já tem, quer ter ou simula um agente real, e usa AEGIS para criar uma **carteira operacional protegida**, vinculada a esse agente, onde qualquer transação precisa passar por:

1. policy definida pelo usuário;
2. verificação de identidade do agente;
3. veredito/receipt validado por 0G/TeeML ou fallback assinado;
4. checagem objetiva da transação;
5. coassinatura da AEGIS;
6. execução via Safe/smart wallet;
7. registro em dashboard/log/Trust Badge;
8. cobertura para green actions elegíveis quando uma contraparte externa falha em obrigação objetiva.

Em linguagem humana:

> O usuário dá poder operacional para um agente, mas esse agente não recebe uma chave livre para gastar. Ele ganha uma carteira protegida onde só consegue agir se a política, a decisão, a identidade e a coassinatura baterem.

---

## 2. Correções importantes sobre a ideia final

A decisão final do time usa alguns termos que precisam ser tecnicamente ajustados para não criar risco ou confusão.

### 2.1. “Criar wallet expondo private key”

**Não deve significar expor a private key da AEGIS.**

A versão segura é:

- A aplicação pode criar uma **Agent Execution Wallet** ou configurar uma **Safe/smart wallet** para o agente.
- O usuário precisa ter controle ou caminho de recuperação sobre a carteira.
- A private key do usuário ou da carteira do agente nunca deve ser exibida sem fluxo intencional de export/recovery.
- A private key da AEGIS/co-signer **não deve ser acessível ao usuário**.
- Se houver um “break-glass recovery”, ele deve desativar a carteira protegida atual e forçar migração para outra carteira.

Formulação correta:

> O usuário cria ou vincula uma carteira operacional do agente. O AEGIS nunca expõe a private key da plataforma. Se houver export/recovery da chave do agente, isso mata a carteira protegida atual e exige migração.

### 2.2. “Agentic ID [ERC-4337]”

**Agentic ID e ERC-4337 não são a mesma coisa.**

A versão correta é separar:

- **Agentic ID / Agent Profile:** identidade lógica do agente, metadata, nome, capabilities, status, policy hash e logs.
- **ERC-4337 / Safe / smart account:** carteira programável usada para execução protegida.

Formulação correta:

> Ao proteger um agente, o usuário vincula um Agent Profile/Agentic ID a uma smart wallet, idealmente uma Safe ou conta compatível com account abstraction. O Agentic ID identifica; a smart wallet executa.

### 2.3. “Assinar com Aceito ou Recusado”

A AEGIS não precisa assinar uma transação recusada para que ela seja bloqueada. O bloqueio pode ser simplesmente não emitir a coassinatura necessária.

Mas faz sentido assinar/logar um **Denial Receipt** para auditoria.

- **Accepted Receipt:** permite coassinatura e execução.
- **Denied Receipt:** registra motivo de recusa e aparece no dashboard, mas não executa.

### 2.4. “Só aceita com nossa private key também”

A ideia correta é **coassinatura**, não expor a chave da AEGIS.

O fluxo normal deve exigir duas autorizações:

1. signer do agente/usuário;
2. AEGIS co-signer.

Isso pode ser feito com:

- Safe 2-of-2;
- Safe module/guard;
- ERC-4337 smart account;
- ou, no MVP, AgentVault simulando essa regra.

### 2.5. “Se formos hackeados, nenhuma transação será feita”

Isso é um gargalo real. Se AEGIS segura a coassinatura, AEGIS pode virar ponto único de falha.

Mitigação recomendada:

- AEGIS co-signer deve ficar em KMS/HSM/TEE no futuro; no hackathon, `.env` apenas para demo.
- Deve existir um **Emergency Recovery / Break-glass Flow**.
- O usuário não deve acessar a private key da AEGIS.
- O usuário pode ter uma recovery path para migrar fundos para outra carteira depois de 2FA/timelock/admin action.
- Ao acionar break-glass, a carteira antiga deixa de ser considerada “Protected by AEGIS”.

---

## 3. Fluxo final do usuário — extremamente explícito

### 3.1. Onboarding

1. Usuário abre o AEGIS.
2. Clica em **Connect Wallet**.
3. Conecta a wallet própria do operador.
4. A aplicação mostra o dashboard vazio:
   - “Nenhum agente protegido ainda”.
5. Usuário clica em **+ Protect Agent**.

### 3.2. Registrar agente

O usuário preenche um formulário:

- `Agent name`: exemplo `TreasuryBot`.
- `Agent type`: Payment / API Buyer / DeFi / Treasury / Other.
- `Agent endpoint`: opcional.
- `Agent description`: descrição curta.
- `Agent signer`: endereço do signer do agente ou wallet operacional.
- `ENS name`: opcional, exemplo `treasurybot.aegis.eth`.

Ao clicar em **Register Agent**, o sistema cria um **Agent Profile**.

Esse Agent Profile não cria o cérebro do agente. Ele cria o cadastro protegido do agente dentro da AEGIS.

### 3.3. Criar ou vincular carteira do agente

Usuário clica em **Create Protected Wallet** ou **Link Agent Wallet**.

Existem dois modos:

#### Modo A — Hackathon/MVP

- Criar uma Agent Execution Wallet local/testnet.
- Mostrar chave apenas se for chave do agente de demo e com aviso claro.
- Nunca expor chave da AEGIS.
- Usar AgentVault/Anvil para simular enforcement.

#### Modo B — Produto real

- Criar Safe/smart account.
- Owners/signers:
  - Agent/User signer;
  - AEGIS co-signer;
  - opcional: recovery guardian.
- Threshold normal: 2-of-2 para execução protegida.
- Emergency recovery: fluxo separado com timelock/2FA/migração.

### 3.4. Criar policy

Usuário clica em **Create Policy**.

Campos do formulário:

- `Allowed destinations`: endereços ou IDs de providers permitidos.
- `Allowed tokens`: HBAR, USDC, token mock etc.
- `Min amount`: valor mínimo opcional.
- `Max amount`: valor máximo por ação.
- `Max daily amount`: opcional.
- `Deadline`: até quando a policy vale.
- `Nonce`: gerado automaticamente.
- `Action type`: payment / API call / service payment / transfer / DeFi action.
- `SLA required?`: sim/não.
- `SLA deadline`: se houver serviço externo.
- `Coverage enabled?`: sim/não para green actions elegíveis.

Ao clicar em **Create Policy**, o sistema gera:

- `policyHash`;
- metadata offchain;
- registro no `PolicyRegistry` ou profile;
- visualização no dashboard.

### 3.5. Ativar proteção

Usuário clica em **Activate Protection**.

O dashboard mostra:

- agente ativo;
- policy ativa;
- wallet protegida;
- status `Protected by AEGIS`;
- coverage status para ações elegíveis;
- logs vazios ou iniciais.

---

## 4. Fluxo de execução de uma transação

### 4.1. Agente propõe uma transação

O agente real ou simulado propõe uma ação:

```json
{
  "agentId": "treasurybot",
  "actionType": "PAY_SERVICE_PROVIDER",
  "destination": "0.0.serviceProvider",
  "token": "HBAR",
  "amount": "1",
  "reason": "Pay approved API provider for market data",
  "policyHash": "0x...",
  "nonce": 12,
  "deadline": "2026-07-26T08:00:00Z"
}
```

### 4.2. 0G/TeeML verifica a decisão

O papel do 0G/TeeML não é “segurar o dinheiro”.

O papel é verificar a decisão do agente em ambiente confiável/atestável.

Entrada para 0G/TeeML:

- policy;
- ação proposta;
- contexto;
- identidade do agente;
- regra de negócio.

Saída esperada:

- `ALLOW` ou `DENY`;
- razão curta;
- `receiptHash`;
- `proofRef` / `ogRef`;
- metadados de execução.

Se 0G/TeeML retornar `false` ou `DENY`, a ação para antes de tentar executar.

Fallback:

- se 0G não funcionar, usar verificação local assinada;
- marcar `mode = fallback`;
- não vender como 0G forte.

### 4.3. Decision Receipt

Depois da decisão, a AEGIS gera um **Decision Receipt**.

Campos mínimos:

```json
{
  "agentId": "treasurybot",
  "wallet": "0xAgentOrSafe",
  "policyHash": "0xPolicy",
  "actionHash": "0xAction",
  "destination": "0.0.serviceProvider",
  "token": "HBAR",
  "amount": "1",
  "chainId": "hedera-testnet-or-evm-chain-id",
  "nonce": 12,
  "deadline": "2026-07-26T08:00:00Z",
  "verdict": "ALLOW",
  "reason": "Destination approved and amount under max",
  "proofRef": {
    "provider": "0G",
    "mode": "real | fallback",
    "receiptHash": "0x...",
    "rawLogUrl": "optional",
    "timestamp": "ISO-8601",
    "notes": "short explanation"
  },
  "signature": "0x..."
}
```

### 4.4. Checagem final do AEGIS

Mesmo se 0G retornar `true`, a AEGIS ainda precisa checar objetivamente:

- identidade do agente;
- `policyHash`;
- valor;
- token;
- destino;
- deadline;
- nonce;
- `actionHash`;
- assinatura do receipt;
- status da wallet protegida;
- fee do protocolo;
- eligibility da coverage, se houver.

Se algo falhar:

- gerar `DeniedReceipt`;
- não coassinar;
- logar motivo;
- atualizar dashboard.

Se tudo passar:

- gerar `AcceptedReceipt`;
- coassinar;
- executar via Safe/smart wallet ou AgentVault;
- coletar fee, se aplicável;
- atualizar Trust Badge/dashboard.

### 4.5. Coassinatura e Safe

A transação só deve ser executada se houver:

1. assinatura do agente/usuário;
2. assinatura da AEGIS.

Essa lógica evita:

- agente executar fora da plataforma usando a mesma wallet protegida;
- AEGIS não receber fee quando a execução passa pelo serviço;
- duplicação de transação fora do fluxo controlado;
- execução sem policy/receipt.

Mas cria um risco:

- AEGIS vira co-signer crítico.

Mitigação:

- recovery path;
- timelock;
- signer rotation;
- fallback de migração;
- key management seguro.

---

## 5. Coverage / Guarantee Layer — versão final

A ideia final diz que todos os serviços e ações `green` são cobertos pela AEGIS.

Para isso ser viável, a palavra “coberto” precisa ser definida com precisão.

### 5.1. O que é uma green action

Uma green action é uma ação que passou por:

- policy;
- identidade;
- 0G/TeeML ou fallback declarado;
- receipt válido;
- coassinatura AEGIS;
- execução dentro da plataforma;
- logs/audit trail.

### 5.2. O que AEGIS cobre

AEGIS pode cobrir falhas objetivas relacionadas a uma green action, como:

1. **Serviço pago não entregou**  
   Exemplo: agente paga API provider, mas provider não libera acesso ou não entrega resposta dentro do SLA.

2. **SLA não cumprido**  
   Exemplo: serviço prometeu resultado em até X segundos/minutos e falhou.

3. **Executor externo violou política**  
   Exemplo: executor aceitou operar sob uma policy e tentou executar fora dela.

4. **Agente/provider bonded descumpriu acordo**  
   Exemplo: agente ou provider tinha bond/deposito de garantia e descumpriu condição objetiva.

5. **Acesso contratado não liberado**  
   Exemplo: agente pagou por acesso a API/dataset/serviço e o acesso não foi concedido.

6. **Prestação de serviço não comprovada**  
   Exemplo: serviço deveria devolver resposta assinada/prova/artefato e não devolveu.

### 5.3. O que AEGIS não cobre

AEGIS não deve cobrir:

- trade autorizado que deu prejuízo;
- queda de preço;
- slippage dentro do limite aceito;
- impermanent loss;
- estratégia ruim, mas permitida;
- perda causada por policy mal configurada pelo usuário;
- fundos fora da wallet protegida;
- ação executada sem passar pelo AEGIS;
- bypass do próprio AEGIS;
- falhas subjetivas difíceis de provar.

### 5.4. Como pagar essa coverage

Opções possíveis:

#### A. Fee reserve

Uma parte das fees cobradas em green actions alimenta uma reserva.

#### B. Bond/slashing

Service providers, executors ou agentes depositam garantia. Se falham, perdem parte do bond.

#### C. Escrow com SLA

Pagamento fica retido até o serviço comprovar entrega.

#### D. Warranty por transação

Cada green action paga microtaxa para uma garantia limitada.

#### E. Coverage por plano pago

Planos pagos incluem limite de cobertura.

### 5.5. Ponto crítico de negócio

A coverage não existe porque o Safety Vault falha.

Ela existe porque, mesmo quando o agente faz tudo certo, uma parte externa pode não cumprir o combinado.

Frase humana:

> O Safety garante que o agente só execute o que podia executar. A coverage garante que, se uma contraparte externa não cumprir o que prometeu depois de uma ação aprovada, existe um caminho de compensação.

---

## 6. Onde cada partner entra

## 6.1. 0G

### Papel no produto

0G entra como verificador da decisão do agente.

O objetivo é usar 0G/TeeML para provar que o veredito não foi inventado livremente por um backend comum.

### Onde entra no fluxo

- Depois que o agente propõe a ação.
- Antes da coassinatura AEGIS.
- Antes da execução via Safe/vault.

### O que precisa existir

- chamada ou artefato 0G real;
- `proofRef` ou `ogRef`;
- receipt ligado à ação;
- logs no dashboard;
- fallback declarado se não funcionar.

### Falha/gargalo

Se 0G for apenas “hash de decisão local”, o fit enfraquece.

---

## 6.2. Hedera

### Papel no produto

Hedera entra como rails de pagamento/operação financeira real.

### Onde entra no fluxo

- Quando a ação aprovada envolve pagamento para service/API provider.
- Pode executar HBAR transfer na testnet.
- Pode futuramente suportar x402/escrow/SLA.

### O que precisa existir

- HBAR transfer testnet real;
- provider account;
- tx id/link;
- pagamento acionado pelo fluxo aprovado, não manualmente;
- logs no dashboard.

### Falha/gargalo

Se Hedera for só log/HCS, não cumpre a tese.

---

## 6.3. ENS

### Papel no produto

ENS entra como identidade/discovery/trust badge.

### Onde entra no fluxo

- Ao registrar o Agent Profile.
- Ao mostrar o Trust Badge.
- Ao resolver metadata pública do agente.

### Records úteis

- `aegis.vault`;
- `aegis.policyHash`;
- `aegis.capabilities`;
- `aegis.payment`;
- `aegis.audit`;
- `aegis.status`.

### Falha/gargalo

Se ENS for só label hardcoded, não deve ser tratado como partner fit.

---

## 7. Arquitetura refatorada

```text
User Wallet / Operator
   |
   v
AEGIS Dashboard
   |
   |-- Register Agent Profile / Agentic ID
   |-- Create or Link Protected Agent Wallet
   |-- Create Policy
   |-- Activate Trust Badge
   |
   v
Agent proposes action
   |
   v
0G / TeeML Decision Verification
   |
   |-- false / DENY -> DeniedReceipt -> log -> stop
   |
   |-- true / ALLOW
   v
AEGIS Policy + Identity + Receipt Check
   |
   |-- invalid -> DeniedReceipt -> no co-signature -> blocked
   |
   |-- valid
   v
AEGIS Co-signature
   |
   v
Safe / Smart Wallet / AgentVault executes
   |
   v
Hedera payment or EVM action
   |
   v
Dashboard logs + Trust Badge + Coverage eligibility
```

---

## 8. Módulos técnicos

| Módulo | Responsabilidade | MVP | Produção |
|---|---|---|---|
| `OperatorWallet` | wallet própria do usuário | wallet conectada | wallet/multisig/DAO |
| `AgentProfile` | identidade e metadata do agente | JSON/local | ENS + Agentic ID |
| `ProtectedAgentWallet` | carteira operacional do agente | AgentVault/Anvil ou Safe test | Safe/ERC-4337 |
| `PolicyRegistry` | guarda constraints e policyHash | contrato simples | versionamento e revogação avançada |
| `DecisionVerifier` | integra 0G/fallback | interface + fallback | 0G/TeeML real |
| `AegisCosigner` | assina accepted/denied receipts | backend signer em `.env` | KMS/HSM/MPC/TEE |
| `SafeExecutionLayer` | exige duas assinaturas | mock/AgentVault | Safe module/guard/4337 |
| `HederaPaymentExecutor` | paga provider | HBAR transfer testnet | x402/HTS/escrow |
| `TrustBadge` | mostra status e evidência | CLI/page mínima | badge público verificável |
| `CoverageEngine` | define elegibilidade de coverage | documentação/regra simples | escrow/bond/slashing/reserve |

---

## 9. Fee e monetização no fluxo final

AEGIS pode monetizar no próprio caminho de execução.

### Fee por green action

Quando uma ação é aprovada e executada, AEGIS cobra fee.

### Fee reserve

Parte da fee vai para reserva de coverage.

### Trust Badge pago

Agentes protegidos pagam para exibir status verificável.

### Dashboard/API

Operadores pagam para gerenciar policies, logs, alertas e múltiplos agentes.

### Coverage premium

Ações ou providers com coverage podem pagar taxa adicional.

---

## 10. Gargalos e limitações

### 10.1. Private key exposta é risco crítico

Nunca expor chave da AEGIS. Se precisar exportar chave do agente, isso deve matar a carteira protegida atual e exigir migração.

### 10.2. AEGIS co-signer vira ponto crítico

Se a AEGIS for hackeada, caída ou censurar, a execução trava.

Mitigações:

- KMS/HSM/MPC/TEE;
- signer rotation;
- emergency recovery;
- timelock;
- fallback de migração.

### 10.3. Safe 2-of-2 pode travar usuário

2-of-2 é forte para segurança, mas ruim se um signer ficar indisponível.

Alternativa futura:

- 2-of-3 com recovery guardian;
- timelocked escape hatch;
- modo paused/migration.

### 10.4. 0G/TeeML pode atrasar demo

Fallback local assinado deve existir.

### 10.5. Hedera pode virar manual

A transferência precisa ser acionada pelo fluxo do agente, não por botão manual separado.

### 10.6. Coverage ampla demais explode risco

“Todas green actions são cobertas” precisa de limite.

Recomendação:

- cobertura apenas para ações elegíveis;
- limite por ação;
- SLA explícito;
- provider aprovado;
- exclusões claras.

### 10.7. Não há atomicidade cross-chain completa

Se o vault EVM e Hedera payment forem separados, o MVP não garante atomicidade total.

Precisa declarar isso.

---

## 11. Falhas possíveis da aplicação

### Falha 1 — 0G aprova uma decisão ruim

Se a ação respeitou a policy, não é sinistro automaticamente.

Pode ser erro de julgamento, mas não falha objetiva coberta.

### Falha 2 — Policy mal configurada pelo usuário

Se o usuário permitiu destino/valor ruim, AEGIS não deve assumir perda ilimitada.

### Falha 3 — AEGIS co-signer comprometido

Risco alto. Mitigar com key management, rotação e emergency shutdown.

### Falha 4 — Provider não entrega serviço

Esse é caso válido de coverage/escrow/SLA.

### Falha 5 — Agente tenta executar fora da plataforma

Se a carteira protegida exige AEGIS co-signature, não consegue. Se o agente tem outra wallet fora do AEGIS, está fora do escopo.

### Falha 6 — Usuário vaza a chave da Agent Wallet

A Safe/coassinatura reduz dano, porque a chave sozinha não executa green action protegida.

### Falha 7 — AEGIS cai

Transações param. Recovery/migration precisa existir no futuro.

---

## 12. Demo recomendada v3

### Demo mínima

1. Usuário conecta wallet.
2. Clica em **+ Protect Agent**.
3. Registra `TreasuryBot`.
4. Cria/vincula Agent Wallet.
5. Cria policy:
   - provider permitido;
   - token HBAR;
   - max 1 HBAR;
   - deadline;
   - nonce.
6. Agent propõe pagar provider permitido.
7. 0G/TeeML ou fallback verifica e retorna `ALLOW`.
8. AEGIS checa policy/receipt e coassina.
9. Safe/AgentVault executa.
10. Hedera HBAR transfer acontece.
11. Dashboard mostra green action + fee + Trust Badge.
12. Agent propõe pagar destino proibido ou valor maior.
13. 0G/AEGIS retorna `DENY` ou checagem objetiva falha.
14. AEGIS não coassina.
15. Dashboard mostra blocked action.

### Demo stretch

16. ENS resolve `treasurybot.aegis.eth`.
17. Trust Badge público mostra metadata.
18. Service provider falha SLA em cenário simulado.
19. Coverage eligibility aparece como “eligible for refund/claim”, sem implementar seguro completo.

---

## 13. O que entra no hackathon

### Core obrigatório

- Connect wallet.
- Register/protect agent.
- Create/link Agent Wallet.
- Create policy.
- 0G/TeeML ou fallback declarado.
- Decision receipt.
- AEGIS Accepted/Denied receipt.
- Co-signature model.
- Action allowed.
- Action blocked.
- Trust Badge/audit logs.

### Core se Hedera for alvo

- HBAR transfer testnet para Service/API Provider.

### Stretch

- ENS runtime.
- Safe real.
- ERC-4337 real.
- x402.
- HCS logs.
- 0G Storage.
- Coverage flow visual.

### Cortar se atrasar

- seguro completo;
- claim automático;
- CoveragePool;
- precificação real;
- ZK;
- The Graph;
- World;
- 1inch;
- Uniswap;
- Sui.

---

## 14. Resumo da arquitetura final em uma frase

> AEGIS registra um agente, cria uma carteira protegida, aplica policies definidas pelo usuário, usa 0G/TeeML para verificar o veredito do agente, exige coassinatura da AEGIS via Safe/smart wallet, executa pagamentos auditáveis e oferece coverage futura para green actions quando terceiros falham em obrigações objetivas.

---

## 15. Nova verdade universal para o projeto

Daqui em diante, o projeto deve ser tratado assim:

- AEGIS não é apenas Safety Vault simples.
- AEGIS é um **Agent Protected Wallet + Policy Gate + 0G Decision Verification + AEGIS Co-signature + Trust Dashboard + Coverage for eligible green actions**.
- O usuário registra/protege agentes; não cria um agent builder completo.
- AEGIS não expõe sua private key.
- A carteira protegida deve exigir coassinatura para evitar execução fora da plataforma.
- 0G/TeeML valida o veredito/decisão, não segura fundos.
- Safe/smart wallet/AgentVault segura a execução.
- Coverage cobre falhas objetivas de terceiros em green actions elegíveis, não risco de mercado nem falha do próprio AEGIS.
- Recovery/insurance completo continua fora do MVP, mas coverage/guarantee layer entra como parte da visão de produto.
