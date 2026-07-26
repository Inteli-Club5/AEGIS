import type { Hex } from "viem";
import type { AgentActorContext } from "../policy-engine/precheck.js";
import type { PolicyRepository } from "../policy-engine/repository.js";
import type { TeeMlRepository } from "../teeml/repository.js";
import {
  buildDecisionReceipt,
  signDecisionReceipt,
  type DecisionReceipt,
} from "./decision-receipt.js";
import type { ExecutionRepository } from "./execution-repository.js";
import { buildPaymentCall, createAgentSignedPayment } from "./safe-payment.js";

export class ExecutionError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly httpStatus: number,
  ) {
    super(message);
    this.name = "ExecutionError";
  }
}

export type ExecutionResult = Readonly<{
  status: "EXECUTED";
  requestId: string;
  safeTxHash: string;
  transactionHash: string;
  amount: string;
  feeAmount: string;
}>;

export type PaymentExecutionDependencies = Readonly<{
  agentVerifierSignerPrivateKey: Hex;
  feeRecipientAddress: `0x${string}`;
  rpcUrl: string;
  cosignerBaseUrl: string;
  getAgentPrivateKey: (agentId: string) => string | undefined;
  idGenerator: () => string;
  clock: () => number;
  fetch?: typeof fetch;
}>;

export class PaymentExecutionService {
  constructor(
    private readonly teemlRepository: TeeMlRepository,
    private readonly policyRepository: Pick<PolicyRepository, "getWallet">,
    private readonly executionRepository: ExecutionRepository,
    private readonly dependencies: PaymentExecutionDependencies,
  ) {}

  async execute(
    requestId: string,
    actor: AgentActorContext,
  ): Promise<ExecutionResult> {
    const fetchImpl = this.dependencies.fetch ?? fetch;
    const now = this.dependencies.clock();

    const receipt = await this.teemlRepository.runLocked(requestId, async transaction => {
      const sources = await transaction.getTrustedSources(requestId);
      if (!sources || sources.agentId !== actor.authenticatedAgentId) {
        throw new ExecutionError("not_found", "action request was not found", 404);
      }
      if (sources.commitmentStatus !== "AVAILABLE") {
        throw new ExecutionError(
          "action_unavailable",
          "action request has no durable commitment available",
          409,
        );
      }
      if (
        sources.actionStatus !== "TEEML_ALLOWED" &&
        sources.actionStatus !== "TEETLS_HACKATHON_ALLOWED"
      ) {
        throw new ExecutionError(
          "not_allowed",
          "action was not approved by TeeML",
          409,
        );
      }
      if (sources.usageHoldStatus !== "HELD" || sources.usageHoldExpiresAt <= now) {
        throw new ExecutionError(
          "usage_hold_unavailable",
          "the UsageHold for this action is no longer available",
          409,
        );
      }

      const verification = await transaction.getVerification(requestId);
      if (!verification || verification.verdict !== "ALLOW") {
        throw new ExecutionError(
          "verdict_not_allow",
          "TeeML verification is not an ALLOW verdict",
          409,
        );
      }

      return buildDecisionReceipt(
        {
          requestId,
          agentId: sources.agentId,
          walletId: sources.walletId,
          policyId: sources.policyId,
          policyVersion: sources.policyVersion,
          policyHash: sources.policyHash,
          actionHash: sources.actionHash,
          actionType: sources.action.actionType,
          destination: sources.action.destination,
          assetId: sources.action.assetId,
          amount: sources.action.amount,
          teemlVerificationId: verification.verificationId,
          teemlRequestHash: verification.teemlRequestHash,
          semanticContextHash: verification.semanticContextHash,
          reasonCode: verification.reasonCode ?? "SEMANTIC_POLICY_MATCH",
          decidedAt: now,
        },
        this.dependencies.feeRecipientAddress,
      );
    });

    const wallet = await this.policyRepository.getWallet(receipt.walletId);
    if (!wallet) {
      throw new ExecutionError("wallet_not_found", "protected wallet was not found", 404);
    }

    const { signature: decisionReceiptSignature } = await signDecisionReceipt(
      receipt,
      this.dependencies.agentVerifierSignerPrivateKey,
    );

    const agentPrivateKey = this.dependencies.getAgentPrivateKey(receipt.agentId);
    if (!agentPrivateKey) {
      throw new ExecutionError(
        "agent_key_unavailable",
        "the agent's signing key is not available in this process",
        503,
      );
    }

    const paymentCall = await buildPaymentCall(receipt, wallet.safeAddress as `0x${string}`);
    const { transactionData, agentSignature } = await createAgentSignedPayment({
      rpcUrl: this.dependencies.rpcUrl,
      safeAddress: wallet.safeAddress,
      agentPrivateKey,
      paymentCall,
    });

    const cosignResponse = await fetchImpl(
      `${this.dependencies.cosignerBaseUrl}/cosign`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          safeAddress: wallet.safeAddress,
          paymentCall,
          nonce: transactionData.nonce,
          agentSignature,
          decisionReceipt: receipt,
          decisionReceiptSignature,
        }),
      },
    );

    if (!cosignResponse.ok) {
      const body = await safeReadJson(cosignResponse);
      throw new ExecutionError(
        typeof body?.error === "string" ? body.error : "cosign_failed",
        "the cosigner rejected or failed to execute the payment",
        502,
      );
    }
    const cosignResult = (await cosignResponse.json()) as {
      status: "EXECUTED";
      safeTxHash: string;
      transactionHash: string;
    };

    const executionId = this.dependencies.idGenerator();
    const executedAt = this.dependencies.clock();

    await this.teemlRepository.runLocked(requestId, async transaction => {
      await transaction.commitUsageHold({ requestId, occurredAt: executedAt });
    });
    await this.executionRepository.recordExecution({
      executionId,
      receipt,
      decisionReceiptSignature,
      safeAddress: wallet.safeAddress,
      safeTxHash: cosignResult.safeTxHash,
      transactionHash: cosignResult.transactionHash,
      executedAt,
    });

    return {
      status: "EXECUTED",
      requestId,
      safeTxHash: cosignResult.safeTxHash,
      transactionHash: cosignResult.transactionHash,
      amount: receipt.amount,
      feeAmount: receipt.feeAmount,
    };
  }
}

async function safeReadJson(response: Response): Promise<Record<string, unknown> | null> {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export type { DecisionReceipt };
