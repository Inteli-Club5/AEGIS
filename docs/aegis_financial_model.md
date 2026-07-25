# AEGIS — Financial Model v1

> **Status:** pricing and unit economics proposal for discussion.  
> **Current reality:** AEGIS is a pre-transaction security layer for agents. There is no insurance, payout, recovery reserve, fee for rejected transactions, or percentage charged on protected funds.

---

## 1. Defined revenue model

| Source | Rule | Who pays | Why it exists |
|---|---:|---|---|
| **Activation fee** | **0.20 USDC** per agent + wallet created | Agent operator | Anti-spam, minimal setup, and economic commitment. The gas/network fee is separate and paid by the user. |
| **Execution fee** | **1%** per approved and executed transaction, with a **minimum of 0.01 USDC** and a **maximum of 2.00 USDC** | Operator/agent | AEGIS only earns revenue when it delivers value: verification, co-signing, and an audit trail for an actual execution. |
| **Provider/network fee** | **0.5%** on a service/API/provider | Provider, when AEGIS generates demand/network/trust | It is not charged on generic transfers. It only makes sense when AEGIS brings demand, reputation, routing, or a trust layer to the provider. |

**Do not charge:** per-agent SaaS, a separate hosted dashboard, a separate Trust Badge, a percentage of protected funds, insurance, coverage, recovery, payout, or rejected transactions.

---

## 2. How can BananaCrystal offer a free start?

BananaCrystal offers a free start because free onboarding is part of its funnel: an instant API key and wallet, no setup fee, and charges only when the agent transacts. However, this does not mean “without controls”: it uses API keys, explicit permissions, spending caps, OTP for transfers, idempotency keys to block duplicates, and immutable logs on Hedera.

This makes it possible to offer free access without leaving the system completely open to abuse. The cost of creating an account/wallet is subsidized or treated as a customer acquisition cost; revenue comes later from transfers and swaps.

### What this teaches AEGIS

AEGIS can charge **0.20 USDC** because it does not aim to be a free payment rail. AEGIS creates a protected agent/wallet, policy, verification, and security trail. Even so, to reduce friction:

> **Recommended future option:** convert the 0.20 USDC into **non-withdrawable credit** for the first executions.

Suggested rules for this credit:

- it can only be used to pay the **AEGIS execution fee**;
- it does not cover the gas/network fee;
- it does not cover the provider/network fee;
- it cannot be withdrawn;
- it expires after 30 or 60 days;
- if the wallet is exported or deactivated, the remaining credit expires.

This way, the activation fee remains an anti-spam mechanism without looking like a “dead fee.”

---

## 3. Market comparison

| Player | Public model | Implications for AEGIS |
|---|---|---|
| **BananaCrystal** | Free start; **0.3% transfer**, **0.5% swap**; no setup/monthly/minimum fees; OTP for transfers; caps and permissions. | BananaCrystal is a payment rail for agents. AEGIS charges more because it sells pre-transaction security, policy, verdicts, co-signing, and auditing. If the user only wants to transfer funds, Banana is cheaper. |
| **Coinbase CDP** | Wallet operations at **US$0.005/operation** with a free tier; Commerce charges **1%** per transaction; the Trade API charges **0.15%** for stablecoins/USDC/EURC and **0.85%** for all others. | Coinbase is infrastructure at scale. AEGIS should not compete on wallet-operation pricing; it should compete on agentic security. The 1% fee has a precedent in crypto payments, but it must deliver clear value. |
| **Hedera** | Predictable fees in USD; a simple HBAR transfer costs around **US$0.0001**. | Network cost is low and should be shown separately from the AEGIS fee. |
| **0G Compute** | GLM-5/GLM-5.2 costs are in the thousandths-of-a-dollar range for a small verification. | The variable cost of a verdict is low, but it depends on the model, token count, and real/fallback mode. |
| **The Graph** | 100k queries/month free; low cost afterward. | It only applies if there is actual indexing. In the MVP, the cost may be zero. |

### Why does BananaCrystal charge different fees for transfers and swaps?

A transfer only moves value. A swap adds quoting, conversion, liquidity, pricing, spread, execution, and market/routing risk. That is why it makes sense for a swap to cost more. This also supports charging the AEGIS provider/network fee only when network/trust value exists, rather than on a generic transfer.

---

## 4. Rationale for AEGIS fees

### Activation fee — 0.20 USDC

**Verdict:** fair as an anti-spam mechanism, not as the main source of revenue.

Strengths:

- reduces unlimited agent/wallet creation;
- helps cover operational setup;
- requires a minimum level of user commitment.

Bottleneck:

- it may create friction compared with competitors that offer a free start.

Solution:

- free testnet/dev environment;
- production at 0.20 USDC;
- convert the 0.20 USDC into credit for the first executions in the future.

### Execution fee — 1%, minimum 0.01 USDC, cap 2.00 USDC

**Verdict:** suitable for transactions of **US$1+** and API/service payments.

Bottleneck:

- for transactions below US$1, the minimum fee is significant.

Example:

| Ticket | Fee | Effective fee |
|---:|---:|---:|
| US$0.10 | US$0.01 | 10% |
| US$0.50 | US$0.01 | 2% |
| US$1.00 | US$0.01 | 1% |
| US$5.00 | US$0.05 | 1% |
| US$100.00 | US$1.00 | 1% |
| US$500.00 | US$2.00 | 0.4% |

Solution for sub-US$1 transactions:

- **batching**: group multiple micro-actions and charge one fee per batch;
- periodic settlement;
- a future microtransaction mode with a lower minimum.

### Provider/network fee — 0.5%

**Verdict:** defensible, provided it is not charged on generic transfers.

Rationale:

- BananaCrystal charges 0.3% for transfers and 0.5% for swaps;
- AEGIS charges 0.5% when it provides security + policy + agent verification + audit + provider network;
- the provider pays because AEGIS generates demand and trust.

Bottleneck:

- there is economic fee stacking: the operator pays the execution fee, and the provider pays the provider fee.

Solution:

- display the fees separately;
- charge the provider fee only when AEGIS generates network/demand/trust value;
- do not charge the provider fee on ordinary transfers.

---

## 5. Costs considered

| Cost | Estimate | Note |
|---|---:|---|
| **0G decision verification** | ~US$0.0005–US$0.003 per simple action | Depends on token count, model, and real/fallback mode. |
| **Hedera HBAR transfer** | ~US$0.0001 | Low network fee; it should be paid by the user together with network/gas costs. |
| **The Graph** | US$0 for up to 100k queries/month; low cost afterward | Use only if there is actual indexing. |
| **RPC/EVM** | variable | Can start on a free tier; increases with reliability and volume. |
| **Cloud/backend/logs** | fixed + low variable cost | Probably the largest actual cost at the beginning. |

For the projection, I use an **average variable cost of US$0.0025 per transaction** and the following estimated fixed costs:

- short term: **US$100/month**;
- medium term: **US$300/month**.

These costs do not include team salaries, legal expenses, a formal audit, or enterprise support.

---

## 6. Revenue scenarios

Assumed volume:

| Scenario | Active agents | Tx per agent/month | Total tx/month |
|---|---:|---:|---:|
| Short term | 50 | 300 | 15,000 |
| Medium term | 200 | 300 | 60,000 |

> Note: 10 transactions/day × 30 days = **300 transactions per agent/month**.

### Mix used for average ticket size

| Mix | Micro-actions | API/service | Larger transactions | Average ticket |
|---|---:|---:|---:|---:|
| Conservative | 70% × US$1 | 30% × US$5 | 0% | US$2.20 |
| Base | 50% × US$1 | 45% × US$5 | 5% × US$50 | US$5.25 |
| Upside | 30% × US$1 | 60% × US$10 | 10% × US$100 | US$16.30 |

The provider fee applies only to API/service transactions.

### Average revenue per transaction

| Mix | Average execution fee | Average provider fee | Average revenue/tx |
|---|---:|---:|---:|
| Conservative | US$0.0220 | US$0.0075 | **US$0.0295** |
| Base | US$0.0525 | US$0.01125 | **US$0.06375** |
| Upside | US$0.1630 | US$0.0300 | **US$0.1930** |

### Monthly projection

| Scenario | Mix | Variable revenue | Activation | Total revenue | Variable cost | Fixed cost | Estimated result* |
|---|---|---:|---:|---:|---:|---:|---:|
| Short term | Conservative | US$442.50 | US$10 | US$452.50 | US$37.50 | US$100 | **US$315.00** |
| Short term | Base | US$956.25 | US$10 | US$966.25 | US$37.50 | US$100 | **US$828.75** |
| Short term | Upside | US$2,895.00 | US$10 | US$2,905.00 | US$37.50 | US$100 | **US$2,767.50** |
| Medium term | Conservative | US$1,770.00 | US$40 | US$1,810.00 | US$150 | US$300 | **US$1,360.00** |
| Medium term | Base | US$3,825.00 | US$40 | US$3,865.00 | US$150 | US$300 | **US$3,415.00** |
| Medium term | Upside | US$11,580.00 | US$40 | US$11,620.00 | US$150 | US$300 | **US$11,170.00** |

\* Estimated result before salaries, taxes, a formal audit, legal expenses, and substantial support costs.

---

## 7. Bottlenecks and solutions

| Bottleneck | Why it matters | Solution |
|---|---|---|
| The activation fee creates friction | Competitors offer a free start | Free dev/testnet; production at 0.20 USDC; in the future, convert it into non-withdrawable execution credit. |
| The 0.01 minimum is significant for sub-US$1 transactions | It may make cent-level micropayments unviable | Batching, batch settlement, and a future microtransaction mode. |
| Fee stacking | The operator + provider may perceive the take rate as high | Transparency: separate line items; charge the provider fee only when AEGIS generates network/trust value. |
| Invalid attempts generate costs without revenue | AEGIS only charges for approved executions | Use a low-cost pre-filter before calling 0G: destination, token, limit, nonce, and deadline. |
| The US$2 cap limits upside | Large transactions pay little | Keep it in v1; introduce enterprise/custom pricing for high-value flows in the future. |
| Using 0G for every action may become costly | The cost is small, but it scales | Use 0G only after the pre-filter; batch verdicts for micro-actions. |
| The provider fee may feel like a tax | Providers will not pay if they do not see value | Charge it only when AEGIS generates demand, reputation, or trust. |
| Competitors are cheaper for simple transfers | BananaCrystal charges less for transfers | Position AEGIS as a security layer, not a generic payment rail. |

---

## 8. How to display pricing in the product

Never hide everything under “gas.” Show separate line items:

```text
Network fee / gas
Paid to the network.

AEGIS execution fee
Paid to AEGIS for verification, co-signing, and the audit trail.

Provider/network fee
Paid by the provider when AEGIS generates demand/network/trust.
```

This avoids the perception of hidden fees.

---

## 9. Recommended decision

Recommended v1 model:

```text
Activation fee:
0.20 USDC per agent + wallet created
+ gas/network paid by the user.

Execution fee:
1% per approved and executed transaction
minimum: 0.01 USDC
maximum: 2.00 USDC.

Provider/network fee:
0.5% on a service/API/provider
only when AEGIS generates demand, network, trust, or routing.
```

Do not charge:

```text
separate SaaS;
separate hosted dashboard;
separate Trust Badge;
% of protected funds;
coverage;
insurance;
recovery;
rejected transactions;
generic provider transfers.
```

The pricing thesis is simple:

> BananaCrystal is cheaper for payments. AEGIS charges more because it does not sell payments alone: it sells pre-transaction verification, policy enforcement, co-signing, and auditing for agents that move value.

---

## Public sources used

- BananaCrystal: https://www.bananacrystal.com/ and https://agents.bananacrystal.com/
- Coinbase Developer Platform pricing: https://www.coinbase.com/developer-platform/pricing
- 0G GLM-5/GLM-5.2 pricing: https://0g.ai/blog/glm-5-live-on-0g-compute and https://pc.0g.ai/models/glm-5.2
- Hedera fees: https://hedera.com/ and https://hedera.com/fee-calculator/
- The Graph Subgraphs pricing: https://thegraph.com/subgraphs/ and https://thegraph.com/docs/en/subgraphs/providers/subgraph-studio/introduction/
