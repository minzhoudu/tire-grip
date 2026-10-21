/**
 * Integration test for the admin side: accounts + sign-in (Better Auth on
 * our schema), status changes, history, manual bookings and blocked time.
 * Needs DATABASE_URL (and BETTER_AUTH_SECRET for sign-in); CI provides both.
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { isAPIError } from "better-auth/api";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, getDb } from "../src/db/index.ts";
import { bookings, servicePrices, services, shops, users, vehicleTypes, workingHours } from "../src/db/schema.ts";
import { addDays, shopToday, zonedToUtc } from "../src/lib/availability/index.ts";
import { bookingRequestSchema } from "../src/lib/booking/request.ts";
import { createShopUser, listUserShops } from "../src/server/accounts.ts";
import {
  adminDaySlots,
  changeBookingStatus,
  countPending,
  createBlock,
  deleteBlock,
  listBookings,
  listUpcomingBlocks,
  markNotified,
} from "../src/server/admin.ts";
import { getAuth } from "../src/server/auth.ts";
import { createBookingRequest } from "../src/server/bookings.ts";
import { loadShopContext } from "../src/server/shops.ts";

if (process.env.CI && !process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for integration tests in CI");

const TZ = "Europe/Belgrade";
const run = Date.now().toString(36);
const slug = `it-admin-${run}`;
const otherSlug = `it-other-${run}`;
const email = `vlasnik-${run}@example.rs`;
const password = "dovoljno-duga-lozinka";
let shopId = "";
let otherShopId = "";
let swapId = "";
let carTypeId = "";

const date = addDays(shopToday({ timezone: TZ }, new Date()), 2);
const farDate = addDays(shopToday({ timezone: TZ }, new Date()), 30); // beyond the 14-day public horizon
const at = (d: string, hh: number, mm = 0) => zonedToUtc(d, hh * 60 + mm, TZ).toISOString();

const request = (over: Record<string, unknown> = {}) =>
  bookingRequestSchema.parse({
    slug,
    serviceId: swapId,
    vehicleTypeId: carTypeId,
    startsAt: at(date, 10),
    name: "Marko",
    phone: "064 700 0001",
    ...over,
  });

async function makeShop(s: string, name: string) {
  const db = getDb();
  const [shop] = await db.insert(shops).values({ slug: s, name, bays: 2, minNoticeMin: 60, bookingHorizonDays: 14 }).returning();
  await db.insert(workingHours).values([1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ shopId: shop!.id, weekday, opensAt: "08:00", closesAt: "17:00" })));
  const [svc] = await db.insert(services).values({ shopId: shop!.id, kind: "seasonal_swap", name: "Zamena guma", durationMin: 30 }).returning();
  const [car] = await db.insert(vehicleTypes).values({ shopId: shop!.id, label: "Putničko", icon: "🚗" }).returning();
  await db.insert(servicePrices).values({ shopId: shop!.id, serviceId: svc!.id, vehicleTypeId: car!.id, priceRsd: 1500 });
  return { shopId: shop!.id, serviceId: svc!.id, carTypeId: car!.id };
}

describe.skipIf(!process.env.DATABASE_URL)("admin (Postgres)", () => {
  beforeAll(async () => {
    ({ shopId, serviceId: swapId, carTypeId } = await makeShop(slug, "IT admin radnja"));
    ({ shopId: otherShopId } = await makeShop(otherSlug, "Druga radnja"));
  });

  afterAll(async () => {
    const db = getDb();
    for (const id of [shopId, otherShopId].filter(Boolean)) {
      await db.delete(bookings).where(eq(bookings.shopId, id));
      await db.delete(shops).where(eq(shops.id, id));
    }
    await db.delete(users).where(eq(users.email, email));
    await closeDb();
  });

  describe.skipIf(!process.env.BETTER_AUTH_SECRET)("accounts and sign-in", () => {
    it("creates an owner who can sign in with Better Auth", async () => {
      const db = getDb();
      const auth = getAuth();
      const created = await createShopUser(db, auth, { email: ` ${email.toUpperCase()} `, password, name: "Pera", shopSlug: slug });
      expect(created.ok && created.created).toBe(true);

      const res = await auth.api.signInEmail({ body: { email, password } });
      expect(res.user.email).toBe(email);
      expect(typeof res.token).toBe("string");

      const wrong = await auth.api.signInEmail({ body: { email, password: "pogresna-lozinka" } }).catch((e: unknown) => e);
      expect(isAPIError(wrong)).toBe(true);
    });

    it("re-running adds memberships without touching the password", async () => {
      const db = getDb();
      const auth = getAuth();
      const again = await createShopUser(db, auth, { email, password: "druga-lozinka-123", name: "Pera", shopSlug: otherSlug, role: "staff" });
      expect(again.ok && again.created).toBe(false);
      const shopsOfUser = await listUserShops(db, again.ok ? again.userId : "");
      expect(shopsOfUser.map((s) => s.slug).sort()).toEqual([otherSlug, slug].sort());
      // old password still works
      const res = await auth.api.signInEmail({ body: { email, password } });
      expect(res.user.email).toBe(email);
    });

    it("validates input", async () => {
      const db = getDb();
      const auth = getAuth();
      expect(await createShopUser(db, auth, { email: `novi-${run}@example.rs`, password: "kratka", name: "X", shopSlug: slug })).toEqual({
        ok: false,
        reason: "weak_password",
      });
      expect(await createShopUser(db, auth, { email: "nije-email", password, name: "X", shopSlug: slug })).toEqual({ ok: false, reason: "invalid_email" });
      expect(await createShopUser(db, auth, { email: `novi-${run}@example.rs`, password, name: "X", shopSlug: "nema" })).toEqual({
        ok: false,
        reason: "shop_not_found",
      });
    });
  });

  it("confirm → complete, with guards against stale and foreign updates", async () => {
    const db = getDb();
    const r = await createBookingRequest(db, request());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const id = r.booking.id;
    expect(await countPending(db, { id: shopId, timezone: TZ })).toBeGreaterThanOrEqual(1);

    // another shop can't touch it
    expect(await changeBookingStatus(db, { shopId: otherShopId, bookingId: id, action: "confirm" })).toEqual({ ok: false, reason: "not_found" });

    const confirmed = await changeBookingStatus(db, { shopId, bookingId: id, action: "confirm" });
    expect(confirmed.ok && confirmed.booking.status).toBe("confirmed");
    // second tap (stale screen) does nothing
    expect(await changeBookingStatus(db, { shopId, bookingId: id, action: "confirm" })).toEqual({ ok: false, reason: "not_allowed" });
    // no-show only after the start time
    expect(await changeBookingStatus(db, { shopId, bookingId: id, action: "noShow" })).toEqual({ ok: false, reason: "not_allowed" });

    const done = await changeBookingStatus(db, { shopId, bookingId: id, action: "complete" });
    expect(done.ok && done.booking.status).toBe("completed");
    const [row] = await db.select().from(bookings).where(eq(bookings.id, id));
    expect(row!.confirmedAt).not.toBeNull();
    expect(row!.completedAt).not.toBeNull();
  });

  it("tracks whether the customer was told about the current status, resetting on each new confirm/reject/cancel", async () => {
    const db = getDb();
    const r = await createBookingRequest(db, request({ phone: "064 700 0009" }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const id = r.booking.id;

    const confirmed = await changeBookingStatus(db, { shopId, bookingId: id, action: "confirm" });
    expect(confirmed.ok && confirmed.booking.notifiedAt).toBeNull(); // fresh status, not yet told

    expect(await markNotified(db, shopId, id)).toBe(true);
    expect(await markNotified(db, shopId, id)).toBe(false); // already notified, no double-count
    const [afterSend] = await db.select().from(bookings).where(eq(bookings.id, id));
    expect(afterSend!.notifiedAt).not.toBeNull();

    // a new notify-worthy action (cancel) means the customer hasn't heard about *this* status yet
    const cancelled = await changeBookingStatus(db, { shopId, bookingId: id, action: "cancel" });
    expect(cancelled.ok && cancelled.booking.notifiedAt).toBeNull();
  });

  it("cancelling frees the slot and moves the booking to history", async () => {
    const db = getDb();
    const shop = { id: shopId, timezone: TZ };
    const a = await createBookingRequest(db, request({ phone: "064 700 0002", startsAt: at(date, 11) }));
    const b = await createBookingRequest(db, request({ phone: "064 700 0003", startsAt: at(date, 11) }));
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(await createBookingRequest(db, request({ phone: "064 700 0004", startsAt: at(date, 11) }))).toEqual({
      ok: false,
      reason: "slot_unavailable",
    });

    await changeBookingStatus(db, { shopId, bookingId: a.booking.id, action: "confirm" });
    const cancelled = await changeBookingStatus(db, { shopId, bookingId: a.booking.id, action: "cancel" });
    expect(cancelled.ok && cancelled.booking.status).toBe("cancelled");
    const rejected = await changeBookingStatus(db, { shopId, bookingId: b.booking.id, action: "reject" });
    expect(rejected.ok && rejected.booking.status).toBe("rejected");

    const again = await createBookingRequest(db, request({ phone: "064 700 0004", startsAt: at(date, 11) }));
    expect(again.ok).toBe(true);

    const upcoming = await listBookings(db, shop, "upcoming");
    const history = await listBookings(db, shop, "history");
    expect(upcoming.map((x) => x.id)).not.toContain(a.booking.id);
    expect(history.map((x) => x.id)).toContain(a.booking.id);
    expect(history.map((x) => x.id)).toContain(b.booking.id);
    expect(upcoming.every((x) => x.status === "pending" || x.status === "confirmed")).toBe(true);
    const sorted = [...upcoming].sort((x, y) => x.startsAt.getTime() - y.startsAt.getTime());
    expect(upcoming.map((x) => x.id)).toEqual(sorted.map((x) => x.id));
  });

  it("the shop can enter bookings the public chat can't (beyond the horizon), confirmed right away", async () => {
    const db = getDb();
    const req = request({ phone: "064 700 0005", startsAt: at(farDate, 9) });
    expect(await createBookingRequest(db, req)).toEqual({ ok: false, reason: "slot_unavailable" });
    const manual = await createBookingRequest(db, req, { source: "admin" });
    expect(manual.ok && manual.booking.status).toBe("confirmed");
    const [row] = await db.select().from(bookings).where(eq(bookings.id, manual.ok ? manual.booking.id : ""));
    expect(row!.source).toBe("admin");
  });

  it("blocked time hides slots, warns about existing bookings, and is scoped to the shop", async () => {
    const db = getDb();
    await createBookingRequest(db, request({ phone: "064 700 0006", startsAt: at(date, 12) }));

    const block = await createBlock(db, { shopId, bays: 2, timezone: TZ, date, fromMin: 12 * 60, toMin: 13 * 60, bay: null, reason: "pauza" });
    expect(block.ok && block.overlappingBookings).toBe(1);
    if (!block.ok) return;

    const ctx = (await loadShopContext(db, slug))!;
    const day = (await adminDaySlots(db, ctx, swapId, carTypeId, date))!;
    const taken = day.slots.filter((s) => !s.available).map((s) => s.time);
    expect(taken).toContain("12:00");
    expect(taken).toContain("12:30");
    expect(taken).not.toContain("13:00");

    const listed = await listUpcomingBlocks(db, { id: shopId, timezone: TZ });
    expect(listed.find((b) => b.id === block.id)).toMatchObject({ date, fromMin: 720, toMin: 780, bay: null, reason: "pauza" });

    expect(await createBlock(db, { shopId, bays: 2, timezone: TZ, date, fromMin: 600, toMin: 540, bay: null })).toEqual({ ok: false, reason: "invalid_range" });
    expect(await createBlock(db, { shopId, bays: 2, timezone: TZ, date, fromMin: 540, toMin: 600, bay: 3 })).toEqual({ ok: false, reason: "invalid_bay" });

    expect(await deleteBlock(db, otherShopId, block.id)).toBe(false);
    expect(await deleteBlock(db, shopId, block.id)).toBe(true);
    const after = (await adminDaySlots(db, ctx, swapId, carTypeId, date))!;
    expect(after.slots.find((s) => s.time === "12:30")!.available).toBe(true);
  });
});
