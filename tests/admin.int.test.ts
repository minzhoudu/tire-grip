/**
 * Integration test for the admin side: accounts + sign-in (Better Auth on
 * our schema), status changes, history, manual bookings and blocked time.
 * Needs DATABASE_URL (and BETTER_AUTH_SECRET for sign-in); CI provides both.
 */
import "dotenv/config";
import { eq, inArray } from "drizzle-orm";
import { isAPIError } from "better-auth/api";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, getDb } from "../src/db/index.ts";
import { bookings, servicePrices, services, shops, users, vehicleTypes, workingHours } from "../src/db/schema.ts";
import { addDays, shopToday, zonedToUtc } from "../src/lib/availability/index.ts";
import { bookingRequestSchema } from "../src/lib/booking/request.ts";
import { createShopUser, listUserShops } from "../src/server/accounts.ts";
import {
  adminDaySlots,
  autoCompleteStale,
  changeBookingStatus,
  completeBookings,
  countPending,
  createBlock,
  deleteBlock,
  listBookings,
  listBookingsToClose,
  listHistoryPage,
  type HistoryCursor,
  listDayBlocks,
  listDayBookings,
  listUpcomingBlocks,
  markNotified,
  markReminderSent,
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

  it("records the day-before reminder only for a confirmed booking of this shop", async () => {
    const db = getDb();
    const r = await createBookingRequest(db, request({ phone: "064 700 0010", startsAt: at(date, 14) }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const id = r.booking.id;

    expect(await markReminderSent(db, shopId, id)).toBe(false); // still pending
    await changeBookingStatus(db, { shopId, bookingId: id, action: "confirm" });
    expect(await markReminderSent(db, otherShopId, id)).toBe(false); // foreign shop
    expect(await markReminderSent(db, shopId, id)).toBe(true);

    const [row] = await db.select().from(bookings).where(eq(bookings.id, id));
    expect(row!.reminderSentAt).not.toBeNull();
    const listed = (await listBookings(db, { id: shopId, timezone: TZ }, "upcoming")).find((b) => b.id === id);
    expect(listed?.reminderSentAt).not.toBeNull();
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

  it("pages through history newest first without skipping or repeating", async () => {
    const db = getDb();
    const shop = { id: shopId, timezone: TZ };
    const all = (await listHistoryPage(db, shop, { limit: 1000 })).rows.map((b) => b.id);
    expect(all.length).toBeGreaterThanOrEqual(3);

    const seen: string[] = [];
    let cursor: HistoryCursor | undefined;
    for (let i = 0; i < 100; i++) {
      const page = await listHistoryPage(db, shop, { limit: 2, cursor });
      seen.push(...page.rows.map((b) => b.id));
      if (!page.next) break;
      cursor = page.next;
    }
    expect(seen).toEqual(all);
  });

  it("uses the bay tapped in the schedule when it's free, otherwise another one", async () => {
    const db = getDb();
    const req = (phone: string) => request({ phone, startsAt: at(farDate, 13) });
    const a = await createBookingRequest(db, req("064 700 0013"), { source: "admin", preferredBay: 2 });
    expect(a.ok && a.booking.bay).toBe(2);
    const b = await createBookingRequest(db, req("064 700 0014"), { source: "admin", preferredBay: 2 });
    expect(b.ok && b.booking.bay).toBe(1);
    expect(await createBookingRequest(db, req("064 700 0015"), { source: "admin", preferredBay: 2 })).toEqual({ ok: false, reason: "slot_unavailable" });
  });

  it("lists ended confirmed bookings to close, completes them in bulk, and auto-completes after 7 days", async () => {
    const db = getDb();
    const shop = { id: shopId, timezone: TZ };
    const now = new Date();
    const hour = 3_600_000;
    // Created in the future (admin source), then moved into the past: the booking rules don't allow past slots.
    const make = async (phone: string, endedAgoMs: number, status: "confirmed" | "pending" = "confirmed") => {
      const r = await createBookingRequest(db, request({ phone, startsAt: at(farDate, 8) }), { source: "admin" });
      if (!r.ok) throw new Error("booking failed");
      const endsAt = new Date(now.getTime() - endedAgoMs);
      await db
        .update(bookings)
        .set({ status, startsAt: new Date(endsAt.getTime() - 30 * 60_000), endsAt })
        .where(eq(bookings.id, r.booking.id));
      return r.booking.id;
    };
    const justEnded = await make("064 700 0021", hour);
    const twoDays = await make("064 700 0022", 48 * hour);
    const stale = await make("064 700 0023", 8 * 24 * hour);
    const stalePending = await make("064 700 0024", 9 * 24 * hour, "pending");

    const toClose = (await listBookingsToClose(db, shopId, now)).map((b) => b.id);
    expect(toClose).toEqual(expect.arrayContaining([justEnded, twoDays]));
    expect(toClose).not.toContain(stale);
    expect(toClose).not.toContain(stalePending);
    // ended today: on the card, not in the upcoming list
    expect((await listBookings(db, shop, "upcoming", now)).map((b) => b.id)).not.toContain(justEnded);

    expect(await autoCompleteStale(db, shopId, now)).toBe(1);
    const [staleRow] = await db.select().from(bookings).where(eq(bookings.id, stale));
    expect(staleRow!.status).toBe("completed");
    expect(staleRow!.completedAt?.getTime()).toBe(staleRow!.endsAt.getTime());
    const [pendingRow] = await db.select().from(bookings).where(eq(bookings.id, stalePending));
    expect(pendingRow!.status).toBe("pending"); // never confirmed: not assumed to have come
    expect(await autoCompleteStale(db, shopId, now)).toBe(0);

    await changeBookingStatus(db, { shopId, bookingId: twoDays, action: "noShow", now });
    // the no-show is already closed; another shop can't close ours
    expect(await completeBookings(db, otherShopId, [justEnded], now)).toBe(0);
    expect(await completeBookings(db, shopId, [justEnded, twoDays], now)).toBe(1);
    const rows = await db.select().from(bookings).where(inArray(bookings.id, [justEnded, twoDays]));
    expect(Object.fromEntries(rows.map((r) => [r.id, r.status]))).toEqual({ [justEnded]: "completed", [twoDays]: "no_show" });
    expect(await listBookingsToClose(db, shopId, now)).toEqual([]);
  });

  it("counts the customer's earlier no-shows on their upcoming bookings", async () => {
    const db = getDb();
    const shop = { id: shopId, timezone: TZ };
    const phone = "064 700 0011";
    const first = await createBookingRequest(db, request({ phone, startsAt: at(farDate, 15) }), { source: "admin" });
    const next = await createBookingRequest(db, request({ phone, startsAt: at(farDate, 16) }), { source: "admin" });
    const stranger = await createBookingRequest(db, request({ phone: "064 700 0012", startsAt: at(farDate, 16) }), { source: "admin" });
    expect(first.ok && next.ok && stranger.ok).toBe(true);
    if (!first.ok || !next.ok || !stranger.ok) return;

    const before = await listBookings(db, shop, "upcoming");
    expect(before.find((b) => b.id === next.booking.id)?.customerNoShows).toBe(0);

    // no-show is only allowed after the start time, so set it directly
    await db.update(bookings).set({ status: "no_show" }).where(eq(bookings.id, first.booking.id));
    const after = await listBookings(db, shop, "upcoming");
    expect(after.find((b) => b.id === next.booking.id)?.customerNoShows).toBe(1);
    expect(after.find((b) => b.id === stranger.booking.id)?.customerNoShows).toBe(0);
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

  it("loads one day's bookings and blocked time for the per-bay schedule", async () => {
    const db = getDb();
    const shop = { id: shopId, timezone: TZ };
    const day = addDays(date, 1);
    const kept = await createBookingRequest(db, request({ phone: "064 700 0020", startsAt: at(day, 9) }));
    const dropped = await createBookingRequest(db, request({ phone: "064 700 0021", startsAt: at(day, 10) }));
    const otherDay = await createBookingRequest(db, request({ phone: "064 700 0022", startsAt: at(addDays(day, 1), 9) }));
    expect(kept.ok && dropped.ok && otherDay.ok).toBe(true);
    if (!kept.ok || !dropped.ok || !otherDay.ok) return;
    await changeBookingStatus(db, { shopId, bookingId: dropped.booking.id, action: "reject" });
    const block = await createBlock(db, { shopId, bays: 2, timezone: TZ, date: day, fromMin: 16 * 60, toMin: 17 * 60, bay: 2, reason: "kvar" });
    expect(block.ok).toBe(true);

    const ids = (await listDayBookings(db, shop, day)).map((b) => b.id);
    expect(ids).toContain(kept.booking.id);
    expect(ids).not.toContain(dropped.booking.id); // rejected doesn't occupy a bay
    expect(ids).not.toContain(otherDay.booking.id);

    expect(await listDayBlocks(db, shop, day)).toEqual([expect.objectContaining({ bay: 2, reason: "kvar", fromMin: 960, toMin: 1020 })]);
  });
});
