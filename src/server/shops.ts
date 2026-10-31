/**
 * Read side for the public booking page: a shop with its services, prices
 * and hours, plus the busy intervals the availability engine needs.
 */
import { and, asc, eq, gt, gte, inArray, lt, sql } from "drizzle-orm";
import type { DB, Tx } from "../db/index.ts";
import {
  blockedTimes,
  bookings,
  scheduleExceptions,
  servicePrices,
  services,
  shops,
  vehicleTypes,
  workingHours,
  type Shop,
} from "../db/schema.ts";
import type {
  BusyInterval,
  DateException,
  Offer,
  ShopSettings,
  VehicleType,
  WeeklyHours,
} from "../lib/availability/index.ts";
import { resolveOffer } from "../lib/availability/index.ts";
import { bookableVehicleTypeIds, buildVehicleCatalog, type CatalogVehicleType } from "../lib/vehicle-types.ts";

type Q = DB | Tx;

/** Statuses that occupy a bay (mirrors the bookings_no_overlap constraint). */
export const ACTIVE_STATUSES = ["pending", "confirmed", "completed"] as const;

/** label is the full name ("Kamion stočar · 2 sprata"); parentId/name/isGroup let the chat and price list group subcategories. */
export type PublicVehicleType = CatalogVehicleType;

export interface PublicService {
  id: string;
  kind: string;
  name: string;
  icon: string | null;
  description: string | null;
  bookable: boolean;
  durationMin: number;
  prices: { vehicleTypeId: VehicleType; priceRsd: number; durationMin: number | null }[];
}

export interface ShopContext {
  shop: Shop;
  settings: ShopSettings;
  services: PublicService[];
  /** Active vehicle types, ordered (each type followed by its subcategories) — the shop's own list, not a fixed set. */
  vehicleTypes: PublicVehicleType[];
  weeklyHours: WeeklyHours[];
  exceptions: DateException[];
}

/** Active shop by slug with active services, prices, weekly hours and upcoming exceptions. */
export async function loadShopContext(db: Q, slug: string): Promise<ShopContext | null> {
  const [shop] = await db
    .select()
    .from(shops)
    .where(and(eq(shops.slug, slug), eq(shops.isActive, true)))
    .limit(1);
  if (!shop) return null;

  const [serviceRows, priceRows, vehicleTypeRows, hourRows, exceptionRows] = await Promise.all([
    db
      .select()
      .from(services)
      .where(and(eq(services.shopId, shop.id), eq(services.isActive, true)))
      .orderBy(asc(services.sortOrder), asc(services.name)),
    db.select().from(servicePrices).where(eq(servicePrices.shopId, shop.id)),
    // All of them (inactive too): a type is a group if it has any subcategory, active or not.
    db.select().from(vehicleTypes).where(eq(vehicleTypes.shopId, shop.id)),
    db.select().from(workingHours).where(eq(workingHours.shopId, shop.id)),
    db
      .select()
      .from(scheduleExceptions)
      .where(and(eq(scheduleExceptions.shopId, shop.id), gte(scheduleExceptions.date, sql`current_date - 1`))),
  ]);

  const catalog = buildVehicleCatalog(vehicleTypeRows);
  const bookableIds = bookableVehicleTypeIds(catalog);
  const vehicleOrder = new Map(catalog.map((vt, i) => [vt.id, i]));
  const publicServices: PublicService[] = serviceRows.map((s) => ({
    id: s.id,
    kind: s.kind,
    name: s.name,
    icon: s.icon,
    description: s.description,
    bookable: s.bookable,
    durationMin: s.durationMin,
    prices: priceRows
      .filter((p) => p.serviceId === s.id && bookableIds.has(p.vehicleTypeId))
      .sort((a, b) => vehicleOrder.get(a.vehicleTypeId)! - vehicleOrder.get(b.vehicleTypeId)!)
      .map((p) => ({ vehicleTypeId: p.vehicleTypeId, priceRsd: p.priceRsd, durationMin: p.durationMin })),
  }));

  return {
    shop,
    settings: {
      timezone: shop.timezone,
      bays: shop.bays,
      slotStepMin: shop.slotStepMin,
      bookingHorizonDays: shop.bookingHorizonDays,
      minNoticeMin: shop.minNoticeMin,
    },
    services: publicServices,
    vehicleTypes: catalog,
    weeklyHours: hourRows.map((h) => ({ weekday: h.weekday, opensAt: h.opensAt, closesAt: h.closesAt })),
    exceptions: exceptionRows.map((e) => ({ date: e.date, closed: e.closed, opensAt: e.opensAt, closesAt: e.closesAt })),
  };
}

/** Bookable service + its price/duration for a vehicle type, or null. */
export function findOffer(
  ctx: ShopContext,
  serviceId: string,
  vehicleTypeId: VehicleType,
): { service: PublicService; offer: Offer } | null {
  const service = ctx.services.find((s) => s.id === serviceId);
  if (!service) return null;
  const offer = resolveOffer({ durationMin: service.durationMin, bookable: service.bookable, isActive: true }, service.prices, vehicleTypeId);
  return offer ? { service, offer } : null;
}

/** Active bookings and blocked times overlapping [from, to). */
export async function loadBusy(db: Q, shopId: string, from: Date, to: Date): Promise<BusyInterval[]> {
  const [bookingRows, blockRows] = await Promise.all([
    db
      .select({ startsAt: bookings.startsAt, endsAt: bookings.endsAt, bay: bookings.bay })
      .from(bookings)
      .where(
        and(
          eq(bookings.shopId, shopId),
          inArray(bookings.status, [...ACTIVE_STATUSES]),
          lt(bookings.startsAt, to),
          gt(bookings.endsAt, from),
        ),
      ),
    db
      .select({ startsAt: blockedTimes.startsAt, endsAt: blockedTimes.endsAt, bay: blockedTimes.bay })
      .from(blockedTimes)
      .where(and(eq(blockedTimes.shopId, shopId), lt(blockedTimes.startsAt, to), gt(blockedTimes.endsAt, from))),
  ]);
  return [...bookingRows, ...blockRows];
}
