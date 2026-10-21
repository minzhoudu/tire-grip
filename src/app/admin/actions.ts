"use server";

import { getDb } from "@/db";
import { fieldErrors } from "@/lib/booking/request";
import { addShopRequestSchema, type AddShopRequestInput } from "@/lib/signup/request";
import { addShop } from "@/server/signup";
import { requireUser } from "@/server/session";

export type AddShopActionResult = { ok: true; slug: string } | { ok: false; errors: Record<string, string> };

/** Self-service second (or third, …) shop for an already signed-in account — still goes to the review queue like any new signup. */
export async function addShopAction(raw: AddShopRequestInput): Promise<AddShopActionResult> {
  const parsed = addShopRequestSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };

  const user = await requireUser("/admin/nova-radnja");
  const result = await addShop(getDb(), { userId: user.id, ...parsed.data });
  if (!result.ok) {
    return result.reason === "slug_taken"
      ? { ok: false, errors: { slug: "Ta adresa je već zauzeta. Izaberite drugu." } }
      : { ok: false, errors: { form: "Već imate radnju koja čeka odobrenje. Sačekajte odgovor pre nego dodate još jednu." } };
  }
  return { ok: true, slug: result.slug };
}
