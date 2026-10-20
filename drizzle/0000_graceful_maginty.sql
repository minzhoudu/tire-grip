CREATE TYPE "public"."booking_source" AS ENUM('web', 'admin', 'reminder', 'viber', 'whatsapp');--> statement-breakpoint
CREATE TYPE "public"."booking_status" AS ENUM('pending', 'confirmed', 'completed', 'cancelled', 'rejected', 'no_show');--> statement-breakpoint
CREATE TYPE "public"."campaign_status" AS ENUM('draft', 'active', 'done');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('owner', 'staff');--> statement-breakpoint
CREATE TYPE "public"."reminder_channel" AS ENUM('wa_link', 'viber_link', 'sms', 'ics');--> statement-breakpoint
CREATE TYPE "public"."reminder_status" AS ENUM('queued', 'sent', 'clicked', 'booked', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."season" AS ENUM('winter', 'summer');--> statement-breakpoint
CREATE TYPE "public"."service_kind" AS ENUM('seasonal_swap', 'mount_balance', 'new_tires', 'repair', 'storage', 'other');--> statement-breakpoint
CREATE TYPE "public"."shop_plan" AS ENUM('internal', 'trial', 'basic', 'pro');--> statement-breakpoint
CREATE TYPE "public"."vehicle_type" AS ENUM('car', 'suv', 'van');--> statement-breakpoint
CREATE TABLE "blocked_times" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"bay" smallint,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blocked_times_order" CHECK ("blocked_times"."starts_at" < "blocked_times"."ends_at"),
	CONSTRAINT "blocked_times_bay_range" CHECK ("blocked_times"."bay" is null or "blocked_times"."bay" >= 1)
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"vehicle_id" uuid,
	"service_id" uuid NOT NULL,
	"vehicle_type" "vehicle_type" NOT NULL,
	"price_rsd" integer NOT NULL,
	"duration_min" smallint NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"bay" smallint NOT NULL,
	"status" "booking_status" DEFAULT 'pending' NOT NULL,
	"source" "booking_source" DEFAULT 'web' NOT NULL,
	"customer_note" text,
	"internal_note" text,
	"cancel_reason" text,
	"confirmed_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bookings_time_order" CHECK ("bookings"."starts_at" < "bookings"."ends_at"),
	CONSTRAINT "bookings_bay_positive" CHECK ("bookings"."bay" >= 1),
	CONSTRAINT "bookings_price_nonneg" CHECK ("bookings"."price_rsd" >= 0)
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"reminder_consent" boolean DEFAULT false NOT NULL,
	"reminder_consent_at" timestamp with time zone,
	"opted_out_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customers_shop_id_uq" UNIQUE("shop_id","id"),
	CONSTRAINT "customers_shop_phone_uq" UNIQUE("shop_id","phone"),
	CONSTRAINT "customers_phone_e164" CHECK ("customers"."phone" ~ '^\+[1-9][0-9]{7,14}$')
);
--> statement-breakpoint
CREATE TABLE "reminder_campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"name" text NOT NULL,
	"season" "season" NOT NULL,
	"channel" "reminder_channel" DEFAULT 'wa_link' NOT NULL,
	"message_template" text NOT NULL,
	"status" "campaign_status" DEFAULT 'draft' NOT NULL,
	"daily_limit" smallint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reminder_campaigns_shop_id_uq" UNIQUE("shop_id","id")
);
--> statement-breakpoint
CREATE TABLE "reminder_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"vehicle_id" uuid,
	"token" text NOT NULL,
	"status" "reminder_status" DEFAULT 'queued' NOT NULL,
	"sent_at" timestamp with time zone,
	"clicked_at" timestamp with time zone,
	"booking_id" uuid,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reminder_messages_campaign_customer_uq" UNIQUE("campaign_id","customer_id")
);
--> statement-breakpoint
CREATE TABLE "schedule_exceptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"date" date NOT NULL,
	"closed" boolean DEFAULT true NOT NULL,
	"opens_at" time,
	"closes_at" time,
	"note" text,
	CONSTRAINT "schedule_exceptions_hours" CHECK (("schedule_exceptions"."closed" and "schedule_exceptions"."opens_at" is null and "schedule_exceptions"."closes_at" is null)
          or (not "schedule_exceptions"."closed" and "schedule_exceptions"."opens_at" is not null and "schedule_exceptions"."closes_at" is not null and "schedule_exceptions"."opens_at" < "schedule_exceptions"."closes_at"))
);
--> statement-breakpoint
CREATE TABLE "service_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"vehicle_type" "vehicle_type" NOT NULL,
	"price_rsd" integer NOT NULL,
	"duration_min" smallint,
	"note" text,
	CONSTRAINT "service_prices_service_vehicle_uq" UNIQUE("service_id","vehicle_type"),
	CONSTRAINT "service_prices_price_nonneg" CHECK ("service_prices"."price_rsd" >= 0),
	CONSTRAINT "service_prices_duration_range" CHECK ("service_prices"."duration_min" is null or "service_prices"."duration_min" between 5 and 480)
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"kind" "service_kind" NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"icon" text,
	"duration_min" smallint DEFAULT 30 NOT NULL,
	"bookable" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "services_shop_id_uq" UNIQUE("shop_id","id"),
	CONSTRAINT "services_duration_range" CHECK ("services"."duration_min" between 5 and 480)
);
--> statement-breakpoint
CREATE TABLE "shop_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" "member_role" DEFAULT 'owner' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shop_members_shop_user_uq" UNIQUE("shop_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "shops" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"city" text,
	"address" text,
	"phone" text,
	"timezone" text DEFAULT 'Europe/Belgrade' NOT NULL,
	"plan" "shop_plan" DEFAULT 'trial' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"bays" smallint DEFAULT 1 NOT NULL,
	"slot_step_min" smallint DEFAULT 30 NOT NULL,
	"booking_horizon_days" smallint DEFAULT 14 NOT NULL,
	"min_notice_min" smallint DEFAULT 60 NOT NULL,
	"auto_confirm" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shops_slug_format" CHECK ("shops"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "shops_bays_range" CHECK ("shops"."bays" between 1 and 20),
	CONSTRAINT "shops_slot_step_range" CHECK ("shops"."slot_step_min" between 5 and 240),
	CONSTRAINT "shops_horizon_range" CHECK ("shops"."booking_horizon_days" between 1 and 120),
	CONSTRAINT "shops_min_notice_range" CHECK ("shops"."min_notice_min" between 0 and 2880)
);
--> statement-breakpoint
CREATE TABLE "tire_storage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"vehicle_id" uuid,
	"season" "season" NOT NULL,
	"tire_size" text,
	"quantity" smallint DEFAULT 4 NOT NULL,
	"with_rims" boolean DEFAULT true NOT NULL,
	"location" text,
	"notes" text,
	"stored_at" timestamp with time zone DEFAULT now() NOT NULL,
	"retrieved_at" timestamp with time zone,
	CONSTRAINT "tire_storage_quantity_range" CHECK ("tire_storage"."quantity" between 1 and 10)
);
--> statement-breakpoint
CREATE TABLE "vehicles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"label" text NOT NULL,
	"vehicle_type" "vehicle_type" DEFAULT 'car' NOT NULL,
	"plate" text,
	"tire_size" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vehicles_shop_id_uq" UNIQUE("shop_id","id")
);
--> statement-breakpoint
CREATE TABLE "working_hours" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"weekday" smallint NOT NULL,
	"opens_at" time NOT NULL,
	"closes_at" time NOT NULL,
	CONSTRAINT "working_hours_weekday_range" CHECK ("working_hours"."weekday" between 1 and 7),
	CONSTRAINT "working_hours_order" CHECK ("working_hours"."opens_at" < "working_hours"."closes_at")
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "blocked_times" ADD CONSTRAINT "blocked_times_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_customer_fk" FOREIGN KEY ("shop_id","customer_id") REFERENCES "public"."customers"("shop_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_vehicle_fk" FOREIGN KEY ("shop_id","vehicle_id") REFERENCES "public"."vehicles"("shop_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_service_fk" FOREIGN KEY ("shop_id","service_id") REFERENCES "public"."services"("shop_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_campaigns" ADD CONSTRAINT "reminder_campaigns_shop_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_messages" ADD CONSTRAINT "reminder_messages_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_messages" ADD CONSTRAINT "reminder_messages_campaign_fk" FOREIGN KEY ("shop_id","campaign_id") REFERENCES "public"."reminder_campaigns"("shop_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_messages" ADD CONSTRAINT "reminder_messages_customer_fk" FOREIGN KEY ("shop_id","customer_id") REFERENCES "public"."customers"("shop_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_messages" ADD CONSTRAINT "reminder_messages_vehicle_fk" FOREIGN KEY ("shop_id","vehicle_id") REFERENCES "public"."vehicles"("shop_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_exceptions" ADD CONSTRAINT "schedule_exceptions_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_prices" ADD CONSTRAINT "service_prices_service_fk" FOREIGN KEY ("shop_id","service_id") REFERENCES "public"."services"("shop_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_members" ADD CONSTRAINT "shop_members_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_members" ADD CONSTRAINT "shop_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tire_storage" ADD CONSTRAINT "tire_storage_customer_fk" FOREIGN KEY ("shop_id","customer_id") REFERENCES "public"."customers"("shop_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tire_storage" ADD CONSTRAINT "tire_storage_vehicle_fk" FOREIGN KEY ("shop_id","vehicle_id") REFERENCES "public"."vehicles"("shop_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_customer_fk" FOREIGN KEY ("shop_id","customer_id") REFERENCES "public"."customers"("shop_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "working_hours" ADD CONSTRAINT "working_hours_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "blocked_times_shop_start_idx" ON "blocked_times" USING btree ("shop_id","starts_at");--> statement-breakpoint
CREATE INDEX "bookings_shop_start_idx" ON "bookings" USING btree ("shop_id","starts_at");--> statement-breakpoint
CREATE INDEX "bookings_shop_status_start_idx" ON "bookings" USING btree ("shop_id","status","starts_at");--> statement-breakpoint
CREATE INDEX "bookings_customer_idx" ON "bookings" USING btree ("customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reminder_messages_token_uq" ON "reminder_messages" USING btree ("token");--> statement-breakpoint
CREATE INDEX "reminder_messages_campaign_status_idx" ON "reminder_messages" USING btree ("campaign_id","status");--> statement-breakpoint
CREATE INDEX "schedule_exceptions_shop_date_idx" ON "schedule_exceptions" USING btree ("shop_id","date");--> statement-breakpoint
CREATE INDEX "services_shop_idx" ON "services" USING btree ("shop_id","sort_order");--> statement-breakpoint
CREATE INDEX "shop_members_user_idx" ON "shop_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shops_slug_uq" ON "shops" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "tire_storage_shop_active_idx" ON "tire_storage" USING btree ("shop_id") WHERE "tire_storage"."retrieved_at" is null;--> statement-breakpoint
CREATE INDEX "vehicles_customer_idx" ON "vehicles" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "working_hours_shop_day_idx" ON "working_hours" USING btree ("shop_id","weekday");--> statement-breakpoint
CREATE INDEX "accounts_user_id_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verifications_identifier_idx" ON "verifications" USING btree ("identifier");