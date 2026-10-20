-- Database constraint tests: double booking, tenant isolation, validation.
-- Runs inside a transaction and ROLLS BACK, so it is safe on a dev database.
--   pnpm db:test      (needs DATABASE_URL and an up-to-date schema)
\set ON_ERROR_STOP on
BEGIN;

-- helper: assert a statement fails with the expected constraint
CREATE FUNCTION pg_temp.expect_fail(stmt text, constraint_name text) RETURNS void AS $$
DECLARE c text;
BEGIN
  BEGIN
    EXECUTE stmt;
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS c = CONSTRAINT_NAME;
    IF c = constraint_name THEN RAISE NOTICE 'OK  blocked by %', c; RETURN; END IF;
    RAISE EXCEPTION 'FAIL expected % but got % (%)', constraint_name, c, SQLERRM;
  END;
  RAISE EXCEPTION 'FAIL statement succeeded, expected %: %', constraint_name, stmt;
END $$ LANGUAGE plpgsql;

-- two shops
INSERT INTO shops (id, slug, name, bays, plan) VALUES
 ('00000000-0000-0000-0000-00000000000a','test-a','Vulkanizer Brzi Točak',2,'internal'),
 ('00000000-0000-0000-0000-00000000000b','test-b','Drugi servis',1,'trial');
INSERT INTO services (id, shop_id, kind, name, duration_min) VALUES
 ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000000a','seasonal_swap','Zamena guma',30),
 ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-00000000000b','seasonal_swap','Zamena guma',30);
INSERT INTO vehicle_types (id, shop_id, label, icon) VALUES
 ('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-00000000000a','Putničko','🚗'),
 ('00000000-0000-0000-0000-0000000000e2','00000000-0000-0000-0000-00000000000a','SUV / džip','🚙'),
 ('00000000-0000-0000-0000-0000000000e3','00000000-0000-0000-0000-00000000000b','Putničko','🚗');
INSERT INTO service_prices (shop_id, service_id, vehicle_type_id, price_rsd, duration_min) VALUES
 ('00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000e1',1500,null),
 ('00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000e2',2000,40);
INSERT INTO customers (id, shop_id, name, phone) VALUES
 ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-00000000000a','Marko','+381641234567'),
 ('00000000-0000-0000-0000-0000000000c2','00000000-0000-0000-0000-00000000000b','Jovan','+381651112223');
INSERT INTO vehicles (id, shop_id, customer_id, label, vehicle_type_id) VALUES
 ('00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000c1','Golf 7','00000000-0000-0000-0000-0000000000e1');

-- valid bookings: same time on two different bays, and back-to-back on the same bay
INSERT INTO bookings (shop_id, customer_id, vehicle_id, service_id, vehicle_type_id, price_rsd, duration_min, starts_at, ends_at, bay) VALUES
 ('00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000e1',1500,30,'2026-10-16 08:30+02','2026-10-16 09:00+02',1),
 ('00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000c1',null,'00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000e1',1500,30,'2026-10-16 08:30+02','2026-10-16 09:00+02',2),
 ('00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000c1',null,'00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000e1',1500,30,'2026-10-16 09:00+02','2026-10-16 09:30+02',1);

-- 1) overlap on the same bay is rejected
SELECT pg_temp.expect_fail($s$INSERT INTO bookings (shop_id, customer_id, service_id, vehicle_type_id, price_rsd, duration_min, starts_at, ends_at, bay)
 VALUES ('00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000e1',1500,30,'2026-10-16 08:45+02','2026-10-16 09:15+02',1)$s$, 'bookings_no_overlap');

-- 2) a cancelled booking frees the slot
UPDATE bookings SET status='cancelled' WHERE bay=2;
INSERT INTO bookings (shop_id, customer_id, service_id, vehicle_type_id, price_rsd, duration_min, starts_at, ends_at, bay)
 VALUES ('00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000e1',1500,30,'2026-10-16 08:30+02','2026-10-16 09:00+02',2);
SELECT 'OK  cancelled booking freed bay 2' AS result;

-- 3) re-activating the cancelled one now collides
SELECT pg_temp.expect_fail($s$UPDATE bookings SET status='pending' WHERE status='cancelled'$s$, 'bookings_no_overlap');

-- 4) another shop's identical time & bay is fine (tenant-scoped constraint)
INSERT INTO bookings (shop_id, customer_id, service_id, vehicle_type_id, price_rsd, duration_min, starts_at, ends_at, bay)
 VALUES ('00000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-0000000000c2','00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000e3',1200,30,'2026-10-16 08:30+02','2026-10-16 09:00+02',1);
SELECT 'OK  other shop can book same time/bay' AS result;

-- 5) cross-tenant references are impossible
SELECT pg_temp.expect_fail($s$INSERT INTO bookings (shop_id, customer_id, service_id, vehicle_type_id, price_rsd, duration_min, starts_at, ends_at, bay)
 VALUES ('00000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000e3',1,30,'2026-10-17 08:30+02','2026-10-17 09:00+02',1)$s$, 'bookings_customer_fk');
SELECT pg_temp.expect_fail($s$INSERT INTO bookings (shop_id, customer_id, service_id, vehicle_type_id, price_rsd, duration_min, starts_at, ends_at, bay)
 VALUES ('00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000e1',1,30,'2026-10-17 08:30+02','2026-10-17 09:00+02',1)$s$, 'bookings_service_fk');
SELECT pg_temp.expect_fail($s$INSERT INTO service_prices (shop_id, service_id, vehicle_type_id, price_rsd)
 VALUES ('00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000e2',100)$s$, 'service_prices_service_fk');

-- 6) data validation
SELECT pg_temp.expect_fail($s$INSERT INTO customers (shop_id, name, phone) VALUES ('00000000-0000-0000-0000-00000000000a','X','064 123 4567')$s$, 'customers_phone_e164');
SELECT pg_temp.expect_fail($s$INSERT INTO customers (shop_id, name, phone) VALUES ('00000000-0000-0000-0000-00000000000a','Marko 2','+381641234567')$s$, 'customers_shop_phone_uq');
SELECT pg_temp.expect_fail($s$INSERT INTO shops (slug, name) VALUES ('Brzi Tocak','x')$s$, 'shops_slug_format');
SELECT pg_temp.expect_fail($s$INSERT INTO shops (slug, name) VALUES ('test-a','dup')$s$, 'shops_slug_uq');
SELECT pg_temp.expect_fail($s$INSERT INTO working_hours (shop_id, weekday, opens_at, closes_at) VALUES ('00000000-0000-0000-0000-00000000000a',8,'08:00','17:00')$s$, 'working_hours_weekday_range');
SELECT pg_temp.expect_fail($s$INSERT INTO working_hours (shop_id, weekday, opens_at, closes_at) VALUES ('00000000-0000-0000-0000-00000000000a',1,'17:00','08:00')$s$, 'working_hours_order');
SELECT pg_temp.expect_fail($s$INSERT INTO schedule_exceptions (shop_id, date, closed, opens_at, closes_at) VALUES ('00000000-0000-0000-0000-00000000000a','2026-11-11',true,'08:00','12:00')$s$, 'schedule_exceptions_hours');
SELECT pg_temp.expect_fail($s$INSERT INTO bookings (shop_id, customer_id, service_id, vehicle_type_id, price_rsd, duration_min, starts_at, ends_at, bay)
 VALUES ('00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000e1',1500,30,'2026-10-18 09:00+02','2026-10-18 08:30+02',1)$s$, 'bookings_time_order');
SELECT pg_temp.expect_fail($s$INSERT INTO service_prices (shop_id, service_id, vehicle_type_id, price_rsd)
 VALUES ('00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000e1',999)$s$, 'service_prices_service_vehicle_uq');

-- 7) reminder token uniqueness & one message per customer per campaign
INSERT INTO reminder_campaigns (id, shop_id, name, season, message_template) VALUES
 ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-00000000000a','Zima 2026','winter','Zdravo {ime}…');
INSERT INTO reminder_messages (shop_id, campaign_id, customer_id, token) VALUES
 ('00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000c1','tok1');
SELECT pg_temp.expect_fail($s$INSERT INTO reminder_messages (shop_id, campaign_id, customer_id, token) VALUES
 ('00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000c1','tok2')$s$, 'reminder_messages_campaign_customer_uq');

-- 8) services in use can't be hard-deleted (history stays intact) …
SELECT pg_temp.expect_fail($s$DELETE FROM services WHERE id='00000000-0000-0000-0000-0000000000a1'$s$, 'bookings_service_fk');
-- … and a shop is purged by deleting its bookings first, then the shop (cascades the rest)
DELETE FROM bookings WHERE shop_id='00000000-0000-0000-0000-00000000000b';
DELETE FROM shops WHERE slug='test-b';
SELECT CASE WHEN (SELECT count(*) FROM bookings WHERE shop_id='00000000-0000-0000-0000-00000000000b')=0
            AND (SELECT count(*) FROM customers WHERE shop_id='00000000-0000-0000-0000-00000000000b')=0
       THEN 'OK  shop delete cascades' ELSE 'FAIL cascade' END AS result;

ROLLBACK;
