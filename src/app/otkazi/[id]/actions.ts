"use server";

/** Public action — no session check. The booking id in the URL is the token (see src/server/cancel.ts). */
import { z } from "zod";
import { getDb } from "@/db";
import { cancelBookingByCustomer } from "@/server/cancel";

const input = z.object({ id: z.uuid() });

export type CancelResult = { ok: true } | { ok: false; error: string };

export async function cancelBookingAction(raw: z.input<typeof input>): Promise<CancelResult> {
  const parsed = input.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Neispravan zahtev." };

  const result = await cancelBookingByCustomer(getDb(), parsed.data.id);
  if (result.ok) return { ok: true };
  return {
    ok: false,
    error: result.reason === "not_found" ? "Termin nije pronađen." : "Ovaj termin više ne može da se otkaže ovde — kontaktirajte radnju.",
  };
}
