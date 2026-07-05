CREATE TABLE "instance_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"anonymous_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
