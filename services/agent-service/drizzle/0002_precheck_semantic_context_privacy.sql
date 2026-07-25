ALTER TABLE "aegis_action_requests" ADD COLUMN IF NOT EXISTS "semantic_context_hash" text;
--> statement-breakpoint
DO $$
BEGIN
	UPDATE "aegis_action_requests"
	SET "semantic_context_hash" = '0x0000000000000000000000000000000000000000000000000000000000000000'
	WHERE "semantic_context_hash" IS NULL;
END $$;
--> statement-breakpoint
ALTER TABLE "aegis_action_requests" ALTER COLUMN "semantic_context_hash" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "aegis_action_requests" DROP COLUMN IF EXISTS "private_payload";
--> statement-breakpoint
ALTER TABLE "aegis_action_requests" DROP COLUMN IF EXISTS "reason_hash";
