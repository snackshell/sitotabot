CREATE TYPE "public"."giveaway_status" AS ENUM('draft', 'active', 'ended', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."giveaway_type" AS ENUM('new_members', 'existing_members', 'multi_channel', 'all_members');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "channels" (
	"id" serial PRIMARY KEY NOT NULL,
	"telegram_id" bigint NOT NULL,
	"name" text NOT NULL,
	"username" text,
	"member_count" integer,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "giveaway_channels" (
	"giveaway_id" uuid NOT NULL,
	"channel_id" integer NOT NULL,
	CONSTRAINT "giveaway_channels_giveaway_id_channel_id_pk" PRIMARY KEY("giveaway_id","channel_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "giveaways" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" integer NOT NULL,
	"created_by" integer NOT NULL,
	"prize" text NOT NULL,
	"description" text,
	"type" "giveaway_type" DEFAULT 'all_members' NOT NULL,
	"start_time" timestamp with time zone NOT NULL,
	"end_time" timestamp with time zone NOT NULL,
	"max_winners" integer DEFAULT 1 NOT NULL,
	"min_account_age_days" integer,
	"join_date_after" timestamp with time zone,
	"join_date_before" timestamp with time zone,
	"weight_by_activity" boolean DEFAULT false NOT NULL,
	"status" "giveaway_status" DEFAULT 'draft' NOT NULL,
	"seed" text,
	"participant_hash" text,
	"proof_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "participants" (
	"id" serial PRIMARY KEY NOT NULL,
	"giveaway_id" uuid NOT NULL,
	"user_id" integer NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_eligible" boolean DEFAULT true NOT NULL,
	"eligibility_reason" text,
	"message_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"telegram_id" bigint NOT NULL,
	"username" text,
	"first_name" text NOT NULL,
	"last_name" text,
	"account_created" timestamp with time zone,
	"first_seen" timestamp with time zone DEFAULT now() NOT NULL,
	"is_bot" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "winners" (
	"id" serial PRIMARY KEY NOT NULL,
	"giveaway_id" uuid NOT NULL,
	"user_id" integer NOT NULL,
	"draw_time" timestamp with time zone DEFAULT now() NOT NULL,
	"position" integer NOT NULL,
	"proof_hash" text NOT NULL,
	"is_reroll" boolean DEFAULT false NOT NULL,
	"reroll_reason" text,
	"notified" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "giveaway_channels" ADD CONSTRAINT "giveaway_channels_giveaway_id_giveaways_id_fk" FOREIGN KEY ("giveaway_id") REFERENCES "public"."giveaways"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "giveaway_channels" ADD CONSTRAINT "giveaway_channels_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "giveaways" ADD CONSTRAINT "giveaways_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "giveaways" ADD CONSTRAINT "giveaways_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "participants" ADD CONSTRAINT "participants_giveaway_id_giveaways_id_fk" FOREIGN KEY ("giveaway_id") REFERENCES "public"."giveaways"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "participants" ADD CONSTRAINT "participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "winners" ADD CONSTRAINT "winners_giveaway_id_giveaways_id_fk" FOREIGN KEY ("giveaway_id") REFERENCES "public"."giveaways"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "winners" ADD CONSTRAINT "winners_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "channels_telegram_id_idx" ON "channels" USING btree ("telegram_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "participants_giveaway_user_idx" ON "participants" USING btree ("giveaway_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_telegram_id_idx" ON "users" USING btree ("telegram_id");