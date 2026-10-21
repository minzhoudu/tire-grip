/**
 * Validation for the public shop-signup form (/registracija).
 * Shared by the server action (authoritative) and the form (instant feedback).
 */
import { z } from "zod";
import { normalizePhone } from "../phone.ts";

/** Must match src/server/auth.ts's Better Auth config (kept separate so this stays import-safe on the client). */
export const MIN_PASSWORD_LENGTH = 10;

export const slugPattern = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Reserved for the app itself — {slug}.mojvulkanizer.com would otherwise collide with these. */
const RESERVED_SLUGS = new Set(["platform", "www", "admin", "api"]);

export const signupRequestSchema = z.object({
  shopName: z.string().trim().min(2, "Unesite naziv radnje").max(80, "Naziv je predugačak"),
  slug: z
    .string()
    .trim()
    .min(2, "Prekratko")
    .max(60, "Predugačko")
    .regex(slugPattern, "Samo mala slova, brojevi i crtice (npr. brzi-tocak)")
    .refine((s) => !RESERVED_SLUGS.has(s), "Ova adresa je rezervisana, izaberite drugu."),
  city: z.string().trim().max(80).optional().default(""),
  ownerName: z.string().trim().min(2, "Unesite ime").max(60, "Ime je predugačko"),
  email: z.email("Unesite ispravan email"),
  password: z.string().min(MIN_PASSWORD_LENGTH, `Lozinka mora imati bar ${MIN_PASSWORD_LENGTH} karaktera`),
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
});

export type SignupRequestInput = z.input<typeof signupRequestSchema>;
export type SignupRequest = z.output<typeof signupRequestSchema>;

/** An already signed-in account adding another shop (/admin/nova-radnja) — no owner/email/password fields, those are already known. */
export const addShopRequestSchema = signupRequestSchema.pick({ shopName: true, slug: true, city: true, phone: true });
export type AddShopRequestInput = z.input<typeof addShopRequestSchema>;
