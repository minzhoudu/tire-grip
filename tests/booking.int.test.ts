/**
 * Integration test: booking requests against a real Postgres.
 * Needs DATABASE_URL with the current schema and the bookings_no_overlap
 * constraint (CI applies the migrations with `pnpm db:setup`). Skipped otherwise.
 *
 * Creates its own throwaway shop (open every day 08–17, 2 bays) so it doesn't
 * depend on the seed or on what weekday the test runs.
 */
import "dotenv/config";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, getDb } from "../src/db/index.ts";
import { bookings, customers, servicePrices, services, shops, vehicleTypes, vehicles, workingHours } from "../src/db/schema.ts";
import { addDays, shopToday, zonedToUtc } from "../src/lib/availability/index.ts";
import { bookingRequestSchema } from "../src/lib/booking/request.ts";
import { pgErrorCode, createBookingRequest } from "../src/server/bookings.ts";

const TZ = "Europe/Belgrade";
const slug = `it-${Date.now().toString(36)}`;
let shopId = "";
let swapId = "";
let storageId = "";
let carTypeId = "";
let suvTypeId = "";
/** Syntactically valid, but no service in this shop has a price for it — exercises "service_unavailable". */
const unknownTypeId = "00000000-0000-4000-8000-000000000099";

// Two days ahead: always inside the horizon and never "too soon".
const date = addDays(shopToday({ timezone: TZ }, new Date()), 2);
const at = (hh: number, mm = 0) => zonedToUtc(date, hh * 60 + mm, TZ).toISOString();

const request = (over: Record<string, unknown> = {}) =>
  bookingRequestSchema.parse({
    slug,
    serviceId: swapId,
    vehicleTypeId: carTypeId,
    startsAt: at(10),
    name: "Marko",
    phone: "064 100 0001",
    ...over,
  });

// In CI the database is required: a missing DATABASE_URL must fail, not silently skip.
if (process.env.CI && !process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for integration tests in CI");

describe.skipIf(!process.env.DATABASE_URL)("createBookingRequest (Postgres)", () => {
  beforeAll(async () => {
    const db = getDb();
    const [shop] = await db
      .insert(shops)
      .values({ slug, name: "IT radnja", phone: "+381641234567", bays: 2, minNoticeMin: 0, bookingHorizonDays: 30 })
      .returning();
    shopId = shop!.id;
    const [swap, storage] = await db
      .insert(services)
      .values([
        { shopId, kind: "seasonal_swap", name: "Zamena guma", durationMin: 30 },
        { shopId, kind: "storage", name: "Čuvanje guma", bookable: false },
      ])
      .returning();
    swapId = swap!.id;
    storageId = storage!.id;
    const [car, suvType] = await db
      .insert(vehicleTypes)
      .values([
        { shopId, label: "Putničko", icon: "🚗" },
        { shopId, label: "SUV / džip", icon: "🚙" },
      ])
      .returning();
    carTypeId = car!.id;
    suvTypeId = suvType!.id;
    await db.insert(servicePrices).values([
      { shopId, serviceId: swapId, vehicleTypeId: carTypeId, priceRsd: 1500 },
      { shopId, serviceId: swapId, vehicleTypeId: suvTypeId, priceRsd: 2000, durationMin: 60 },
      { shopId, serviceId: storageId, vehicleTypeId: carTypeId, priceRsd: 3000 },
    ]);
    await db
      .insert(workingHours)
      .values([1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ shopId, weekday, opensAt: "08:00", closesAt: "17:00" })));
  });

  afterAll(async () => {
    const db = getDb();
    if (shopId) {
      await db.delete(bookings).where(eq(bookings.shopId, shopId));
      await db.delete(shops).where(eq(shops.id, shopId));
    }
    await closeDb();
  });

  it("books the first free bay, then the second, then reports the slot as taken", async () => {
    const db = getDb();
    const first = await createBookingRequest(db, request());
    const second = await createBookingRequest(db, request({ phone: "064 100 0002", name: "Ana" }));
    const third = await createBookingRequest(db, request({ phone: "064 100 0003", name: "Jovan" }));

    expect(first.ok && first.booking.bay).toBe(1);
    expect(first.ok && first.booking.status).toBe("pending");
    expect(first.ok && first.booking.priceRsd).toBe(1500);
    expect(first.ok && first.booking.time).toBe("10:00");
    expect(second.ok && second.booking.bay).toBe(2);
    expect(third).toEqual({ ok: false, reason: "slot_unavailable" });
  });

  it("parallel requests for the same slot: exactly one per bay wins, the loser writes nothing", async () => {
    const db = getDb();
    const phones = ["064 200 0001", "064 200 0002", "064 200 0003"];
    const results = await Promise.all(
      phones.map((phone, i) => createBookingRequest(db, request({ phone, name: `Paralelni ${i}`, startsAt: at(11) }))),
    );

    // One line per request so a failure shows exactly what each one got.
    const outcomes = results.map((r) => (r.ok ? `bay ${r.booking.bay}` : r.reason)).sort();
    expect(outcomes).toEqual(["bay 1", "bay 2", "slot_unavailable"]);

    const rows = await db
      .select({ id: bookings.id })
      .from(bookings)
      .where(and(eq(bookings.shopId, shopId), eq(bookings.startsAt, new Date(at(11)))));
    expect(rows).toHaveLength(2);

    // The losing transaction rolled back its customer upsert too.
    const saved = await db
      .select({ phone: customers.phone })
      .from(customers)
      .where(and(eq(customers.shopId, shopId), inArray(customers.phone, ["+381642000001", "+381642000002", "+381642000003"])));
    expect(saved).toHaveLength(2);
  });

  it("under load (10 parallel requests, 5 rounds) never errors: 2 winners, the rest 'taken'", async () => {
    const db = getDb();
    for (let round = 0; round < 5; round++) {
      // its own day, so it doesn't collide with the other tests; one slot per round (08:00 … 10:00)
      const startsAt = zonedToUtc(addDays(date, 1), 8 * 60 + round * 30, TZ).toISOString();
      const results = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          createBookingRequest(db, request({ phone: `064 9${round}0 00${String(i).padStart(2, "0")}`, name: `Talas ${round}-${i}`, startsAt })),
        ),
      );
      const outcomes = results.map((r) => (r.ok ? `bay ${r.booking.bay}` : r.reason)).sort();
      expect(outcomes, `round ${round}`).toEqual(["bay 1", "bay 2", ...Array(8).fill("slot_unavailable")]);
    }
  });

  it("a longer service (SUV, 60 min) needs both half-hours free", async () => {
    const db = getDb();
    // 13:30 is fully booked → a 60-minute booking at 13:00 can't fit
    await createBookingRequest(db, request({ phone: "064 300 0001", startsAt: at(13, 30) }));
    await createBookingRequest(db, request({ phone: "064 300 0002", startsAt: at(13, 30) }));
    const suv = await createBookingRequest(db, request({ phone: "064 300 0003", vehicleTypeId: suvTypeId, startsAt: at(13) }));
    expect(suv).toEqual({ ok: false, reason: "slot_unavailable" });

    const ok = await createBookingRequest(db, request({ phone: "064 300 0003", vehicleTypeId: suvTypeId, startsAt: at(14) }));
    expect(ok.ok && ok.booking.durationMin).toBe(60);
    expect(ok.ok && ok.booking.endsAt.toISOString()).toBe(at(15));
  });

  it("the same phone is one customer; the name is updated and the car is reused", async () => {
    const db = getDb();
    const a = await createBookingRequest(db, request({ phone: "064 400 0001", name: "Pera", vehicleLabel: "Golf 7", startsAt: at(15) }));
    const b = await createBookingRequest(
      db,
      request({ phone: "+381 64 4000001", name: "Petar", vehicleLabel: "golf 7", startsAt: at(16), reminderConsent: true }),
    );
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(b.booking.customerId).toBe(a.booking.customerId);
    expect(b.booking.vehicleId).toBe(a.booking.vehicleId);

    const [customer] = await db.select().from(customers).where(eq(customers.id, a.booking.customerId));
    expect(customer!.name).toBe("Petar");
    expect(customer!.reminderConsent).toBe(true);
    expect(customer!.reminderConsentAt).not.toBeNull();

    const cars = await db.select().from(vehicles).where(eq(vehicles.customerId, a.booking.customerId));
    expect(cars).toHaveLength(1);
  });

  it("rejects start times that aren't real slots", async () => {
    const db = getDb();
    expect(await createBookingRequest(db, request({ startsAt: at(10, 10) }))).toEqual({ ok: false, reason: "slot_unavailable" });
    expect(await createBookingRequest(db, request({ startsAt: at(7) }))).toEqual({ ok: false, reason: "slot_unavailable" });
    expect(await createBookingRequest(db, request({ startsAt: at(16, 45) }))).toEqual({ ok: false, reason: "slot_unavailable" });
    const yesterday = zonedToUtc(addDays(date, -3), 10 * 60, TZ).toISOString();
    expect(await createBookingRequest(db, request({ startsAt: yesterday }))).toEqual({ ok: false, reason: "slot_unavailable" });
  });

  it("rejects services that can't be booked and unknown shops", async () => {
    const db = getDb();
    expect(await createBookingRequest(db, request({ serviceId: storageId }))).toEqual({ ok: false, reason: "service_unavailable" });
    expect(await createBookingRequest(db, request({ vehicleTypeId: unknownTypeId }))).toEqual({ ok: false, reason: "service_unavailable" });
    expect(await createBookingRequest(db, request({ slug: "ne-postoji" }))).toEqual({ ok: false, reason: "shop_not_found" });
  });

  it("auto-confirm shops create confirmed bookings", async () => {
    const db = getDb();
    await db.update(shops).set({ autoConfirm: true }).where(eq(shops.id, shopId));
    const r = await createBookingRequest(db, request({ phone: "064 500 0001", startsAt: at(9) }));
    await db.update(shops).set({ autoConfirm: false }).where(eq(shops.id, shopId));
    expect(r.ok && r.booking.status).toBe("confirmed");
  });

  it("the database itself still rejects an overlapping insert (23P01)", async () => {
    const db = getDb();
    const [existing] = await db.select().from(bookings).where(and(eq(bookings.shopId, shopId), eq(bookings.bay, 1))).limit(1);
    const { id: _id, createdAt: _c, updatedAt: _u, ...copy } = existing!;
    const err = await db
      .insert(bookings)
      .values(copy)
      .then(() => null)
      .catch((e: unknown) => e);
    expect(pgErrorCode(err)).toBe("23P01");
  });
});
