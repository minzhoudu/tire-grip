-- Custom migration (drizzle-kit can't express exclusion constraints).
-- Prevents double booking: two ACTIVE bookings (pending / confirmed / completed)
-- of the same shop on the same bay may not overlap. The range is half-open '[)',
-- so back-to-back bookings (10:00–10:30, 10:30–11:00) are allowed.
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
