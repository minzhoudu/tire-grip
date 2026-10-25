/**
 * Customer directory: the shop-side "who's been here" view (searchShopCustomers,
 * getShopCustomer), and the public phone lookup customers use to find their
 * own bookings without an account (findBookingsByPhone).
 */
import { and, asc, desc, eq, or, sql } from "drizzle-orm";
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

export const CUSTOMERS_PAGE_SIZE = 50;

/** Lowercase without Serbian diacritics, so "petrovic" finds "Petrović". Must match the SQL translate() below. */
export function foldName(s: string): string {
  return s.toLowerCase().replace(/[čć]/g, "c").replace(/š/g, "s").replace(/ž/g, "z").replace(/đ/g, "dj");
}

/** LIKE treats % and _ as wildcards (and \ as the escape): typed literally, they should match literally. */
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/**
 * One page of the shop's customers, most recent visit first ("visit" = a completed appointment).
 * `q` matches the name (case- and diacritics-insensitive) or, with 3+ digits, the phone number.
 * Counting and sorting happen in the database, so only one page ever leaves it.
 */
export async function searchShopCustomers(
  db: DB,
  shopId: string,
  { q = "", offset = 0, limit = CUSTOMERS_PAGE_SIZE }: { q?: string; offset?: number; limit?: number } = {},
): Promise<{ rows: ShopCustomerRow[]; hasMore: boolean }> {
  const visits = db
    .select({ customerId: bookings.customerId, n: sql<number>`count(*)::int`.as("n"), lastVisitAt: sql<string>`max(${bookings.startsAt})`.as("last_visit_at") })
    .from(bookings)
    .where(and(eq(bookings.shopId, shopId), eq(bookings.status, "completed")))
    .groupBy(bookings.customerId)
    .as("visits");

  const term = q.trim();
  const digits = term.replace(/\D/g, "").replace(/^0+/, "");
  const nameMatch = term
    ? sql`translate(replace(lower(${customers.name}), 'đ', 'dj'), 'čćšž', 'ccsz') like ${`%${escapeLike(foldName(term))}%`}`
    : undefined;
  const phoneMatch = digits.length >= 3 ? sql`${customers.phone} like ${`%${digits}%`}` : undefined;

  const rows = await db
    .select({ id: customers.id, name: customers.name, phone: customers.phone, visitCount: visits.n, lastVisitAt: visits.lastVisitAt })
    .from(customers)
    .leftJoin(visits, eq(visits.customerId, customers.id))
    .where(and(eq(customers.shopId, shopId), term ? (phoneMatch ? or(nameMatch, phoneMatch) : nameMatch) : undefined))
    .orderBy(sql`${visits.lastVisitAt} desc nulls last`, asc(customers.name), asc(customers.id))
    .limit(limit + 1)
    .offset(offset);

  return {
    // raw sql`max(...)` comes back from the driver as a string, not a Date — parse it explicitly.
    rows: rows.slice(0, limit).map((r) => ({ ...r, visitCount: r.visitCount ?? 0, lastVisitAt: r.lastVisitAt ? new Date(r.lastVisitAt) : null })),
    hasMore: rows.length > limit,
  };
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
