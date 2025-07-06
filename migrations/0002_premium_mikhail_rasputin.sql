ALTER TABLE "transactions" ADD COLUMN "is_internal_transfer" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "matched_transfer_id" integer;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "transfer_detection_confidence" text;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "transfer_fee" numeric(12, 2);