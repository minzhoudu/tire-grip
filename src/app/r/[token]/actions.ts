"use server";

/** Public action — no session check. The token in the URL is unguessable (see src/server/reminders.ts). */
import { z } from "zod";
import { getDb } from "@/db";
import { optOutByToken } from "@/server/reminders";

const input = z.object({ token: z.uuid() });

export async function optOutAction(raw: z.input<typeof input>): Promise<{ ok: boolean }> {
  const parsed = input.safeParse(raw);
  if (!parsed.success) return { ok: false };
  return { ok: await optOutByToken(getDb(), parsed.data.token) };
}
