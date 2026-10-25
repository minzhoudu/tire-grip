/**
 * Read-only stats for the owner: revenue and booking-count trend, no-show
 * rate, busiest weekday and most-booked services, over a fixed window
 * (last `weeks` weeks, Monday–Sunday in the shop's timezone).
 */
import { and, eq, gte, inArray, lt, sql } from "drizzle-orm";
import type { DB } from "../db/index.ts";
import { bookings, services } from "../db/schema.ts";
import { addDays, isoWeekday, shopToday, utcToZoned, zonedToUtc } from "../lib/availability/index.ts";

export interface WeekStat {
  weekStart: string; // local date, Monday
  count: number;
  revenueRsd: number;
}

export interface ServiceStat {
  serviceId: string;
  serviceName: string;
  serviceIcon: string | null;
  count: number;
}

export interface ShopStats {
  weeks: WeekStat[]; // chronological, zero-filled for weeks with no bookings
  totalCount: number;
  totalRevenueRsd: number;
  /** no_show / (completed + no_show) over the window, as a 0–100 number; null until any booking has reached its time. */
  noShowRate: number | null;
  byWeekday: { weekday: number; count: number }[]; // 1 (Mon) .. 7 (Sun)
  /** Cancelled or rejected in the window: shown next to the count, never inside it. */
  cancelledCount: number;
  /** Pending or confirmed bookings from now on, outside the window: "Zakazano unapred". */
  upcomingCount: number;
  topServices: ServiceStat[];
}

function mondayOf(date: string): string {
  return addDays(date, -(isoWeekday(date) - 1));
}

export async function getShopStats(db: DB, shop: { id: string; timezone: string }, weeks = 8, now = new Date()): Promise<ShopStats> {
  const currentMonday = mondayOf(shopToday(shop, now));
  const windowStartMonday = addDays(currentMonday, -(weeks - 1) * 7);
  const windowStart = zonedToUtc(windowStartMonday, 0, shop.timezone);
  // Up to the end of this week: later bookings have no bar to land in, and would make the totals disagree with the weeks shown.
  const windowEnd = zonedToUtc(addDays(currentMonday, 7), 0, shop.timezone);

  const upcoming = db
    .select({ n: sql<number>`count(*)::int` })
    .from(bookings)
    .where(and(eq(bookings.shopId, shop.id), inArray(bookings.status, ["pending", "confirmed"]), gte(bookings.startsAt, now)));

  const rowsQuery = db
    .select({ startsAt: bookings.startsAt, status: bookings.status, priceRsd: bookings.priceRsd, serviceId: services.id, serviceName: services.name, serviceIcon: services.icon })
    .from(bookings)
    .innerJoin(services, and(eq(services.id, bookings.serviceId), eq(services.shopId, bookings.shopId)))
    .where(and(eq(bookings.shopId, shop.id), gte(bookings.startsAt, windowStart), lt(bookings.startsAt, windowEnd)));
  const [rows, [upcomingRow]] = await Promise.all([rowsQuery, upcoming]);

  const weekBuckets = new Map<string, WeekStat>();
  for (let i = 0; i < weeks; i++) {
    const weekStart = addDays(windowStartMonday, i * 7);
    weekBuckets.set(weekStart, { weekStart, count: 0, revenueRsd: 0 });
  }
  const weekdayCounts = new Map<number, number>([1, 2, 3, 4, 5, 6, 7].map((d) => [d, 0]));
  const serviceCounts = new Map<string, ServiceStat>();
  let completed = 0;
  let noShow = 0;

  let cancelled = 0;
  for (const r of rows) {
    // Only appointments that happened or are agreed count; a cancelled or never-confirmed one isn't demand served.
    if (r.status === "cancelled" || r.status === "rejected") {
      cancelled++;
      continue;
    }
    if (r.status === "pending") continue;
    const local = utcToZoned(r.startsAt, shop.timezone);
    const week = weekBuckets.get(mondayOf(local.date));
    if (week) {
      week.count++;
      if (r.status === "completed") week.revenueRsd += r.priceRsd;
    }
    weekdayCounts.set(local.weekday, (weekdayCounts.get(local.weekday) ?? 0) + 1);

    const svc = serviceCounts.get(r.serviceId) ?? { serviceId: r.serviceId, serviceName: r.serviceName, serviceIcon: r.serviceIcon, count: 0 };
    svc.count++;
    serviceCounts.set(r.serviceId, svc);

    if (r.status === "completed") completed++;
    else if (r.status === "no_show") noShow++;
  }

  const weeksList = [...weekBuckets.values()];
  return {
    weeks: weeksList,
    totalCount: weeksList.reduce((sum, w) => sum + w.count, 0),
    cancelledCount: cancelled,
    totalRevenueRsd: weeksList.reduce((sum, w) => sum + w.revenueRsd, 0),
    noShowRate: completed + noShow > 0 ? (noShow / (completed + noShow)) * 100 : null,
    byWeekday: [...weekdayCounts.entries()].map(([weekday, count]) => ({ weekday, count })),
    topServices: [...serviceCounts.values()].sort((a, b) => b.count - a.count).slice(0, 5),
    upcomingCount: upcomingRow?.n ?? 0,
  };
}
