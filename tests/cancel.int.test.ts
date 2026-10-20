/**
 * Integration tests for self-service cancellation (/otkazi/{bookingId}):
 * the booking's own id is the only "token" — no shop/session check — so the
 * conditional UPDATE and the not-found/not-allowed split matter most here.
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, getDb } from "../src/db/index.ts";
import { bookings, servicePrices, services, shops, workingHours } from "../src/db/schema.ts";
import { addDays, shopToday, zonedToUtc } from "../src/lib/availability/index.ts";
import { bookingRequestSchema } from "../src/lib/booking/request.ts";
import { canSelfCancel, cancelBookingByCustomer, getCancellableBooking } from "../src/server/cancel.ts";
import { createBookingRequest } from "../src/server/bookings.ts";
import { CUSTOMER_CANCEL_REASON } from "../src/lib/booking/status.ts";

if (process.env.CI && !process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for integration tests in CI");

const TZ = "Europe/Belgrade";
const run = Date.now().toString(36);
const slug = `it-cancel-${run}`;
let shopId = "";
let serviceId = "";

const date = addDays(shopToday({ timezone: TZ }, new Date()), 2);
const at = (d: string, hh: number, mm = 0) => zonedToUtc(d, hh * 60 + mm, TZ).toISOString();

const request = (over: Record<string, unknown> = {}) =>
  bookingRequestSchema.parse({
    slug,
    serviceId,
    vehicleType: "car",
    startsAt: at(date, 10),
    name: "Marko",
    phone: "064 700 9001",
    ...over,
  });

describe.skipIf(!process.env.DATABASE_URL)("self-service cancel (Postgres)", () => {
  beforeAll(async () => {
    const db = getDb();
    const [shop] = await db
      .insert(shops)
      .values({ slug, name: "IT otkazivanje radnja", bays: 1, minNoticeMin: 0, bookingHorizonDays: 30 })
      .returning();
    shopId = shop!.id;
    await db.insert(workingHours).values([1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ shopId, weekday, opensAt: "08:00", closesAt: "17:00" })));
    const [svc] = await db.insert(services).values({ shopId, kind: "seasonal_swap", name: "Zamena guma", durationMin: 30 }).returning();
    serviceId = svc!.id;
    await db.insert(servicePrices).values({ shopId, serviceId, vehicleType: "car", priceRsd: 1500 });
  });

  afterAll(async () => {
    const db = getDb();
    await db.delete(bookings).where(eq(bookings.shopId, shopId));
    await db.delete(shops).where(eq(shops.id, shopId));
    await closeDb();
  });

  it("a stranger-looking id returns nothing to look at", async () => {
    const db = getDb();
    expect(await getCancellableBooking(db, "00000000-0000-0000-0000-000000000000")).toBeNull();
    expect(await cancelBookingByCustomer(db, "00000000-0000-0000-0000-000000000000")).toEqual({ ok: false, reason: "not_found" });
  });

  it("lets the customer cancel their own pending booking, and a second attempt fails", async () => {
    const db = getDb();
    const r = await createBookingRequest(db, request());
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const before = await getCancellableBooking(db, r.booking.id);
    expect(before).toMatchObject({ status: "pending", serviceName: "Zamena guma", shopSlug: slug, customerName: "Marko" });
    expect(canSelfCancel(before!)).toBe(true);

    expect(await cancelBookingByCustomer(db, r.booking.id)).toEqual({ ok: true });
    const [row] = await db.select().from(bookings).where(eq(bookings.id, r.booking.id));
    expect(row).toMatchObject({ status: "cancelled", cancelReason: CUSTOMER_CANCEL_REASON });
    expect(row!.cancelledAt).not.toBeNull();

    // already cancelled: second attempt is a no-op, reported as "not allowed" not "not found"
    expect(await cancelBookingByCustomer(db, r.booking.id)).toEqual({ ok: false, reason: "not_allowed" });
    const after = await getCancellableBooking(db, r.booking.id);
    expect(canSelfCancel(after!)).toBe(false);
  });

  it("also cancels an already-confirmed booking", async () => {
    const db = getDb();
    const r = await createBookingRequest(db, request({ phone: "064 700 9002", startsAt: at(date, 11) }), { source: "admin" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const before = await getCancellableBooking(db, r.booking.id);
    expect(before!.status).toBe("confirmed");

    expect(await cancelBookingByCustomer(db, r.booking.id)).toEqual({ ok: true });
  });

  it("refuses to cancel a booking that has already started", async () => {
    const db = getDb();
    const r = await createBookingRequest(db, request({ phone: "064 700 9003", startsAt: at(date, 12) }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const inThePast = new Date(r.booking.startsAt.getTime() + 60_000); // 1 min after start
    const booking = await getCancellableBooking(db, r.booking.id);
    expect(canSelfCancel(booking!, inThePast)).toBe(false);
    expect(await cancelBookingByCustomer(db, r.booking.id, inThePast)).toEqual({ ok: false, reason: "not_allowed" });

    // the booking is untouched — still cancellable with the real clock
    const stillThere = await getCancellableBooking(db, r.booking.id);
    expect(stillThere!.status).toBe("pending");
  });

  it("doesn't let a cancel race a shop action: only one of two concurrent cancels wins", async () => {
    const db = getDb();
    const r = await createBookingRequest(db, request({ phone: "064 700 9004", startsAt: at(date, 13) }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const [a, b] = await Promise.all([cancelBookingByCustomer(db, r.booking.id), cancelBookingByCustomer(db, r.booking.id)]);
    const results = [a, b];
    expect(results.filter((x) => x.ok)).toHaveLength(1);
    expect(results.filter((x) => !x.ok && x.reason === "not_allowed")).toHaveLength(1);
  });
});
