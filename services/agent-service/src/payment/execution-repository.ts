import pg from "pg";
import type { DecisionReceipt } from "./decision-receipt.js";

export type ExecutionRecordInput = Readonly<{
  executionId: string;
  receipt: DecisionReceipt;
  decisionReceiptSignature: string;
  safeAddress: string;
  safeTxHash: string;
  transactionHash: string;
  executedAt: number;
}>;

export type ExecutionRepository = {
  recordExecution(input: ExecutionRecordInput): Promise<void>;
};

export class PostgresExecutionRepository implements ExecutionRepository {
  constructor(private readonly pool: pg.Pool) {}

  async recordExecution(input: ExecutionRecordInput): Promise<void> {
    const { receipt } = input;
    await this.pool.query(
      `insert into aegis_executions (
         execution_id, request_id, teeml_verification_id, agent_id, wallet_id,
         policy_id, policy_version, policy_hash, action_hash,
         destination_kind, destination_value, asset_id, amount, fee_amount,
         fee_recipient_address, teeml_request_hash, semantic_context_hash,
         decision_receipt_signature, safe_address, safe_tx_hash,
         transaction_hash, status, decided_at, executed_at, created_at
       ) values (
         $1, $2, $3, $4, $5,
         $6, $7, $8, $9,
         $10, $11, $12, $13, $14,
         $15, $16, $17,
         $18, $19, $20,
         $21, 'EXECUTED', $22, $23, $23
       )`,
      [
        input.executionId,
        receipt.requestId,
        receipt.teemlVerificationId,
        receipt.agentId,
        receipt.walletId,
        receipt.policyId,
        receipt.policyVersion,
        receipt.policyHash,
        receipt.actionHash,
        receipt.destination.kind,
        receipt.destination.value,
        receipt.assetId,
        receipt.amount,
        receipt.feeAmount,
        receipt.feeRecipientAddress,
        receipt.teemlRequestHash,
        receipt.semanticContextHash,
        input.decisionReceiptSignature,
        input.safeAddress,
        input.safeTxHash,
        input.transactionHash,
        receipt.decidedAt,
        input.executedAt,
      ],
    );
  }
}

export function createPostgresExecutionRepository(
  connectionString: string,
): PostgresExecutionRepository {
  const { Pool } = pg;
  return new PostgresExecutionRepository(new Pool({ connectionString }));
}
