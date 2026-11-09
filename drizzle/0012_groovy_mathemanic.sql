ALTER TABLE "bookings" ALTER COLUMN "customer_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "guest_name" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_customer_or_admin" CHECK ("bookings"."customer_id" is not null or "bookings"."source" = 'admin');--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_guest_name_without_customer" CHECK ("bookings"."customer_id" is null or "bookings"."guest_name" is null);