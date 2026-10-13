-- Custom migration: prevent double booking at the database level.
--
-- Each booking occupies one bay for [starts_at, ends_at). Two ACTIVE bookings
-- (pending / confirmed / completed) of the same shop on the same bay may not
-- overlap in time. Back-to-back bookings (10:00–10:30 and 10:30–11:00) are
-- allowed because the range is half-open '[)'.
--
-- Drizzle can't express exclusion constraints, so this lives in a custom
-- migration. Create it once with:
--   pnpm drizzle-kit generate --custom --name=booking_no_overlap
-- and paste this file's contents into the generated SQL file.

CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_no_overlap"
  EXCLUDE USING gist (
    "shop_id" WITH =,
    "bay" WITH =,
    tstzrange("starts_at", "ends_at", '[)') WITH &&
  )
  WHERE ("status" IN ('pending', 'confirmed', 'completed'));
