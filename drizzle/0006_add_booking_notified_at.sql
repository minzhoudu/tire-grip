ALTER TABLE "bookings" ADD COLUMN "notified_at" timestamp with time zone;
--> statement-breakpoint
-- Existing bookings predate this column: treat them as already handled so the
-- admin panel doesn't retroactively flag months of history as "not notified".
UPDATE "bookings" SET "notified_at" = COALESCE("confirmed_at", "cancelled_at", "updated_at")
WHERE "status" IN ('confirmed', 'rejected', 'cancelled');