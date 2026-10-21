/**
 * Data access for the owner-only "Podešavanja" (settings) page: shop info,
 * booking rules, weekly hours, date exceptions and services/prices.
 * Every function takes the shopId explicitly and scopes every query by it.
 */
import { and, asc, eq, gt, inArray, sql } from "drizzle-orm";
import type { DB } from "../db/index.ts";
import {
  bookings,
  customers,
  scheduleExceptions,
  servicePrices,
  services,
  shops,
  vehicleTypes,
  workingHours,
  type ScheduleException,
  type Shop,
} from "../db/schema.ts";
import { hoursForDate, type DateException, type WeeklyHours } from "../lib/availability/index.ts";
import type { VehicleType } from "../lib/availability/pricing.ts";
import { formatMinutes, utcToZoned } from "../lib/availability/zoned.ts";

export type ServiceKind = (typeof services.$inferInsert)["kind"];

/* ----------------------------------------------------------------- shop info */

export interface ShopInfoInput {
  name: string;
  city: string | null;
  address: string | null;
  phone: string | null;
}

export async function updateShopInfo(db: DB, shopId: string, input: ShopInfoInput): Promise<void> {
  await db
    .update(shops)
    .set({ name: input.name, city: input.city, address: input.address, phone: input.phone })
    .where(eq(shops.id, shopId));
}

/* ----------------------------------------------------------------- booking rules */

export interface BookingRulesInput {
  bays: number;
  slotStepMin: number;
  bookingHorizonDays: number;
  minNoticeMin: number;
  autoConfirm: boolean;
}

export type UpdateBookingRulesResult = { ok: true } | { ok: false; reason: "bays_in_use"; count: number };

/** Open (pending/confirmed), not-yet-finished bookings sitting on a bay that would stop existing. */
async function countBookingsOnBaysAbove(db: DB, shopId: string, bays: number, now: Date): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(bookings)
    .where(
      and(
        eq(bookings.shopId, shopId),
        inArray(bookings.status, ["pending", "confirmed"]),
        gt(bookings.endsAt, now),
        sql`${bookings.bay} > ${bays}`,
      ),
    );
  return row?.n ?? 0;
}

/** Reducing bays is refused while a booking still occupies a bay number that would disappear. */
export async function updateBookingRules(db: DB, shop: Shop, input: BookingRulesInput, now = new Date()): Promise<UpdateBookingRulesResult> {
  if (input.bays < shop.bays) {
    const count = await countBookingsOnBaysAbove(db, shop.id, input.bays, now);
    if (count > 0) return { ok: false, reason: "bays_in_use", count };
  }
  await db
    .update(shops)
    .set({
      bays: input.bays,
      slotStepMin: input.slotStepMin,
      bookingHorizonDays: input.bookingHorizonDays,
      minNoticeMin: input.minNoticeMin,
      autoConfirm: input.autoConfirm,
    })
    .where(eq(shops.id, shop.id));
  return { ok: true };
}

/* ----------------------------------------------------------------- weekly hours */

export interface WorkingHoursDayInput {
  weekday: number;
  intervals: { opensAt: string; closesAt: string }[];
}

export interface AffectedBooking {
  id: string;
  date: string;
  time: string;
  customerName: string;
}

export async function listWorkingHours(db: DB, shopId: string): Promise<WeeklyHours[]> {
  const rows = await db
    .select()
    .from(workingHours)
    .where(eq(workingHours.shopId, shopId))
    .orderBy(asc(workingHours.weekday), asc(workingHours.opensAt));
  return rows.map((r) => ({ weekday: r.weekday, opensAt: r.opensAt, closesAt: r.closesAt }));
}

/** Future open bookings that no longer fit the (prospective) weekly hours; exceptions override the week, so those dates are skipped. */
async function findBookingsOutsideHours(
  db: DB,
  shop: { id: string; timezone: string },
  newWeeklyHours: WeeklyHours[],
  now: Date,
): Promise<AffectedBooking[]> {
  const exceptionRows = await db.select().from(scheduleExceptions).where(eq(scheduleExceptions.shopId, shop.id));
  const exceptions: DateException[] = exceptionRows.map((e) => ({ date: e.date, closed: e.closed, opensAt: e.opensAt, closesAt: e.closesAt }));
  const exceptionDates = new Set(exceptions.map((e) => e.date));

  const rows = await db
    .select({ id: bookings.id, startsAt: bookings.startsAt, endsAt: bookings.endsAt, customerName: customers.name })
    .from(bookings)
    .innerJoin(customers, and(eq(customers.id, bookings.customerId), eq(customers.shopId, bookings.shopId)))
    .where(and(eq(bookings.shopId, shop.id), inArray(bookings.status, ["pending", "confirmed"]), gt(bookings.endsAt, now)));

  const affected: AffectedBooking[] = [];
  for (const b of rows) {
    const start = utcToZoned(b.startsAt, shop.timezone);
    const end = utcToZoned(b.endsAt, shop.timezone);
    if (exceptionDates.has(start.date)) continue;
    const intervals = hoursForDate(start.date, newWeeklyHours, []);
    const fits = start.date === end.date && intervals.some((i) => start.minutes >= i.open && end.minutes <= i.close);
    if (!fits) affected.push({ id: b.id, date: start.date, time: formatMinutes(start.minutes), customerName: b.customerName });
  }
  return affected.sort((a, b) => (a.date === b.date ? a.time.localeCompare(b.time) : a.date.localeCompare(b.date)));
}

/** Replaces the whole week in one go. Doesn't block on shorter hours — only warns with the affected bookings. */
export async function updateWorkingHours(
  db: DB,
  shop: { id: string; timezone: string },
  days: WorkingHoursDayInput[],
  now = new Date(),
): Promise<{ affected: AffectedBooking[] }> {
  const newHours: WeeklyHours[] = days.flatMap((d) => d.intervals.map((i) => ({ weekday: d.weekday, opensAt: i.opensAt, closesAt: i.closesAt })));
  const affected = await findBookingsOutsideHours(db, shop, newHours, now);

  await db.transaction(async (tx) => {
    await tx.delete(workingHours).where(eq(workingHours.shopId, shop.id));
    if (newHours.length > 0) {
      await tx.insert(workingHours).values(newHours.map((h) => ({ shopId: shop.id, weekday: h.weekday, opensAt: h.opensAt, closesAt: h.closesAt })));
    }
  });

  return { affected };
}

/* ----------------------------------------------------------------- date exceptions (holidays) */

export interface ExceptionInput {
  date: string;
  closed: boolean;
  opensAt: string | null;
  closesAt: string | null;
  note: string | null;
}

export async function listExceptions(db: DB, shopId: string): Promise<ScheduleException[]> {
  return db
    .select()
    .from(scheduleExceptions)
    .where(and(eq(scheduleExceptions.shopId, shopId), sql`${scheduleExceptions.date} >= current_date - 1`))
    .orderBy(asc(scheduleExceptions.date));
}

/** At most one exception per date: a new one for an existing date replaces it. */
export async function upsertException(db: DB, shopId: string, input: ExceptionInput): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(scheduleExceptions).where(and(eq(scheduleExceptions.shopId, shopId), eq(scheduleExceptions.date, input.date)));
    await tx.insert(scheduleExceptions).values({
      shopId,
      date: input.date,
      closed: input.closed,
      opensAt: input.opensAt,
      closesAt: input.closesAt,
      note: input.note,
    });
  });
}

export async function deleteException(db: DB, shopId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(scheduleExceptions)
    .where(and(eq(scheduleExceptions.shopId, shopId), eq(scheduleExceptions.id, id)))
    .returning({ id: scheduleExceptions.id });
  return rows.length > 0;
}

/* ----------------------------------------------------------------- services & prices */

export interface ServicePriceRow {
  vehicleTypeId: VehicleType;
  priceRsd: number;
  durationMin: number | null;
}

export interface ServiceWithPrices {
  id: string;
  kind: string;
  name: string;
  description: string | null;
  icon: string | null;
  durationMin: number;
  bookable: boolean;
  isActive: boolean;
  sortOrder: number;
  hasBookings: boolean;
  prices: ServicePriceRow[];
}

export async function listServicesForSettings(db: DB, shopId: string): Promise<ServiceWithPrices[]> {
  const [serviceRows, priceRows, bookingCounts] = await Promise.all([
    db.select().from(services).where(eq(services.shopId, shopId)).orderBy(asc(services.sortOrder), asc(services.name)),
    db.select().from(servicePrices).where(eq(servicePrices.shopId, shopId)),
    db
      .select({ serviceId: bookings.serviceId, n: sql<number>`count(*)::int` })
      .from(bookings)
      .where(eq(bookings.shopId, shopId))
      .groupBy(bookings.serviceId),
  ]);
  const bookingCountByService = new Map(bookingCounts.map((r) => [r.serviceId, r.n]));

  return serviceRows.map((s) => ({
    id: s.id,
    kind: s.kind,
    name: s.name,
    description: s.description,
    icon: s.icon,
    durationMin: s.durationMin,
    bookable: s.bookable,
    isActive: s.isActive,
    sortOrder: s.sortOrder,
    hasBookings: (bookingCountByService.get(s.id) ?? 0) > 0,
    prices: priceRows
      .filter((p) => p.serviceId === s.id)
      .map((p) => ({ vehicleTypeId: p.vehicleTypeId, priceRsd: p.priceRsd, durationMin: p.durationMin })),
  }));
}

export interface ServiceInput {
  kind: ServiceKind;
  name: string;
  description: string | null;
  icon: string | null;
  durationMin: number;
  bookable: boolean;
  prices: ServicePriceRow[];
}

export async function createService(db: DB, shopId: string, input: ServiceInput): Promise<string> {
  return db.transaction(async (tx) => {
    const [maxRow] = await tx.select({ max: sql<number>`coalesce(max(${services.sortOrder}), 0)` }).from(services).where(eq(services.shopId, shopId));
    const [row] = await tx
      .insert(services)
      .values({
        shopId,
        kind: input.kind,
        name: input.name,
        description: input.description,
        icon: input.icon,
        durationMin: input.durationMin,
        bookable: input.bookable,
        sortOrder: (maxRow?.max ?? 0) + 1,
      })
      .returning({ id: services.id });
    const id = row!.id;
    if (input.prices.length > 0) {
      await tx.insert(servicePrices).values(input.prices.map((p) => ({ shopId, serviceId: id, vehicleTypeId: p.vehicleTypeId, priceRsd: p.priceRsd, durationMin: p.durationMin })));
    }
    return id;
  });
}

export async function updateService(db: DB, shopId: string, serviceId: string, input: ServiceInput): Promise<boolean> {
  return db.transaction(async (tx) => {
    const updated = await tx
      .update(services)
      .set({
        kind: input.kind,
        name: input.name,
        description: input.description,
        icon: input.icon,
        durationMin: input.durationMin,
        bookable: input.bookable,
      })
      .where(and(eq(services.shopId, shopId), eq(services.id, serviceId)))
      .returning({ id: services.id });
    if (updated.length === 0) return false;
    await tx.delete(servicePrices).where(and(eq(servicePrices.shopId, shopId), eq(servicePrices.serviceId, serviceId)));
    if (input.prices.length > 0) {
      await tx.insert(servicePrices).values(input.prices.map((p) => ({ shopId, serviceId, vehicleTypeId: p.vehicleTypeId, priceRsd: p.priceRsd, durationMin: p.durationMin })));
    }
    return true;
  });
}

export async function setServiceActive(db: DB, shopId: string, serviceId: string, isActive: boolean): Promise<boolean> {
  const rows = await db
    .update(services)
    .set({ isActive })
    .where(and(eq(services.shopId, shopId), eq(services.id, serviceId)))
    .returning({ id: services.id });
  return rows.length > 0;
}

export type DeleteServiceResult = { ok: true } | { ok: false; reason: "has_bookings" | "not_found" };

/** A service that was ever booked can't be deleted (the booking FK would be orphaned) — deactivate it instead. */
export async function deleteService(db: DB, shopId: string, serviceId: string): Promise<DeleteServiceResult> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(bookings)
    .where(and(eq(bookings.shopId, shopId), eq(bookings.serviceId, serviceId)));
  if ((row?.n ?? 0) > 0) return { ok: false, reason: "has_bookings" };
  const deleted = await db.delete(services).where(and(eq(services.shopId, shopId), eq(services.id, serviceId))).returning({ id: services.id });
  return deleted.length > 0 ? { ok: true } : { ok: false, reason: "not_found" };
}

/** Swaps sort_order with the previous/next service, for simple reordering (no drag-and-drop). */
export async function moveService(db: DB, shopId: string, serviceId: string, direction: "up" | "down"): Promise<void> {
  const rows = await db
    .select({ id: services.id, sortOrder: services.sortOrder })
    .from(services)
    .where(eq(services.shopId, shopId))
    .orderBy(asc(services.sortOrder), asc(services.name));
  const idx = rows.findIndex((r) => r.id === serviceId);
  if (idx === -1) return;
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= rows.length) return;
  const a = rows[idx]!;
  const b = rows[swapIdx]!;
  await db.transaction(async (tx) => {
    await tx.update(services).set({ sortOrder: b.sortOrder }).where(eq(services.id, a.id));
    await tx.update(services).set({ sortOrder: a.sortOrder }).where(eq(services.id, b.id));
  });
}

/* ----------------------------------------------------------------- vehicle types */

export interface VehicleTypeWithUsage {
  id: string;
  label: string;
  icon: string | null;
  isActive: boolean;
  sortOrder: number;
  hasBookings: boolean;
}

export async function listVehicleTypesForSettings(db: DB, shopId: string): Promise<VehicleTypeWithUsage[]> {
  const [rows, bookingCounts] = await Promise.all([
    db.select().from(vehicleTypes).where(eq(vehicleTypes.shopId, shopId)).orderBy(asc(vehicleTypes.sortOrder)),
    db
      .select({ vehicleTypeId: bookings.vehicleTypeId, n: sql<number>`count(*)::int` })
      .from(bookings)
      .where(eq(bookings.shopId, shopId))
      .groupBy(bookings.vehicleTypeId),
  ]);
  const bookingCountByType = new Map(bookingCounts.map((r) => [r.vehicleTypeId, r.n]));

  return rows.map((vt) => ({
    id: vt.id,
    label: vt.label,
    icon: vt.icon,
    isActive: vt.isActive,
    sortOrder: vt.sortOrder,
    hasBookings: (bookingCountByType.get(vt.id) ?? 0) > 0,
  }));
}

export interface VehicleTypeInput {
  label: string;
  icon: string | null;
}

export async function createVehicleType(db: DB, shopId: string, input: VehicleTypeInput): Promise<string> {
  return db.transaction(async (tx) => {
    const [maxRow] = await tx.select({ max: sql<number>`coalesce(max(${vehicleTypes.sortOrder}), 0)` }).from(vehicleTypes).where(eq(vehicleTypes.shopId, shopId));
    const [row] = await tx
      .insert(vehicleTypes)
      .values({ shopId, label: input.label, icon: input.icon, sortOrder: (maxRow?.max ?? 0) + 1 })
      .returning({ id: vehicleTypes.id });
    return row!.id;
  });
}

export async function updateVehicleType(db: DB, shopId: string, vehicleTypeId: string, input: VehicleTypeInput): Promise<boolean> {
  const updated = await db
    .update(vehicleTypes)
    .set({ label: input.label, icon: input.icon })
    .where(and(eq(vehicleTypes.shopId, shopId), eq(vehicleTypes.id, vehicleTypeId)))
    .returning({ id: vehicleTypes.id });
  return updated.length > 0;
}

export async function setVehicleTypeActive(db: DB, shopId: string, vehicleTypeId: string, isActive: boolean): Promise<boolean> {
  const rows = await db
    .update(vehicleTypes)
    .set({ isActive })
    .where(and(eq(vehicleTypes.shopId, shopId), eq(vehicleTypes.id, vehicleTypeId)))
    .returning({ id: vehicleTypes.id });
  return rows.length > 0;
}

export type DeleteVehicleTypeResult = { ok: true } | { ok: false; reason: "has_bookings" | "not_found" };

/** A vehicle type that was ever booked can't be deleted (the booking FK would be orphaned) — deactivate it instead. */
export async function deleteVehicleType(db: DB, shopId: string, vehicleTypeId: string): Promise<DeleteVehicleTypeResult> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(bookings)
    .where(and(eq(bookings.shopId, shopId), eq(bookings.vehicleTypeId, vehicleTypeId)));
  if ((row?.n ?? 0) > 0) return { ok: false, reason: "has_bookings" };
  const deleted = await db.delete(vehicleTypes).where(and(eq(vehicleTypes.shopId, shopId), eq(vehicleTypes.id, vehicleTypeId))).returning({ id: vehicleTypes.id });
  return deleted.length > 0 ? { ok: true } : { ok: false, reason: "not_found" };
}

/** Swaps sort_order with the previous/next vehicle type, for simple reordering (no drag-and-drop). */
export async function moveVehicleType(db: DB, shopId: string, vehicleTypeId: string, direction: "up" | "down"): Promise<void> {
  const rows = await db.select({ id: vehicleTypes.id, sortOrder: vehicleTypes.sortOrder }).from(vehicleTypes).where(eq(vehicleTypes.shopId, shopId)).orderBy(asc(vehicleTypes.sortOrder));
  const idx = rows.findIndex((r) => r.id === vehicleTypeId);
  if (idx === -1) return;
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= rows.length) return;
  const a = rows[idx]!;
  const b = rows[swapIdx]!;
  await db.transaction(async (tx) => {
    await tx.update(vehicleTypes).set({ sortOrder: b.sortOrder }).where(eq(vehicleTypes.id, a.id));
    await tx.update(vehicleTypes).set({ sortOrder: a.sortOrder }).where(eq(vehicleTypes.id, b.id));
  });
}

/* ----------------------------------------------------------------- hub summary */

export interface SettingsSection {
  href: string;
  icon: string;
  title: string;
  subtitle: string;
}

/** The 5 settings categories with their live one-line summaries — shared by the mobile hub list and the desktop sidebar. `adminBase` comes from getAdminBase(shop.slug). */
export async function listSettingsSections(db: DB, shop: Shop, adminBase: string): Promise<SettingsSection[]> {
  const [weeklyHours, exceptions, services, vehicleTypesList] = await Promise.all([
    listWorkingHours(db, shop.id),
    listExceptions(db, shop.id),
    listServicesForSettings(db, shop.id),
    listVehicleTypesForSettings(db, shop.id),
  ]);
  const openDays = new Set(weeklyHours.map((h) => h.weekday)).size;
  const activeServices = services.filter((s) => s.isActive).length;
  const activeVehicleTypes = vehicleTypesList.filter((vt) => vt.isActive).length;
  const base = `${adminBase}/podesavanja`;

  return [
    {
      href: `${base}/radnja`,
      icon: "🏪",
      title: "Podaci radnje",
      subtitle: [shop.city, shop.address].filter(Boolean).join(" · ") || "Naziv, grad, adresa, telefon",
    },
    {
      href: `${base}/pravila`,
      icon: "⚙️",
      title: "Pravila zakazivanja",
      subtitle: `${shop.bays} ${shop.bays === 1 ? "boks" : shop.bays <= 4 ? "boksa" : "boksova"} · ${shop.slotStepMin} min korak · auto-potvrda ${shop.autoConfirm ? "uključena" : "isključena"}`,
    },
    {
      href: `${base}/radno-vreme`,
      icon: "🕒",
      title: "Radno vreme",
      subtitle: openDays === 0 ? "Radnja je zatvorena svih dana" : `Otvoreno ${openDays}/7 dana u nedelji`,
    },
    {
      href: `${base}/praznici`,
      icon: "📅",
      title: "Praznici i posebno radno vreme",
      subtitle: exceptions.length === 0 ? "Nema predstojećih izuzetaka" : `${exceptions.length} predstojeć${exceptions.length === 1 ? "i" : "ih"}`,
    },
    {
      href: `${base}/usluge`,
      icon: "🛞",
      title: "Usluge i cene",
      subtitle: `${activeServices}/${services.length} aktivno`,
    },
    {
      href: `${base}/vrste-vozila`,
      icon: "🚗",
      title: "Vrste vozila",
      subtitle: `${activeVehicleTypes}/${vehicleTypesList.length} aktivno`,
    },
  ];
}
