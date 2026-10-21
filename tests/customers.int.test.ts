/**
 * Integration tests for the customer directory: the shop-side "Kupci" list
 * (listShopCustomers, getShopCustomer, listCustomerBookings) and the public
 * phone lookup (findBookingsByPhone) customers use without an account.
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, getDb } from "../src/db/index.ts";
import { bookings, customers, services, shops, vehicleTypes } from "../src/db/schema.ts";
import { listCustomerBookings } from "../src/server/admin.ts";
import { findBookingsByPhone, getShopBasics, getShopCustomer, listShopCustomers } from "../src/server/customers.ts";

if (process.env.CI && !process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for integration tests in CI");

const run = Date.now().toString(36);
const slug = `it-customers-${run}`;
let shopId = "";
let serviceId = "";
let carTypeId = "";
let customerAId = "";
let customerBId = "";

describe.skipIf(!process.env.DATABASE_URL)("customer directory (Postgres)", () => {
  beforeAll(async () => {
    const db = getDb();
    const [shop] = await db.insert(shops).values({ slug, name: "IT Kupci Radnja", isActive: true, signupStatus: "approved" }).returning();
    shopId = shop!.id;
    const [svc] = await db.insert(services).values({ shopId, kind: "other", name: "Usluga", durationMin: 30 }).returning();
    serviceId = svc!.id;
    const [car] = await db.insert(vehicleTypes).values({ shopId, label: "Putničko", icon: "🚗" }).returning();
    carTypeId = car!.id;

    const [custA, custB] = await db
      .insert(customers)
      .values([
        { shopId, name: "Ana Anić", phone: "+381641110001" },
        { shopId, name: "Bane Banić", phone: "+381641110002" },
      ])
      .returning();
    customerAId = custA!.id;
    customerBId = custB!.id;

    const booking = (customerId: string, status: "completed" | "pending" | "cancelled", startsAt: string) => ({
      shopId,
      customerId,
      serviceId,
      vehicleTypeId: carTypeId,
      bay: 1 as const,
      status,
      startsAt: new Date(startsAt),
      endsAt: new Date(new Date(startsAt).getTime() + 30 * 60_000),
      priceRsd: 1000,
      durationMin: 30,
      source: "web" as const,
    });

    // A: 2 completed visits + 1 upcoming pending. B: 1 cancelled only — never actually visited.
    await db.insert(bookings).values([
      booking(customerAId, "completed", "2026-01-10T09:00:00Z"),
      booking(customerAId, "completed", "2026-02-10T09:00:00Z"),
      booking(customerAId, "pending", "2099-01-10T09:00:00Z"),
      booking(customerBId, "cancelled", "2026-03-10T09:00:00Z"),
    ]);
  });

  afterAll(async () => {
    const db = getDb();
    await db.delete(bookings).where(eq(bookings.shopId, shopId));
    await db.delete(customers).where(eq(customers.shopId, shopId));
    await db.delete(shops).where(eq(shops.id, shopId));
    await closeDb();
  });

  it("lists customers with completed-visit counts and last-visit date", async () => {
    const db = getDb();
    const rows = await listShopCustomers(db, shopId);
    const a = rows.find((r) => r.id === customerAId);
    const b = rows.find((r) => r.id === customerBId);
    expect(a).toMatchObject({ name: "Ana Anić", visitCount: 2 });
    expect(a!.lastVisitAt?.toISOString()).toBe("2026-02-10T09:00:00.000Z");
    expect(b).toMatchObject({ name: "Bane Banić", visitCount: 0, lastVisitAt: null });
  });

  it("gets one customer's basic info, or null if it doesn't belong to this shop", async () => {
    const db = getDb();
    expect(await getShopCustomer(db, shopId, customerAId)).toMatchObject({ name: "Ana Anić", phone: "+381641110001" });
    expect(await getShopCustomer(db, shopId, "00000000-0000-0000-0000-000000000000")).toBeNull();
  });

  it("lists every booking for one customer regardless of status", async () => {
    const db = getDb();
    const rows = await listCustomerBookings(db, shopId, customerAId);
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.status).sort()).toEqual(["completed", "completed", "pending"]);
  });

  it("finds bookings by phone for a known customer, newest first", async () => {
    const db = getDb();
    const rows = await findBookingsByPhone(db, shopId, "+381641110001");
    expect(rows).toHaveLength(3);
    expect(rows![0]!.status).toBe("pending"); // the 2099 one is newest
  });

  it("returns null for an unknown phone", async () => {
    const db = getDb();
    expect(await findBookingsByPhone(db, shopId, "+381699999999")).toBeNull();
  });

  it("resolves shop basics by slug, or null for an unknown/inactive slug", async () => {
    const db = getDb();
    expect(await getShopBasics(db, slug)).toMatchObject({ id: shopId, name: "IT Kupci Radnja" });
    expect(await getShopBasics(db, `ne-postoji-${run}`)).toBeNull();
  });
});
