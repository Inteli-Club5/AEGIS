CREATE TYPE "public"."aegis_agentic_id_registration_status" AS ENUM('PROCESSING', 'COMPLETED', 'UNKNOWN');--> statement-breakpoint
CREATE TABLE "aegis_agentic_id_registrations" (
	"agent_id" text PRIMARY KEY NOT NULL,
	"registration_hash" text NOT NULL,
	"status" "aegis_agentic_id_registration_status" NOT NULL,
	"metadata_uri" text,
	"explorer_url" text,
	"created_at" integer NOT NULL,
	"updated_at" integer NOT NULL,
	"completed_at" integer,
	CONSTRAINT "aegis_agentic_id_registrations_hash_check" CHECK ("registration_hash" ~ '^0x[0-9a-f]{64}$'),
	CONSTRAINT "aegis_agentic_id_registrations_completion_check" CHECK ((
        (
          "status" = 'COMPLETED'
          AND "metadata_uri" IS NOT NULL
          AND length("metadata_uri") BETWEEN 1 AND 2048
          AND "explorer_url" IS NOT NULL
          AND length("explorer_url") BETWEEN 1 AND 2048
          AND "completed_at" IS NOT NULL
        )
        OR
        (
          "status" IN ('PROCESSING', 'UNKNOWN')
          AND "metadata_uri" IS NULL
          AND "explorer_url" IS NULL
          AND "completed_at" IS NULL
        )
      ))
);
--> statement-breakpoint
ALTER TABLE "aegis_agentic_id_registrations" ADD CONSTRAINT "aegis_agentic_id_registrations_agent_id_aegis_agents_agent_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."aegis_agents"("agent_id") ON DELETE no action ON UPDATE no action;
