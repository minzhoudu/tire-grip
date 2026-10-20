ALTER TABLE "service_prices" DROP CONSTRAINT "service_prices_service_vehicle_uq";--> statement-breakpoint
ALTER TABLE "bookings" ALTER COLUMN "vehicle_type_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "service_prices" ALTER COLUMN "vehicle_type_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "vehicles" ALTER COLUMN "vehicle_type_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" DROP COLUMN "vehicle_type";--> statement-breakpoint
ALTER TABLE "service_prices" DROP COLUMN "vehicle_type";--> statement-breakpoint
ALTER TABLE "vehicles" DROP COLUMN "vehicle_type";--> statement-breakpoint
ALTER TABLE "service_prices" ADD CONSTRAINT "service_prices_service_vehicle_uq" UNIQUE("service_id","vehicle_type_id");--> statement-breakpoint
DROP TYPE "public"."vehicle_type";