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
      ));
