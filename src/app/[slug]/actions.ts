"use server";

/**
 * Server actions behind the customer chat. They are public HTTP endpoints,
 * so every input is validated here regardless of what the UI sends.
 */
import { z } from "zod";
import { getDb } from "@/db";
import {
  addDays,
  dayChipLabel,
  dayLongLabel,
  getDayAvailability,
  listBookableDays,
  shopToday,
  zonedToUtc,
} from "@/lib/availability";
import { bookingRequestSchema, fieldErrors, vehicleTypes, type BookingRequestInput } from "@/lib/booking/request";
import { newBookingMessage, vehicleTypeLabels } from "@/lib/booking/messages";
import { formatPhone, whatsappLink } from "@/lib/phone";
import { createBookingRequest } from "@/server/bookings";
import { getOrigin } from "@/server/origin";
import { findOffer, loadBusy, loadShopContext } from "@/server/shops";

const offerInput = z.object({
  slug: z.string().min(1).max(80),
  serviceId: z.uuid(),
  vehicleType: z.enum(vehicleTypes),
});

const daysInput = offerInput.extend({ offset: z.number().int().min(0).max(120).optional().default(0) });

export interface DayOption {
  date: string;
  label: string;
}

export interface SlotOption {
  time: string;
  startsAt: string;
  available: boolean;
}

/** One page (6) of upcoming days that still have a free slot, starting after `offset` such days. */
const DAYS_PAGE_SIZE = 6;

export async function getDaysAction(
  raw: z.input<typeof daysInput>,
): Promise<{ ok: true; days: DayOption[]; hasMore: boolean } | { ok: false }> {
  const input = daysInput.safeParse(raw);
  if (!input.success) return { ok: false };

  const db = getDb();
  const ctx = await loadShopContext(db, input.data.slug);
  if (!ctx) return { ok: false };
  const found = findOffer(ctx, input.data.serviceId, input.data.vehicleType);
  if (!found) return { ok: false };

  const now = new Date();
  const tz = ctx.settings.timezone;
  const today = shopToday(ctx.settings, now);
  const busy = await loadBusy(
    db,
    ctx.shop.id,
    zonedToUtc(today, 0, tz),
    zonedToUtc(addDays(today, ctx.settings.bookingHorizonDays + 1), 0, tz),
  );
  // Ask for one extra day to know whether another page follows, without showing it.
  const days = listBookableDays({
    shop: ctx.settings,
    weeklyHours: ctx.weeklyHours,
    exceptions: ctx.exceptions,
    busy,
    durationMin: found.offer.durationMin,
    now,
    offset: input.data.offset,
    limit: DAYS_PAGE_SIZE + 1,
  });
  const hasMore = days.length > DAYS_PAGE_SIZE;
  const page = days.slice(0, DAYS_PAGE_SIZE);
  return { ok: true, days: page.map((d) => ({ date: d.date, label: dayChipLabel(d.date, today) })), hasMore };
}

const slotsInput = offerInput.extend({ date: z.iso.date() });

/** All start times for one day; taken ones come back with available: false. */
export async function getSlotsAction(
  raw: z.input<typeof slotsInput>,
): Promise<{ ok: true; dayLabel: string; slots: SlotOption[] } | { ok: false }> {
  const input = slotsInput.safeParse(raw);
  if (!input.success) return { ok: false };

  const db = getDb();
  const ctx = await loadShopContext(db, input.data.slug);
  if (!ctx) return { ok: false };
  const found = findOffer(ctx, input.data.serviceId, input.data.vehicleType);
  if (!found) return { ok: false };

  const { date } = input.data;
  const tz = ctx.settings.timezone;
  const busy = await loadBusy(db, ctx.shop.id, zonedToUtc(date, 0, tz), zonedToUtc(addDays(date, 1), 0, tz));
  const day = getDayAvailability({
    shop: ctx.settings,
    weeklyHours: ctx.weeklyHours,
    exceptions: ctx.exceptions,
    busy,
    durationMin: found.offer.durationMin,
    now: new Date(),
    date,
  });
  return {
    ok: true,
    dayLabel: dayLongLabel(date),
    slots: day.slots.map((s) => ({ time: s.time, startsAt: s.startsAt.toISOString(), available: s.available })),
  };
}

export interface BookingConfirmation {
  status: "pending" | "confirmed";
  dayLabel: string;
  time: string;
  priceRsd: number;
  customerName: string;
  phoneDisplay: string;
  /** Opens WhatsApp to the shop with the request prefilled (until the admin panel exists) */
  shopWhatsappUrl: string | null;
  /** Self-service cancel link (/otkazi/{bookingId}) */
  cancelUrl: string;
}

export type SubmitBookingResult =
  | { ok: true; confirmation: BookingConfirmation }
  | { ok: false; reason: "invalid"; errors: Record<string, string> }
  | { ok: false; reason: "slot_unavailable" | "service_unavailable" | "shop_not_found" | "error" };

export async function submitBookingAction(raw: BookingRequestInput): Promise<SubmitBookingResult> {
  const parsed = bookingRequestSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "invalid", errors: fieldErrors(parsed.error) };
  const req = parsed.data;

  try {
    const result = await createBookingRequest(getDb(), req);
    if (!result.ok) return { ok: false, reason: result.reason };

    const { booking, shop, serviceName } = result;
    const dayLabel = dayLongLabel(booking.date);
    const message = newBookingMessage({
      shopName: shop.name,
      serviceName,
      vehicleTypeLabel: vehicleTypeLabels[req.vehicleType],
      vehicleLabel: req.vehicleLabel || undefined,
      dayLabel,
      time: booking.time,
      priceRsd: booking.priceRsd,
      customerName: req.name,
      customerPhone: req.phone,
      note: req.note || undefined,
    });

    return {
      ok: true,
      confirmation: {
        status: booking.status,
        dayLabel,
        time: booking.time,
        priceRsd: booking.priceRsd,
        customerName: req.name,
        phoneDisplay: formatPhone(req.phone),
        shopWhatsappUrl: shop.phone ? whatsappLink(shop.phone, message) : null,
        cancelUrl: `${await getOrigin()}/otkazi/${booking.id}`,
      },
    };
  } catch (err) {
    console.error("submitBookingAction failed", err);
    return { ok: false, reason: "error" };
  }
}
