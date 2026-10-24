/**
 * Creating a booking request from the public chat.
 *
 * 1. Re-validate the shop and the service/vehicle offer.
 * 2. In one transaction, holding a per-shop advisory lock so simultaneous
 *    requests are handled one after another: re-check that the start time
 *    is a real, currently free slot (same engine the chat used, so hours,
 *    notice and horizon all apply), upsert the customer by phone, find or
 *    create the vehicle, and insert the booking on the first free bay.
 * 3. The exclusion constraint stays as the last line of defense (23P01 →
 *    next bay). If the slot is gone, nothing is written.
 */
import { and, eq, sql } from "drizzle-orm";
import type { DB } from "../db/index.ts";
import { bookings, customers, vehicles } from "../db/schema.ts";
import { addDays, getDayAvailability, utcToZoned, zonedToUtc } from "../lib/availability/index.ts";
import type { BookingRequest } from "../lib/booking/request.ts";
import { findOffer, loadBusy, loadShopContext, type ShopContext } from "./shops.ts";

export type CreateBookingResult =
  | {
      ok: true;
      booking: {
        id: string;
        status: "pending" | "confirmed";
        bay: number;
        startsAt: Date;
        endsAt: Date;
        date: string; // local date in the shop's timezone
        time: string; // local "HH:MM"
        priceRsd: number;
        durationMin: number;
        customerId: string;
        vehicleId: string | null;
      };
      shop: ShopContext["shop"];
    }
  | { ok: false; reason: "shop_not_found" | "service_unavailable" | "slot_unavailable" };

class SlotTaken extends Error {}

/** SQLSTATE of a Postgres error, also when wrapped by Drizzle (DrizzleQueryError.cause). */
export function pgErrorCode(err: unknown): string | undefined {
  let current: unknown = err;
  for (let depth = 0; depth < 5 && current && typeof current === "object"; depth++) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) return code;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

const EXCLUSION_VIOLATION = "23P01";
/**
 * Fallbacks only: with the per-shop advisory lock, inserts don't collide. If a
 * write ever bypasses the lock (e.g. a manual SQL insert), the exclusion
 * constraint still rejects overlaps (23P01) and a deadlock (40P01) is retried.
 */
const DEADLOCK = "40P01";
const MAX_DEADLOCK_RETRIES = 5;

export interface CreateBookingOptions {
  now?: Date;
  /**
   * "web" = customer chat (shop settings apply as-is).
   * "admin" = entered by the shop (phone call): no minimum notice, a longer
   * horizon, and the booking is confirmed right away.
   * "reminder" = followed a seasonal reminder link — same rules as "web", just tagged for attribution.
   */
  source?: "web" | "admin" | "reminder";
  /** Try this bay first (tapped in the schedule); another free bay is used if it's taken. */
  preferredBay?: number;
}

/** How far ahead the shop itself can enter bookings. */
export const ADMIN_HORIZON_DAYS = 120;

export async function createBookingRequest(
  db: DB,
  req: BookingRequest,
  { now = new Date(), source = "web", preferredBay }: CreateBookingOptions = {},
): Promise<CreateBookingResult> {
  const ctx = await loadShopContext(db, req.slug);
  if (!ctx) return { ok: false, reason: "shop_not_found" };

  const found = findOffer(ctx, req.serviceId, req.vehicleTypeId);
  if (!found) return { ok: false, reason: "service_unavailable" };
  const { service, offer } = found;

  const tz = ctx.settings.timezone;
  const startsAt = new Date(req.startsAt);
  const { date } = utcToZoned(startsAt, tz);
  const settings =
    source === "admin"
      ? { ...ctx.settings, minNoticeMin: 0, bookingHorizonDays: Math.max(ctx.settings.bookingHorizonDays, ADMIN_HORIZON_DAYS) }
      : ctx.settings;
  const status = source === "admin" || ctx.shop.autoConfirm ? ("confirmed" as const) : ("pending" as const);

  try {
    return await db.transaction(async (tx) => {
      // One booking write per shop at a time. Without this, simultaneous requests
      // all see the same free bays, collide on the exclusion constraint and can
      // deadlock (Postgres only detects that after deadlock_timeout, 1 s). With it,
      // each request reads availability after the previous one has committed.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${ctx.shop.id}, 7))`);

      const busy = await loadBusy(tx, ctx.shop.id, zonedToUtc(date, 0, tz), zonedToUtc(addDays(date, 1), 0, tz));
      const day = getDayAvailability({
        shop: settings,
        weeklyHours: ctx.weeklyHours,
        exceptions: ctx.exceptions,
        busy,
        durationMin: offer.durationMin,
        now,
        date,
      });
      const slot = day.slots.find((s) => s.startsAt.getTime() === startsAt.getTime());
      if (!slot || !slot.available) throw new SlotTaken();

      const consent = req.reminderConsent
        ? { reminderConsent: true, reminderConsentAt: now, optedOutAt: null }
        : {};
      const [customer] = await tx
        .insert(customers)
        .values({ shopId: ctx.shop.id, name: req.name, phone: req.phone, ...consent })
        .onConflictDoUpdate({
          target: [customers.shopId, customers.phone],
          set: { name: req.name, updatedAt: now, ...consent },
        })
        .returning({ id: customers.id });
      if (!customer) throw new Error("customer upsert returned nothing");

      let vehicleId: string | null = null;
      if (req.vehicleLabel) {
        const [existing] = await tx
          .select({ id: vehicles.id })
          .from(vehicles)
          .where(
            and(
              eq(vehicles.shopId, ctx.shop.id),
              eq(vehicles.customerId, customer.id),
              sql`lower(${vehicles.label}) = lower(${req.vehicleLabel})`,
            ),
          )
          .limit(1);
        if (existing) {
          vehicleId = existing.id;
        } else {
          const [created] = await tx
            .insert(vehicles)
            .values({ shopId: ctx.shop.id, customerId: customer.id, label: req.vehicleLabel, vehicleTypeId: req.vehicleTypeId })
            .returning({ id: vehicles.id });
          vehicleId = created?.id ?? null;
        }
      }

      const bays = preferredBay && slot.freeBays.includes(preferredBay) ? [preferredBay, ...slot.freeBays.filter((b) => b !== preferredBay)] : slot.freeBays;
      let deadlocks = 0;
      for (let i = 0; i < bays.length; i++) {
        const bay = bays[i]!;
        try {
          const [row] = await tx.transaction((sp) =>
            sp
              .insert(bookings)
              .values({
                shopId: ctx.shop.id,
                customerId: customer.id,
                vehicleId,
                serviceId: service.id,
                vehicleTypeId: req.vehicleTypeId,
                priceRsd: offer.priceRsd,
                durationMin: offer.durationMin,
                startsAt: slot.startsAt,
                endsAt: slot.endsAt,
                bay,
                status,
                source,
                customerNote: req.note || null,
                confirmedAt: status === "confirmed" ? now : null,
              })
              .returning(),
          );
          if (!row) throw new Error("booking insert returned nothing");
          return {
            ok: true as const,
            booking: {
              id: row.id,
              status,
              bay: row.bay,
              startsAt: row.startsAt,
              endsAt: row.endsAt,
              date,
              time: slot.time,
              priceRsd: row.priceRsd,
              durationMin: row.durationMin,
              customerId: customer.id,
              vehicleId,
            },
            shop: ctx.shop,
          };
        } catch (err) {
          const code = pgErrorCode(err);
          if (code === EXCLUSION_VIOLATION) continue; // bay taken a moment ago, try the next one
          if (code === DEADLOCK && deadlocks++ < MAX_DEADLOCK_RETRIES) {
            i--; // same bay again: the other request has finished by now, so we get a clean answer
            continue;
          }
          throw err;
        }
      }
      throw new SlotTaken(); // rolls back the customer/vehicle writes too
    });
  } catch (err) {
    if (err instanceof SlotTaken || pgErrorCode(err) === EXCLUSION_VIOLATION || pgErrorCode(err) === DEADLOCK) {
      return { ok: false, reason: "slot_unavailable" };
    }
    throw err;
  }
}
