ALTER TABLE "aegis_action_requests" ALTER COLUMN "semantic_context_hash" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "aegis_action_requests" ADD COLUMN "action_hash_schema_version" text;--> statement-breakpoint
ALTER TABLE "aegis_action_requests" ADD COLUMN "action_type" text;--> statement-breakpoint
ALTER TABLE "aegis_action_requests" ADD COLUMN "destination_kind" text;--> statement-breakpoint
ALTER TABLE "aegis_action_requests" ADD COLUMN "destination_value" text;--> statement-breakpoint
ALTER TABLE "aegis_action_requests" ADD COLUMN "destination_chain_id" integer;--> statement-breakpoint
ALTER TABLE "aegis_action_requests" ADD COLUMN "asset_id" text;--> statement-breakpoint
ALTER TABLE "aegis_action_requests" ADD COLUMN "amount" text;--> statement-breakpoint
ALTER TABLE "aegis_action_requests" ADD COLUMN "action_deadline" integer;--> statement-breakpoint
ALTER TABLE "aegis_action_requests" ADD CONSTRAINT "aegis_action_requests_action_commitment_check" CHECK ((
        "action_hash_schema_version" IS NULL
        AND "action_type" IS NULL
        AND "destination_kind" IS NULL
        AND "destination_value" IS NULL
        AND "destination_chain_id" IS NULL
        AND "asset_id" IS NULL
        AND "amount" IS NULL
        AND "action_deadline" IS NULL
      ) OR (
        "action_hash_schema_version" = 'aegis.action.level1.v2'
        AND "action_type" IS NOT NULL
        AND btrim("action_type") <> ''
        AND "destination_kind" IN ('EVM_ADDRESS', 'HEDERA_ACCOUNT_ID', 'URL_ORIGIN')
        AND "destination_value" IS NOT NULL
        AND btrim("destination_value") <> ''
        AND "asset_id" IS NOT NULL
        AND btrim("asset_id") <> ''
        AND "amount" ~ '^[1-9][0-9]*$'
        AND "action_deadline" >= 0
        AND (
          ("destination_kind" = 'EVM_ADDRESS' AND "destination_chain_id" = 296)
          OR ("destination_kind" = 'HEDERA_ACCOUNT_ID' AND ("destination_chain_id" IS NULL OR "destination_chain_id" = 296))
          OR ("destination_kind" = 'URL_ORIGIN' AND "destination_chain_id" IS NULL)
        )
      ));
