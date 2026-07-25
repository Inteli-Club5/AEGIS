CREATE TYPE "public"."aegis_action_request_status" AS ENUM('RECEIVED', 'DENIED_PRECHECK', 'PENDING_TEEML');--> statement-breakpoint
CREATE TYPE "public"."aegis_asset_catalog_kind" AS ENUM('HBAR', 'HTS_FUNGIBLE');--> statement-breakpoint
CREATE TYPE "public"."aegis_asset_catalog_status" AS ENUM('ACTIVE', 'DISABLED');--> statement-breakpoint
CREATE TYPE "public"."aegis_precheck_record_status" AS ENUM('PASS_TO_TEEML', 'DENY_PRECHECK');--> statement-breakpoint
CREATE TYPE "public"."aegis_usage_hold_status" AS ENUM('HELD', 'RELEASED', 'EXPIRED', 'COMMITTED');--> statement-breakpoint
CREATE TABLE "aegis_asset_catalog" (
	"asset_id" text PRIMARY KEY NOT NULL,
	"network_id" text DEFAULT 'hedera:testnet' NOT NULL,
	"kind" "aegis_asset_catalog_kind" NOT NULL,
	"hedera_token_id" text,
	"symbol" text,
	"decimals" integer NOT NULL,
	"status" "aegis_asset_catalog_status" NOT NULL,
	"created_at" integer NOT NULL,
	"updated_at" integer NOT NULL,
	CONSTRAINT "aegis_asset_catalog_network_check" CHECK ("network_id" = 'hedera:testnet'),
	CONSTRAINT "aegis_asset_catalog_decimals_check" CHECK ("decimals" >= 0 AND "decimals" <= 30),
	CONSTRAINT "aegis_asset_catalog_hbar_check" CHECK (("kind" <> 'HBAR') OR ("asset_id" = 'hedera:testnet:hbar' AND "hedera_token_id" IS NULL AND "decimals" = 8)),
	CONSTRAINT "aegis_asset_catalog_hts_check" CHECK (("kind" <> 'HTS_FUNGIBLE') OR ("asset_id" LIKE 'hedera:testnet:hts:%' AND "hedera_token_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "aegis_action_requests" (
	"request_id" text PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"wallet_id" text NOT NULL,
	"idempotency_key_hash" text NOT NULL,
	"request_payload_hash" text NOT NULL,
	"private_payload" jsonb NOT NULL,
	"reason_hash" text,
	"aegis_nonce" bigint,
	"policy_id" text,
	"policy_version" integer,
	"policy_hash" text,
	"action_hash" text NOT NULL,
	"status" "aegis_action_request_status" NOT NULL,
	"functional_response" jsonb NOT NULL,
	"created_at" integer NOT NULL,
	"updated_at" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "aegis_precheck_records" (
	"precheck_id" text PRIMARY KEY NOT NULL,
	"request_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"wallet_id" text NOT NULL,
	"policy_id" text,
	"policy_version" integer,
	"policy_hash" text,
	"action_hash" text NOT NULL,
	"aegis_nonce" bigint,
	"evaluated_at" integer NOT NULL,
	"status" "aegis_precheck_record_status" NOT NULL,
	"reason_code" text,
	"usage_hold_id" text,
	"evaluator_version" text NOT NULL,
	"created_at" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "aegis_usage_holds" (
	"usage_hold_id" text PRIMARY KEY NOT NULL,
	"request_id" text NOT NULL,
	"precheck_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"wallet_id" text NOT NULL,
	"policy_id" text NOT NULL,
	"policy_version" integer NOT NULL,
	"policy_hash" text NOT NULL,
	"asset_id" text NOT NULL,
	"amount" text NOT NULL,
	"action_count" integer NOT NULL,
	"status" "aegis_usage_hold_status" NOT NULL,
	"held_at" integer NOT NULL,
	"expires_at" integer NOT NULL,
	"released_at" integer,
	"expired_at" integer,
	"committed_at" integer,
	"created_at" integer NOT NULL,
	"updated_at" integer NOT NULL,
	CONSTRAINT "aegis_usage_holds_amount_check" CHECK ("amount" ~ '^(0|[1-9][0-9]*)$' AND "amount" <> '0'),
	CONSTRAINT "aegis_usage_holds_action_count_check" CHECK ("action_count" = 1)
);
--> statement-breakpoint
CREATE TABLE "aegis_wallet_nonces" (
	"wallet_id" text PRIMARY KEY NOT NULL,
	"next_nonce" bigint DEFAULT 1 NOT NULL,
	"updated_at" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "aegis_audit_events" (
	"event_id" text PRIMARY KEY NOT NULL,
	"schema_version" text NOT NULL,
	"event_type" text NOT NULL,
	"occurred_at" integer NOT NULL,
	"request_id" text NOT NULL,
	"precheck_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"wallet_id" text NOT NULL,
	"policy_id" text,
	"policy_version" integer,
	"policy_hash" text,
	"action_hash" text NOT NULL,
	"stage" text NOT NULL,
	"outcome" text NOT NULL,
	"reason_code" text,
	"network_id" text NOT NULL,
	"idempotency_key_hash" text NOT NULL,
	"request_payload_hash" text NOT NULL,
	"usage_hold_id" text,
	"actor_type" text NOT NULL,
	"retention_until" integer NOT NULL,
	CONSTRAINT "aegis_audit_events_stage_check" CHECK ("stage" = 'PRECHECK'),
	CONSTRAINT "aegis_audit_events_actor_type_check" CHECK ("actor_type" = 'AGENT'),
	CONSTRAINT "aegis_audit_events_network_check" CHECK ("network_id" = 'hedera:testnet')
);
--> statement-breakpoint
ALTER TABLE "aegis_precheck_records" ADD CONSTRAINT "aegis_precheck_records_request_id_aegis_action_requests_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."aegis_action_requests"("request_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aegis_usage_holds" ADD CONSTRAINT "aegis_usage_holds_request_id_aegis_action_requests_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."aegis_action_requests"("request_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aegis_usage_holds" ADD CONSTRAINT "aegis_usage_holds_precheck_id_aegis_precheck_records_precheck_id_fk" FOREIGN KEY ("precheck_id") REFERENCES "public"."aegis_precheck_records"("precheck_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aegis_usage_holds" ADD CONSTRAINT "aegis_usage_holds_asset_id_aegis_asset_catalog_asset_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."aegis_asset_catalog"("asset_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aegis_wallet_nonces" ADD CONSTRAINT "aegis_wallet_nonces_wallet_id_aegis_wallets_wallet_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."aegis_wallets"("wallet_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "aegis_action_requests_idempotency_unique" ON "aegis_action_requests" USING btree ("agent_id","idempotency_key_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "aegis_action_requests_wallet_nonce_unique" ON "aegis_action_requests" USING btree ("wallet_id","aegis_nonce");--> statement-breakpoint
CREATE INDEX "aegis_action_requests_agent_wallet_idx" ON "aegis_action_requests" USING btree ("agent_id","wallet_id");--> statement-breakpoint
CREATE INDEX "aegis_action_requests_policy_idx" ON "aegis_action_requests" USING btree ("policy_id");--> statement-breakpoint
CREATE UNIQUE INDEX "aegis_precheck_records_request_unique" ON "aegis_precheck_records" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "aegis_precheck_records_agent_wallet_idx" ON "aegis_precheck_records" USING btree ("agent_id","wallet_id");--> statement-breakpoint
CREATE UNIQUE INDEX "aegis_usage_holds_request_unique" ON "aegis_usage_holds" USING btree ("request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "aegis_usage_holds_precheck_unique" ON "aegis_usage_holds" USING btree ("precheck_id");--> statement-breakpoint
CREATE INDEX "aegis_usage_holds_policy_wallet_idx" ON "aegis_usage_holds" USING btree ("agent_id","wallet_id","policy_id");--> statement-breakpoint
CREATE INDEX "aegis_usage_holds_active_idx" ON "aegis_usage_holds" USING btree ("wallet_id","policy_id","status","expires_at");--> statement-breakpoint
CREATE INDEX "aegis_audit_events_request_idx" ON "aegis_audit_events" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "aegis_audit_events_precheck_idx" ON "aegis_audit_events" USING btree ("precheck_id");--> statement-breakpoint
INSERT INTO "aegis_asset_catalog" ("asset_id", "network_id", "kind", "hedera_token_id", "symbol", "decimals", "status", "created_at", "updated_at")
VALUES ('hedera:testnet:hbar', 'hedera:testnet', 'HBAR', NULL, 'HBAR', 8, 'ACTIVE', 0, 0);
