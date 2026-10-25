/**
 * "Pronađi vulkanizera": the public map of shops on the Pro plan that have set their pin.
 * Each comes with what Google can't show: whether it's open now and its first free slot.
 */
import { and, asc, eq, isNotNull } from "drizzle-orm";
import type { DB } from "../db/index.ts";
import { shops } from "../db/schema.ts";
import { addDays, dayChipLabel, getOpenStatus, listBookableDays, openStatusText, shopToday, zonedToUtc } from "../lib/availability/index.ts";
import { resolveOffer } from "../lib/availability/index.ts";
import { loadBusy, loadShopContext, type PublicService } from "./shops.ts";

export interface DirectoryShop {
  slug: string;
  name: string;
  businessLabel: string;
  city: string | null;
  address: string | null;
  lat: number;
  lng: number;
  open: boolean;
  /** "Radimo do 17h" / "Zatvoreno · otvaramo sutra u 08:00" */
  statusText: string;
  /** "Danas u 14:30" for the shop's main service; null = nothing free in its booking window */
  firstFree: string | null;
  firstFreeService: string | null;
  services: { name: string; icon: string | null }[];
}

/** The service a driver most likely wants: tyre change if offered, else the first bookable one. */
function mainService(services: PublicService[]): PublicService | null {
  const bookable = services.filter((s) => s.bookable && s.prices.length > 0);
  return bookable.find((s) => s.kind === "seasonal_swap") ?? bookable[0] ?? null;
}

async function directoryEntry(db: DB, slug: string, now: Date): Promise<DirectoryShop | null> {
  const ctx = await loadShopContext(db, slug);
  if (!ctx || ctx.shop.latitude === null || ctx.shop.longitude === null) return null;
  const today = shopToday(ctx.settings, now);
  const status = getOpenStatus({ shop: ctx.settings, weeklyHours: ctx.weeklyHours, exceptions: ctx.exceptions, now });

  let firstFree: string | null = null;
  const service = mainService(ctx.services);
  const offer = service && resolveOffer({ durationMin: service.durationMin, bookable: true, isActive: true }, service.prices, service.prices[0]!.vehicleTypeId);
  if (service && offer) {
    const tz = ctx.settings.timezone;
    const busy = await loadBusy(db, ctx.shop.id, zonedToUtc(today, 0, tz), zonedToUtc(addDays(today, ctx.settings.bookingHorizonDays + 1), 0, tz));
    const [day] = listBookableDays({
      shop: ctx.settings,
      weeklyHours: ctx.weeklyHours,
      exceptions: ctx.exceptions,
      busy,
      durationMin: offer.durationMin,
      now,
      limit: 1,
    });
    const slot = day?.slots.find((s) => s.available);
    if (day && slot) firstFree = `${dayChipLabel(day.date, today)} u ${slot.time}`;
  }

  return {
    slug: ctx.shop.slug,
    name: ctx.shop.name,
    businessLabel: ctx.shop.businessLabel || "Vulkanizer",
    city: ctx.shop.city,
    address: ctx.shop.address,
    lat: ctx.shop.latitude,
    lng: ctx.shop.longitude,
    open: status.open,
    statusText: openStatusText(status, today),
    firstFree,
    firstFreeService: firstFree ? service!.name : null,
    services: ctx.services.filter((s) => s.prices.length > 0).map((s) => ({ name: s.name, icon: s.icon })),
  };
}

/** Which shops are on the public map. */
export async function listDirectorySlugs(db: DB): Promise<string[]> {
  const rows = await db
    .select({ slug: shops.slug })
    .from(shops)
    .where(and(eq(shops.plan, "pro"), eq(shops.isActive, true), eq(shops.signupStatus, "approved"), isNotNull(shops.latitude)))
    .orderBy(asc(shops.name));
  return rows.map((r) => r.slug);
}

// Free slots change by the minute, but the map doesn't need to be exact to the second:
// recompute at most every 2 minutes per server instance instead of on every visit.
const TTL_MS = 2 * 60_000;
let cached: { at: number; shops: Promise<DirectoryShop[]> } | null = null;

export async function listDirectory(db: DB, now = new Date()): Promise<DirectoryShop[]> {
  if (cached && now.getTime() - cached.at < TTL_MS) return cached.shops;
  const shopsPromise = (async () => {
    const slugs = await listDirectorySlugs(db);
    const entries = await Promise.all(slugs.map((slug) => directoryEntry(db, slug, now)));
    return entries.filter((e): e is DirectoryShop => e !== null);
  })();
  cached = { at: now.getTime(), shops: shopsPromise };
  shopsPromise.catch(() => (cached = null)); // don't keep a failure around
  return shopsPromise;
}
