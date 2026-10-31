/**
 * Support-only hard delete of a booking (platform admin in "Uđi kao"): the slot is free
 * again and nothing is left behind, and it can't reach another shop's booking.
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, getDb } from "../src/db/index.ts";
import { bookings, servicePrices, services, shops, vehicleTypes, workingHours } from "../src/db/schema.ts";
import { addDays, shopToday, zonedToUtc } from "../src/lib/availability/index.ts";
import { bookingRequestSchema } from "../src/lib/booking/request.ts";
import { deleteBookingForSupport } from "../src/server/admin.ts";
import { createBookingRequest } from "../src/server/bookings.ts";

if (process.env.CI && !process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for integration tests in CI");

const TZ = "Europe/Belgrade";
const run = Date.now().toString(36);
const slug = `it-support-del-${run}`;
let shopId = "";
let otherShopId = "";
let serviceId = "";
let carTypeId = "";
const date = addDays(shopToday({ timezone: TZ }, new Date()), 2);

const request = (phone: string) =>
  bookingRequestSchema.parse({ slug, serviceId, vehicleTypeId: carTypeId, startsAt: zonedToUtc(date, 10 * 60, TZ).toISOString(), name: "Test Kupac", phone });

describe.skipIf(!process.env.DATABASE_URL)("support: delete booking (Postgres)", () => {
  beforeAll(async () => {
    const db = getDb();
    const [shop] = await db.insert(shops).values({ slug, name: "IT brisanje", bays: 1, minNoticeMin: 0, bookingHorizonDays: 30 }).returning();
    shopId = shop!.id;
    const [other] = await db.insert(shops).values({ slug: `${slug}-druga`, name: "IT druga radnja" }).returning();
    otherShopId = other!.id;
    await db.insert(workingHours).values([1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ shopId, weekday, opensAt: "08:00", closesAt: "17:00" })));
    const [svc] = await db.insert(services).values({ shopId, kind: "seasonal_swap", name: "Zamena guma", durationMin: 30 }).returning();
    serviceId = svc!.id;
    const [car] = await db.insert(vehicleTypes).values({ shopId, label: "Putničko" }).returning();
    carTypeId = car!.id;
    await db.insert(servicePrices).values({ shopId, serviceId, vehicleTypeId: carTypeId, priceRsd: 1500 });
  });

  afterAll(async () => {
    const db = getDb();
    await db.delete(bookings).where(eq(bookings.shopId, shopId));
    await db.delete(shops).where(eq(shops.id, shopId));
    await db.delete(shops).where(eq(shops.id, otherShopId));
    await closeDb();
  });

  it("removes the booking for good and frees its slot", async () => {
    const db = getDb();
    const first = await createBookingRequest(db, request("064 900 0001"));
    if (!first.ok) throw new Error("booking failed");
    // the only bay is taken now
    expect(await createBookingRequest(db, request("064 900 0002"))).toEqual({ ok: false, reason: "slot_unavailable" });

    const details = await deleteBookingForSupport(db, { id: shopId, timezone: TZ }, first.booking.id);
    expect(details).toContain("Test Kupac");
    expect(details).toContain(`${date} 10:00`);
    expect(await db.select().from(bookings).where(eq(bookings.id, first.booking.id))).toHaveLength(0);

    expect((await createBookingRequest(db, request("064 900 0002"))).ok).toBe(true);
  });

  it("can't delete another shop's booking, or one that's already gone", async () => {
    const db = getDb();
    const [row] = await db.select({ id: bookings.id }).from(bookings).where(eq(bookings.shopId, shopId)).limit(1);
    expect(await deleteBookingForSupport(db, { id: otherShopId, timezone: TZ }, row!.id)).toBeNull();
    expect(await db.select().from(bookings).where(eq(bookings.id, row!.id))).toHaveLength(1);
    expect(await deleteBookingForSupport(db, { id: shopId, timezone: TZ }, "00000000-0000-0000-0000-000000000000")).toBeNull();
  });
});
