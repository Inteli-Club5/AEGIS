ALTER TYPE "public"."aegis_teeml_verification_status" ADD VALUE 'TEETLS_HACKATHON_ALLOWED' BEFORE 'DENIED';--> statement-breakpoint
ALTER TABLE "aegis_teeml_verifications" DROP CONSTRAINT "aegis_teeml_verifications_result_check";--> statement-breakpoint
ALTER TABLE "aegis_teeml_verifications" ADD CONSTRAINT "aegis_teeml_verifications_result_check" CHECK ((
        ("status" = 'PROCESSING'
          AND "verdict" IS NULL
          AND "reason_code" IS NULL
          AND "technical_reason_code" IS NULL
          AND "response_hash" IS NULL)
        OR
        ("status"::text IN ('ALLOWED', 'TEETLS_HACKATHON_ALLOWED', 'DENIED')
          AND "verdict" IS NOT NULL
          AND "verdict" = CASE WHEN "status"::text = 'DENIED' THEN 'DENY' ELSE 'ALLOW' END
          AND "reason_code" IS NOT NULL
          AND "technical_reason_code" IS NULL
          AND "model_id" IS NOT NULL
          AND "security_profile" IS NOT NULL
          AND "trust_mode" IS NOT NULL
          AND "verification_mode" IS NOT NULL
          AND "sealed_inference" IS NOT NULL
          AND (
            ("status"::text = 'ALLOWED'
              AND "security_profile" = 'production-private-teeml'
              AND "trust_mode" = 'private'
              AND "verification_mode" = 'TeeML'
              AND "sealed_inference" = true)
            OR
            ("status"::text = 'TEETLS_HACKATHON_ALLOWED'
              AND "security_profile" = 'hackathon-testnet-teetls'
              AND "trust_mode" = 'verified'
              AND "verification_mode" = 'TeeTLS'
              AND "sealed_inference" = false)
            OR
            ("status"::text = 'DENIED'
              AND (
                ("security_profile" = 'production-private-teeml'
                  AND "trust_mode" = 'private'
                  AND "verification_mode" = 'TeeML'
                  AND "sealed_inference" = true)
                OR
                ("security_profile" = 'hackathon-testnet-teetls'
                  AND "trust_mode" = 'verified'
                  AND "verification_mode" = 'TeeTLS'
                  AND "sealed_inference" = false)
              ))
          )
          AND "tee_verified" IS NOT NULL
          AND "tee_verified" = true
          AND "response_hash" IS NOT NULL
          AND "response_hash" ~ '^0x[0-9a-f]{64}$'
          AND "latency_ms" IS NOT NULL
          AND "latency_ms" >= 0
          AND "evaluated_at" IS NOT NULL)
        OR
        ("status" = 'FAILED'
          AND "verdict" IS NULL
          AND "reason_code" IS NULL
          AND "technical_reason_code" IS NOT NULL)
      ));--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "aegis_action_requests" AS "action"
    WHERE "action"."status"::text = 'TEEML_ALLOWED'
      AND NOT EXISTS (
        SELECT 1
        FROM "aegis_teeml_verifications" AS "verification"
        WHERE "verification"."request_id" = "action"."request_id"
          AND "verification"."status"::text = 'ALLOWED'
          AND "verification"."verdict" = 'ALLOW'
          AND "verification"."security_profile" = 'production-private-teeml'
          AND "verification"."trust_mode" = 'private'
          AND "verification"."verification_mode" = 'TeeML'
          AND "verification"."sealed_inference" = true
          AND "verification"."tee_verified" = true
      )
  ) THEN
    RAISE EXCEPTION 'Existing TEEML_ALLOWED action lacks a production Private/TeeML artifact';
  END IF;
END
$$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION "aegis_enforce_teeml_handoff_profile"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."status"::text = 'TEEML_ALLOWED' AND NOT EXISTS (
    SELECT 1
    FROM "aegis_teeml_verifications" AS "verification"
    WHERE "verification"."request_id" = NEW."request_id"
      AND "verification"."status"::text = 'ALLOWED'
      AND "verification"."verdict" = 'ALLOW'
      AND "verification"."security_profile" = 'production-private-teeml'
      AND "verification"."trust_mode" = 'private'
      AND "verification"."verification_mode" = 'TeeML'
      AND "verification"."sealed_inference" = true
      AND "verification"."tee_verified" = true
  ) THEN
    RAISE EXCEPTION 'TEEML_ALLOWED requires a production Private/TeeML artifact';
  END IF;

  IF NEW."status"::text = 'TEETLS_HACKATHON_ALLOWED' AND NOT EXISTS (
    SELECT 1
    FROM "aegis_teeml_verifications" AS "verification"
    WHERE "verification"."request_id" = NEW."request_id"
      AND "verification"."status"::text = 'TEETLS_HACKATHON_ALLOWED'
      AND "verification"."verdict" = 'ALLOW'
      AND "verification"."security_profile" = 'hackathon-testnet-teetls'
      AND "verification"."trust_mode" = 'verified'
      AND "verification"."verification_mode" = 'TeeTLS'
      AND "verification"."sealed_inference" = false
      AND "verification"."tee_verified" = true
  ) THEN
    RAISE EXCEPTION 'TEETLS_HACKATHON_ALLOWED requires a hackathon TeeTLS artifact';
  END IF;

  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "aegis_action_requests_teeml_handoff_profile_trigger"
BEFORE INSERT OR UPDATE OF "status" ON "aegis_action_requests"
FOR EACH ROW
EXECUTE FUNCTION "aegis_enforce_teeml_handoff_profile"();
