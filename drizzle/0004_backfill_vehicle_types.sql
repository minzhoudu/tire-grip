-- Custom data migration: seed the 3 default vehicle types for every existing
-- shop (today every shop implicitly has exactly these), then point every
-- service_prices/vehicles/bookings row at the matching new row instead of
-- the old fixed enum value.
INSERT INTO "vehicle_types" ("shop_id", "label", "icon", "sort_order")
SELECT "id", 'Putničko', '🚗', 0 FROM "shops"
UNION ALL
SELECT "id", 'SUV / džip', '🚙', 1 FROM "shops"
UNION ALL
SELECT "id", 'Kombi', '🚐', 2 FROM "shops";
--> statement-breakpoint

UPDATE "service_prices" sp
SET "vehicle_type_id" = vt."id"
FROM "vehicle_types" vt
WHERE vt."shop_id" = sp."shop_id"
  AND vt."label" = (CASE sp."vehicle_type" WHEN 'car' THEN 'Putničko' WHEN 'suv' THEN 'SUV / džip' WHEN 'van' THEN 'Kombi' END);
--> statement-breakpoint

UPDATE "vehicles" v
SET "vehicle_type_id" = vt."id"
FROM "vehicle_types" vt
WHERE vt."shop_id" = v."shop_id"
  AND vt."label" = (CASE v."vehicle_type" WHEN 'car' THEN 'Putničko' WHEN 'suv' THEN 'SUV / džip' WHEN 'van' THEN 'Kombi' END);
--> statement-breakpoint

UPDATE "bookings" b
SET "vehicle_type_id" = vt."id"
FROM "vehicle_types" vt
WHERE vt."shop_id" = b."shop_id"
  AND vt."label" = (CASE b."vehicle_type" WHEN 'car' THEN 'Putničko' WHEN 'suv' THEN 'SUV / džip' WHEN 'van' THEN 'Kombi' END);
