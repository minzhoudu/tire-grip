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
import { findOffer, loadBusy, loadShopContext } from "@/server/shops";

const offerInput = z.object({
  slug: z.string().min(1).max(80),
  serviceId: z.uuid(),
  vehicleType: z.enum(vehicleTypes),
});

export interface DayOption {
  date: string;
  label: string;
}

export interface SlotOption {
  time: string;
  startsAt: string;
  available: boolean;
}

/** Up to 6 upcoming days that still have a free slot for this service. */
export async function getDaysAction(raw: z.input<typeof offerInput>): Promise<{ ok: true; days: DayOption[] } | { ok: false }> {
  const input = offerInput.safeParse(raw);
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
  const days = listBookableDays({
    shop: ctx.settings,
    weeklyHours: ctx.weeklyHours,
    exceptions: ctx.exceptions,
    busy,
    durationMin: found.offer.durationMin,
    now,
    limit: 6,
  });
  return { ok: true, days: days.map((d) => ({ date: d.date, label: dayChipLabel(d.date, today) })) };
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
      },
    };
  } catch (err) {
    console.error("submitBookingAction failed", err);
    return { ok: false, reason: "error" };
  }
}
