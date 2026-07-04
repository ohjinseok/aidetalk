ALTER TABLE "conversations" ALTER COLUMN "last_message_at" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "secret_enc" text;