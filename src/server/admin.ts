/**
 * Admin-side data access. Every function takes the shopId explicitly and
 * scopes every query by it — callers get it from requireShopAccess(), never
 * from user input.
 */
import { and, asc, desc, eq, gte, gt, inArray, isNull, lt, or, sql } from "drizzle-orm";
import type { DB } from "../db/index.ts";
import { blockedTimes, bookings, customers, services, vehicleTypes, vehicles } from "../db/schema.ts";
import { addDays, dayLongLabel, getDayAvailability, shopToday, utcToZoned, zonedToUtc } from "../lib/availability/index.ts";
import { formatMinutes } from "../lib/availability/zoned.ts";
import { cancellationMessage, confirmationMessage, rejectionMessage } from "../lib/booking/messages.ts";
import { ACTIONS, FINAL_STATUSES, allowedActions, notifiesCustomer, type BookingAction, type BookingStatus } from "../lib/booking/status.ts";
import { whatsappLink } from "../lib/phone.ts";
import { ADMIN_HORIZON_DAYS } from "./bookings.ts";
import { ACTIVE_STATUSES, findOffer, loadBusy, type ShopContext } from "./shops.ts";

export type AdminView = "upcoming" | "history";

export interface AdminBooking {
  id: string;
  status: BookingStatus;
  source: string;
  startsAt: Date;
  endsAt: Date;
  bay: number;
  priceRsd: number;
  durationMin: number;
  vehicleTypeLabel: string;
  vehicleTypeIcon: string | null;
  serviceName: string;
  serviceIcon: string | null;
  customerName: string;
  customerPhone: string;
  vehicleLabel: string | null;
  customerNote: string | null;
  createdAt: Date;
  cancelReason: string | null;
  notifiedAt: Date | null;
}

const bookingColumns = {
  id: bookings.id,
  status: bookings.status,
  source: bookings.source,
  startsAt: bookings.startsAt,
  endsAt: bookings.endsAt,
  bay: bookings.bay,
  priceRsd: bookings.priceRsd,
  durationMin: bookings.durationMin,
  vehicleTypeLabel: vehicleTypes.label,
  vehicleTypeIcon: vehicleTypes.icon,
  serviceName: services.name,
  serviceIcon: services.icon,
  customerName: customers.name,
  customerPhone: customers.phone,
  vehicleLabel: vehicles.label,
  customerNote: bookings.customerNote,
  createdAt: bookings.createdAt,
  cancelReason: bookings.cancelReason,
  notifiedAt: bookings.notifiedAt,
};

function bookingQuery(db: DB) {
  return db
    .select(bookingColumns)
    .from(bookings)
    .innerJoin(services, and(eq(services.id, bookings.serviceId), eq(services.shopId, bookings.shopId)))
    .innerJoin(customers, and(eq(customers.id, bookings.customerId), eq(customers.shopId, bookings.shopId)))
    .innerJoin(vehicleTypes, and(eq(vehicleTypes.id, bookings.vehicleTypeId), eq(vehicleTypes.shopId, bookings.shopId)))
    .leftJoin(vehicles, and(eq(vehicles.id, bookings.vehicleId), eq(vehicles.shopId, bookings.shopId)));
}

/**
 * upcoming: pending + confirmed from the start of today (shop time), soonest first.
 * history:  everything else from the last 60 days (finished, cancelled, or before today), newest first.
 */
export async function listBookings(
  db: DB,
  shop: { id: string; timezone: string },
  view: AdminView,
  now = new Date(),
): Promise<AdminBooking[]> {
  const startOfToday = zonedToUtc(shopToday(shop, now), 0, shop.timezone);
  const open: BookingStatus[] = ["pending", "confirmed"];

  if (view === "upcoming") {
    return bookingQuery(db)
      .where(and(eq(bookings.shopId, shop.id), inArray(bookings.status, open), gte(bookings.endsAt, startOfToday)))
      .orderBy(asc(bookings.startsAt), asc(bookings.bay));
  }

  const since = new Date(startOfToday.getTime() - 60 * 86_400_000);
  return bookingQuery(db)
    .where(
      and(
        eq(bookings.shopId, shop.id),
        gte(bookings.startsAt, since),
        or(inArray(bookings.status, FINAL_STATUSES), lt(bookings.endsAt, startOfToday)),
      ),
    )
    .orderBy(desc(bookings.startsAt))
    .limit(200);
}

export async function getBooking(db: DB, shopId: string, bookingId: string): Promise<AdminBooking | null> {
  const [row] = await bookingQuery(db)
    .where(and(eq(bookings.shopId, shopId), eq(bookings.id, bookingId)))
    .limit(1);
  return row ?? null;
}

/** Pending requests waiting for the shop (badge on the tab). */
export async function countPending(db: DB, shop: { id: string; timezone: string }, now = new Date()): Promise<number> {
  const startOfToday = zonedToUtc(shopToday(shop, now), 0, shop.timezone);
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(bookings)
    .where(and(eq(bookings.shopId, shop.id), eq(bookings.status, "pending"), gte(bookings.endsAt, startOfToday)));
  return row?.n ?? 0;
}

export type ChangeStatusResult =
  | { ok: true; booking: AdminBooking }
  | { ok: false; reason: "not_found" | "not_allowed" };

/**
 * Apply an admin action. The UPDATE only matches rows still in an allowed
 * "from" status, so a stale screen or a second phone can't apply it twice.
 */
export async function changeBookingStatus(
  db: DB,
  input: { shopId: string; bookingId: string; action: BookingAction; now?: Date },
): Promise<ChangeStatusResult> {
  const now = input.now ?? new Date();
  const current = await getBooking(db, input.shopId, input.bookingId);
  if (!current) return { ok: false, reason: "not_found" };
  if (!allowedActions(current.status, current.startsAt, now).includes(input.action)) {
    return { ok: false, reason: "not_allowed" };
  }

  const { from, to } = ACTIONS[input.action];
  const stamp =
    to === "confirmed"
      ? { confirmedAt: now }
      : to === "completed"
        ? { completedAt: now }
        : to === "cancelled" || to === "rejected"
          ? { cancelledAt: now }
          : {};
  // A fresh confirm/reject/cancel means the customer hasn't been told about *this* status yet.
  const notifyReset = notifiesCustomer(input.action) ? { notifiedAt: null } : {};

  const updated = await db
    .update(bookings)
    .set({ status: to, updatedAt: now, ...stamp, ...notifyReset })
    .where(and(eq(bookings.shopId, input.shopId), eq(bookings.id, input.bookingId), inArray(bookings.status, from)))
    .returning({ id: bookings.id });
  if (updated.length === 0) return { ok: false, reason: "not_allowed" };

  const booking = await getBooking(db, input.shopId, input.bookingId);
  return booking ? { ok: true, booking } : { ok: false, reason: "not_found" };
}

/** Conditional UPDATE (still unnotified) so a double tap or a stale screen can't double-count. */
export async function markNotified(db: DB, shopId: string, bookingId: string): Promise<boolean> {
  const updated = await db
    .update(bookings)
    .set({ notifiedAt: new Date() })
    .where(and(eq(bookings.shopId, shopId), eq(bookings.id, bookingId), isNull(bookings.notifiedAt)))
    .returning({ id: bookings.id });
  return updated.length > 0;
}

/** Status → which customer-message kind applies, for whichever of confirm/reject/cancel is the booking's current status. */
const NOTIFY_KIND: Partial<Record<BookingStatus, "confirm" | "reject" | "cancel">> = {
  confirmed: "confirm",
  rejected: "reject",
  cancelled: "cancel",
};

export function notifyKindForStatus(status: BookingStatus): "confirm" | "reject" | "cancel" | null {
  return NOTIFY_KIND[status] ?? null;
}

/** wa.me link with the right message for confirm/reject/cancel — built fresh each time, so it always reflects the booking's current details. */
export function customerMessageUrl(
  booking: AdminBooking,
  shop: { name: string; slug: string; address: string | null; timezone: string },
  kind: "confirm" | "reject" | "cancel",
  origin: string,
): string {
  const local = utcToZoned(booking.startsAt, shop.timezone);
  const input = {
    shopName: shop.name,
    serviceName: booking.serviceName,
    dayLabel: dayLongLabel(local.date),
    time: formatMinutes(local.minutes),
    priceRsd: booking.priceRsd,
    address: shop.address,
    bookingUrl: `${origin}/${shop.slug}`,
    cancelUrl: kind === "confirm" ? `${origin}/otkazi/${booking.id}` : undefined,
  };
  const text =
    kind === "confirm" ? confirmationMessage(input) : kind === "reject" ? rejectionMessage(input) : cancellationMessage(input);
  return whatsappLink(booking.customerPhone, text);
}

/* ------------------------------------------------------------ manual booking slots */

/** Slots for the shop's own entry form: no minimum notice, long horizon. */
export async function adminDaySlots(db: DB, ctx: ShopContext, serviceId: string, vehicleTypeId: string, date: string, now = new Date()) {
  const found = findOffer(ctx, serviceId, vehicleTypeId);
  if (!found) return null;
  const tz = ctx.settings.timezone;
  const busy = await loadBusy(db, ctx.shop.id, zonedToUtc(date, 0, tz), zonedToUtc(addDays(date, 1), 0, tz));
  const day = getDayAvailability({
    shop: { ...ctx.settings, minNoticeMin: 0, bookingHorizonDays: Math.max(ctx.settings.bookingHorizonDays, ADMIN_HORIZON_DAYS) },
    weeklyHours: ctx.weeklyHours,
    exceptions: ctx.exceptions,
    busy,
    durationMin: found.offer.durationMin,
    now,
    date,
  });
  return { ...day, offer: found.offer };
}

/* ------------------------------------------------------------ blocked time */

export interface BlockInput {
  shopId: string;
  bays: number;
  timezone: string;
  date: string;
  fromMin: number;
  toMin: number;
  /** null = whole shop */
  bay: number | null;
  reason?: string;
}

export type CreateBlockResult =
  | { ok: true; id: string; overlappingBookings: number }
  | { ok: false; reason: "invalid_range" | "invalid_bay" };

export async function createBlock(db: DB, input: BlockInput): Promise<CreateBlockResult> {
  if (input.fromMin >= input.toMin || input.fromMin < 0 || input.toMin > 24 * 60) return { ok: false, reason: "invalid_range" };
  if (input.bay !== null && (input.bay < 1 || input.bay > input.bays)) return { ok: false, reason: "invalid_bay" };

  const startsAt = zonedToUtc(input.date, input.fromMin, input.timezone);
  const endsAt = zonedToUtc(input.date, input.toMin, input.timezone);
  const [row] = await db
    .insert(blockedTimes)
    .values({ shopId: input.shopId, bay: input.bay, startsAt, endsAt, reason: input.reason?.trim() || null })
    .returning({ id: blockedTimes.id });

  // Existing bookings aren't moved automatically — tell the shop so they can call those customers.
  const [overlap] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(bookings)
    .where(
      and(
        eq(bookings.shopId, input.shopId),
        inArray(bookings.status, [...ACTIVE_STATUSES]),
        lt(bookings.startsAt, endsAt),
        gt(bookings.endsAt, startsAt),
        ...(input.bay === null ? [] : [eq(bookings.bay, input.bay)]),
      ),
    );
  return { ok: true, id: row!.id, overlappingBookings: overlap?.n ?? 0 };
}

export async function listUpcomingBlocks(db: DB, shop: { id: string; timezone: string }, now = new Date()) {
  const rows = await db
    .select()
    .from(blockedTimes)
    .where(and(eq(blockedTimes.shopId, shop.id), gt(blockedTimes.endsAt, now)))
    .orderBy(asc(blockedTimes.startsAt))
    .limit(100);
  return rows.map((b) => {
    const from = utcToZoned(b.startsAt, shop.timezone);
    const to = utcToZoned(b.endsAt, shop.timezone);
    return { id: b.id, bay: b.bay, reason: b.reason, date: from.date, fromMin: from.minutes, toMin: to.date === from.date ? to.minutes : 24 * 60 };
  });
}

/** Deletes only within the shop; returns false if the block isn't this shop's. */
export async function deleteBlock(db: DB, shopId: string, blockId: string): Promise<boolean> {
  const rows = await db
    .delete(blockedTimes)
    .where(and(eq(blockedTimes.shopId, shopId), eq(blockedTimes.id, blockId)))
    .returning({ id: blockedTimes.id });
  return rows.length > 0;
}
