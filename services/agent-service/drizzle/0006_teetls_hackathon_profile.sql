ALTER TABLE "aegis_teeml_verifications" DROP CONSTRAINT "aegis_teeml_verifications_result_check";--> statement-breakpoint
ALTER TABLE "aegis_teeml_verifications" ADD COLUMN "security_profile" text;--> statement-breakpoint
ALTER TABLE "aegis_teeml_verifications" ADD COLUMN "verification_mode" text;--> statement-breakpoint
ALTER TABLE "aegis_teeml_verifications" ADD COLUMN "sealed_inference" boolean;--> statement-breakpoint
UPDATE "aegis_teeml_verifications"
SET "security_profile" = 'production-private-teeml',
    "verification_mode" = 'TeeML',
    "sealed_inference" = true
WHERE "status" IN ('ALLOWED', 'DENIED')
  AND "trust_mode" = 'private'
  AND "tee_verified" = true;--> statement-breakpoint
ALTER TABLE "aegis_teeml_verifications" ADD CONSTRAINT "aegis_teeml_verifications_result_check" CHECK ((
        ("status" = 'PROCESSING'
          AND "verdict" IS NULL
          AND "reason_code" IS NULL
          AND "technical_reason_code" IS NULL
          AND "response_hash" IS NULL)
        OR
        ("status" IN ('ALLOWED', 'DENIED')
          AND "verdict" = CASE WHEN "status" = 'ALLOWED' THEN 'ALLOW' ELSE 'DENY' END
          AND "reason_code" IS NOT NULL
          AND "technical_reason_code" IS NULL
          AND "model_id" IS NOT NULL
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
          )
          AND "tee_verified" = true
          AND "response_hash" ~ '^0x[0-9a-f]{64}$'
          AND "latency_ms" >= 0
          AND "evaluated_at" IS NOT NULL)
        OR
        ("status" = 'FAILED'
          AND "verdict" IS NULL
          AND "reason_code" IS NULL
          AND "technical_reason_code" IS NOT NULL)
      ));
