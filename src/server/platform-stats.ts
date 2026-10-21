/**
 * Platform-wide read-only stats for the platform owner (/platforma/statistika):
 * booking volume across every shop, and which shops are most active. Mirrors
 * the per-shop stats.ts, but bucketed on a single reference timezone since
 * bookings span many shops (not necessarily all the same timezone).
 */
import { eq, gte, sql } from "drizzle-orm";
import type { DB } from "../db/index.ts";
import { bookings, shops } from "../db/schema.ts";
import { addDays, isoWeekday, shopToday, utcToZoned, zonedToUtc } from "../lib/availability/index.ts";

const TZ = "Europe/Belgrade";

function mondayOf(date: string): string {
  return addDays(date, -(isoWeekday(date) - 1));
}

export interface PlatformWeekStat {
  weekStart: string; // local date (Europe/Belgrade), Monday
  count: number;
}

export interface TopShopStat {
  shopId: string;
  shopSlug: string;
  shopName: string;
  count: number;
}

export interface ShopStatusCounts {
  pending: number;
  active: number;
  suspended: number;
  rejected: number;
}

export interface PlatformStats {
  weeks: PlatformWeekStat[]; // chronological, zero-filled
  totalBookingsInWindow: number;
  totalBookingsAllTime: number;
  shopCounts: ShopStatusCounts;
  topShops: TopShopStat[]; // by booking count within the window, top N
}

export async function getPlatformStats(db: DB, weeks = 8, topN = 5, now = new Date()): Promise<PlatformStats> {
  const currentMonday = mondayOf(shopToday({ timezone: TZ }, now));
  const windowStartMonday = addDays(currentMonday, -(weeks - 1) * 7);
  const windowStart = zonedToUtc(windowStartMonday, 0, TZ);

  const [shopRows, windowRows, allTimeCountRows] = await Promise.all([
    db.select({ id: shops.id, signupStatus: shops.signupStatus, isActive: shops.isActive }).from(shops),
    db
      .select({ startsAt: bookings.startsAt, shopId: bookings.shopId, shopSlug: shops.slug, shopName: shops.name })
      .from(bookings)
      .innerJoin(shops, eq(shops.id, bookings.shopId))
      .where(gte(bookings.startsAt, windowStart)),
    db.select({ n: sql<number>`count(*)::int` }).from(bookings),
  ]);
  const allTimeCount = allTimeCountRows[0]?.n ?? 0;

  const shopCounts: ShopStatusCounts = { pending: 0, active: 0, suspended: 0, rejected: 0 };
  for (const s of shopRows) {
    if (s.signupStatus === "pending") shopCounts.pending++;
    else if (s.signupStatus === "rejected") shopCounts.rejected++;
    else if (s.isActive) shopCounts.active++;
    else shopCounts.suspended++;
  }

  const weekBuckets = new Map<string, PlatformWeekStat>();
  for (let i = 0; i < weeks; i++) {
    const weekStart = addDays(windowStartMonday, i * 7);
    weekBuckets.set(weekStart, { weekStart, count: 0 });
  }
  const shopCountsInWindow = new Map<string, TopShopStat>();

  for (const r of windowRows) {
    const local = utcToZoned(r.startsAt, TZ);
    const week = weekBuckets.get(mondayOf(local.date));
    if (week) week.count++;

    const shopStat = shopCountsInWindow.get(r.shopId) ?? { shopId: r.shopId, shopSlug: r.shopSlug, shopName: r.shopName, count: 0 };
    shopStat.count++;
    shopCountsInWindow.set(r.shopId, shopStat);
  }

  return {
    weeks: [...weekBuckets.values()],
    totalBookingsInWindow: windowRows.length,
    totalBookingsAllTime: allTimeCount,
    shopCounts,
    topShops: [...shopCountsInWindow.values()].sort((a, b) => b.count - a.count).slice(0, topN),
  };
}
