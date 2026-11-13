ALTER TABLE "scores" ALTER COLUMN "cpu" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "scores" ALTER COLUMN "disk" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "scores" ALTER COLUMN "network" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "scores" ALTER COLUMN "stability" DROP NOT NULL;