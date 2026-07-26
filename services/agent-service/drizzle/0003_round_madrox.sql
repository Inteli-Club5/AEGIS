CREATE TYPE "public"."aegis_wallet_creation_status" AS ENUM('INITIALIZED', 'PREPARED', 'BROADCAST', 'COMPLETED');--> statement-breakpoint
CREATE TYPE "public"."aegis_wallet_deployment_provenance" AS ENUM('BROADCAST_RECEIPT', 'PREDICTED_SAFE_RECONCILIATION');--> statement-breakpoint
CREATE TYPE "public"."aegis_wallet_guardian_source" AS ENUM('REQUESTED', 'CONFIGURED_AEGIS', 'OWNER_FALLBACK');--> statement-breakpoint
CREATE TABLE "aegis_wallet_creation_operations" (
	"operation_id" text PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"network_id" text DEFAULT 'hedera:testnet' NOT NULL,
	"wallet_id" text NOT NULL,
	"recovery_guardian_address" text NOT NULL,
	"guardian_source" "aegis_wallet_guardian_source" NOT NULL,
	"salt_nonce" text NOT NULL,
	"status" "aegis_wallet_creation_status" NOT NULL,
	"predicted_safe_address" text,
	"transaction_hash" text,
	"owners" jsonb,
	"threshold" integer,
	"deployment_provenance" "aegis_wallet_deployment_provenance",
	"created_at" integer NOT NULL,
	"updated_at" integer NOT NULL,
	CONSTRAINT "aegis_wallet_creation_operations_network_check" CHECK ("network_id" = 'hedera:testnet'),
	CONSTRAINT "aegis_wallet_creation_operations_salt_nonce_check" CHECK ("salt_nonce" ~ '^(0|[1-9][0-9]*)$'),
	CONSTRAINT "aegis_wallet_creation_operations_threshold_check" CHECK ("threshold" IS NULL OR "threshold" > 0)
);
--> statement-breakpoint
ALTER TABLE "aegis_wallet_creation_operations" ADD CONSTRAINT "aegis_wallet_creation_operations_agent_id_aegis_agents_agent_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."aegis_agents"("agent_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "aegis_wallet_creation_operations_agent_network_unique" ON "aegis_wallet_creation_operations" USING btree ("agent_id","network_id");--> statement-breakpoint
CREATE UNIQUE INDEX "aegis_wallet_creation_operations_wallet_unique" ON "aegis_wallet_creation_operations" USING btree ("wallet_id");--> statement-breakpoint
CREATE UNIQUE INDEX "aegis_wallets_agent_network_unique" ON "aegis_wallets" USING btree ("agent_id","network_id");