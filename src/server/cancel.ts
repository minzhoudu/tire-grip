/**
 * Self-service cancellation (/otkazi/{bookingId}) — the ONE public surface
 * that looks up a booking by id alone, no shop/session check. The booking's
 * id doubles as its cancel token: a v4 UUID is as unguessable as any token
 * we'd generate, and only the customer it was sent to (via WhatsApp) has it.
 */
import { and, eq, gt, inArray } from "drizzle-orm";
import type { DB } from "../db/index.ts";
import { bookings, customers, services, shops } from "../db/schema.ts";
import { CUSTOMER_CANCEL_REASON, type BookingStatus } from "../lib/booking/status.ts";

export interface CancellableBooking {
  id: string;
  status: BookingStatus;
  startsAt: Date;
  endsAt: Date;
  priceRsd: number;
  serviceName: string;
  serviceIcon: string | null;
  customerName: string;
  shopName: string;
  shopSlug: string;
  shopAddress: string | null;
  shopPhone: string | null;
  shopTimezone: string;
}

/** The statuses from which a customer may still cancel themselves (same as admin's, plus "pending"). */
const CUSTOMER_CANCELLABLE: BookingStatus[] = ["pending", "confirmed"];

export async function getCancellableBooking(db: DB, bookingId: string): Promise<CancellableBooking | null> {
  const [row] = await db
    .select({
      id: bookings.id,
      status: bookings.status,
      startsAt: bookings.startsAt,
      endsAt: bookings.endsAt,
      priceRsd: bookings.priceRsd,
      serviceName: services.name,
      serviceIcon: services.icon,
      customerName: customers.name,
      shopName: shops.name,
      shopSlug: shops.slug,
      shopAddress: shops.address,
      shopPhone: shops.phone,
      shopTimezone: shops.timezone,
    })
    .from(bookings)
    .innerJoin(shops, eq(shops.id, bookings.shopId))
    .innerJoin(services, and(eq(services.id, bookings.serviceId), eq(services.shopId, bookings.shopId)))
    .innerJoin(customers, and(eq(customers.id, bookings.customerId), eq(customers.shopId, bookings.shopId)))
    .where(eq(bookings.id, bookingId))
    .limit(1);
  return row ?? null;
}

export function canSelfCancel(booking: Pick<CancellableBooking, "status" | "startsAt">, now = new Date()): boolean {
  return CUSTOMER_CANCELLABLE.includes(booking.status) && booking.startsAt.getTime() > now.getTime();
}

export type CancelByCustomerResult = { ok: true } | { ok: false; reason: "not_found" | "not_allowed" };

/** Conditional UPDATE (status still cancellable AND not yet started) so a stale page/double-tap can't double-cancel or race a shop action. */
export async function cancelBookingByCustomer(db: DB, bookingId: string, now = new Date()): Promise<CancelByCustomerResult> {
  const rows = await db
    .update(bookings)
    .set({ status: "cancelled", cancelledAt: now, cancelReason: CUSTOMER_CANCEL_REASON, updatedAt: now })
    .where(and(eq(bookings.id, bookingId), inArray(bookings.status, CUSTOMER_CANCELLABLE), gt(bookings.startsAt, now)))
    .returning({ id: bookings.id });
  if (rows.length > 0) return { ok: true };

  const existing = await getCancellableBooking(db, bookingId);
  return { ok: false, reason: existing ? "not_allowed" : "not_found" };
}
