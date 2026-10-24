/**
 * Integration tests for seasonal reminder campaigns: audience (consent +
 * swap history, excluding opt-outs and non-swap-only customers), idempotent
 * queue generation, the daily-limit cap, send/opt-out, and attributing a
 * resulting booking back to the reminder that prompted it.
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, getDb } from "../src/db/index.ts";
import { bookings, customers, reminderCampaigns, reminderMessages, servicePrices, services, shops, vehicleTypes, workingHours } from "../src/db/schema.ts";
import { addDays, shopToday, zonedToUtc } from "../src/lib/availability/index.ts";
import { bookingRequestSchema } from "../src/lib/booking/request.ts";
import { createBookingRequest } from "../src/server/bookings.ts";
import {
  createCampaign,
  deleteCampaign,
  generateQueue,
  getReminderByToken,
  linkBookingToReminder,
  listTodayQueue,
  markSent,
  optOutByToken,
  previewAudience,
} from "../src/server/reminders.ts";

if (process.env.CI && !process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for integration tests in CI");

const TZ = "Europe/Belgrade";
const run = Date.now().toString(36);
const slug = `it-reminders-${run}`;
let shopId = "";
let swapId = "";
let repairId = "";
let carTypeId = "";

const date = addDays(shopToday({ timezone: TZ }, new Date()), 2);
const at = (hh: number, mm = 0) => zonedToUtc(date, hh * 60 + mm, TZ).toISOString();

const request = (over: Record<string, unknown> = {}) =>
  bookingRequestSchema.parse({
    slug,
    serviceId: swapId,
    vehicleTypeId: carTypeId,
    startsAt: at(10),
    name: "Kupac",
    phone: "064 800 0001",
    reminderConsent: true,
    ...over,
  });

describe.skipIf(!process.env.DATABASE_URL)("seasonal reminders (Postgres)", () => {
  beforeAll(async () => {
    const db = getDb();
    const [shop] = await db.insert(shops).values({ slug, name: "IT podsetnici radnja", bays: 3, minNoticeMin: 0, bookingHorizonDays: 30 }).returning();
    shopId = shop!.id;
    await db.insert(workingHours).values([1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ shopId, weekday, opensAt: "08:00", closesAt: "17:00" })));
    const [swap, repair] = await db
      .insert(services)
      .values([
        { shopId, kind: "seasonal_swap", name: "Zamena guma", durationMin: 30 },
        { shopId, kind: "repair", name: "Popravka gume", durationMin: 20 },
      ])
      .returning();
    swapId = swap!.id;
    repairId = repair!.id;
    const [car] = await db.insert(vehicleTypes).values({ shopId, label: "Putničko", icon: "🚗" }).returning();
    carTypeId = car!.id;
    await db.insert(servicePrices).values([
      { shopId, serviceId: swapId, vehicleTypeId: carTypeId, priceRsd: 1500 },
      { shopId, serviceId: repairId, vehicleTypeId: carTypeId, priceRsd: 800 },
    ]);
  });

  afterAll(async () => {
    const db = getDb();
    if (shopId) {
      await db.delete(bookings).where(eq(bookings.shopId, shopId));
      await db.delete(shops).where(eq(shops.id, shopId));
    }
    await closeDb();
  });

  it("audience = consented customers with real seasonal-swap history, excluding opt-outs and swap-less customers", async () => {
    const db = getDb();
    // Eligible: consented, booked a seasonal swap.
    const eligible = await createBookingRequest(db, request({ phone: "064 800 0001", name: "Marko", startsAt: at(9) }));
    expect(eligible.ok).toBe(true);

    // Not consented.
    const noConsent = await createBookingRequest(db, request({ phone: "064 800 0002", name: "Jovan", reminderConsent: false, startsAt: at(9, 30) }));
    expect(noConsent.ok).toBe(true);

    // Consented but only ever booked a non-swap service.
    const onlyRepair = await createBookingRequest(
      db,
      request({ phone: "064 800 0003", name: "Ana", serviceId: repairId, startsAt: at(11) }),
    );
    expect(onlyRepair.ok).toBe(true);

    // Consented, booked a swap, but it was cancelled — no real history.
    const cancelled = await createBookingRequest(db, request({ phone: "064 800 0004", name: "Petar", startsAt: at(12) }));
    expect(cancelled.ok).toBe(true);
    if (cancelled.ok) await db.update(bookings).set({ status: "cancelled" }).where(eq(bookings.id, cancelled.booking.id));

    const count = await previewAudience(db, shopId);
    expect(count).toBe(1); // only Marko
  });

  it("generates the queue once, idempotently, and respects the daily limit", async () => {
    const db = getDb();
    const campaignId = await createCampaign(db, shopId, { name: "Zima 2026", season: "winter", messageTemplate: "Zdravo {ime}! {radnja}: {link}", dailyLimit: 1 });

    const first = await generateQueue(db, shopId, campaignId);
    expect(first).toEqual({ ok: true, created: 1 }); // just Marko, per the previous test

    const second = await generateQueue(db, shopId, campaignId);
    expect(second).toEqual({ ok: true, created: 0 }); // already queued, no duplicates

    const [row] = await db.select().from(reminderMessages).where(eq(reminderMessages.campaignId, campaignId));
    expect(row).toMatchObject({ status: "queued" });

    const [campaign] = await db.select().from(reminderCampaigns).where(eq(reminderCampaigns.id, campaignId));
    expect(campaign!.status).toBe("active"); // flipped from draft on first generate

    const queue = await listTodayQueue(db, shopId, campaignId);
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ customerName: "Marko" });

    // mark sent: campaign has nothing left queued, so it auto-completes
    expect(await markSent(db, shopId, campaignId, queue[0]!.id)).toBe(true);
    expect(await markSent(db, shopId, campaignId, queue[0]!.id)).toBe(false); // already sent, no double-count
    const [done] = await db.select().from(reminderCampaigns).where(eq(reminderCampaigns.id, campaignId));
    expect(done!.status).toBe("done");

    const token = queue[0]!.token;
    const landing = await getReminderByToken(db, token);
    expect(landing).toMatchObject({ shopSlug: slug, customerName: "Marko" });
  });

  it("opting out removes the customer from future campaigns", async () => {
    const db = getDb();
    const r = await createBookingRequest(db, request({ phone: "064 800 0005", name: "Jelena", startsAt: at(13) }));
    expect(r.ok).toBe(true);

    const beforeCount = await previewAudience(db, shopId);
    const campaignId = await createCampaign(db, shopId, { name: "Zima proba", season: "winter", messageTemplate: "x", dailyLimit: null });
    await generateQueue(db, shopId, campaignId);
    const [msg] = await db.select().from(reminderMessages).where(eq(reminderMessages.campaignId, campaignId)).limit(1);

    expect(await optOutByToken(db, msg!.token)).toBe(true);
    expect(await optOutByToken(db, "00000000-0000-0000-0000-000000000000")).toBe(false);

    const afterCount = await previewAudience(db, shopId);
    expect(afterCount).toBe(beforeCount - 1);

    const [customer] = await db.select().from(customers).where(eq(customers.id, msg!.customerId));
    expect(customer!.reminderConsent).toBe(false);
    expect(customer!.optedOutAt).not.toBeNull();
  });

  it("attributes a booking back to the reminder that prompted it, without overwriting an earlier attribution", async () => {
    const db = getDb();
    const r = await createBookingRequest(db, request({ phone: "064 800 0006", name: "Nikola", startsAt: at(14) }));
    expect(r.ok).toBe(true);

    const campaignId = await createCampaign(db, shopId, { name: "Leto proba", season: "summer", messageTemplate: "x", dailyLimit: null });
    await generateQueue(db, shopId, campaignId);
    const [msg] = await db.select().from(reminderMessages).where(eq(reminderMessages.campaignId, campaignId)).limit(1);

    const booked = await createBookingRequest(db, request({ phone: "064 800 0007", name: "Druga rezervacija", startsAt: at(15) }));
    expect(booked.ok).toBe(true);
    if (!booked.ok) return;

    await linkBookingToReminder(db, { shopId, token: msg!.token, bookingId: booked.booking.id });
    const [linked] = await db.select().from(reminderMessages).where(eq(reminderMessages.id, msg!.id));
    expect(linked).toMatchObject({ status: "booked", bookingId: booked.booking.id });

    // a second, different booking shouldn't steal the attribution once it's set
    const other = await createBookingRequest(db, request({ phone: "064 800 0008", name: "Treća rezervacija", startsAt: at(16) }));
    expect(other.ok).toBe(true);
    if (!other.ok) return;
    await linkBookingToReminder(db, { shopId, token: msg!.token, bookingId: other.booking.id });
    const [stillFirst] = await db.select().from(reminderMessages).where(eq(reminderMessages.id, msg!.id));
    expect(stillFirst!.bookingId).toBe(booked.booking.id);
  });

  it("deleting a campaign removes its list (old links stop working) but keeps the bookings it brought in", async () => {
    const db = getDb();
    const campaignId = await createCampaign(db, shopId, { name: "Za brisanje", season: "winter", messageTemplate: "x", dailyLimit: null });
    await generateQueue(db, shopId, campaignId);
    const [msg] = await db.select().from(reminderMessages).where(eq(reminderMessages.campaignId, campaignId)).limit(1);
    const booked = await createBookingRequest(db, request({ phone: "064 800 0009", name: "Zakazao iz podsetnika", startsAt: at(16, 30) }));
    expect(booked.ok).toBe(true);
    if (!booked.ok) return;
    await linkBookingToReminder(db, { shopId, token: msg!.token, bookingId: booked.booking.id });

    expect(await deleteCampaign(db, "00000000-0000-0000-0000-000000000000", campaignId)).toBe(false); // another shop can't
    expect(await deleteCampaign(db, shopId, campaignId)).toBe(true);

    expect(await db.select().from(reminderCampaigns).where(eq(reminderCampaigns.id, campaignId))).toHaveLength(0);
    expect(await db.select().from(reminderMessages).where(eq(reminderMessages.campaignId, campaignId))).toHaveLength(0);
    expect(await getReminderByToken(db, msg!.token)).toBeNull();
    expect(await db.select().from(bookings).where(eq(bookings.id, booked.booking.id))).toHaveLength(1);
  });
});
