/**
 * Integration tests for shop notifications: who gets a push, who falls back
 * to email, and that dead devices are cleaned up. Push and email are fakes.
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, getDb } from "../src/db/index.ts";
import { bookings, pushSubscriptions, servicePrices, services, shopMembers, shops, users, vehicleTypes, workingHours } from "../src/db/schema.ts";
import { addDays, shopToday, zonedToUtc } from "../src/lib/availability/index.ts";
import { bookingRequestSchema } from "../src/lib/booking/request.ts";
import { createBookingRequest } from "../src/server/bookings.ts";
import { cancelBookingByCustomer } from "../src/server/cancel.ts";
import {
  getNotificationSettings,
  notifyShop,
  savePushSubscription,
  sendTestNotification,
  setEmailNotifications,
} from "../src/server/notifications.ts";
import type { PushPayload, PushResult, PushTarget } from "../src/server/push.ts";

if (process.env.CI && !process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for integration tests in CI");

const TZ = "Europe/Belgrade";
const run = Date.now().toString(36);
const slug = `it-notify-${run}`;
const ownerId = `it-notify-owner-${run}`;
const staffId = `it-notify-staff-${run}`;
const outsiderId = `it-notify-outsider-${run}`;
let shopId = "";
let serviceId = "";
let carTypeId = "";

const date = addDays(shopToday({ timezone: TZ }, new Date()), 2);
const at = (hh: number) => zonedToUtc(date, hh * 60, TZ).toISOString();
const origin = "http://localhost:3000";

const request = (hh: number, phone: string) =>
  bookingRequestSchema.parse({ slug, serviceId, vehicleTypeId: carTypeId, startsAt: at(hh), name: "Marko", phone, vehicleLabel: "Golf" });

const endpoint = (name: string) => `https://fcm.googleapis.com/fcm/send/${run}-${name}`;

function fakes(results: Record<string, PushResult> = {}) {
  const pushes: { target: PushTarget; payload: PushPayload }[] = [];
  const emails: { to: string; subject: string }[] = [];
  return {
    pushes,
    emails,
    push: async (target: PushTarget, payload: PushPayload) => {
      pushes.push({ target, payload });
      return results[target.endpoint] ?? "sent";
    },
    email: async (input: { to: string; subject: string; html: string }) => {
      emails.push({ to: input.to, subject: input.subject });
    },
  };
}

describe.skipIf(!process.env.DATABASE_URL)("shop notifications (Postgres)", () => {
  beforeAll(async () => {
    const db = getDb();
    const [shop] = await db.insert(shops).values({ slug, name: "IT obaveštenja", bays: 2, minNoticeMin: 0, bookingHorizonDays: 30 }).returning();
    shopId = shop!.id;
    await db.insert(workingHours).values([1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ shopId, weekday, opensAt: "08:00", closesAt: "17:00" })));
    const [svc] = await db.insert(services).values({ shopId, kind: "seasonal_swap", name: "Zamena guma", icon: "🛞", durationMin: 30 }).returning();
    serviceId = svc!.id;
    const [car] = await db.insert(vehicleTypes).values({ shopId, label: "Putničko", icon: "🚗" }).returning();
    carTypeId = car!.id;
    await db.insert(servicePrices).values({ shopId, serviceId, vehicleTypeId: carTypeId, priceRsd: 1500 });

    await db.insert(users).values([
      { id: ownerId, email: `owner-${run}@example.rs`, name: "Vlasnik", emailVerified: true },
      { id: staffId, email: `staff-${run}@example.rs`, name: "Radnik", emailVerified: true },
      { id: outsiderId, email: `outsider-${run}@example.rs`, name: "Bivši radnik", emailVerified: true },
    ]);
    await db.insert(shopMembers).values([
      { shopId, userId: ownerId, role: "owner" },
      { shopId, userId: staffId, role: "staff" },
    ]);
  });

  afterAll(async () => {
    const db = getDb();
    await db.delete(bookings).where(eq(bookings.shopId, shopId));
    await db.delete(shops).where(eq(shops.id, shopId));
    for (const id of [ownerId, staffId, outsiderId]) await db.delete(users).where(eq(users.id, id));
    await closeDb();
  });

  it("emails every member when nobody has push yet", async () => {
    const db = getDb();
    const r = await createBookingRequest(db, request(9, "064 800 0001"));
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const f = fakes();
    const report = await notifyShop(db, { kind: "new_booking", bookingId: r.booking.id }, { ...f, origin });
    expect(report).toEqual({ pushed: 0, emailed: 2, removed: 0 });
    expect(f.emails.map((e) => e.to).sort()).toEqual([`owner-${run}@example.rs`, `staff-${run}@example.rs`]);
    expect(f.emails[0]!.subject).toBe("🛞 Novi zahtev: Marko | Moj Vulkanizer");
  });

  it("pushes to each device of current members only; email only for those push didn't reach", async () => {
    const db = getDb();
    await savePushSubscription(db, { shopId, userId: ownerId, endpoint: endpoint("owner-phone"), p256dh: "p", auth: "a" });
    await savePushSubscription(db, { shopId, userId: ownerId, endpoint: endpoint("owner-laptop"), p256dh: "p", auth: "a" });
    await savePushSubscription(db, { shopId, userId: outsiderId, endpoint: endpoint("outsider"), p256dh: "p", auth: "a" });

    const r = await createBookingRequest(db, request(10, "064 800 0002"));
    if (!r.ok) throw new Error("booking failed");

    const f = fakes();
    const report = await notifyShop(db, { kind: "new_booking", bookingId: r.booking.id }, { ...f, origin });
    expect(report).toEqual({ pushed: 2, emailed: 1, removed: 0 });
    expect(f.pushes.map((p) => p.target.endpoint).sort()).toEqual([endpoint("owner-laptop"), endpoint("owner-phone")]);
    expect(f.emails.map((e) => e.to)).toEqual([`staff-${run}@example.rs`]);

    const payload = f.pushes[0]!.payload;
    expect(payload.title).toBe("🛞 Novi zahtev: Marko");
    expect(payload.url).toBe(`${origin}/admin/${slug}#booking-${r.booking.id}`);
    expect(payload.tag).toBe(`booking-${r.booking.id}`);
    expect(payload.badge).toBe(2); // both requests so far are pending
  });

  it("removes devices the push service says are gone, and emails if that was the only one", async () => {
    const db = getDb();
    const r = await createBookingRequest(db, request(11, "064 800 0003"));
    if (!r.ok) throw new Error("booking failed");

    const f = fakes({ [endpoint("owner-phone")]: "gone", [endpoint("owner-laptop")]: "failed" });
    const report = await notifyShop(db, { kind: "new_booking", bookingId: r.booking.id }, { ...f, origin });
    expect(report).toEqual({ pushed: 0, emailed: 2, removed: 1 });

    const left = await db.select({ endpoint: pushSubscriptions.endpoint }).from(pushSubscriptions).where(eq(pushSubscriptions.userId, ownerId));
    expect(left.map((x) => x.endpoint)).toEqual([endpoint("owner-laptop")]);
  });

  it("respects a member who turned email off", async () => {
    const db = getDb();
    await setEmailNotifications(db, shopId, staffId, false);
    expect(await getNotificationSettings(db, shopId, staffId)).toEqual({ emailNotifications: false, deviceCount: 0 });

    const r = await createBookingRequest(db, request(12, "064 800 0004"));
    if (!r.ok) throw new Error("booking failed");
    const f = fakes();
    const report = await notifyShop(db, { kind: "new_booking", bookingId: r.booking.id }, { ...f, origin });
    expect(report).toEqual({ pushed: 1, emailed: 0, removed: 0 });
    await setEmailNotifications(db, shopId, staffId, true);
  });

  it("tells the shop when a customer cancels, linking to the panel", async () => {
    const db = getDb();
    const r = await createBookingRequest(db, request(13, "064 800 0005"));
    if (!r.ok) throw new Error("booking failed");
    expect(await cancelBookingByCustomer(db, r.booking.id)).toEqual({ ok: true });

    const f = fakes();
    await notifyShop(db, { kind: "customer_cancelled", bookingId: r.booking.id }, { ...f, origin });
    expect(f.pushes[0]!.payload).toMatchObject({ title: "❌ Otkazan termin: Marko", url: `${origin}/admin/${slug}` });
  });

  it("does nothing for an unknown booking", async () => {
    const f = fakes();
    const report = await notifyShop(getDb(), { kind: "new_booking", bookingId: "00000000-0000-0000-0000-000000000000" }, { ...f, origin });
    expect(report).toEqual({ pushed: 0, emailed: 0, removed: 0 });
    expect(f.pushes).toHaveLength(0);
  });

  it("re-subscribing the same device moves it to whoever is signed in now", async () => {
    const db = getDb();
    await savePushSubscription(db, { shopId, userId: staffId, endpoint: endpoint("owner-laptop"), p256dh: "p2", auth: "a2" });
    const rows = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint("owner-laptop")));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ userId: staffId, p256dh: "p2", auth: "a2" });

    const f = fakes();
    expect(await sendTestNotification(db, { shopId, userId: staffId, url: "/admin" }, f.push)).toBe(1);
    expect(await sendTestNotification(db, { shopId, userId: ownerId, url: "/admin" }, f.push)).toBe(0);
  });
});
