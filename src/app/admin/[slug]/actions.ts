"use server";

/**
 * Admin server actions. Each one re-checks that the signed-in user belongs to
 * the shop in `slug` (requireShopAccess) and only ever touches that shop's rows.
 */
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db";
import { dayLongLabel } from "@/lib/availability";
import { parseTime } from "@/lib/availability/zoned";
import { bookingRequestSchema, fieldErrors, type BookingRequestInput } from "@/lib/booking/request";
import { allowedActions, notifiesCustomer, type BookingAction, type BookingStatus } from "@/lib/booking/status";
import {
  adminDaySlots,
  changeBookingStatus,
  createBlock,
  customerMessageUrl,
  deleteBlock,
  getBooking,
  markNotified,
  markReminderSent,
} from "@/server/admin";
import { getAuth } from "@/server/auth";
import { createBookingRequest } from "@/server/bookings";
import { getOrigin, platformUrl, rootLoginUrl } from "@/server/origin";
import { endImpersonation, IMPERSONATION_COOKIE, logPlatformAction } from "@/server/platform";
import { requireShopAccess, requireUser } from "@/server/session";
import { loadShopContext } from "@/server/shops";

const slugSchema = z.string().min(1).max(80);

/* ------------------------------------------------------------------ status */

const statusInput = z.object({
  slug: slugSchema,
  bookingId: z.uuid(),
  action: z.enum(["confirm", "reject", "cancel", "complete", "noShow"]),
});

export type StatusActionResult =
  | { ok: true; status: BookingStatus; actions: BookingAction[]; messageUrl: string | null }
  | { ok: false; reason: "not_found" | "not_allowed" | "invalid" };

export async function changeStatusAction(raw: z.input<typeof statusInput>): Promise<StatusActionResult> {
  const input = statusInput.safeParse(raw);
  if (!input.success) return { ok: false, reason: "invalid" };
  const { shop } = await requireShopAccess(input.data.slug);

  const now = new Date();
  const result = await changeBookingStatus(getDb(), { shopId: shop.id, bookingId: input.data.bookingId, action: input.data.action, now });
  if (!result.ok) return result;

  const action = input.data.action;
  const messageUrl = notifiesCustomer(action)
    ? customerMessageUrl(result.booking, shop, action as "confirm" | "reject" | "cancel", await getOrigin())
    : null;
  return {
    ok: true,
    status: result.booking.status,
    actions: allowedActions(result.booking.status, result.booking.startsAt, now),
    messageUrl,
  };
}

export async function markNotifiedAction(raw: { slug: string; bookingId: string }): Promise<{ ok: boolean }> {
  const input = z.object({ slug: slugSchema, bookingId: z.uuid() }).safeParse(raw);
  if (!input.success) return { ok: false };
  const { shop } = await requireShopAccess(input.data.slug);
  return { ok: await markNotified(getDb(), shop.id, input.data.bookingId) };
}

export async function markReminderSentAction(raw: { slug: string; bookingId: string }): Promise<{ ok: boolean }> {
  const input = z.object({ slug: slugSchema, bookingId: z.uuid() }).safeParse(raw);
  if (!input.success) return { ok: false };
  const { shop } = await requireShopAccess(input.data.slug);
  return { ok: await markReminderSent(getDb(), shop.id, input.data.bookingId) };
}

/* ------------------------------------------------------------------ manual booking */

const slotsInput = z.object({
  slug: slugSchema,
  serviceId: z.uuid(),
  vehicleTypeId: z.uuid(),
  date: z.iso.date(),
});

export async function adminSlotsAction(
  raw: z.input<typeof slotsInput>,
): Promise<{ ok: true; status: string; slots: { time: string; startsAt: string; available: boolean }[] } | { ok: false }> {
  const input = slotsInput.safeParse(raw);
  if (!input.success) return { ok: false };
  await requireShopAccess(input.data.slug);
  const db = getDb();
  const ctx = await loadShopContext(db, input.data.slug);
  if (!ctx) return { ok: false };
  const day = await adminDaySlots(db, ctx, input.data.serviceId, input.data.vehicleTypeId, input.data.date);
  if (!day) return { ok: false };
  return {
    ok: true,
    status: day.status,
    slots: day.slots.map((s) => ({ time: s.time, startsAt: s.startsAt.toISOString(), available: s.available })),
  };
}

export type ManualBookingResult =
  | { ok: true; messageUrl: string; summary: string }
  | { ok: false; reason: "invalid"; errors: Record<string, string> }
  | { ok: false; reason: "slot_unavailable" | "service_unavailable" | "shop_not_found" };

export async function createManualBookingAction(raw: BookingRequestInput & { bay?: number }): Promise<ManualBookingResult> {
  const parsed = bookingRequestSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "invalid", errors: fieldErrors(parsed.error) };
  const { shop } = await requireShopAccess(parsed.data.slug);
  const preferredBay = Number.isInteger(raw.bay) && raw.bay! >= 1 && raw.bay! <= shop.bays ? raw.bay : undefined;

  const db = getDb();
  const result = await createBookingRequest(db, parsed.data, { source: "admin", preferredBay });
  if (!result.ok) return { ok: false, reason: result.reason };

  const booking = await getBooking(db, shop.id, result.booking.id);
  if (!booking) return { ok: false, reason: "slot_unavailable" };
  return {
    ok: true,
    messageUrl: customerMessageUrl(booking, shop, "confirm", await getOrigin()),
    summary: `${booking.customerName} · ${dayLongLabel(result.booking.date)} u ${result.booking.time}h${shop.bays > 1 ? ` · boks ${result.booking.bay}` : ""}`,
  };
}

/* ------------------------------------------------------------------ blocked time */

const blockInput = z.object({
  slug: slugSchema,
  date: z.iso.date(),
  from: z.string().regex(/^\d{2}:\d{2}$/),
  to: z.string().regex(/^\d{2}:\d{2}$/),
  bay: z.number().int().min(1).nullable(),
  reason: z.string().trim().max(120).optional(),
});

export type BlockActionResult =
  | { ok: true; overlappingBookings: number }
  | { ok: false; error: string };

export async function createBlockAction(raw: z.input<typeof blockInput>): Promise<BlockActionResult> {
  const input = blockInput.safeParse(raw);
  if (!input.success) return { ok: false, error: "Proverite datum i vreme." };
  const { shop } = await requireShopAccess(input.data.slug);

  const result = await createBlock(getDb(), {
    shopId: shop.id,
    bays: shop.bays,
    timezone: shop.timezone,
    date: input.data.date,
    fromMin: parseTime(input.data.from),
    toMin: parseTime(input.data.to),
    bay: input.data.bay,
    reason: input.data.reason,
  });
  if (!result.ok) {
    return { ok: false, error: result.reason === "invalid_range" ? "Vreme „do“ mora biti posle vremena „od“." : "Nepostojeći boks." };
  }
  return { ok: true, overlappingBookings: result.overlappingBookings };
}

export async function deleteBlockAction(raw: { slug: string; blockId: string }): Promise<{ ok: boolean }> {
  const input = z.object({ slug: slugSchema, blockId: z.uuid() }).safeParse(raw);
  if (!input.success) return { ok: false };
  const { shop } = await requireShopAccess(input.data.slug);
  return { ok: await deleteBlock(getDb(), shop.id, input.data.blockId) };
}

/* ------------------------------------------------------------------ session */

export async function signOutAction(): Promise<void> {
  await getAuth().api.signOut({ headers: await headers() });
  redirect(await rootLoginUrl());
}

/** Ends the current "Uđi kao" support session, if any, and sends the admin back to the platform dashboard. */
export async function endImpersonationAction(): Promise<void> {
  const user = await requireUser();
  const jar = await cookies();
  const sessionId = jar.get(IMPERSONATION_COOKIE)?.value;
  if (sessionId) {
    const ended = await endImpersonation(getDb(), sessionId, user.id);
    if (ended) await logPlatformAction(getDb(), { adminUserId: user.id, shopId: ended.shopId, action: "impersonation_ended" });
  }
  jar.delete(IMPERSONATION_COOKIE);
  redirect(await platformUrl());
}
