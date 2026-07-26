CREATE TYPE "public"."aegis_execution_status" AS ENUM('EXECUTED');--> statement-breakpoint
CREATE TABLE "aegis_executions" (
	"execution_id" text PRIMARY KEY NOT NULL,
	"request_id" text NOT NULL,
	"teeml_verification_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"wallet_id" text NOT NULL,
	"policy_id" text NOT NULL,
	"policy_version" integer NOT NULL,
	"policy_hash" text NOT NULL,
	"action_hash" text NOT NULL,
	"destination_kind" text NOT NULL,
	"destination_value" text NOT NULL,
	"asset_id" text NOT NULL,
	"amount" text NOT NULL,
	"fee_amount" text NOT NULL,
	"fee_recipient_address" text NOT NULL,
	"teeml_request_hash" text NOT NULL,
	"semantic_context_hash" text NOT NULL,
	"decision_receipt_signature" text NOT NULL,
	"safe_address" text NOT NULL,
	"safe_tx_hash" text NOT NULL,
	"transaction_hash" text NOT NULL,
	"status" "aegis_execution_status" NOT NULL,
	"decided_at" integer NOT NULL,
	"executed_at" integer NOT NULL,
	"created_at" integer NOT NULL,
	CONSTRAINT "aegis_executions_format_check" CHECK ((
        "policy_hash" ~ '^0x[0-9a-f]{64}$'
        AND "action_hash" ~ '^0x[0-9a-f]{64}$'
        AND "teeml_request_hash" ~ '^0x[0-9a-f]{64}$'
        AND "semantic_context_hash" ~ '^0x[0-9a-f]{64}$'
        AND "fee_recipient_address" ~ '^0x[0-9a-fA-F]{40}$'
        AND "safe_address" ~ '^0x[0-9a-fA-F]{40}$'
        AND "amount" ~ '^[0-9]+$'
        AND "fee_amount" ~ '^[0-9]+$'
      ))
);
--> statement-breakpoint
ALTER TABLE "aegis_executions" ADD CONSTRAINT "aegis_executions_request_id_aegis_action_requests_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."aegis_action_requests"("request_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aegis_executions" ADD CONSTRAINT "aegis_executions_teeml_verification_id_aegis_teeml_verifications_verification_id_fk" FOREIGN KEY ("teeml_verification_id") REFERENCES "public"."aegis_teeml_verifications"("verification_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "aegis_executions_request_unique" ON "aegis_executions" USING btree ("request_id");