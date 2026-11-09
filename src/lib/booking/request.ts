/**
 * Validation for a booking request coming from the customer chat.
 * Shared by the server action (authoritative) and the form (instant feedback).
 */
import { z } from "zod";
import { normalizePhone } from "../phone.ts";

export const bookingRequestSchema = z.object({
  slug: z.string().min(1).max(80),
  serviceId: z.uuid(),
  vehicleTypeId: z.uuid(),
  /** ISO instant of the chosen slot, as returned by the availability action */
  startsAt: z.iso.datetime(),
  name: z.string().trim().min(2, "Unesite ime").max(60, "Ime je predugačko"),
  phone: z
    .string()
    .trim()
    .transform((v, ctx) => {
      const e164 = normalizePhone(v);
      if (!e164) {
        ctx.addIssue({ code: "custom", message: "Unesite ispravan broj telefona, npr. 064 123 4567" });
        return z.NEVER;
      }
      return e164;
    }),
  vehicleLabel: z.string().trim().max(60, "Predugačko").optional().default(""),
  note: z.string().trim().max(300, "Napomena je predugačka").optional().default(""),
  reminderConsent: z.boolean().optional().default(false),
});

/** Phone that may be left empty: "" → null, otherwise it has to be a valid number. */
const optionalPhone = z
  .string()
  .trim()
  .optional()
  .default("")
  .transform((v, ctx) => {
    if (!v) return null;
    const e164 = normalizePhone(v);
    if (!e164) {
      ctx.addIssue({ code: "custom", message: "Unesite ispravan broj telefona, npr. 064 123 4567" });
      return z.NEVER;
    }
    return e164;
  });

/**
 * A booking the shop enters itself (a phone call, someone at the door): nothing about the customer
 * is required. With no phone it becomes a "Rezervacija radnje" (see createBookingRequest).
 */
export const adminBookingRequestSchema = bookingRequestSchema.extend({
  name: z.string().trim().max(60, "Ime je predugačko").optional().default(""),
  phone: optionalPhone,
});

/** Customer details added later to a Rezervacija radnje. */
export const bookingCustomerSchema = z.object({
  name: z.string().trim().max(60, "Ime je predugačko").optional().default(""),
  phone: optionalPhone,
  vehicleLabel: z.string().trim().max(60, "Predugačko").optional().default(""),
});

export type BookingRequestInput = z.input<typeof bookingRequestSchema>;
export type AdminBookingRequestInput = z.input<typeof adminBookingRequestSchema>;
export type BookingRequest = z.output<typeof bookingRequestSchema>;

/** Field → first error message, for showing under the inputs. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] ??= issue.message;
  }
  return out;
}
