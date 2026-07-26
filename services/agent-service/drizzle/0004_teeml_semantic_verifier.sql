CREATE TYPE "public"."aegis_teeml_verification_status" AS ENUM('PROCESSING', 'ALLOWED', 'DENIED', 'FAILED');--> statement-breakpoint
ALTER TYPE "public"."aegis_action_request_status" ADD VALUE 'TEEML_PROCESSING';--> statement-breakpoint
ALTER TYPE "public"."aegis_action_request_status" ADD VALUE 'TEEML_ALLOWED';--> statement-breakpoint
ALTER TYPE "public"."aegis_action_request_status" ADD VALUE 'TEEML_DENIED';--> statement-breakpoint
ALTER TYPE "public"."aegis_action_request_status" ADD VALUE 'TEEML_FAILED';--> statement-breakpoint
CREATE TABLE "aegis_agent_semantic_profiles" (
	"agent_id" text PRIMARY KEY NOT NULL,
	"agentic_id" text NOT NULL,
	"contract_address" text NOT NULL,
	"token_id" text NOT NULL,
	"metadata_hash" text NOT NULL,
	"capability_ids" jsonb NOT NULL,
	"registered_at" integer NOT NULL,
	"updated_at" integer NOT NULL,
	CONSTRAINT "aegis_agent_semantic_profiles_identity_check" CHECK ((
        "contract_address" ~ '^0x[0-9a-f]{40}$'
        AND "token_id" ~ '^(0|[1-9][0-9]*)$'
        AND "metadata_hash" ~ '^0x[0-9a-f]{64}$'
        AND jsonb_typeof("capability_ids") = 'array'
        AND jsonb_array_length("capability_ids") BETWEEN 1 AND 20
      ))
);
--> statement-breakpoint
CREATE TABLE "aegis_teeml_audit_events" (
	"event_id" text PRIMARY KEY NOT NULL,
	"verification_id" text,
	"request_id" text NOT NULL,
	"precheck_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"policy_hash" text NOT NULL,
	"action_hash" text NOT NULL,
	"semantic_context_hash" text,
	"teeml_request_hash" text,
	"outcome" text NOT NULL,
	"reason_code" text NOT NULL,
	"occurred_at" integer NOT NULL,
	"retention_until" integer NOT NULL,
	CONSTRAINT "aegis_teeml_audit_events_outcome_check" CHECK ((
        ("outcome" IN ('TEEML_ALLOWED', 'TEEML_DENIED')
          AND "verification_id" IS NOT NULL
          AND "semantic_context_hash" ~ '^0x[0-9a-f]{64}$'
          AND "teeml_request_hash" ~ '^0x[0-9a-f]{64}$')
        OR
        ("outcome" = 'TEEML_FAILED'
          AND (("semantic_context_hash" IS NULL AND "teeml_request_hash" IS NULL)
            OR ("semantic_context_hash" ~ '^0x[0-9a-f]{64}$'
              AND "teeml_request_hash" ~ '^0x[0-9a-f]{64}$')))
      ))
);
--> statement-breakpoint
CREATE TABLE "aegis_teeml_verifications" (
	"verification_id" text PRIMARY KEY NOT NULL,
	"request_id" text NOT NULL,
	"precheck_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"agentic_id" text NOT NULL,
	"policy_id" text NOT NULL,
	"policy_version" integer NOT NULL,
	"policy_hash" text NOT NULL,
	"action_hash" text NOT NULL,
	"semantic_context_hash" text NOT NULL,
	"teeml_request_hash" text NOT NULL,
	"status" "aegis_teeml_verification_status" NOT NULL,
	"verdict" text,
	"reason_code" text,
	"technical_reason_code" text,
	"provider_address" text,
	"model_id" text,
	"trust_mode" text,
	"tee_verified" boolean,
	"response_id" text,
	"response_hash" text,
	"trace_hash" text,
	"prompt_tokens" integer,
	"completion_tokens" integer,
	"latency_ms" integer,
	"evaluated_at" integer,
	"created_at" integer NOT NULL,
	"updated_at" integer NOT NULL,
	CONSTRAINT "aegis_teeml_verifications_context_commitment_check" CHECK ((
        "policy_hash" ~ '^0x[0-9a-f]{64}$'
        AND "action_hash" ~ '^0x[0-9a-f]{64}$'
        AND "semantic_context_hash" ~ '^0x[0-9a-f]{64}$'
        AND "teeml_request_hash" ~ '^0x[0-9a-f]{64}$'
      )),
	CONSTRAINT "aegis_teeml_verifications_result_check" CHECK ((
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
          AND "trust_mode" = 'private'
          AND "tee_verified" = true
          AND "response_hash" ~ '^0x[0-9a-f]{64}$'
          AND "latency_ms" >= 0
          AND "evaluated_at" IS NOT NULL)
        OR
        ("status" = 'FAILED'
          AND "verdict" IS NULL
          AND "reason_code" IS NULL
          AND "technical_reason_code" IS NOT NULL)
      ))
);
--> statement-breakpoint
ALTER TABLE "aegis_agent_semantic_profiles" ADD CONSTRAINT "aegis_agent_semantic_profiles_agent_id_aegis_agents_agent_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."aegis_agents"("agent_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aegis_teeml_audit_events" ADD CONSTRAINT "aegis_teeml_audit_events_verification_id_aegis_teeml_verifications_verification_id_fk" FOREIGN KEY ("verification_id") REFERENCES "public"."aegis_teeml_verifications"("verification_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aegis_teeml_verifications" ADD CONSTRAINT "aegis_teeml_verifications_request_id_aegis_action_requests_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."aegis_action_requests"("request_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aegis_teeml_verifications" ADD CONSTRAINT "aegis_teeml_verifications_precheck_id_aegis_precheck_records_precheck_id_fk" FOREIGN KEY ("precheck_id") REFERENCES "public"."aegis_precheck_records"("precheck_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "aegis_agent_semantic_profiles_agentic_id_unique" ON "aegis_agent_semantic_profiles" USING btree ("agentic_id");--> statement-breakpoint
CREATE UNIQUE INDEX "aegis_teeml_audit_events_request_unique" ON "aegis_teeml_audit_events" USING btree ("request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "aegis_teeml_verifications_request_unique" ON "aegis_teeml_verifications" USING btree ("request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "aegis_teeml_verifications_precheck_unique" ON "aegis_teeml_verifications" USING btree ("precheck_id");
