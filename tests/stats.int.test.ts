/**
 * Integration tests for the owner's stats page: weekly trend (zero-filled),
 * revenue counts only "completed", no-show rate ignores not-yet-due
 * bookings, and the window boundary excludes anything older than 8 weeks.
 *
 * Bookings are inserted directly (not via createBookingRequest) because the
 * booking engine only ever creates future-dated, pending bookings — stats
 * need a spread of past weeks and final statuses (completed/no_show/cancelled).
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, getDb } from "../src/db/index.ts";
import { bookings, customers, services, shops, vehicleTypes, workingHours } from "../src/db/schema.ts";
import { addDays, isoWeekday, shopToday, zonedToUtc } from "../src/lib/availability/index.ts";
import { getShopStats } from "../src/server/stats.ts";

if (process.env.CI && !process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for integration tests in CI");

const TZ = "Europe/Belgrade";
const run = Date.now().toString(36);
const slug = `it-stats-${run}`;
const now = new Date();
let shopId = "";
let swapId = "";
let repairId = "";
let customerId = "";
let carTypeId = "";

const mondayOf = (date: string) => addDays(date, -(isoWeekday(date) - 1));
const at = (date: string, hh: number) => zonedToUtc(date, hh * 60, TZ);
const currentMonday = mondayOf(shopToday({ timezone: TZ }, now));

describe.skipIf(!process.env.DATABASE_URL)("shop stats (Postgres)", () => {
  beforeAll(async () => {
    const db = getDb();
    const [shop] = await db.insert(shops).values({ slug, name: "IT statistika radnja", bays: 5, timezone: TZ }).returning();
    shopId = shop!.id;
    await db.insert(workingHours).values([1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ shopId, weekday, opensAt: "08:00", closesAt: "17:00" })));
    const [swap, repair] = await db
      .insert(services)
      .values([
        { shopId, kind: "seasonal_swap", name: "Zamena guma", icon: "🔄", durationMin: 30 },
        { shopId, kind: "repair", name: "Popravka gume", icon: "🔧", durationMin: 20 },
      ])
      .returning();
    swapId = swap!.id;
    repairId = repair!.id;
    const [car] = await db.insert(vehicleTypes).values({ shopId, label: "Putničko", icon: "🚗" }).returning();
    carTypeId = car!.id;
    const [customer] = await db.insert(customers).values({ shopId, name: "Stats Kupac", phone: "+381641230000" }).returning();
    customerId = customer!.id;

    const row = (weeksAgo: number, weekday: number, hh: number, status: "pending" | "completed" | "no_show" | "cancelled", serviceId: string, priceRsd: number) => {
      const weekMonday = addDays(currentMonday, -weeksAgo * 7);
      const date = addDays(weekMonday, weekday - 1);
      const startsAt = at(date, hh);
      return {
        shopId,
        customerId,
        serviceId,
        vehicleTypeId: carTypeId,
        priceRsd,
        durationMin: 30,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 30 * 60_000),
        bay: 1,
        status,
        source: "admin" as const,
      };
    };

    await db.insert(bookings).values([
      row(0, 2, 9, "pending", swapId, 1500), // this week: counts, no revenue (not completed)
      row(1, 3, 10, "completed", swapId, 1500), // last week: counts + revenue + no-show denominator
      row(1, 4, 11, "no_show", repairId, 800), // last week: counts, no revenue, no-show numerator+denominator
      row(2, 2, 9, "cancelled", swapId, 1500), // 2 weeks ago: counts only
      row(3, 3, 9, "completed", swapId, 1500), // another completed swap, for top-services ranking
      row(10, 2, 9, "completed", swapId, 9999), // 10 weeks ago: outside the 8-week window, must be excluded entirely
    ]);
  });

  afterAll(async () => {
    const db = getDb();
    if (shopId) {
      await db.delete(bookings).where(eq(bookings.shopId, shopId));
      await db.delete(shops).where(eq(shops.id, shopId));
    }
    await closeDb();
  });

  it("buckets by week (zero-filled), counting all statuses but only completed revenue", async () => {
    const stats = await getShopStats(getDb(), { id: shopId, timezone: TZ }, 8, now);
    expect(stats.weeks).toHaveLength(8);
    expect(stats.weeks[7]).toMatchObject({ weekStart: currentMonday, count: 1, revenueRsd: 0 }); // this week: pending only

    const lastWeek = stats.weeks[6]!;
    expect(lastWeek).toMatchObject({ count: 2, revenueRsd: 1500 }); // completed + no_show, revenue from the completed one only

    const twoWeeksAgo = stats.weeks[5]!;
    expect(twoWeeksAgo).toMatchObject({ count: 1, revenueRsd: 0 }); // cancelled: counted, no revenue

    const emptyWeek = stats.weeks[0]!; // 7 weeks ago: nothing was inserted there
    expect(emptyWeek).toMatchObject({ count: 0, revenueRsd: 0 });
  });

  it("excludes anything older than the window, and totals match the sum of the weeks shown", async () => {
    const stats = await getShopStats(getDb(), { id: shopId, timezone: TZ }, 8, now);
    // 5 bookings fall inside the 8-week window; the 10-weeks-ago one (9999 din) must not leak in.
    expect(stats.totalCount).toBe(5);
    expect(stats.totalRevenueRsd).toBe(3000); // the two completed swaps inside the window, 1500 each
    expect(stats.totalRevenueRsd).toBe(stats.weeks.reduce((sum, w) => sum + w.revenueRsd, 0));
  });

  it("no-show rate counts only bookings that have reached their time (completed + no_show)", async () => {
    const stats = await getShopStats(getDb(), { id: shopId, timezone: TZ }, 8, now);
    // 1 no_show out of (2 completed + 1 no_show) = 33.3%; the still-pending booking doesn't count either way.
    expect(stats.noShowRate).toBeCloseTo(33.33, 1);
  });

  it("ranks services by booking count and aggregates weekday counts across weeks", async () => {
    const stats = await getShopStats(getDb(), { id: shopId, timezone: TZ }, 8, now);
    expect(stats.topServices[0]).toMatchObject({ serviceId: swapId, count: 4 });
    expect(stats.topServices[1]).toMatchObject({ serviceId: repairId, count: 1 });

    const tuesday = stats.byWeekday.find((d) => d.weekday === 2)!; // weekday 2 bookings: this week + 2 weeks ago
    expect(tuesday.count).toBe(2);
  });

  it("returns a null no-show rate and empty weeks for a shop with no bookings yet", async () => {
    const db = getDb();
    const [empty] = await db.insert(shops).values({ slug: `${slug}-empty`, name: "Prazna radnja", timezone: TZ }).returning();
    const stats = await getShopStats(db, { id: empty!.id, timezone: TZ }, 8, now);
    expect(stats.noShowRate).toBeNull();
    expect(stats.totalCount).toBe(0);
    expect(stats.topServices).toEqual([]);
    expect(stats.weeks.every((w) => w.count === 0 && w.revenueRsd === 0)).toBe(true);
    await db.delete(shops).where(eq(shops.id, empty!.id));
  });
});
