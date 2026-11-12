CREATE TYPE "public"."trial_source" AS ENUM('official', 'community');--> statement-breakpoint
CREATE TYPE "public"."trial_status" AS ENUM('pending', 'running', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "endurance_points" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"trial_id" integer NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"key" text NOT NULL,
	"value" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "locations" (
	"id" serial PRIMARY KEY NOT NULL,
	"provider_id" integer NOT NULL,
	"city" text NOT NULL,
	"country" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "metrics" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"trial_id" integer NOT NULL,
	"key" text NOT NULL,
	"value" double precision NOT NULL,
	"unit" text
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"provider_id" integer NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"vcpu" integer NOT NULL,
	"ram_gb" numeric(6, 2) NOT NULL,
	"disk_gb" integer NOT NULL,
	"disk_type" text,
	"price_usd" numeric(10, 2) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plans_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "providers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"website_url" text,
	"affiliate_url" text,
	"country" text,
	"is_sponsor" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "providers_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "raw_results" (
	"id" serial PRIMARY KEY NOT NULL,
	"trial_id" integer NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scores" (
	"id" serial PRIMARY KEY NOT NULL,
	"trial_id" integer NOT NULL,
	"cpu" double precision NOT NULL,
	"disk" double precision NOT NULL,
	"network" double precision NOT NULL,
	"stability" double precision NOT NULL,
	"overall" double precision NOT NULL,
	"price_weighted" double precision NOT NULL,
	"methodology_version" text NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scores_trial_id_unique" UNIQUE("trial_id")
);
--> statement-breakpoint
CREATE TABLE "trials" (
	"id" serial PRIMARY KEY NOT NULL,
	"plan_id" integer NOT NULL,
	"location_id" integer,
	"source" "trial_source" NOT NULL,
	"status" "trial_status" DEFAULT 'pending' NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"cpu_model" text,
	"ingest_token_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "endurance_points" ADD CONSTRAINT "endurance_points_trial_id_trials_id_fk" FOREIGN KEY ("trial_id") REFERENCES "public"."trials"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metrics" ADD CONSTRAINT "metrics_trial_id_trials_id_fk" FOREIGN KEY ("trial_id") REFERENCES "public"."trials"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_results" ADD CONSTRAINT "raw_results_trial_id_trials_id_fk" FOREIGN KEY ("trial_id") REFERENCES "public"."trials"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scores" ADD CONSTRAINT "scores_trial_id_trials_id_fk" FOREIGN KEY ("trial_id") REFERENCES "public"."trials"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trials" ADD CONSTRAINT "trials_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trials" ADD CONSTRAINT "trials_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "endurance_trial_key_time_idx" ON "endurance_points" USING btree ("trial_id","key","recorded_at");--> statement-breakpoint
CREATE UNIQUE INDEX "metrics_trial_key_idx" ON "metrics" USING btree ("trial_id","key");--> statement-breakpoint
CREATE INDEX "trials_plan_idx" ON "trials" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "trials_status_idx" ON "trials" USING btree ("status");