DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "aegis_teeml_verifications"
    WHERE "security_profile" = 'hackathon-testnet-teetls'
      AND "status" = 'ALLOWED'
  ) THEN
    RAISE EXCEPTION 'Existing hackathon TeeTLS ALLOW rows require explicit manual reconciliation before the demo-only status migration';
  END IF;
END
$$;--> statement-breakpoint
ALTER TYPE "public"."aegis_action_request_status" ADD VALUE 'TEETLS_HACKATHON_ALLOWED' BEFORE 'TEEML_DENIED';--> statement-breakpoint
ALTER TABLE "aegis_teeml_audit_events" DROP CONSTRAINT "aegis_teeml_audit_events_outcome_check";--> statement-breakpoint
ALTER TABLE "aegis_teeml_audit_events" ADD CONSTRAINT "aegis_teeml_audit_events_outcome_check" CHECK ((
        ("outcome" IN ('TEEML_ALLOWED', 'TEETLS_HACKATHON_ALLOWED', 'TEEML_DENIED')
          AND "verification_id" IS NOT NULL
          AND "semantic_context_hash" ~ '^0x[0-9a-f]{64}$'
          AND "teeml_request_hash" ~ '^0x[0-9a-f]{64}$')
        OR
        ("outcome" = 'TEEML_FAILED'
          AND (("semantic_context_hash" IS NULL AND "teeml_request_hash" IS NULL)
            OR ("semantic_context_hash" ~ '^0x[0-9a-f]{64}$'
              AND "teeml_request_hash" ~ '^0x[0-9a-f]{64}$')))
      ));
