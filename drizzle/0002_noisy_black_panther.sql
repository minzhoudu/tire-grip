CREATE TYPE "public"."signup_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "platform_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_user_id" text NOT NULL,
	"shop_id" uuid,
	"action" text NOT NULL,
	"details" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_impersonation_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_user_id" text NOT NULL,
	"shop_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "shops" ADD COLUMN "signup_status" "signup_status" DEFAULT 'approved' NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_audit_log" ADD CONSTRAINT "platform_audit_log_admin_user_id_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_audit_log" ADD CONSTRAINT "platform_audit_log_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_impersonation_sessions" ADD CONSTRAINT "platform_impersonation_sessions_admin_user_id_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_impersonation_sessions" ADD CONSTRAINT "platform_impersonation_sessions_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "platform_audit_log_shop_idx" ON "platform_audit_log" USING btree ("shop_id");--> statement-breakpoint
CREATE INDEX "platform_audit_log_admin_idx" ON "platform_audit_log" USING btree ("admin_user_id");--> statement-breakpoint
CREATE INDEX "platform_impersonation_shop_idx" ON "platform_impersonation_sessions" USING btree ("shop_id");--> statement-breakpoint
CREATE INDEX "platform_impersonation_admin_idx" ON "platform_impersonation_sessions" USING btree ("admin_user_id");