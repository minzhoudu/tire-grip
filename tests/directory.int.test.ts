/**
 * The public map of shops: only Pro, active, approved shops with a pin, each with its open
 * status and first free slot.
 */
import "dotenv/config";
import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, getDb } from "../src/db/index.ts";
import { servicePrices, services, shops, vehicleTypes, workingHours } from "../src/db/schema.ts";
import { listDirectory, listDirectorySlugs } from "../src/server/directory.ts";

if (process.env.CI && !process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for integration tests in CI");

const run = Date.now().toString(36);
const slugs = { pro: `it-dir-pro-${run}`, basic: `it-dir-basic-${run}`, noPin: `it-dir-nopin-${run}`, inactive: `it-dir-off-${run}` };

describe.skipIf(!process.env.DATABASE_URL)("directory (Postgres)", () => {
  beforeAll(async () => {
    const db = getDb();
    const pin = { latitude: 43.7234, longitude: 20.687 };
    const rows = await db
      .insert(shops)
      .values([
        { slug: slugs.pro, name: "IT Pro radnja", plan: "pro", city: "Kraljevo", address: "Omladinska 1", ...pin, bookingHorizonDays: 7, minNoticeMin: 0 },
        { slug: slugs.basic, name: "IT Basic radnja", plan: "basic", ...pin },
        { slug: slugs.noPin, name: "IT bez pina", plan: "pro" },
        { slug: slugs.inactive, name: "IT ugašena", plan: "pro", isActive: false, ...pin },
      ])
      .returning();
    const pro = rows.find((r) => r.slug === slugs.pro)!;
    await db.insert(workingHours).values([1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ shopId: pro.id, weekday, opensAt: "00:00", closesAt: "23:59" })));
    const [car] = await db.insert(vehicleTypes).values({ shopId: pro.id, label: "Putničko", icon: "🚗" }).returning();
    const [wash, swap] = await db
      .insert(services)
      .values([
        { shopId: pro.id, kind: "other", name: "Pranje", icon: "💧", durationMin: 30, sortOrder: 0 },
        { shopId: pro.id, kind: "seasonal_swap", name: "Zamena guma", icon: "🔄", durationMin: 30, sortOrder: 1 },
      ])
      .returning();
    await db.insert(servicePrices).values([
      { shopId: pro.id, serviceId: wash!.id, vehicleTypeId: car!.id, priceRsd: 800 },
      { shopId: pro.id, serviceId: swap!.id, vehicleTypeId: car!.id, priceRsd: 1500 },
    ]);
  });

  afterAll(async () => {
    await getDb().delete(shops).where(inArray(shops.slug, Object.values(slugs)));
    await closeDb();
  });

  it("lists only active, approved Pro shops that have set their pin", async () => {
    const listed = await listDirectorySlugs(getDb());
    expect(listed).toContain(slugs.pro);
    expect(listed).not.toContain(slugs.basic);
    expect(listed).not.toContain(slugs.noPin);
    expect(listed).not.toContain(slugs.inactive);
  });

  it("shows open status and the first free slot of the tyre change, not just the first service", async () => {
    const entry = (await listDirectory(getDb())).find((s) => s.slug === slugs.pro);
    expect(entry).toMatchObject({ name: "IT Pro radnja", city: "Kraljevo", lat: 43.7234, lng: 20.687, firstFreeService: "Zamena guma" });
    expect(entry!.firstFree).toMatch(/ u \d{2}:\d{2}$/);
    expect(entry!.services.map((s) => s.name)).toEqual(["Pranje", "Zamena guma"]);
  });
});
