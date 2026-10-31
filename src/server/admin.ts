/**
 * Admin-side data access. Every function takes the shopId explicitly and
 * scopes every query by it — callers get it from requireShopAccess(), never
 * from user input.
 */
import { and, asc, desc, eq, gte, gt, inArray, isNull, lt, lte, not, or, sql } from "drizzle-orm";
import type { DB } from "../db/index.ts";
import { blockedTimes, bookings, customers, services, vehicleTypes, vehicles } from "../db/schema.ts";
import { addDays, dayChipLabel, dayLongLabel, getDayAvailability, shopToday, utcToZoned, zonedToUtc } from "../lib/availability/index.ts";
import { formatMinutes } from "../lib/availability/zoned.ts";
import { cancellationMessage, confirmationMessage, dayBeforeReminderMessage, rejectionMessage } from "../lib/booking/messages.ts";
import { ACTIONS, FINAL_STATUSES, allowedActions, notifiesCustomer, type BookingAction, type BookingStatus } from "../lib/booking/status.ts";
import { googleMapsUrl } from "../lib/maps-links.ts";
import { whatsappLink } from "../lib/phone.ts";
import type { BookingCardData } from "../components/admin/booking-card.tsx";
import { ADMIN_HORIZON_DAYS } from "./bookings.ts";
import { shopPublicUrl } from "./origin.ts";
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
  customerId: string;
  customerName: string;
  customerPhone: string;
  vehicleLabel: string | null;
  customerNote: string | null;
  createdAt: Date;
  cancelReason: string | null;
  notifiedAt: Date | null;
  reminderSentAt: Date | null;
  /** How many of this customer's bookings at this shop ended as "nije došao" */
  customerNoShows: number;
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
  customerId: bookings.customerId,
  customerName: customers.name,
  customerPhone: customers.phone,
  vehicleLabel: vehicles.label,
  customerNote: bookings.customerNote,
  createdAt: bookings.createdAt,
  cancelReason: bookings.cancelReason,
  notifiedAt: bookings.notifiedAt,
  reminderSentAt: bookings.reminderSentAt,
  customerNoShows: sql<number>`(select count(*)::int from bookings ns where ns.shop_id = ${bookings.shopId} and ns.customer_id = ${bookings.customerId} and ns.status = 'no_show')`,
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
      .where(
        and(
          eq(bookings.shopId, shop.id),
          inArray(bookings.status, open),
          gte(bookings.endsAt, startOfToday),
          // Confirmed and already over: listed under "Prošli termini za zaključiti" instead (listBookingsToClose).
          not(and(eq(bookings.status, "confirmed"), lte(bookings.endsAt, now))!),
        ),
      )
      .orderBy(asc(bookings.startsAt), asc(bookings.bay));
  }

  return (await listHistoryPage(db, shop, { now })).rows;
}

export const HISTORY_PAGE_SIZE = 30;

/** Where the next history page starts: the last booking shown (newest first, id breaks ties). */
export interface HistoryCursor {
  startsAt: string;
  id: string;
}

/** Closed or past bookings, newest first, one page at a time ("Učitaj još"). No date limit. */
export async function listHistoryPage(
  db: DB,
  shop: { id: string; timezone: string },
  { cursor, limit = HISTORY_PAGE_SIZE, now = new Date() }: { cursor?: HistoryCursor; limit?: number; now?: Date } = {},
): Promise<{ rows: AdminBooking[]; next: HistoryCursor | null }> {
  const startOfToday = zonedToUtc(shopToday(shop, now), 0, shop.timezone);
  const rows = await bookingQuery(db)
    .where(
      and(
        eq(bookings.shopId, shop.id),
        or(inArray(bookings.status, FINAL_STATUSES), lt(bookings.endsAt, startOfToday)),
        cursor ? sql`(${bookings.startsAt}, ${bookings.id}) < (${cursor.startsAt}::timestamptz, ${cursor.id}::uuid)` : undefined,
      ),
    )
    .orderBy(desc(bookings.startsAt), desc(bookings.id))
    .limit(limit + 1);
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  return { rows: page, next: rows.length > limit && last ? { startsAt: last.startsAt.toISOString(), id: last.id } : null };
}

/** "Danas · nedelja 25.10." / "Sutra · …" / "petak 23.10." (with the year when it isn't this year) */
export function dayHeading(date: string, today: string): string {
  const chip = dayChipLabel(date, today);
  const long = dayLongLabel(date) + (date.slice(0, 4) !== today.slice(0, 4) ? `${date.slice(0, 4)}.` : "");
  return chip === "Danas" || chip === "Sutra" ? `${chip} · ${long}` : long;
}

/* ------------------------------------------------------------ closing past bookings */

/** Confirmed bookings still open this long after they ended are closed as completed (autoCompleteStale). */
export const AUTO_COMPLETE_AFTER_DAYS = 7;

/** Confirmed bookings that are over but not yet marked "Završeno" / "Nije došao", oldest first. */
export async function listBookingsToClose(db: DB, shopId: string, now = new Date()): Promise<AdminBooking[]> {
  const cutoff = new Date(now.getTime() - AUTO_COMPLETE_AFTER_DAYS * 86_400_000);
  return bookingQuery(db)
    .where(and(eq(bookings.shopId, shopId), eq(bookings.status, "confirmed"), lte(bookings.endsAt, now), gte(bookings.endsAt, cutoff)))
    .orderBy(asc(bookings.startsAt), asc(bookings.bay));
}

/**
 * "Svi su došli": marks these bookings completed. Only ones of this shop that are still confirmed and
 * already started, so a stale screen can't touch anything else. Returns how many changed.
 */
export async function completeBookings(db: DB, shopId: string, ids: string[], now = new Date()): Promise<number> {
  if (ids.length === 0) return 0;
  const updated = await db
    .update(bookings)
    .set({ status: "completed", completedAt: now, updatedAt: now })
    .where(and(eq(bookings.shopId, shopId), inArray(bookings.id, ids), eq(bookings.status, "confirmed"), lte(bookings.startsAt, now)))
    .returning({ id: bookings.id });
  return updated.length;
}

/**
 * Nobody closed them within AUTO_COMPLETE_AFTER_DAYS: assume the customer came, so revenue and visits
 * stay right. Runs when the pages that depend on it load (no cron needed); a no-op most of the time.
 */
export async function autoCompleteStale(db: DB, shopId: string, now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - AUTO_COMPLETE_AFTER_DAYS * 86_400_000);
  const updated = await db
    .update(bookings)
    .set({ status: "completed", completedAt: sql`${bookings.endsAt}`, updatedAt: now })
    .where(and(eq(bookings.shopId, shopId), eq(bookings.status, "confirmed"), lt(bookings.endsAt, cutoff)))
    .returning({ id: bookings.id });
  return updated.length;
}

/** Everything this customer has ever booked at this shop, newest first — for the admin's customer history view. */
export async function listCustomerBookings(db: DB, shopId: string, customerId: string): Promise<AdminBooking[]> {
  return bookingQuery(db)
    .where(and(eq(bookings.shopId, shopId), eq(bookings.customerId, customerId)))
    .orderBy(desc(bookings.startsAt))
    .limit(100);
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

/** wa.me link with the right message for confirm/reject/cancel/day-before reminder — built fresh each time, so it always reflects the booking's current details. */
export function customerMessageUrl(
  booking: AdminBooking,
  shop: { name: string; slug: string; address: string | null; timezone: string; city?: string | null; latitude?: number | null; longitude?: number | null },
  kind: "confirm" | "reject" | "cancel" | "reminder",
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
    // Only an exact pin: a search by address text is what sent customers to the wrong town.
    mapUrl:
      shop.latitude != null && shop.longitude != null
        ? googleMapsUrl({ name: shop.name, address: shop.address, city: shop.city ?? null, latitude: shop.latitude, longitude: shop.longitude })
        : null,
    bookingUrl: shopPublicUrl(shop.slug, origin),
    cancelUrl: kind === "confirm" || kind === "reminder" ? `${origin}/otkazi/${booking.id}` : undefined,
  };
  const text =
    kind === "confirm"
      ? confirmationMessage(input)
      : kind === "reject"
        ? rejectionMessage(input)
        : kind === "cancel"
          ? cancellationMessage(input)
          : dayBeforeReminderMessage(input);
  return whatsappLink(booking.customerPhone, text);
}

/** Everything the admin BookingCard needs, from a booking row. */
export function toBookingCardData(
  b: AdminBooking,
  shop: { name: string; slug: string; address: string | null; timezone: string; bays: number },
  origin: string,
  now = new Date(),
): BookingCardData {
  const start = utcToZoned(b.startsAt, shop.timezone);
  const end = utcToZoned(b.endsAt, shop.timezone);
  const notifyKind = b.notifiedAt === null ? notifyKindForStatus(b.status) : null;
  return {
    id: b.id,
    status: b.status,
    actions: allowedActions(b.status, b.startsAt, now),
    timeRange: `${formatMinutes(start.minutes)}–${formatMinutes(end.minutes)}`,
    serviceName: `${b.serviceIcon ?? ""} ${b.serviceName}`.trim(),
    vehicleTypeLabel: b.vehicleTypeLabel,
    vehicleTypeIcon: b.vehicleTypeIcon,
    vehicleLabel: b.vehicleLabel,
    customerName: b.customerName,
    customerPhone: b.customerPhone,
    customerNote: b.customerNote,
    priceRsd: b.priceRsd,
    bay: shop.bays > 1 ? b.bay : null,
    byPhone: b.source === "admin",
    cancelReason: b.cancelReason,
    notifyUrl: notifyKind ? customerMessageUrl(b, shop, notifyKind, origin) : null,
    customerNoShows: Number(b.customerNoShows),
  };
}

/** Bookings that occupy a bay on one local day (pending, confirmed, done, no-show), for the per-bay schedule. */
export async function listDayBookings(db: DB, shop: { id: string; timezone: string }, date: string): Promise<AdminBooking[]> {
  const from = zonedToUtc(date, 0, shop.timezone);
  const to = zonedToUtc(addDays(date, 1), 0, shop.timezone);
  return bookingQuery(db)
    .where(
      and(
        eq(bookings.shopId, shop.id),
        inArray(bookings.status, [...ACTIVE_STATUSES, "no_show"]),
        lt(bookings.startsAt, to),
        gt(bookings.endsAt, from),
      ),
    )
    .orderBy(asc(bookings.startsAt), asc(bookings.bay));
}

/** Blocked time overlapping one local day, as minutes within that day (clamped to it). */
export async function listDayBlocks(db: DB, shop: { id: string; timezone: string }, date: string) {
  const from = zonedToUtc(date, 0, shop.timezone);
  const to = zonedToUtc(addDays(date, 1), 0, shop.timezone);
  const rows = await db
    .select()
    .from(blockedTimes)
    .where(and(eq(blockedTimes.shopId, shop.id), lt(blockedTimes.startsAt, to), gt(blockedTimes.endsAt, from)))
    .orderBy(asc(blockedTimes.startsAt));
  return rows.map((b) => {
    const start = utcToZoned(b.startsAt, shop.timezone);
    const end = utcToZoned(b.endsAt, shop.timezone);
    return {
      id: b.id,
      bay: b.bay,
      reason: b.reason,
      fromMin: start.date < date ? 0 : start.minutes,
      toMin: end.date > date ? 24 * 60 : end.minutes,
    };
  });
}

/** Records that the day-before reminder went out. Only for a still-confirmed booking; re-sending just moves the timestamp. */
export async function markReminderSent(db: DB, shopId: string, bookingId: string): Promise<boolean> {
  const updated = await db
    .update(bookings)
    .set({ reminderSentAt: new Date() })
    .where(and(eq(bookings.shopId, shopId), eq(bookings.id, bookingId), eq(bookings.status, "confirmed")))
    .returning({ id: bookings.id });
  return updated.length > 0;
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
