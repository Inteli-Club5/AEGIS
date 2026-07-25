ALTER TABLE "aegis_teeml_audit_events" DROP CONSTRAINT "aegis_teeml_audit_events_outcome_check";--> statement-breakpoint
ALTER TABLE "aegis_teeml_audit_events" ADD CONSTRAINT "aegis_teeml_audit_events_outcome_check" CHECK ((
        ("outcome" IN ('TEEML_ALLOWED', 'TEETLS_HACKATHON_ALLOWED', 'TEEML_DENIED')
          AND "verification_id" IS NOT NULL
          AND "semantic_context_hash" IS NOT NULL
          AND "semantic_context_hash" ~ '^0x[0-9a-f]{64}$'
          AND "teeml_request_hash" IS NOT NULL
          AND "teeml_request_hash" ~ '^0x[0-9a-f]{64}$')
        OR
        ("outcome" = 'TEEML_FAILED'
          AND (("semantic_context_hash" IS NULL AND "teeml_request_hash" IS NULL)
            OR ("semantic_context_hash" ~ '^0x[0-9a-f]{64}$'
              AND "teeml_request_hash" ~ '^0x[0-9a-f]{64}$')))
      ));--> statement-breakpoint
CREATE OR REPLACE FUNCTION "aegis_enforce_teeml_audit_binding"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."outcome" IN (
    'TEEML_ALLOWED',
    'TEETLS_HACKATHON_ALLOWED',
    'TEEML_DENIED'
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM "aegis_teeml_verifications" AS "verification"
      JOIN "aegis_action_requests" AS "action"
        ON "action"."request_id" = "verification"."request_id"
      WHERE "verification"."verification_id" = NEW."verification_id"
        AND "verification"."request_id" = NEW."request_id"
        AND "verification"."precheck_id" = NEW."precheck_id"
        AND "verification"."agent_id" = NEW."agent_id"
        AND "verification"."policy_hash" = NEW."policy_hash"
        AND "verification"."action_hash" = NEW."action_hash"
        AND "verification"."semantic_context_hash" = NEW."semantic_context_hash"
        AND "verification"."teeml_request_hash" = NEW."teeml_request_hash"
        AND "verification"."reason_code" = NEW."reason_code"
        AND "action"."status"::text = NEW."outcome"
        AND (
          (NEW."outcome" = 'TEEML_ALLOWED'
            AND "verification"."status"::text = 'ALLOWED'
            AND "verification"."security_profile" = 'production-private-teeml'
            AND "verification"."trust_mode" = 'private'
            AND "verification"."verification_mode" = 'TeeML'
            AND "verification"."sealed_inference" = true
            AND "verification"."tee_verified" = true)
          OR
          (NEW."outcome" = 'TEETLS_HACKATHON_ALLOWED'
            AND "verification"."status"::text = 'TEETLS_HACKATHON_ALLOWED'
            AND "verification"."security_profile" = 'hackathon-testnet-teetls'
            AND "verification"."trust_mode" = 'verified'
            AND "verification"."verification_mode" = 'TeeTLS'
            AND "verification"."sealed_inference" = false
            AND "verification"."tee_verified" = true)
          OR
          (NEW."outcome" = 'TEEML_DENIED'
            AND "verification"."status"::text = 'DENIED'
            AND "verification"."verdict" = 'DENY'
            AND "verification"."tee_verified" = true)
        )
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        CONSTRAINT = 'aegis_teeml_audit_events_binding_check',
        MESSAGE = 'TeeML audit event does not match its final verification and action';
    END IF;
  ELSIF NEW."outcome" = 'TEEML_FAILED' THEN
    IF NEW."verification_id" IS NULL THEN
      IF NEW."semantic_context_hash" IS NOT NULL
        OR NEW."teeml_request_hash" IS NOT NULL
        OR NOT EXISTS (
          SELECT 1
          FROM "aegis_action_requests" AS "action"
          JOIN "aegis_precheck_records" AS "precheck"
            ON "precheck"."request_id" = "action"."request_id"
          WHERE "action"."request_id" = NEW."request_id"
            AND "precheck"."precheck_id" = NEW."precheck_id"
            AND "action"."agent_id" = NEW."agent_id"
            AND "action"."policy_hash" = NEW."policy_hash"
            AND "action"."action_hash" = NEW."action_hash"
            AND "action"."status"::text = 'TEEML_FAILED'
        )
      THEN
        RAISE EXCEPTION USING
          ERRCODE = '23514',
          CONSTRAINT = 'aegis_teeml_audit_events_binding_check',
          MESSAGE = 'Pre-context TeeML failure audit does not match its action';
      END IF;
    ELSIF NOT EXISTS (
      SELECT 1
      FROM "aegis_teeml_verifications" AS "verification"
      JOIN "aegis_action_requests" AS "action"
        ON "action"."request_id" = "verification"."request_id"
      WHERE "verification"."verification_id" = NEW."verification_id"
        AND "verification"."request_id" = NEW."request_id"
        AND "verification"."precheck_id" = NEW."precheck_id"
        AND "verification"."agent_id" = NEW."agent_id"
        AND "verification"."policy_hash" = NEW."policy_hash"
        AND "verification"."action_hash" = NEW."action_hash"
        AND "verification"."semantic_context_hash" = NEW."semantic_context_hash"
        AND "verification"."teeml_request_hash" = NEW."teeml_request_hash"
        AND "verification"."status"::text = 'FAILED'
        AND "verification"."technical_reason_code" = NEW."reason_code"
        AND "action"."status"::text = 'TEEML_FAILED'
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        CONSTRAINT = 'aegis_teeml_audit_events_binding_check',
        MESSAGE = 'TeeML failure audit does not match its verification and action';
    END IF;
  ELSE
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      CONSTRAINT = 'aegis_teeml_audit_events_binding_check',
      MESSAGE = 'Unsupported TeeML audit outcome';
  END IF;

  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "aegis_teeml_audit_events_binding_trigger"
AFTER INSERT OR UPDATE ON "aegis_teeml_audit_events"
FOR EACH ROW
EXECUTE FUNCTION "aegis_enforce_teeml_audit_binding"();--> statement-breakpoint
UPDATE "aegis_teeml_audit_events"
SET "outcome" = "outcome";--> statement-breakpoint
CREATE OR REPLACE FUNCTION "aegis_prevent_final_teeml_verification_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."status"::text IN (
    'ALLOWED',
    'TEETLS_HACKATHON_ALLOWED',
    'DENIED',
    'FAILED'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      CONSTRAINT = 'aegis_teeml_verifications_final_immutable',
      MESSAGE = 'Final TeeML verification artifacts are immutable';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "aegis_teeml_verifications_final_immutable_trigger"
BEFORE UPDATE OR DELETE ON "aegis_teeml_verifications"
FOR EACH ROW
EXECUTE FUNCTION "aegis_prevent_final_teeml_verification_mutation"();
