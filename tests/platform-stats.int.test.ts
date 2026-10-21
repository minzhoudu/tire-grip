/**
 * Integration tests for platform-wide aggregate stats (/platforma/statistika):
 * booking volume across every shop, bucketed by week, plus which shops are
 * most active in the window.
 */
import "dotenv/config";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, getDb } from "../src/db/index.ts";
import { bookings, customers, services, shops, vehicleTypes } from "../src/db/schema.ts";
import { getPlatformStats } from "../src/server/platform-stats.ts";

if (process.env.CI && !process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for integration tests in CI");

const TZ = "Europe/Belgrade";
const run = Date.now().toString(36);
const slugA = `it-pstats-a-${run}`;
const slugB = `it-pstats-b-${run}`;
let shopAId = "";
let shopBId = "";
const shopIds: string[] = [];

describe.skipIf(!process.env.DATABASE_URL)("platform stats (Postgres)", () => {
  beforeAll(async () => {
    const db = getDb();
    const [shopA, shopB] = await db
      .insert(shops)
      .values([
        { slug: slugA, name: "IT Platform Stats A", isActive: true, signupStatus: "approved", timezone: TZ },
        { slug: slugB, name: "IT Platform Stats B", isActive: true, signupStatus: "approved", timezone: TZ },
      ])
      .returning();
    shopAId = shopA!.id;
    shopBId = shopB!.id;
    shopIds.push(shopAId, shopBId);

    for (const shopId of shopIds) {
      const [svc] = await db.insert(services).values({ shopId, kind: "other", name: "Usluga", durationMin: 30 }).returning();
      const [car] = await db.insert(vehicleTypes).values({ shopId, label: "Putničko", icon: "🚗" }).returning();
      const [cust] = await db.insert(customers).values({ shopId, name: "Kupac", phone: `+3816411${shopId.slice(0, 5).replace(/\D/g, "1")}` }).returning();

      // 3 bookings for A (this week), 1 for B — so A should lead topShops.
      const count = shopId === shopAId ? 3 : 1;
      const now = new Date();
      for (let i = 0; i < count; i++) {
        const startsAt = new Date(now.getTime() - i * 86_400_000);
        await db.insert(bookings).values({
          shopId,
          customerId: cust!.id,
          serviceId: svc!.id,
          vehicleTypeId: car!.id,
          bay: 1,
          status: "completed",
          startsAt,
          endsAt: new Date(startsAt.getTime() + 30 * 60_000),
          priceRsd: 1000,
          durationMin: 30,
          source: "web",
        });
      }
    }
  });

  afterAll(async () => {
    const db = getDb();
    await db.delete(bookings).where(inArray(bookings.shopId, shopIds));
    await db.delete(customers).where(inArray(customers.shopId, shopIds));
    await db.delete(shops).where(inArray(shops.id, shopIds));
    await closeDb();
  });

  it("counts bookings across shops in the window and ranks the most active shop first", async () => {
    const db = getDb();
    // topN large enough that our 2 fixture shops are guaranteed to show up regardless of other local data.
    const stats = await getPlatformStats(db, 8, 1000);
    expect(stats.totalBookingsInWindow).toBeGreaterThanOrEqual(4);
    expect(stats.totalBookingsAllTime).toBeGreaterThanOrEqual(4);

    const top = stats.topShops.find((s) => s.shopId === shopAId || s.shopId === shopBId);
    expect(top?.shopId).toBe(shopAId); // A has 3 bookings, B has 1 — A should rank above B
    expect(stats.topShops.find((s) => s.shopId === shopAId)?.count).toBe(3);
    expect(stats.topShops.find((s) => s.shopId === shopBId)?.count).toBe(1);

    const weekTotal = stats.weeks.reduce((sum, w) => sum + w.count, 0);
    expect(weekTotal).toBeGreaterThanOrEqual(4);
  });

  it("counts shops by status", async () => {
    const db = getDb();
    const stats = await getPlatformStats(db);
    expect(stats.shopCounts.active).toBeGreaterThanOrEqual(2); // at least our 2 test shops
  });
});
