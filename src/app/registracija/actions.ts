"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db";
import { fieldErrors } from "@/lib/booking/request";
import { slugPattern, signupRequestSchema, type SignupRequestInput } from "@/lib/signup/request";
import { getAuth } from "@/server/auth";
import { isSlugAvailable, registerShop } from "@/server/signup";

const REASON_MESSAGES = {
  slug_taken: "Ta adresa je već zauzeta. Izaberite drugu.",
  email_taken: "Nalog sa tim emailom već postoji.",
  weak_password: "Lozinka mora biti duža.",
} as const;

export type RegisterShopActionResult = { ok: false; errors: Record<string, string> };

export async function registerShopAction(raw: SignupRequestInput): Promise<RegisterShopActionResult> {
  const parsed = signupRequestSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };

  const db = getDb();
  const auth = getAuth();
  const result = await registerShop(db, auth, parsed.data);
  if (!result.ok) {
    const field = result.reason === "slug_taken" ? "slug" : result.reason === "email_taken" ? "email" : "password";
    return { ok: false, errors: { [field]: REASON_MESSAGES[result.reason] } };
  }

  // Sign the new owner in right away (nextCookies() plugin sets the session cookie here).
  await auth.api.signInEmail({ body: { email: parsed.data.email, password: parsed.data.password }, headers: await headers() });
  redirect("/admin");
}

const slugInput = z.object({ slug: z.string().trim().min(2).max(60).regex(slugPattern) });

export async function checkSlugAction(raw: z.input<typeof slugInput>): Promise<{ available: boolean }> {
  const input = slugInput.safeParse(raw);
  if (!input.success) return { available: false };
  return { available: await isSlugAvailable(getDb(), input.data.slug) };
}
