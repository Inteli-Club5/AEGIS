-- Legacy constraints accepted UNKNOWN when nullable proof fields were absent.
-- Reconcile those rows as technical failures before enforcing the strict tuple.
ALTER TABLE "aegis_teeml_verifications" DROP CONSTRAINT "aegis_teeml_verifications_result_check";--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "aegis_teeml_verifications" AS "verification"
    JOIN "aegis_usage_holds" AS "hold"
      ON "hold"."request_id" = "verification"."request_id"
    WHERE "verification"."status" IN ('ALLOWED', 'DENIED')
      AND "hold"."status" = 'COMMITTED'
      AND (
        "verification"."verdict" IS NULL
        OR "verification"."verdict" <> CASE
          WHEN "verification"."status" = 'ALLOWED' THEN 'ALLOW'
          ELSE 'DENY'
        END
        OR "verification"."reason_code" IS NULL
        OR "verification"."technical_reason_code" IS NOT NULL
        OR "verification"."model_id" IS NULL
        OR ((
          ("verification"."security_profile" = 'production-private-teeml'
            AND "verification"."trust_mode" = 'private'
            AND "verification"."verification_mode" = 'TeeML'
            AND "verification"."sealed_inference" = true)
          OR
          ("verification"."security_profile" = 'hackathon-testnet-teetls'
            AND "verification"."trust_mode" = 'verified'
            AND "verification"."verification_mode" = 'TeeTLS'
            AND "verification"."sealed_inference" = false)
        ) IS NOT TRUE)
        OR "verification"."tee_verified" IS DISTINCT FROM true
        OR "verification"."response_hash" IS NULL
        OR "verification"."response_hash" !~ '^0x[0-9a-f]{64}$'
        OR "verification"."latency_ms" IS NULL
        OR "verification"."latency_ms" < 0
        OR "verification"."evaluated_at" IS NULL
      )
  ) THEN
    RAISE EXCEPTION 'Invalid legacy TeeML evidence has a COMMITTED UsageHold and requires manual reconciliation';
  END IF;
END
$$;--> statement-breakpoint
DO $action_reconcile$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "aegis_teeml_verifications"
    WHERE "status" IN ('ALLOWED', 'DENIED')
  ) THEN
    EXECUTE $sql$
      UPDATE "aegis_action_requests" AS "action"
      SET "status" = 'TEEML_FAILED',
          "updated_at" = GREATEST(
            "action"."updated_at",
            floor(extract(epoch from clock_timestamp()))::integer
          )
      FROM "aegis_teeml_verifications" AS "verification"
      WHERE "action"."request_id" = "verification"."request_id"
        AND "action"."status" IN (
          'PENDING_TEEML',
          'TEEML_PROCESSING',
          'TEEML_ALLOWED',
          'TEEML_DENIED'
        )
        AND "verification"."status" IN ('ALLOWED', 'DENIED')
        AND ((
          "verification"."verdict" IS NOT NULL
          AND "verification"."verdict" = CASE
            WHEN "verification"."status" = 'ALLOWED' THEN 'ALLOW'
            ELSE 'DENY'
          END
          AND "verification"."reason_code" IS NOT NULL
          AND "verification"."technical_reason_code" IS NULL
          AND "verification"."model_id" IS NOT NULL
          AND "verification"."security_profile" IS NOT NULL
          AND "verification"."trust_mode" IS NOT NULL
          AND "verification"."verification_mode" IS NOT NULL
          AND "verification"."sealed_inference" IS NOT NULL
          AND (
            ("verification"."security_profile" = 'production-private-teeml'
              AND "verification"."trust_mode" = 'private'
              AND "verification"."verification_mode" = 'TeeML'
              AND "verification"."sealed_inference" = true)
            OR
            ("verification"."security_profile" = 'hackathon-testnet-teetls'
              AND "verification"."trust_mode" = 'verified'
              AND "verification"."verification_mode" = 'TeeTLS'
              AND "verification"."sealed_inference" = false)
          )
          AND "verification"."tee_verified" IS NOT NULL
          AND "verification"."tee_verified" = true
          AND "verification"."response_hash" IS NOT NULL
          AND "verification"."response_hash" ~ '^0x[0-9a-f]{64}$'
          AND "verification"."latency_ms" IS NOT NULL
          AND "verification"."latency_ms" >= 0
          AND "verification"."evaluated_at" IS NOT NULL
        ) IS NOT TRUE)
    $sql$;
  END IF;
END
$action_reconcile$;--> statement-breakpoint
UPDATE "aegis_usage_holds" AS "hold"
SET "status" = 'RELEASED',
    "released_at" = COALESCE(
      "hold"."released_at",
      floor(extract(epoch from clock_timestamp()))::integer
    ),
    "updated_at" = GREATEST(
      "hold"."updated_at",
      floor(extract(epoch from clock_timestamp()))::integer
    )
FROM "aegis_teeml_verifications" AS "verification"
WHERE "hold"."request_id" = "verification"."request_id"
  AND "hold"."status" IN ('HELD', 'EXPIRED')
  AND "verification"."status" IN ('ALLOWED', 'DENIED')
  AND ((
    "verification"."verdict" IS NOT NULL
    AND "verification"."verdict" = CASE
      WHEN "verification"."status" = 'ALLOWED' THEN 'ALLOW'
      ELSE 'DENY'
    END
    AND "verification"."reason_code" IS NOT NULL
    AND "verification"."technical_reason_code" IS NULL
    AND "verification"."model_id" IS NOT NULL
    AND "verification"."security_profile" IS NOT NULL
    AND "verification"."trust_mode" IS NOT NULL
    AND "verification"."verification_mode" IS NOT NULL
    AND "verification"."sealed_inference" IS NOT NULL
    AND (
      ("verification"."security_profile" = 'production-private-teeml'
        AND "verification"."trust_mode" = 'private'
        AND "verification"."verification_mode" = 'TeeML'
        AND "verification"."sealed_inference" = true)
      OR
      ("verification"."security_profile" = 'hackathon-testnet-teetls'
        AND "verification"."trust_mode" = 'verified'
        AND "verification"."verification_mode" = 'TeeTLS'
        AND "verification"."sealed_inference" = false)
    )
    AND "verification"."tee_verified" IS NOT NULL
    AND "verification"."tee_verified" = true
    AND "verification"."response_hash" IS NOT NULL
    AND "verification"."response_hash" ~ '^0x[0-9a-f]{64}$'
    AND "verification"."latency_ms" IS NOT NULL
    AND "verification"."latency_ms" >= 0
    AND "verification"."evaluated_at" IS NOT NULL
  ) IS NOT TRUE);--> statement-breakpoint
UPDATE "aegis_teeml_audit_events" AS "audit"
SET "outcome" = 'TEEML_FAILED',
    "reason_code" = 'TEEML_UNKNOWN_RESULT',
    "occurred_at" = floor(extract(epoch from clock_timestamp()))::integer
FROM "aegis_teeml_verifications" AS "verification"
WHERE "audit"."verification_id" = "verification"."verification_id"
  AND "verification"."status" IN ('ALLOWED', 'DENIED')
  AND ((
    "verification"."verdict" IS NOT NULL
    AND "verification"."verdict" = CASE
      WHEN "verification"."status" = 'ALLOWED' THEN 'ALLOW'
      ELSE 'DENY'
    END
    AND "verification"."reason_code" IS NOT NULL
    AND "verification"."technical_reason_code" IS NULL
    AND "verification"."model_id" IS NOT NULL
    AND "verification"."security_profile" IS NOT NULL
    AND "verification"."trust_mode" IS NOT NULL
    AND "verification"."verification_mode" IS NOT NULL
    AND "verification"."sealed_inference" IS NOT NULL
    AND (
      ("verification"."security_profile" = 'production-private-teeml'
        AND "verification"."trust_mode" = 'private'
        AND "verification"."verification_mode" = 'TeeML'
        AND "verification"."sealed_inference" = true)
      OR
      ("verification"."security_profile" = 'hackathon-testnet-teetls'
        AND "verification"."trust_mode" = 'verified'
        AND "verification"."verification_mode" = 'TeeTLS'
        AND "verification"."sealed_inference" = false)
    )
    AND "verification"."tee_verified" IS NOT NULL
    AND "verification"."tee_verified" = true
    AND "verification"."response_hash" IS NOT NULL
    AND "verification"."response_hash" ~ '^0x[0-9a-f]{64}$'
    AND "verification"."latency_ms" IS NOT NULL
    AND "verification"."latency_ms" >= 0
    AND "verification"."evaluated_at" IS NOT NULL
  ) IS NOT TRUE);--> statement-breakpoint
UPDATE "aegis_teeml_verifications" AS "verification"
SET "status" = 'FAILED',
    "verdict" = NULL,
    "reason_code" = NULL,
    "technical_reason_code" = 'TEEML_UNKNOWN_RESULT',
    "evaluated_at" = COALESCE(
      "verification"."evaluated_at",
      floor(extract(epoch from clock_timestamp()))::integer
    ),
    "updated_at" = floor(extract(epoch from clock_timestamp()))::integer
WHERE "verification"."status" IN ('ALLOWED', 'DENIED')
  AND ((
    "verification"."verdict" IS NOT NULL
    AND "verification"."verdict" = CASE
      WHEN "verification"."status" = 'ALLOWED' THEN 'ALLOW'
      ELSE 'DENY'
    END
    AND "verification"."reason_code" IS NOT NULL
    AND "verification"."technical_reason_code" IS NULL
    AND "verification"."model_id" IS NOT NULL
    AND "verification"."security_profile" IS NOT NULL
    AND "verification"."trust_mode" IS NOT NULL
    AND "verification"."verification_mode" IS NOT NULL
    AND "verification"."sealed_inference" IS NOT NULL
    AND (
      ("verification"."security_profile" = 'production-private-teeml'
        AND "verification"."trust_mode" = 'private'
        AND "verification"."verification_mode" = 'TeeML'
        AND "verification"."sealed_inference" = true)
      OR
      ("verification"."security_profile" = 'hackathon-testnet-teetls'
        AND "verification"."trust_mode" = 'verified'
        AND "verification"."verification_mode" = 'TeeTLS'
        AND "verification"."sealed_inference" = false)
    )
    AND "verification"."tee_verified" IS NOT NULL
    AND "verification"."tee_verified" = true
    AND "verification"."response_hash" IS NOT NULL
    AND "verification"."response_hash" ~ '^0x[0-9a-f]{64}$'
    AND "verification"."latency_ms" IS NOT NULL
    AND "verification"."latency_ms" >= 0
    AND "verification"."evaluated_at" IS NOT NULL
  ) IS NOT TRUE);--> statement-breakpoint
ALTER TABLE "aegis_teeml_verifications" ADD CONSTRAINT "aegis_teeml_verifications_result_check" CHECK ((
        ("status" = 'PROCESSING'
          AND "verdict" IS NULL
          AND "reason_code" IS NULL
          AND "technical_reason_code" IS NULL
          AND "response_hash" IS NULL)
        OR
        ("status" IN ('ALLOWED', 'DENIED')
          AND "verdict" IS NOT NULL
          AND "verdict" = CASE WHEN "status" = 'ALLOWED' THEN 'ALLOW' ELSE 'DENY' END
          AND "reason_code" IS NOT NULL
          AND "technical_reason_code" IS NULL
          AND "model_id" IS NOT NULL
          AND "security_profile" IS NOT NULL
          AND "trust_mode" IS NOT NULL
          AND "verification_mode" IS NOT NULL
          AND "sealed_inference" IS NOT NULL
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
