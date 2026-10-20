CREATE TABLE "vehicle_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"label" text NOT NULL,
	"icon" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vehicle_types_shop_id_uq" UNIQUE("shop_id","id")
);
--> statement-breakpoint
ALTER TABLE "bookings" ALTER COLUMN "vehicle_type" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "service_prices" ALTER COLUMN "vehicle_type" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "vehicles" ALTER COLUMN "vehicle_type" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "vehicle_type_id" uuid;--> statement-breakpoint
ALTER TABLE "service_prices" ADD COLUMN "vehicle_type_id" uuid;--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "vehicle_type_id" uuid;--> statement-breakpoint
ALTER TABLE "vehicle_types" ADD CONSTRAINT "vehicle_types_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "vehicle_types_shop_idx" ON "vehicle_types" USING btree ("shop_id","sort_order");--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_vehicle_type_fk" FOREIGN KEY ("shop_id","vehicle_type_id") REFERENCES "public"."vehicle_types"("shop_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_prices" ADD CONSTRAINT "service_prices_vehicle_type_fk" FOREIGN KEY ("shop_id","vehicle_type_id") REFERENCES "public"."vehicle_types"("shop_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_vehicle_type_fk" FOREIGN KEY ("shop_id","vehicle_type_id") REFERENCES "public"."vehicle_types"("shop_id","id") ON DELETE no action ON UPDATE no action;