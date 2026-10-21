/**
 * Moj Vulkanizer — database schema (Drizzle ORM, PostgreSQL 16)
 *
 * Multi-tenant: every business table carries `shop_id`. Child rows reference
 * their parents with COMPOSITE foreign keys (shop_id, id), so the database
 * itself guarantees that a booking can never point at another shop's
 * customer, vehicle or service.
 *
 * Double booking is prevented in the database, not only in the app:
 * each booking occupies one "bay" (boks) for [starts_at, ends_at), and an
 * exclusion constraint forbids two active bookings on the same bay with
 * overlapping time ranges. See drizzle/0001_booking_no_overlap.sql.
 *
 * History is protected: a service or vehicle that has bookings can't be
 * hard-deleted (deactivate it with is_active instead). To purge a whole shop,
 * delete its bookings first, then the shop row — everything else cascades.
 *
 * Money is stored as whole dinars (integer). Times are timestamptz; the shop's
 * IANA timezone is used to interpret working hours.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  smallint,
  text,
  time,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./auth-schema";

export * from "./auth-schema";

/* ----------------------------------------------------------------- enums */

export const shopPlan = pgEnum("shop_plan", ["internal", "trial", "basic", "pro"]);
export const signupStatus = pgEnum("signup_status", ["pending", "approved", "rejected"]);
export const memberRole = pgEnum("member_role", ["owner", "staff"]);
export const serviceKind = pgEnum("service_kind", [
  "seasonal_swap", // zamena letnje <-> zimske (gume na felnama)
  "mount_balance", // montaža + balansiranje
  "new_tires", // nove gume
  "repair", // popravka gume
  "storage", // čuvanje guma (hotel)
  "other",
]);
export const bookingStatus = pgEnum("booking_status", [
  "pending", // čeka potvrdu vulkanizera
  "confirmed",
  "completed",
  "cancelled", // otkazao kupac ili radnja
  "rejected", // radnja odbila zahtev
  "no_show",
]);
export const bookingSource = pgEnum("booking_source", [
  "web",
  "admin", // ručni unos (telefonski poziv)
  "reminder", // preko personalizovanog linka iz podsetnika
  "viber",
  "whatsapp",
]);
export const season = pgEnum("season", ["winter", "summer"]);
export const reminderChannel = pgEnum("reminder_channel", ["wa_link", "viber_link", "sms", "ics"]);
export const campaignStatus = pgEnum("campaign_status", ["draft", "active", "done"]);
export const reminderStatus = pgEnum("reminder_status", [
  "queued",
  "sent", // poslato (ili vulkanizer otvorio wa.me link)
  "clicked", // kupac otvorio personalizovani link
  "booked", // kupac zakazao preko linka
  "failed",
  "skipped", // npr. kupac se odjavio
]);

/* ----------------------------------------------------------------- helpers */

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

/* ----------------------------------------------------------------- shops */

export const shops = pgTable(
  "shops",
  {
    id: id(),
    /** Public URL part: app.example.rs/{slug} */
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    /** Shown under the shop name on the customer booking page, e.g. "Vulkanizer", "Perionica". Falls back to "Vulkanizer" when unset. */
    businessLabel: text("business_label"),
    city: text("city"),
    address: text("address"),
    /** E.164, e.g. +381641234567 — used for wa.me / viber links */
    phone: text("phone"),
    timezone: text("timezone").notNull().default("Europe/Belgrade"),
    plan: shopPlan("plan").notNull().default("trial"),
    isActive: boolean("is_active").notNull().default(true),
    /** Self-signups start 'pending'; CLI/seed-created shops default to 'approved' (no review needed). */
    signupStatus: signupStatus("signup_status").notNull().default("approved"),

    /* booking settings */
    /** Number of lifts/bays that can work in parallel */
    bays: smallint("bays").notNull().default(1),
    /** Grid of start times offered to customers, in minutes */
    slotStepMin: smallint("slot_step_min").notNull().default(30),
    /** How many days ahead customers can book */
    bookingHorizonDays: smallint("booking_horizon_days").notNull().default(14),
    /** Minimum notice before a slot, in minutes (no booking 5 min before) */
    minNoticeMin: smallint("min_notice_min").notNull().default(60),
    /** false = request waits for the shop to confirm (default) */
    autoConfirm: boolean("auto_confirm").notNull().default(false),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("shops_slug_uq").on(t.slug),
    check("shops_slug_format", sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
    check("shops_bays_range", sql`${t.bays} between 1 and 20`),
    check("shops_slot_step_range", sql`${t.slotStepMin} between 5 and 240`),
    check("shops_horizon_range", sql`${t.bookingHorizonDays} between 1 and 120`),
    check("shops_min_notice_range", sql`${t.minNoticeMin} between 0 and 2880`),
  ],
);

/** Who can manage a shop: a Better Auth user with a role in that shop. */
export const shopMembers = pgTable(
  "shop_members",
  {
    id: id(),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: memberRole("role").notNull().default("owner"),
    createdAt: createdAt(),
  },
  (t) => [unique("shop_members_shop_user_uq").on(t.shopId, t.userId), index("shop_members_user_idx").on(t.userId)],
);

/* ----------------------------------------------------------------- platform admin */

/**
 * Every action the platform owner takes on a shop from outside the normal
 * owner/staff roles (approve/reject signup, suspend, change plan, impersonate).
 * Append-only — never updated or deleted.
 */
export const platformAuditLog = pgTable(
  "platform_audit_log",
  {
    id: id(),
    adminUserId: text("admin_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    shopId: uuid("shop_id").references(() => shops.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    details: text("details"),
    createdAt: createdAt(),
  },
  (t) => [index("platform_audit_log_shop_idx").on(t.shopId), index("platform_audit_log_admin_idx").on(t.adminUserId)],
);

/**
 * A time-boxed grant letting a platform admin use a shop's admin panel for
 * support, without adding a shop_members row. Ends at expiresAt or when
 * endedAt is set, whichever comes first.
 */
export const platformImpersonationSessions = pgTable(
  "platform_impersonation_sessions",
  {
    id: id(),
    adminUserId: text("admin_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("platform_impersonation_shop_idx").on(t.shopId), index("platform_impersonation_admin_idx").on(t.adminUserId)],
);

/* ----------------------------------------------------------------- services & prices */

export const services = pgTable(
  "services",
  {
    id: id(),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    kind: serviceKind("kind").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    /** Emoji shown on the chat button, e.g. 🔄 */
    icon: text("icon"),
    /** Default duration if a price row doesn't override it */
    durationMin: smallint("duration_min").notNull().default(30),
    /** false = info only (e.g. storage price list), can't be booked */
    bookable: boolean("bookable").notNull().default(true),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: smallint("sort_order").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("services_shop_id_uq").on(t.shopId, t.id), // target for composite FKs
    index("services_shop_idx").on(t.shopId, t.sortOrder),
    check("services_duration_range", sql`${t.durationMin} between 5 and 480`),
  ],
);

/** A kind of vehicle a shop services (car, SUV, van, or anything a shop adds — bicycle, motorcycle…). */
export const vehicleTypes = pgTable(
  "vehicle_types",
  {
    id: id(),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    /** Emoji shown next to the label, e.g. 🚗 */
    icon: text("icon"),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: smallint("sort_order").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("vehicle_types_shop_id_uq").on(t.shopId, t.id), // target for composite FKs
    index("vehicle_types_shop_idx").on(t.shopId, t.sortOrder),
  ],
);

/** Price (and optional duration) of a service per vehicle type. */
export const servicePrices = pgTable(
  "service_prices",
  {
    id: id(),
    shopId: uuid("shop_id").notNull(),
    serviceId: uuid("service_id").notNull(),
    vehicleTypeId: uuid("vehicle_type_id").notNull(),
    /** Whole dinars */
    priceRsd: integer("price_rsd").notNull(),
    durationMin: smallint("duration_min"),
    note: text("note"),
  },
  (t) => [
    foreignKey({
      name: "service_prices_service_fk",
      columns: [t.shopId, t.serviceId],
      foreignColumns: [services.shopId, services.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "service_prices_vehicle_type_fk",
      columns: [t.shopId, t.vehicleTypeId],
      foreignColumns: [vehicleTypes.shopId, vehicleTypes.id],
    }).onDelete("cascade"),
    unique("service_prices_service_vehicle_uq").on(t.serviceId, t.vehicleTypeId),
    check("service_prices_price_nonneg", sql`${t.priceRsd} >= 0`),
    check("service_prices_duration_range", sql`${t.durationMin} is null or ${t.durationMin} between 5 and 480`),
  ],
);

/* ----------------------------------------------------------------- schedule */

/**
 * Regular weekly hours. Several rows per weekday are allowed
 * (e.g. 08:00–12:00 and 13:00–17:00 for a lunch break).
 * weekday: ISO 1 = Monday … 7 = Sunday. A weekday with no rows = closed.
 */
export const workingHours = pgTable(
  "working_hours",
  {
    id: id(),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    weekday: smallint("weekday").notNull(),
    opensAt: time("opens_at").notNull(),
    closesAt: time("closes_at").notNull(),
  },
  (t) => [
    index("working_hours_shop_day_idx").on(t.shopId, t.weekday),
    check("working_hours_weekday_range", sql`${t.weekday} between 1 and 7`),
    check("working_hours_order", sql`${t.opensAt} < ${t.closesAt}`),
  ],
);

/**
 * Overrides for specific dates: holidays (closed) or special hours.
 * If a date has any exception row, it replaces the weekly hours for that day.
 */
export const scheduleExceptions = pgTable(
  "schedule_exceptions",
  {
    id: id(),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    closed: boolean("closed").notNull().default(true),
    opensAt: time("opens_at"),
    closesAt: time("closes_at"),
    note: text("note"),
  },
  (t) => [
    index("schedule_exceptions_shop_date_idx").on(t.shopId, t.date),
    check(
      "schedule_exceptions_hours",
      sql`(${t.closed} and ${t.opensAt} is null and ${t.closesAt} is null)
          or (not ${t.closed} and ${t.opensAt} is not null and ${t.closesAt} is not null and ${t.opensAt} < ${t.closesAt})`,
    ),
  ],
);

/**
 * Time a bay is blocked by the shop itself (break, bay out of order, walk-ins).
 * bay = null blocks ALL bays.
 */
export const blockedTimes = pgTable(
  "blocked_times",
  {
    id: id(),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    bay: smallint("bay"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    reason: text("reason"),
    createdAt: createdAt(),
  },
  (t) => [
    index("blocked_times_shop_start_idx").on(t.shopId, t.startsAt),
    check("blocked_times_order", sql`${t.startsAt} < ${t.endsAt}`),
    check("blocked_times_bay_range", sql`${t.bay} is null or ${t.bay} >= 1`),
  ],
);

/* ----------------------------------------------------------------- customers & vehicles */

export const customers = pgTable(
  "customers",
  {
    id: id(),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Normalized E.164 (+3816…) — one customer per phone per shop */
    phone: text("phone").notNull(),
    /** Consent to seasonal reminders (ZZPL): when and that it was given */
    reminderConsent: boolean("reminder_consent").notNull().default(false),
    reminderConsentAt: timestamp("reminder_consent_at", { withTimezone: true }),
    /** Customer replied STOP / asked to be removed */
    optedOutAt: timestamp("opted_out_at", { withTimezone: true }),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("customers_shop_id_uq").on(t.shopId, t.id),
    unique("customers_shop_phone_uq").on(t.shopId, t.phone),
    check("customers_phone_e164", sql`${t.phone} ~ '^\\+[1-9][0-9]{7,14}$'`),
  ],
);

export const vehicles = pgTable(
  "vehicles",
  {
    id: id(),
    shopId: uuid("shop_id").notNull(),
    customerId: uuid("customer_id").notNull(),
    /** Free text as typed by the customer: "Golf 7", "Škoda Octavia" */
    label: text("label").notNull(),
    vehicleTypeId: uuid("vehicle_type_id").notNull(),
    plate: text("plate"),
    /** e.g. "205/55 R16" */
    tireSize: text("tire_size"),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: "vehicles_customer_fk",
      columns: [t.shopId, t.customerId],
      foreignColumns: [customers.shopId, customers.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "vehicles_vehicle_type_fk",
      columns: [t.shopId, t.vehicleTypeId],
      foreignColumns: [vehicleTypes.shopId, vehicleTypes.id],
    }),
    unique("vehicles_shop_id_uq").on(t.shopId, t.id),
    index("vehicles_customer_idx").on(t.customerId),
  ],
);

/* ----------------------------------------------------------------- bookings */

export const bookings = pgTable(
  "bookings",
  {
    id: id(),
    shopId: uuid("shop_id").notNull(),
    customerId: uuid("customer_id").notNull(),
    vehicleId: uuid("vehicle_id"),
    serviceId: uuid("service_id").notNull(),

    /* snapshots — later price-list changes don't rewrite history */
    vehicleTypeId: uuid("vehicle_type_id").notNull(),
    priceRsd: integer("price_rsd").notNull(),
    durationMin: smallint("duration_min").notNull(),

    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    /** Which lift/bay the booking occupies (1..shops.bays) */
    bay: smallint("bay").notNull(),

    status: bookingStatus("status").notNull().default("pending"),
    source: bookingSource("source").notNull().default("web"),
    customerNote: text("customer_note"),
    internalNote: text("internal_note"),
    cancelReason: text("cancel_reason"),

    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    /** When the shop actually sent the customer the confirm/reject/cancel message — null after a status change the shop hasn't notified the customer about yet. */
    notifiedAt: timestamp("notified_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: "bookings_customer_fk",
      columns: [t.shopId, t.customerId],
      foreignColumns: [customers.shopId, customers.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "bookings_vehicle_fk",
      columns: [t.shopId, t.vehicleId],
      foreignColumns: [vehicles.shopId, vehicles.id],
    }),
    foreignKey({
      name: "bookings_service_fk",
      columns: [t.shopId, t.serviceId],
      foreignColumns: [services.shopId, services.id],
    }),
    foreignKey({
      name: "bookings_vehicle_type_fk",
      columns: [t.shopId, t.vehicleTypeId],
      foreignColumns: [vehicleTypes.shopId, vehicleTypes.id],
    }),
    index("bookings_shop_start_idx").on(t.shopId, t.startsAt),
    index("bookings_shop_status_start_idx").on(t.shopId, t.status, t.startsAt),
    index("bookings_customer_idx").on(t.customerId),
    check("bookings_time_order", sql`${t.startsAt} < ${t.endsAt}`),
    check("bookings_bay_positive", sql`${t.bay} >= 1`),
    check("bookings_price_nonneg", sql`${t.priceRsd} >= 0`),
    // + exclusion constraint bookings_no_overlap (custom migration)
  ],
);

/* ----------------------------------------------------------------- tire hotel */

/** Tires stored at the shop between seasons ("hotel za gume"). */
export const tireStorage = pgTable(
  "tire_storage",
  {
    id: id(),
    shopId: uuid("shop_id").notNull(),
    customerId: uuid("customer_id").notNull(),
    vehicleId: uuid("vehicle_id"),
    /** Which set is stored: the winter set is stored during summer */
    season: season("season").notNull(),
    tireSize: text("tire_size"),
    quantity: smallint("quantity").notNull().default(4),
    withRims: boolean("with_rims").notNull().default(true),
    /** Shelf/label code in the storage */
    location: text("location"),
    notes: text("notes"),
    storedAt: timestamp("stored_at", { withTimezone: true }).notNull().defaultNow(),
    retrievedAt: timestamp("retrieved_at", { withTimezone: true }),
  },
  (t) => [
    foreignKey({
      name: "tire_storage_customer_fk",
      columns: [t.shopId, t.customerId],
      foreignColumns: [customers.shopId, customers.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "tire_storage_vehicle_fk",
      columns: [t.shopId, t.vehicleId],
      foreignColumns: [vehicles.shopId, vehicles.id],
    }),
    index("tire_storage_shop_active_idx").on(t.shopId).where(sql`${t.retrievedAt} is null`),
    check("tire_storage_quantity_range", sql`${t.quantity} between 1 and 10`),
  ],
);

/* ----------------------------------------------------------------- seasonal reminders */

export const reminderCampaigns = pgTable(
  "reminder_campaigns",
  {
    id: id(),
    shopId: uuid("shop_id").notNull(),
    name: text("name").notNull(),
    season: season("season").notNull(),
    channel: reminderChannel("channel").notNull().default("wa_link"),
    /** Text with placeholders: {ime}, {vozilo}, {link}, {radnja} */
    messageTemplate: text("message_template").notNull(),
    status: campaignStatus("status").notNull().default("draft"),
    /** Max messages per day — send in waves matched to free capacity */
    dailyLimit: smallint("daily_limit"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("reminder_campaigns_shop_id_uq").on(t.shopId, t.id),
    foreignKey({
      name: "reminder_campaigns_shop_fk",
      columns: [t.shopId],
      foreignColumns: [shops.id],
    }).onDelete("cascade"),
  ],
);

export const reminderMessages = pgTable(
  "reminder_messages",
  {
    id: id(),
    shopId: uuid("shop_id").notNull(),
    campaignId: uuid("campaign_id").notNull(),
    customerId: uuid("customer_id").notNull(),
    vehicleId: uuid("vehicle_id"),
    /** Unguessable token for the personalized link /r/{token} */
    token: text("token").notNull(),
    status: reminderStatus("status").notNull().default("queued"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    clickedAt: timestamp("clicked_at", { withTimezone: true }),
    bookingId: uuid("booking_id").references(() => bookings.id, { onDelete: "set null" }),
    error: text("error"),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      name: "reminder_messages_campaign_fk",
      columns: [t.shopId, t.campaignId],
      foreignColumns: [reminderCampaigns.shopId, reminderCampaigns.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "reminder_messages_customer_fk",
      columns: [t.shopId, t.customerId],
      foreignColumns: [customers.shopId, customers.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "reminder_messages_vehicle_fk",
      columns: [t.shopId, t.vehicleId],
      foreignColumns: [vehicles.shopId, vehicles.id],
    }),
    uniqueIndex("reminder_messages_token_uq").on(t.token),
    unique("reminder_messages_campaign_customer_uq").on(t.campaignId, t.customerId),
    index("reminder_messages_campaign_status_idx").on(t.campaignId, t.status),
  ],
);

/* ----------------------------------------------------------------- types */

export type Shop = typeof shops.$inferSelect;
export type NewShop = typeof shops.$inferInsert;
export type PlatformAuditLog = typeof platformAuditLog.$inferSelect;
export type PlatformImpersonationSession = typeof platformImpersonationSessions.$inferSelect;
export type Service = typeof services.$inferSelect;
export type VehicleTypeRow = typeof vehicleTypes.$inferSelect;
export type ServicePrice = typeof servicePrices.$inferSelect;
export type WorkingHours = typeof workingHours.$inferSelect;
export type ScheduleException = typeof scheduleExceptions.$inferSelect;
export type BlockedTime = typeof blockedTimes.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type Vehicle = typeof vehicles.$inferSelect;
export type Booking = typeof bookings.$inferSelect;
export type NewBooking = typeof bookings.$inferInsert;
export type TireStorage = typeof tireStorage.$inferSelect;
export type ReminderCampaign = typeof reminderCampaigns.$inferSelect;
export type ReminderMessage = typeof reminderMessages.$inferSelect;
