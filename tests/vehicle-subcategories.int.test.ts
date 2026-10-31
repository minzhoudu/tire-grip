/**
 * Vehicle subcategories end to end: the first subcategory takes over its vehicle's prices, a
 * group is never priced or booked itself, customers book a subcategory, and the admin sees
 * "Kamion stočar · 2 sprata".
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, getDb } from "../src/db/index.ts";
import { bookings, servicePrices, services, shops, vehicleTypes, workingHours } from "../src/db/schema.ts";
import { addDays, shopToday, zonedToUtc } from "../src/lib/availability/index.ts";
import { bookingRequestSchema } from "../src/lib/booking/request.ts";
import { getBooking } from "../src/server/admin.ts";
import { createBookingRequest } from "../src/server/bookings.ts";
import {
  createVehicleSubcategory,
  createVehicleType,
  deleteVehicleType,
  listVehicleTypesForSettings,
  moveVehicleType,
  updateService,
} from "../src/server/settings.ts";
import { findOffer, loadShopContext } from "../src/server/shops.ts";

if (process.env.CI && !process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for integration tests in CI");

const TZ = "Europe/Belgrade";
const run = Date.now().toString(36);
const slug = `it-subcat-${run}`;
let shopId = "";
let serviceId = "";
let carId = "";
let truckId = "";
let floor1 = "";
let floor2 = "";
const date = addDays(shopToday({ timezone: TZ }, new Date()), 2);

describe.skipIf(!process.env.DATABASE_URL)("vehicle subcategories (Postgres)", () => {
  beforeAll(async () => {
    const db = getDb();
    const [shop] = await db.insert(shops).values({ slug, name: "IT podkategorije", bays: 2, minNoticeMin: 0, bookingHorizonDays: 30 }).returning();
    shopId = shop!.id;
    await db.insert(workingHours).values([1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ shopId, weekday, opensAt: "08:00", closesAt: "17:00" })));
    const [svc] = await db.insert(services).values({ shopId, kind: "other", name: "Pranje", durationMin: 60 }).returning();
    serviceId = svc!.id;
    carId = await createVehicleType(db, shopId, { label: "Putničko", icon: "🚗" });
    truckId = await createVehicleType(db, shopId, { label: "Kamion stočar", icon: "🚚" });
    await db.insert(servicePrices).values([
      { shopId, serviceId, vehicleTypeId: carId, priceRsd: 1000 },
      { shopId, serviceId, vehicleTypeId: truckId, priceRsd: 5000 },
    ]);
  });

  afterAll(async () => {
    const db = getDb();
    await db.delete(bookings).where(eq(bookings.shopId, shopId));
    await db.delete(shops).where(eq(shops.id, shopId));
    await closeDb();
  });

  it("the first subcategory takes over the vehicle's prices; the next ones start unpriced", async () => {
    const db = getDb();
    const first = await createVehicleSubcategory(db, shopId, truckId, "1 sprat");
    expect(first).toMatchObject({ ok: true, movedPrices: 1 });
    floor1 = first.ok ? first.id : "";
    const second = await createVehicleSubcategory(db, shopId, truckId, "2 sprata");
    expect(second).toMatchObject({ ok: true, movedPrices: 0 });
    floor2 = second.ok ? second.id : "";

    const prices = await db.select().from(servicePrices).where(eq(servicePrices.serviceId, serviceId));
    expect(prices.map((p) => [p.vehicleTypeId, p.priceRsd]).sort()).toEqual([[carId, 1000], [floor1, 5000]].sort());
    const [sub] = await db.select().from(vehicleTypes).where(eq(vehicleTypes.id, floor1));
    expect(sub).toMatchObject({ parentId: truckId, icon: null });
  });

  it("subcategories are one level deep and stay inside the shop", async () => {
    const db = getDb();
    expect(await createVehicleSubcategory(db, shopId, floor1, "pola sprata")).toEqual({ ok: false, reason: "parent_not_found" });
    expect(await createVehicleSubcategory(db, shopId, "00000000-0000-0000-0000-000000000000", "x")).toEqual({ ok: false, reason: "parent_not_found" });
  });

  it("saving a service drops a price for a group and keeps the subcategories' prices", async () => {
    const db = getDb();
    await updateService(db, shopId, serviceId, {
      kind: "other",
      name: "Pranje",
      description: null,
      icon: null,
      durationMin: 60,
      bookable: true,
      prices: [
        { vehicleTypeId: carId, priceRsd: 1000, durationMin: null },
        { vehicleTypeId: truckId, priceRsd: 9999, durationMin: null },
        { vehicleTypeId: floor1, priceRsd: 5000, durationMin: null },
        { vehicleTypeId: floor2, priceRsd: 8000, durationMin: 90 },
      ],
    });
    const prices = await db.select().from(servicePrices).where(eq(servicePrices.serviceId, serviceId));
    expect(prices.map((p) => p.vehicleTypeId).sort()).toEqual([carId, floor1, floor2].sort());
  });

  it("the booking page lists the subcategories under their vehicle, and only they can be booked", async () => {
    const db = getDb();
    const ctx = (await loadShopContext(db, slug))!;
    expect(ctx.vehicleTypes.map((vt) => [vt.label, vt.isGroup])).toEqual([
      ["Putničko", false],
      ["Kamion stočar", true],
      ["Kamion stočar · 1 sprat", false],
      ["Kamion stočar · 2 sprata", false],
    ]);
    expect(ctx.vehicleTypes.find((vt) => vt.id === floor2)?.icon).toBe("🚚");
    expect(ctx.services[0]!.prices.map((p) => p.vehicleTypeId)).toEqual([carId, floor1, floor2]);
    expect(findOffer(ctx, serviceId, truckId)).toBeNull();
    expect(findOffer(ctx, serviceId, floor2)?.offer).toEqual({ priceRsd: 8000, durationMin: 90 });
  });

  it("a customer books a subcategory, and the admin sees its full name", async () => {
    const db = getDb();
    const req = bookingRequestSchema.parse({
      slug,
      serviceId,
      vehicleTypeId: floor2,
      startsAt: zonedToUtc(date, 10 * 60, TZ).toISOString(),
      name: "Stočar Pera",
      phone: "064 900 1001",
    });
    const r = await createBookingRequest(db, req);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.booking).toMatchObject({ priceRsd: 8000, durationMin: 90 });
    const b = await getBooking(db, shopId, r.booking.id);
    expect(b).toMatchObject({ vehicleTypeLabel: "Kamion stočar · 2 sprata", vehicleTypeIcon: "🚚" });

    // booking the group itself is refused
    const group = await createBookingRequest(db, { ...req, vehicleTypeId: truckId, phone: "+381649001002" });
    expect(group).toEqual({ ok: false, reason: "service_unavailable" });
  });

  it("a booked subcategory blocks deleting it and its vehicle; an unbooked one can go", async () => {
    const db = getDb();
    const listed = await listVehicleTypesForSettings(db, shopId);
    expect(listed.find((vt) => vt.id === truckId)?.hasBookings).toBe(true);
    expect(await deleteVehicleType(db, shopId, truckId)).toEqual({ ok: false, reason: "has_bookings" });
    expect(await deleteVehicleType(db, shopId, floor2)).toEqual({ ok: false, reason: "has_bookings" });
    expect(await deleteVehicleType(db, shopId, floor1)).toEqual({ ok: true });
  });

  it("reorders subcategories among themselves only", async () => {
    const db = getDb();
    const third = await createVehicleSubcategory(db, shopId, truckId, "3 sprata");
    if (!third.ok) throw new Error("create failed");
    await moveVehicleType(db, shopId, third.id, "up");
    const subs = (await listVehicleTypesForSettings(db, shopId)).filter((vt) => vt.parentId === truckId);
    expect(subs.map((vt) => vt.label)).toEqual(["3 sprata", "2 sprata"]);
    // top-level order untouched
    const tops = (await listVehicleTypesForSettings(db, shopId)).filter((vt) => vt.parentId === null);
    expect(tops.map((vt) => vt.label)).toEqual(["Putničko", "Kamion stočar"]);
  });
});
