CREATE TYPE "public"."aegis_agent_status" AS ENUM('ACTIVE', 'PAUSED', 'RETIRED');--> statement-breakpoint
CREATE TYPE "public"."aegis_policy_status" AS ENUM('DRAFT', 'ACTIVE', 'SUPERSEDED', 'REVOKED');--> statement-breakpoint
CREATE TYPE "public"."aegis_wallet_status" AS ENUM('PROTECTED', 'PAUSED', 'RETIRED', 'DEAD');--> statement-breakpoint
CREATE TABLE "aegis_agents" (
	"agent_id" text PRIMARY KEY NOT NULL,
	"owner_address" text NOT NULL,
	"status" "aegis_agent_status" NOT NULL,
	"created_at" integer NOT NULL,
	"updated_at" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "aegis_policies" (
	"policy_id" text PRIMARY KEY NOT NULL,
	"policy_series_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"wallet_id" text NOT NULL,
	"policy_version" integer NOT NULL,
	"policy_hash" text NOT NULL,
	"status" "aegis_policy_status" NOT NULL,
	"valid_from" integer NOT NULL,
	"valid_until" integer,
	"rules" jsonb NOT NULL,
	"semantic_rules" jsonb NOT NULL,
	"operator_address" text NOT NULL,
	"operator_signature" text NOT NULL,
	"operator_message" text NOT NULL,
	"operator_commitment" text NOT NULL,
	"created_at" integer NOT NULL,
	"updated_at" integer NOT NULL,
	"activated_at" integer,
	"revoked_at" integer,
	"superseded_at" integer,
	"superseded_by_policy_id" text
);
--> statement-breakpoint
CREATE TABLE "aegis_wallets" (
	"wallet_id" text PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"network_id" text DEFAULT 'hedera:testnet' NOT NULL,
	"safe_address" text NOT NULL,
	"status" "aegis_wallet_status" NOT NULL,
	"created_at" integer NOT NULL,
	"updated_at" integer NOT NULL,
	CONSTRAINT "aegis_wallets_network_check" CHECK ("network_id" = 'hedera:testnet')
);
--> statement-breakpoint
ALTER TABLE "aegis_policies" ADD CONSTRAINT "aegis_policies_agent_id_aegis_agents_agent_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."aegis_agents"("agent_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aegis_policies" ADD CONSTRAINT "aegis_policies_wallet_id_aegis_wallets_wallet_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."aegis_wallets"("wallet_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aegis_wallets" ADD CONSTRAINT "aegis_wallets_agent_id_aegis_agents_agent_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."aegis_agents"("agent_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "aegis_wallets_agent_wallet_unique" ON "aegis_wallets" USING btree ("agent_id","wallet_id");--> statement-breakpoint
ALTER TABLE "aegis_policies" ADD CONSTRAINT "aegis_policies_agent_wallet_fk" FOREIGN KEY ("agent_id","wallet_id") REFERENCES "public"."aegis_wallets"("agent_id","wallet_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "aegis_policies_one_active_per_wallet" ON "aegis_policies" USING btree ("agent_id","wallet_id") WHERE "status" = 'ACTIVE';--> statement-breakpoint
CREATE INDEX "aegis_policies_agent_wallet_idx" ON "aegis_policies" USING btree ("agent_id","wallet_id");--> statement-breakpoint
CREATE UNIQUE INDEX "aegis_policies_series_version_unique" ON "aegis_policies" USING btree ("policy_series_id","policy_version");--> statement-breakpoint
CREATE INDEX "aegis_wallets_agent_idx" ON "aegis_wallets" USING btree ("agent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "aegis_wallets_network_safe_unique" ON "aegis_wallets" USING btree ("network_id","safe_address");
