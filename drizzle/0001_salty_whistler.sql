ALTER TABLE "giveaways" ADD COLUMN "creator_contact_username" text;--> statement-breakpoint
ALTER TABLE "giveaways" ADD COLUMN "winners_public" boolean DEFAULT false NOT NULL;