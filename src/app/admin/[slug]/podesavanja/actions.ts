"use server";

/**
 * Server actions for the owner-only settings page. Each one re-checks
 * requireOwnerAccess(slug) — the shop comes from the URL, so ownership must
 * be verified every time, same as the rest of the admin panel.
 */
import { z } from "zod";
import { getDb } from "@/db";
import { serviceKind } from "@/db/schema";
import { normalizePhone } from "@/lib/phone";
import { requireOwnerAccess } from "@/server/session";
import {
  createService,
  createVehicleType,
  deleteException,
  deleteService,
  deleteVehicleType,
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
  type AffectedBooking,
  type ServiceInput,
  type VehicleTypeInput,
} from "@/server/settings";

const slugSchema = z.string().min(1).max(80);
const timeSchema = z.string().regex(/^\d{2}:\d{2}$/);

/* ------------------------------------------------------------------ shop info */

const shopInfoInput = z.object({
  slug: slugSchema,
  name: z.string().trim().min(1, "Unesite naziv radnje").max(120),
  city: z.string().trim().max(80).optional().default(""),
  address: z.string().trim().max(200).optional().default(""),
  phone: z.string().trim().max(30).optional().default(""),
});

export type ShopInfoResult = { ok: true } | { ok: false; errors: Record<string, string> };

export async function updateShopInfoAction(raw: z.input<typeof shopInfoInput>): Promise<ShopInfoResult> {
  const input = shopInfoInput.safeParse(raw);
  if (!input.success) return { ok: false, errors: { form: "Proverite unete podatke." } };
  const { shop } = await requireOwnerAccess(input.data.slug);

  let phone: string | null = null;
  if (input.data.phone) {
    phone = normalizePhone(input.data.phone);
    if (!phone) return { ok: false, errors: { phone: "Unesite ispravan broj telefona, npr. 064 123 4567" } };
  }

  await updateShopInfo(getDb(), shop.id, {
    name: input.data.name,
    city: input.data.city || null,
    address: input.data.address || null,
    phone,
  });
  return { ok: true };
}

/* ------------------------------------------------------------------ booking rules */

const bookingRulesInput = z.object({
  slug: slugSchema,
  bays: z.number().int().min(1).max(20),
  slotStepMin: z.number().int().min(5).max(240),
  bookingHorizonDays: z.number().int().min(1).max(120),
  minNoticeMin: z.number().int().min(0).max(2880),
  autoConfirm: z.boolean(),
});

export type BookingRulesResult = { ok: true } | { ok: false; error: string };

export async function updateBookingRulesAction(raw: z.input<typeof bookingRulesInput>): Promise<BookingRulesResult> {
  const input = bookingRulesInput.safeParse(raw);
  if (!input.success) return { ok: false, error: "Proverite unete vrednosti." };
  const { shop } = await requireOwnerAccess(input.data.slug);

  const result = await updateBookingRules(getDb(), shop, {
    bays: input.data.bays,
    slotStepMin: input.data.slotStepMin,
    bookingHorizonDays: input.data.bookingHorizonDays,
    minNoticeMin: input.data.minNoticeMin,
    autoConfirm: input.data.autoConfirm,
  });
  if (!result.ok) {
    return {
      ok: false,
      error: `Ne može: ${result.count} zakazan(ih) termin(a) je na dizalici koja bi nestala. Prebacite ih ili otkažite, pa probajte ponovo.`,
    };
  }
  return { ok: true };
}

/* ------------------------------------------------------------------ weekly hours */

const dayInput = z.object({
  weekday: z.number().int().min(1).max(7),
  intervals: z
    .array(z.object({ opensAt: timeSchema, closesAt: timeSchema }))
    .max(4)
    .refine((ivs) => ivs.every((i) => i.opensAt < i.closesAt), "Vreme „do“ mora biti posle vremena „od“."),
});

const workingHoursInput = z.object({ slug: slugSchema, days: z.array(dayInput).length(7) });

export type WorkingHoursResult = { ok: true; affected: AffectedBooking[] } | { ok: false; error: string };

export async function updateWorkingHoursAction(raw: z.input<typeof workingHoursInput>): Promise<WorkingHoursResult> {
  const input = workingHoursInput.safeParse(raw);
  if (!input.success) return { ok: false, error: "Proverite unete sate." };
  const { shop } = await requireOwnerAccess(input.data.slug);

  const { affected } = await updateWorkingHours(getDb(), shop, input.data.days);
  return { ok: true, affected };
}

/* ------------------------------------------------------------------ date exceptions */

const exceptionInput = z
  .object({
    slug: slugSchema,
    date: z.iso.date(),
    closed: z.boolean(),
    opensAt: timeSchema.optional(),
    closesAt: timeSchema.optional(),
    note: z.string().trim().max(120).optional().default(""),
  })
  .refine((v) => v.closed || (v.opensAt && v.closesAt && v.opensAt < v.closesAt), {
    message: "Unesite radno vreme za taj dan (vreme „do“ posle vremena „od“), ili obeležite da je radnja zatvorena.",
  });

export type ExceptionResult = { ok: true } | { ok: false; error: string };

export async function upsertExceptionAction(raw: z.input<typeof exceptionInput>): Promise<ExceptionResult> {
  const input = exceptionInput.safeParse(raw);
  if (!input.success) return { ok: false, error: input.error.issues[0]?.message ?? "Proverite unete podatke." };
  const { shop } = await requireOwnerAccess(input.data.slug);

  await upsertException(getDb(), shop.id, {
    date: input.data.date,
    closed: input.data.closed,
    opensAt: input.data.closed ? null : input.data.opensAt!,
    closesAt: input.data.closed ? null : input.data.closesAt!,
    note: input.data.note || null,
  });
  return { ok: true };
}

export async function deleteExceptionAction(raw: { slug: string; id: string }): Promise<{ ok: boolean }> {
  const input = z.object({ slug: slugSchema, id: z.uuid() }).safeParse(raw);
  if (!input.success) return { ok: false };
  const { shop } = await requireOwnerAccess(input.data.slug);
  return { ok: await deleteException(getDb(), shop.id, input.data.id) };
}

/* ------------------------------------------------------------------ services & prices */

const priceInput = z.object({
  vehicleTypeId: z.uuid(),
  priceRsd: z.number().int().min(0),
  durationMin: z.number().int().min(5).max(480).nullable(),
});

const serviceInput = z.object({
  slug: slugSchema,
  kind: z.enum(serviceKind.enumValues),
  name: z.string().trim().min(1, "Unesite naziv usluge").max(60),
  description: z.string().trim().max(300).optional().default(""),
  icon: z.string().trim().max(8).optional().default(""),
  durationMin: z.number().int().min(5).max(480),
  bookable: z.boolean(),
  prices: z
    .array(priceInput)
    .max(50)
    .refine((p) => new Set(p.map((x) => x.vehicleTypeId)).size === p.length, "Po jedna cena za svaki tip vozila."),
});

export type ServiceResult = { ok: true } | { ok: false; error: string };

function toServiceInput(data: z.output<typeof serviceInput>): ServiceInput {
  return {
    kind: data.kind,
    name: data.name,
    description: data.description || null,
    icon: data.icon || null,
    durationMin: data.durationMin,
    bookable: data.bookable,
    prices: data.prices,
  };
}

export async function createServiceAction(raw: z.input<typeof serviceInput>): Promise<ServiceResult> {
  const input = serviceInput.safeParse(raw);
  if (!input.success) return { ok: false, error: input.error.issues[0]?.message ?? "Proverite unete podatke." };
  const { shop } = await requireOwnerAccess(input.data.slug);
  await createService(getDb(), shop.id, toServiceInput(input.data));
  return { ok: true };
}

export async function updateServiceAction(raw: z.input<typeof serviceInput> & { serviceId: string }): Promise<ServiceResult> {
  const { serviceId, ...rest } = raw;
  const input = serviceInput.safeParse(rest);
  const idCheck = z.uuid().safeParse(serviceId);
  if (!input.success || !idCheck.success) return { ok: false, error: input.success ? "Neispravna usluga." : input.error.issues[0]?.message ?? "" };
  const { shop } = await requireOwnerAccess(input.data.slug);
  const ok = await updateService(getDb(), shop.id, idCheck.data, toServiceInput(input.data));
  return ok ? { ok: true } : { ok: false, error: "Usluga nije pronađena." };
}

export async function setServiceActiveAction(raw: { slug: string; serviceId: string; isActive: boolean }): Promise<{ ok: boolean }> {
  const input = z.object({ slug: slugSchema, serviceId: z.uuid(), isActive: z.boolean() }).safeParse(raw);
  if (!input.success) return { ok: false };
  const { shop } = await requireOwnerAccess(input.data.slug);
  return { ok: await setServiceActive(getDb(), shop.id, input.data.serviceId, input.data.isActive) };
}

export type DeleteServiceActionResult = { ok: true } | { ok: false; reason: "has_bookings" | "not_found" | "invalid" };

export async function deleteServiceAction(raw: { slug: string; serviceId: string }): Promise<DeleteServiceActionResult> {
  const input = z.object({ slug: slugSchema, serviceId: z.uuid() }).safeParse(raw);
  if (!input.success) return { ok: false, reason: "invalid" };
  const { shop } = await requireOwnerAccess(input.data.slug);
  return deleteService(getDb(), shop.id, input.data.serviceId);
}

export async function moveServiceAction(raw: { slug: string; serviceId: string; direction: "up" | "down" }): Promise<{ ok: boolean }> {
  const input = z.object({ slug: slugSchema, serviceId: z.uuid(), direction: z.enum(["up", "down"]) }).safeParse(raw);
  if (!input.success) return { ok: false };
  const { shop } = await requireOwnerAccess(input.data.slug);
  await moveService(getDb(), shop.id, input.data.serviceId, input.data.direction);
  return { ok: true };
}

/* ------------------------------------------------------------------ vehicle types */

const vehicleTypeInput = z.object({
  slug: slugSchema,
  label: z.string().trim().min(1, "Unesite naziv").max(60),
  icon: z.string().trim().max(8).optional().default(""),
});

export type VehicleTypeResult = { ok: true } | { ok: false; error: string };

function toVehicleTypeInput(data: z.output<typeof vehicleTypeInput>): VehicleTypeInput {
  return { label: data.label, icon: data.icon || null };
}

export async function createVehicleTypeAction(raw: z.input<typeof vehicleTypeInput>): Promise<VehicleTypeResult> {
  const input = vehicleTypeInput.safeParse(raw);
  if (!input.success) return { ok: false, error: input.error.issues[0]?.message ?? "Proverite unete podatke." };
  const { shop } = await requireOwnerAccess(input.data.slug);
  await createVehicleType(getDb(), shop.id, toVehicleTypeInput(input.data));
  return { ok: true };
}

export async function updateVehicleTypeAction(raw: z.input<typeof vehicleTypeInput> & { vehicleTypeId: string }): Promise<VehicleTypeResult> {
  const { vehicleTypeId, ...rest } = raw;
  const input = vehicleTypeInput.safeParse(rest);
  const idCheck = z.uuid().safeParse(vehicleTypeId);
  if (!input.success || !idCheck.success) return { ok: false, error: input.success ? "Neispravna vrsta vozila." : input.error.issues[0]?.message ?? "" };
  const { shop } = await requireOwnerAccess(input.data.slug);
  const ok = await updateVehicleType(getDb(), shop.id, idCheck.data, toVehicleTypeInput(input.data));
  return ok ? { ok: true } : { ok: false, error: "Vrsta vozila nije pronađena." };
}

export async function setVehicleTypeActiveAction(raw: { slug: string; vehicleTypeId: string; isActive: boolean }): Promise<{ ok: boolean }> {
  const input = z.object({ slug: slugSchema, vehicleTypeId: z.uuid(), isActive: z.boolean() }).safeParse(raw);
  if (!input.success) return { ok: false };
  const { shop } = await requireOwnerAccess(input.data.slug);
  return { ok: await setVehicleTypeActive(getDb(), shop.id, input.data.vehicleTypeId, input.data.isActive) };
}

export type DeleteVehicleTypeActionResult = { ok: true } | { ok: false; reason: "has_bookings" | "not_found" | "invalid" };

export async function deleteVehicleTypeAction(raw: { slug: string; vehicleTypeId: string }): Promise<DeleteVehicleTypeActionResult> {
  const input = z.object({ slug: slugSchema, vehicleTypeId: z.uuid() }).safeParse(raw);
  if (!input.success) return { ok: false, reason: "invalid" };
  const { shop } = await requireOwnerAccess(input.data.slug);
  return deleteVehicleType(getDb(), shop.id, input.data.vehicleTypeId);
}

export async function moveVehicleTypeAction(raw: { slug: string; vehicleTypeId: string; direction: "up" | "down" }): Promise<{ ok: boolean }> {
  const input = z.object({ slug: slugSchema, vehicleTypeId: z.uuid(), direction: z.enum(["up", "down"]) }).safeParse(raw);
  if (!input.success) return { ok: false };
  const { shop } = await requireOwnerAccess(input.data.slug);
  await moveVehicleType(getDb(), shop.id, input.data.vehicleTypeId, input.data.direction);
  return { ok: true };
}
