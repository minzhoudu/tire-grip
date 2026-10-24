/**
 * Integration tests for the owner-only settings module: shop info, booking
 * rules (with the bays-in-use guard), weekly hours (with the shorter-hours
 * warning), date exceptions and services/prices (with the has-bookings
 * delete guard). Needs DATABASE_URL; CI provides it.
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, getDb } from "../src/db/index.ts";
import { bookings, scheduleExceptions, servicePrices, services, shops, vehicleTypes, workingHours } from "../src/db/schema.ts";
import { addDays, shopToday, utcToZoned, zonedToUtc } from "../src/lib/availability/index.ts";
import { bookingRequestSchema } from "../src/lib/booking/request.ts";
import { createBookingRequest } from "../src/server/bookings.ts";
import {
  addClosedDays,
  createService,
  createVehicleType,
  deleteException,
  deleteService,
  deleteVehicleType,
  getSetupChecklist,
  listExceptions,
  listServicesForSettings,
  listSettingsSections,
  listVehicleTypesForSettings,
  listWorkingHours,
  moveService,
  moveVehicleType,
  setServiceActive,
  setVehicleTypeActive,
  updateBookingRules,
  updateService,
  updateShopInfo,
  updateVehicleType,
  updateWorkingHours,
  upsertException,
} from "../src/server/settings.ts";

if (process.env.CI && !process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for integration tests in CI");

const TZ = "Europe/Belgrade";
const run = Date.now().toString(36);
const slug = `it-settings-${run}`;
let shopId = "";
let swapId = "";
let carTypeId = "";
let suvTypeId = "";

const date = addDays(shopToday({ timezone: TZ }, new Date()), 2);
const at = (d: string, hh: number, mm = 0) => zonedToUtc(d, hh * 60 + mm, TZ).toISOString();

const request = (over: Record<string, unknown> = {}) =>
  bookingRequestSchema.parse({
    slug,
    serviceId: swapId,
    vehicleTypeId: carTypeId,
    startsAt: at(date, 10),
    name: "Marko",
    phone: "064 700 1001",
    ...over,
  });

describe.skipIf(!process.env.DATABASE_URL)("settings (Postgres)", () => {
  beforeAll(async () => {
    const db = getDb();
    const [shop] = await db
      .insert(shops)
      .values({ slug, name: "IT podešavanja radnja", bays: 2, minNoticeMin: 60, bookingHorizonDays: 14 })
      .returning();
    shopId = shop!.id;
    await db.insert(workingHours).values([1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ shopId, weekday, opensAt: "08:00", closesAt: "17:00" })));
    const [svc] = await db.insert(services).values({ shopId, kind: "seasonal_swap", name: "Zamena guma", durationMin: 30 }).returning();
    swapId = svc!.id;
    const [car, suvType] = await db
      .insert(vehicleTypes)
      .values([
        { shopId, label: "Putničko", icon: "🚗" },
        { shopId, label: "SUV / džip", icon: "🚙" },
      ])
      .returning();
    carTypeId = car!.id;
    suvTypeId = suvType!.id;
    await db.insert(servicePrices).values({ shopId, serviceId: swapId, vehicleTypeId: carTypeId, priceRsd: 1500 });
  });

  afterAll(async () => {
    const db = getDb();
    if (shopId) {
      await db.delete(bookings).where(eq(bookings.shopId, shopId));
      await db.delete(shops).where(eq(shops.id, shopId));
    }
    await closeDb();
  });

  it("updates shop info", async () => {
    const db = getDb();
    await updateShopInfo(db, shopId, {
      name: "Novo ime",
      businessLabel: "Perionica",
      city: "Novi Sad",
      address: "Bulevar 1",
      phone: "+381641112222",
    });
    const [row] = await db.select().from(shops).where(eq(shops.id, shopId));
    expect(row).toMatchObject({
      name: "Novo ime",
      businessLabel: "Perionica",
      city: "Novi Sad",
      address: "Bulevar 1",
      phone: "+381641112222",
    });
  });

  describe("setup checklist", () => {
    it("is all done for a shop with hours, vehicle types and services already set up", async () => {
      const db = getDb();
      expect(await getSetupChecklist(db, shopId)).toEqual({ radnoVreme: true, vrsteVozila: true, uslugeICene: true });

      const [shop] = await db.select().from(shops).where(eq(shops.id, shopId));
      const sections = await listSettingsSections(db, shop!, "/admin/x");
      expect(sections.find((s) => s.title === "Radno vreme")?.incomplete).toBeFalsy();
      expect(sections.find((s) => s.title === "Usluge i cene")?.incomplete).toBeFalsy();
      expect(sections.find((s) => s.title === "Vrste vozila")?.incomplete).toBeFalsy();
    });

    it("flags all three as incomplete for a freshly created shop", async () => {
      const db = getDb();
      const [freshShop] = await db.insert(shops).values({ slug: `${slug}-fresh`, name: "Prazna radnja" }).returning();

      expect(await getSetupChecklist(db, freshShop!.id)).toEqual({ radnoVreme: false, vrsteVozila: false, uslugeICene: false });

      const sections = await listSettingsSections(db, freshShop!, "/admin/x");
      expect(sections.find((s) => s.title === "Radno vreme")?.incomplete).toBe(true);
      expect(sections.find((s) => s.title === "Usluge i cene")?.incomplete).toBe(true);
      expect(sections.find((s) => s.title === "Vrste vozila")?.incomplete).toBe(true);

      await db.delete(shops).where(eq(shops.id, freshShop!.id));
    });
  });

  describe("booking rules: reducing bays", () => {
    it("blocks reducing bays while a future booking sits on a bay that would disappear", async () => {
      const db = getDb();
      const a = await createBookingRequest(db, request(), { source: "admin" }); // bay 1
      const b = await createBookingRequest(db, request({ phone: "064 700 1002" }), { source: "admin" }); // bay 2
      expect(a.ok && b.ok).toBe(true);

      const [shop] = await db.select().from(shops).where(eq(shops.id, shopId));
      const result = await updateBookingRules(db, shop!, {
        bays: 1,
        slotStepMin: shop!.slotStepMin,
        bookingHorizonDays: shop!.bookingHorizonDays,
        minNoticeMin: shop!.minNoticeMin,
        autoConfirm: shop!.autoConfirm,
      });
      expect(result).toEqual({ ok: false, reason: "bays_in_use", count: 1 });

      const [after] = await db.select().from(shops).where(eq(shops.id, shopId));
      expect(after!.bays).toBe(2); // unchanged

      // cancelling the booking on bay 2 frees it up
      if (a.ok) await db.update(bookings).set({ status: "cancelled" }).where(eq(bookings.id, a.ok ? a.booking.id : ""));
      if (b.ok) await db.update(bookings).set({ status: "cancelled" }).where(eq(bookings.id, b.booking.id));
    });

    it("allows the update once nothing occupies the bays being removed", async () => {
      const db = getDb();
      const [shop] = await db.select().from(shops).where(eq(shops.id, shopId));
      const result = await updateBookingRules(db, shop!, {
        bays: 1,
        slotStepMin: 45,
        bookingHorizonDays: 20,
        minNoticeMin: 90,
        autoConfirm: true,
      });
      expect(result).toEqual({ ok: true });
      const [after] = await db.select().from(shops).where(eq(shops.id, shopId));
      expect(after).toMatchObject({ bays: 1, slotStepMin: 45, bookingHorizonDays: 20, minNoticeMin: 90, autoConfirm: true });

      // restore for the rest of the suite
      await updateBookingRules(db, after!, { bays: 2, slotStepMin: 30, bookingHorizonDays: 14, minNoticeMin: 60, autoConfirm: false });
    });
  });

  describe("weekly hours: shortening warns instead of blocking", () => {
    it("saves shorter hours but reports bookings that no longer fit", async () => {
      const db = getDb();
      const r = await createBookingRequest(db, request({ startsAt: at(date, 16), name: "Kasni Kupac", phone: "064 700 2001" }), { source: "admin" });
      expect(r.ok).toBe(true);

      const weekday = utcToZoned(zonedToUtc(date, 0, TZ), TZ).weekday;
      const days = [1, 2, 3, 4, 5, 6, 7].map((wd) => ({
        weekday: wd,
        intervals: wd === weekday ? [{ opensAt: "08:00", closesAt: "15:00" }] : [{ opensAt: "08:00", closesAt: "17:00" }],
      }));

      const { affected } = await updateWorkingHours(db, { id: shopId, timezone: TZ }, days);
      expect(affected).toHaveLength(1);
      expect(affected[0]).toMatchObject({ date, time: "16:00", customerName: "Kasni Kupac" });

      const saved = await listWorkingHours(db, shopId);
      expect(saved.find((h) => h.weekday === weekday)).toMatchObject({ closesAt: "15:00:00" });

      // restore full hours for the rest of the suite
      await updateWorkingHours(
        db,
        { id: shopId, timezone: TZ },
        [1, 2, 3, 4, 5, 6, 7].map((wd) => ({ weekday: wd, intervals: [{ opensAt: "08:00", closesAt: "17:00" }] })),
      );
    });

    it("a date exception overrides the week, so it isn't flagged by a weekly-hours change", async () => {
      const db = getDb();
      const excDate = addDays(date, 1);
      await upsertException(db, shopId, { date: excDate, closed: false, opensAt: "08:00", closesAt: "20:00", note: "produženo" });

      const r = await createBookingRequest(db, request({ startsAt: at(excDate, 18), name: "Kupac Izuzetak", phone: "064 700 2002" }), {
        source: "admin",
      });
      expect(r.ok).toBe(true);

      const weekday = utcToZoned(zonedToUtc(excDate, 0, TZ), TZ).weekday;
      const days = [1, 2, 3, 4, 5, 6, 7].map((wd) => ({
        weekday: wd,
        intervals: wd === weekday ? [{ opensAt: "08:00", closesAt: "12:00" }] : [{ opensAt: "08:00", closesAt: "17:00" }],
      }));
      const { affected } = await updateWorkingHours(db, { id: shopId, timezone: TZ }, days);
      expect(affected.find((a) => a.customerName === "Kupac Izuzetak")).toBeUndefined();

      await updateWorkingHours(
        db,
        { id: shopId, timezone: TZ },
        [1, 2, 3, 4, 5, 6, 7].map((wd) => ({ weekday: wd, intervals: [{ opensAt: "08:00", closesAt: "17:00" }] })),
      );
    });
  });

  describe("date exceptions", () => {
    it("upserting the same date replaces the previous row, and delete is scoped to the shop", async () => {
      const db = getDb();
      const excDate = addDays(date, 10);
      await upsertException(db, shopId, { date: excDate, closed: true, opensAt: null, closesAt: null, note: "prvi" });
      await upsertException(db, shopId, { date: excDate, closed: false, opensAt: "09:00", closesAt: "13:00", note: "drugi" });

      const list = await listExceptions(db, shopId);
      const rows = list.filter((e) => e.date === excDate);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ closed: false, note: "drugi" });

      const otherShop = (await db.insert(shops).values({ slug: `${slug}-other`, name: "Druga" }).returning())[0]!;
      expect(await deleteException(db, otherShop.id, rows[0]!.id)).toBe(false);
      expect(await deleteException(db, shopId, rows[0]!.id)).toBe(true);
      await db.delete(shops).where(eq(shops.id, otherShop.id));
    });
  });

  describe("services", () => {
    it("creates, updates, reorders and deletes a service with no bookings", async () => {
      const db = getDb();
      const id = await createService(db, shopId, {
        kind: "repair",
        name: "Test usluga",
        description: null,
        icon: "🔧",
        durationMin: 20,
        bookable: true,
        prices: [{ vehicleTypeId: carTypeId, priceRsd: 900, durationMin: null }],
      });

      let list = await listServicesForSettings(db, shopId);
      const created = list.find((s) => s.id === id);
      expect(created).toMatchObject({ name: "Test usluga", hasBookings: false, prices: [{ vehicleTypeId: carTypeId, priceRsd: 900, durationMin: null }] });

      const updated = await updateService(db, shopId, id, {
        kind: "repair",
        name: "Test usluga 2",
        description: "opis",
        icon: "🔧",
        durationMin: 25,
        bookable: true,
        prices: [
          { vehicleTypeId: carTypeId, priceRsd: 950, durationMin: null },
          { vehicleTypeId: suvTypeId, priceRsd: 1100, durationMin: 30 },
        ],
      });
      expect(updated).toBe(true);
      list = await listServicesForSettings(db, shopId);
      expect(list.find((s) => s.id === id)).toMatchObject({ name: "Test usluga 2", prices: expect.arrayContaining([{ vehicleTypeId: suvTypeId, priceRsd: 1100, durationMin: 30 }]) });

      expect(await setServiceActive(db, shopId, id, false)).toBe(true);
      list = await listServicesForSettings(db, shopId);
      expect(list.find((s) => s.id === id)?.isActive).toBe(false);

      // reorder: move it up past the seeded "Zamena guma"
      const before = await listServicesForSettings(db, shopId);
      const idxBefore = before.findIndex((s) => s.id === id);
      await moveService(db, shopId, id, "up");
      const after = await listServicesForSettings(db, shopId);
      const idxAfter = after.findIndex((s) => s.id === id);
      expect(idxAfter).toBeLessThan(idxBefore);

      expect(await deleteService(db, shopId, id)).toEqual({ ok: true });
      list = await listServicesForSettings(db, shopId);
      expect(list.find((s) => s.id === id)).toBeUndefined();
    });

    it("a service with bookings can only be deactivated, never deleted", async () => {
      const db = getDb();
      const r = await createBookingRequest(db, request({ startsAt: at(addDays(date, 20), 9), name: "Kupac Usluge", phone: "064 700 3001" }), {
        source: "admin",
      });
      expect(r.ok).toBe(true);

      expect(await deleteService(db, shopId, swapId)).toEqual({ ok: false, reason: "has_bookings" });
      expect(await setServiceActive(db, shopId, swapId, false)).toBe(true);
      const list = await listServicesForSettings(db, shopId);
      const row = list.find((s) => s.id === swapId);
      expect(row).toMatchObject({ isActive: false, hasBookings: true });
      await setServiceActive(db, shopId, swapId, true);
    });

    it("scopes updates and deletes to the owning shop", async () => {
      const db = getDb();
      const otherShop = (await db.insert(shops).values({ slug: `${slug}-other2`, name: "Druga2" }).returning())[0]!;
      const updated = await updateService(db, otherShop.id, swapId, {
        kind: "repair",
        name: "Hack",
        description: null,
        icon: null,
        durationMin: 10,
        bookable: true,
        prices: [],
      });
      expect(updated).toBe(false);
      const list = await listServicesForSettings(db, shopId);
      expect(list.find((s) => s.id === swapId)?.name).not.toBe("Hack");

      expect(await deleteService(db, otherShop.id, swapId)).toEqual({ ok: false, reason: "not_found" });
      await db.delete(shops).where(eq(shops.id, otherShop.id));
    });
  });

  describe("vehicle types", () => {
    it("creates, updates, reorders and deletes a vehicle type with no bookings", async () => {
      const db = getDb();
      const id = await createVehicleType(db, shopId, { label: "Bicikl", icon: "🚲" });

      let list = await listVehicleTypesForSettings(db, shopId);
      expect(list.find((vt) => vt.id === id)).toMatchObject({ label: "Bicikl", icon: "🚲", hasBookings: false });

      expect(await updateVehicleType(db, shopId, id, { label: "Bicikl / trotinet", icon: "🛴" })).toBe(true);
      list = await listVehicleTypesForSettings(db, shopId);
      expect(list.find((vt) => vt.id === id)).toMatchObject({ label: "Bicikl / trotinet", icon: "🛴" });

      expect(await setVehicleTypeActive(db, shopId, id, false)).toBe(true);
      list = await listVehicleTypesForSettings(db, shopId);
      expect(list.find((vt) => vt.id === id)?.isActive).toBe(false);
      await setVehicleTypeActive(db, shopId, id, true);

      const before = await listVehicleTypesForSettings(db, shopId);
      const idxBefore = before.findIndex((vt) => vt.id === id);
      await moveVehicleType(db, shopId, id, "up");
      const after = await listVehicleTypesForSettings(db, shopId);
      const idxAfter = after.findIndex((vt) => vt.id === id);
      expect(idxAfter).toBeLessThan(idxBefore);

      expect(await deleteVehicleType(db, shopId, id)).toEqual({ ok: true });
      list = await listVehicleTypesForSettings(db, shopId);
      expect(list.find((vt) => vt.id === id)).toBeUndefined();
    });

    it("a vehicle type with bookings can only be deactivated, never deleted", async () => {
      const db = getDb();
      const r = await createBookingRequest(db, request({ startsAt: at(addDays(date, 25), 9), name: "Kupac Vozila", phone: "064 700 4001" }), {
        source: "admin",
      });
      expect(r.ok).toBe(true);

      expect(await deleteVehicleType(db, shopId, carTypeId)).toEqual({ ok: false, reason: "has_bookings" });
      expect(await setVehicleTypeActive(db, shopId, carTypeId, false)).toBe(true);
      const list = await listVehicleTypesForSettings(db, shopId);
      expect(list.find((vt) => vt.id === carTypeId)).toMatchObject({ isActive: false, hasBookings: true });
      await setVehicleTypeActive(db, shopId, carTypeId, true);
    });

    it("scopes updates and deletes to the owning shop", async () => {
      const db = getDb();
      const otherShop = (await db.insert(shops).values({ slug: `${slug}-other3`, name: "Druga3" }).returning())[0]!;
      expect(await updateVehicleType(db, otherShop.id, carTypeId, { label: "Hack", icon: null })).toBe(false);
      const list = await listVehicleTypesForSettings(db, shopId);
      expect(list.find((vt) => vt.id === carTypeId)?.label).not.toBe("Hack");

      expect(await deleteVehicleType(db, otherShop.id, carTypeId)).toEqual({ ok: false, reason: "not_found" });
      await db.delete(shops).where(eq(shops.id, otherShop.id));
    });
  });

  it("closes on picked holidays, keeps a date's own custom hours, and reports days that already have bookings", async () => {
    const db = getDb();
    const [custom, plain, booked] = [addDays(date, 40), addDays(date, 41), addDays(date, 42)];
    await upsertException(db, shopId, { date: custom, closed: false, opensAt: "09:00", closesAt: "13:00", note: "skraćeno" });
    const r = await createBookingRequest(db, request({ startsAt: at(booked, 9), name: "Praznični Kupac", phone: "064 700 5001" }), { source: "admin" });
    expect(r.ok).toBe(true);

    const days = [custom, plain, booked].map((d) => ({ date: d, note: "Praznik" }));
    expect(await addClosedDays(db, { id: shopId, timezone: TZ }, days)).toEqual({ added: 2, datesWithBookings: [booked] });
    expect(await addClosedDays(db, { id: shopId, timezone: TZ }, days)).toEqual({ added: 0, datesWithBookings: [] }); // nothing new

    const rows = await db.select().from(scheduleExceptions).where(eq(scheduleExceptions.shopId, shopId));
    expect(rows.find((e) => e.date === custom)).toMatchObject({ closed: false, note: "skraćeno" });
    expect(rows.find((e) => e.date === plain)).toMatchObject({ closed: true, note: "Praznik" });
  });
});
