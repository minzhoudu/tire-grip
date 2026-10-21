/**
 * Customer directory: the shop-side "who's been here" view (listShopCustomers,
 * getShopCustomer), and the public phone lookup customers use to find their
 * own bookings without an account (findBookingsByPhone).
 */
import { and, desc, eq, sql } from "drizzle-orm";
import type { DB } from "../db/index.ts";
import { bookings, customers, services, shops } from "../db/schema.ts";
import type { BookingStatus } from "../lib/booking/status.ts";

export interface ShopCustomerRow {
  id: string;
  name: string;
  phone: string;
  visitCount: number;
  lastVisitAt: Date | null;
}

/** Everyone who has ever booked at this shop — "visit" = a completed appointment, most recent visit first. */
export async function listShopCustomers(db: DB, shopId: string): Promise<ShopCustomerRow[]> {
  const [customerRows, visitRows] = await Promise.all([
    db.select({ id: customers.id, name: customers.name, phone: customers.phone }).from(customers).where(eq(customers.shopId, shopId)),
    db
      .select({ customerId: bookings.customerId, n: sql<number>`count(*)::int`, lastVisitAt: sql<Date>`max(${bookings.startsAt})` })
      .from(bookings)
      .where(and(eq(bookings.shopId, shopId), eq(bookings.status, "completed")))
      .groupBy(bookings.customerId),
  ]);
  const visitByCustomer = new Map(visitRows.map((v) => [v.customerId, v]));

  return customerRows
    .map((c) => {
      const visit = visitByCustomer.get(c.id);
      // raw sql`max(...)` comes back from the driver as a string, not a Date — parse it explicitly.
      const lastVisitAt = visit?.lastVisitAt ? new Date(visit.lastVisitAt) : null;
      return { id: c.id, name: c.name, phone: c.phone, visitCount: visit?.n ?? 0, lastVisitAt };
    })
    .sort((a, b) => (b.lastVisitAt?.getTime() ?? 0) - (a.lastVisitAt?.getTime() ?? 0));
}

export interface ShopCustomer {
  id: string;
  name: string;
  phone: string;
  notes: string | null;
}

export async function getShopCustomer(db: DB, shopId: string, customerId: string): Promise<ShopCustomer | null> {
  const [row] = await db
    .select({ id: customers.id, name: customers.name, phone: customers.phone, notes: customers.notes })
    .from(customers)
    .where(and(eq(customers.shopId, shopId), eq(customers.id, customerId)))
    .limit(1);
  return row ?? null;
}

/* ------------------------------------------------------------- public lookup (/{slug}/moji-termini) */

export interface ShopBasics {
  id: string;
  name: string;
  timezone: string;
}

export async function getShopBasics(db: DB, slug: string): Promise<ShopBasics | null> {
  const [row] = await db
    .select({ id: shops.id, name: shops.name, timezone: shops.timezone })
    .from(shops)
    .where(and(eq(shops.slug, slug), eq(shops.isActive, true)))
    .limit(1);
  return row ?? null;
}

export interface CustomerBookingSummary {
  id: string;
  status: BookingStatus;
  startsAt: Date;
  endsAt: Date;
  priceRsd: number;
  serviceName: string;
  serviceIcon: string | null;
}

/** Null when the phone isn't a known customer at this shop — show the same "no bookings" message either way, don't reveal which. */
export async function findBookingsByPhone(db: DB, shopId: string, phone: string): Promise<CustomerBookingSummary[] | null> {
  const [customer] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.shopId, shopId), eq(customers.phone, phone)))
    .limit(1);
  if (!customer) return null;

  return db
    .select({
      id: bookings.id,
      status: bookings.status,
      startsAt: bookings.startsAt,
      endsAt: bookings.endsAt,
      priceRsd: bookings.priceRsd,
      serviceName: services.name,
      serviceIcon: services.icon,
    })
    .from(bookings)
    .innerJoin(services, and(eq(services.id, bookings.serviceId), eq(services.shopId, bookings.shopId)))
    .where(and(eq(bookings.shopId, shopId), eq(bookings.customerId, customer.id)))
    .orderBy(desc(bookings.startsAt))
    .limit(50);
}
