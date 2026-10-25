ALTER TABLE "shops" ADD COLUMN "latitude" double precision;--> statement-breakpoint
ALTER TABLE "shops" ADD COLUMN "longitude" double precision;--> statement-breakpoint
ALTER TABLE "shops" ADD CONSTRAINT "shops_location_valid" CHECK (("shops"."latitude" is null and "shops"."longitude" is null) or ("shops"."latitude" between -90 and 90 and "shops"."longitude" between -180 and 180));