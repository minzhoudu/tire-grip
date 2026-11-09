/**
 * "Rezervacija radnje": the shop enters a booking in a few taps without the customer's data.
 * No customer row is created, nothing about it reaches Kupci, and the details can be added later.
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, getDb } from "../src/db/index.ts";
import { bookings, customers, servicePrices, services, shops, vehicleTypes, vehicles, workingHours } from "../src/db/schema.ts";
import { addDays, shopToday, zonedToUtc } from "../src/lib/availability/index.ts";
import { adminBookingRequestSchema, bookingRequestSchema } from "../src/lib/booking/request.ts";
import { SHOP_ENTRY_NAME } from "../src/lib/booking/status.ts";
import { attachCustomerToBooking, customerMessageUrl, getBooking, toBookingCardData } from "../src/server/admin.ts";
import { createBookingRequest } from "../src/server/bookings.ts";
import { searchShopCustomers } from "../src/server/customers.ts";

if (process.env.CI && !process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for integration tests in CI");

const TZ = "Europe/Belgrade";
const run = Date.now().toString(36);
const slug = `it-shop-entry-${run}`;
let shopId = "";
let serviceId = "";
let carId = "";
const date = addDays(shopToday({ timezone: TZ }, new Date()), 2);
const at = (hh: number) => zonedToUtc(date, hh * 60, TZ).toISOString();
const shopInfo = () => ({ name: "IT radnja", slug, address: null, timezone: TZ, bays: 3 });

const entry = (hh: number, over: Record<string, unknown> = {}) =>
  adminBookingRequestSchema.parse({ slug, serviceId, vehicleTypeId: carId, startsAt: at(hh), ...over });

describe.skipIf(!process.env.DATABASE_URL)("Rezervacija radnje (Postgres)", () => {
  beforeAll(async () => {
    const db = getDb();
    const [shop] = await db.insert(shops).values({ slug, name: "IT radnja", bays: 3, minNoticeMin: 0, bookingHorizonDays: 30 }).returning();
    shopId = shop!.id;
    await db.insert(workingHours).values([1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ shopId, weekday, opensAt: "08:00", closesAt: "17:00" })));
    const [svc] = await db.insert(services).values({ shopId, kind: "seasonal_swap", name: "Zamena guma", durationMin: 30 }).returning();
    serviceId = svc!.id;
    const [car] = await db.insert(vehicleTypes).values({ shopId, label: "Putničko", icon: "🚗" }).returning();
    carId = car!.id;
    await db.insert(servicePrices).values({ shopId, serviceId, vehicleTypeId: carId, priceRsd: 1500 });
  });

  afterAll(async () => {
    const db = getDb();
    await db.delete(bookings).where(eq(bookings.shopId, shopId));
    await db.delete(shops).where(eq(shops.id, shopId));
    await closeDb();
  });

  it("books with no customer data at all: confirmed, no customer row, shown as Rezervacija radnje", async () => {
    const db = getDb();
    const r = await createBookingRequest(db, entry(9), { source: "admin" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.booking).toMatchObject({ status: "confirmed", customerId: null, vehicleId: null });
    expect(await db.select().from(customers).where(eq(customers.shopId, shopId))).toHaveLength(0);

    const b = (await getBooking(db, shopId, r.booking.id))!;
    expect(b).toMatchObject({ customerId: null, customerName: SHOP_ENTRY_NAME, customerPhone: null, customerNoShows: 0 });
    expect(customerMessageUrl(b, shopInfo(), "confirm", "http://x")).toBeNull();
    expect(toBookingCardData(b, shopInfo(), "http://x")).toMatchObject({ isShopEntry: true, notifyUrl: null, customerPhone: null });
  });

  it("keeps a name given without a phone, and puts the car in the note", async () => {
    const db = getDb();
    const r = await createBookingRequest(db, entry(10, { name: "Marko", vehicleLabel: "Golf 7", note: "hitno" }), { source: "admin" });
    if (!r.ok) throw new Error("booking failed");
    const b = (await getBooking(db, shopId, r.booking.id))!;
    expect(b).toMatchObject({ customerName: "Marko", customerPhone: null, customerNote: "Auto: Golf 7 · hitno" });
  });

  it("a phone without a name still creates the customer, listed under the number", async () => {
    const db = getDb();
    const r = await createBookingRequest(db, entry(11, { phone: "064 900 2001" }), { source: "admin" });
    if (!r.ok) throw new Error("booking failed");
    const [c] = await db.select().from(customers).where(eq(customers.id, r.booking.customerId!));
    expect(c).toMatchObject({ phone: "+381649002001", name: "064 900 2001" });

    // a known customer keeps their name when the shop leaves it empty
    await db.update(customers).set({ name: "Jovan" }).where(eq(customers.id, c!.id));
    const again = await createBookingRequest(db, entry(12, { phone: "064 900 2001" }), { source: "admin" });
    if (!again.ok) throw new Error("booking failed");
    expect((await getBooking(db, shopId, again.booking.id))!.customerName).toBe("Jovan");
  });

  it("only the shop can leave the customer out: the chat and the database both refuse it", async () => {
    const db = getDb();
    await expect(createBookingRequest(db, entry(13), { source: "web" })).rejects.toThrow();
    await expect(
      db.insert(bookings).values({
        shopId,
        serviceId,
        vehicleTypeId: carId,
        priceRsd: 1500,
        durationMin: 30,
        startsAt: new Date(at(14)),
        endsAt: new Date(at(15)),
        bay: 1,
        source: "web",
      }),
    ).rejects.toThrow();
    // the chat's own schema still requires name and phone
    expect(bookingRequestSchema.safeParse({ slug, serviceId, vehicleTypeId: carId, startsAt: at(13) }).success).toBe(false);
  });

  it("customer details can be added afterwards: a name alone, then a phone that links the customer and car", async () => {
    const db = getDb();
    const r = await createBookingRequest(db, entry(15), { source: "admin" });
    if (!r.ok) throw new Error("booking failed");
    const id = r.booking.id;

    expect(await attachCustomerToBooking(db, shopId, id, { name: "", phone: null, vehicleLabel: "" })).toEqual({ ok: false, reason: "empty" });
    expect(await attachCustomerToBooking(db, shopId, id, { name: "Ana", phone: null, vehicleLabel: "" })).toEqual({ ok: true });
    expect((await getBooking(db, shopId, id))!).toMatchObject({ customerName: "Ana", customerId: null });

    expect(await attachCustomerToBooking(db, shopId, id, { name: "Ana", phone: "+381649002002", vehicleLabel: "Clio" })).toEqual({ ok: true });
    const b = (await getBooking(db, shopId, id))!;
    expect(b).toMatchObject({ customerName: "Ana", customerPhone: "+381649002002", vehicleLabel: "Clio" });
    expect(customerMessageUrl(b, shopInfo(), "confirm", "http://x")).toContain("wa.me");
    const [row] = await db.select().from(bookings).where(eq(bookings.id, id));
    expect(row!.guestName).toBeNull();
    expect(await db.select().from(vehicles).where(eq(vehicles.customerId, row!.customerId!))).toHaveLength(1);

    // once it has a customer it's an ordinary booking: no more "add details"
    expect(await attachCustomerToBooking(db, shopId, id, { name: "X", phone: null, vehicleLabel: "" })).toEqual({ ok: false, reason: "not_found" });
  });

  it("Kupci lists only real customers", async () => {
    const page = await searchShopCustomers(getDb(), shopId);
    expect(page.rows.map((c) => c.name).sort()).toEqual(["Ana", "Jovan"]);
  });
});
