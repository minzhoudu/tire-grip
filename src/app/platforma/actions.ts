"use server";

/**
 * Server actions for the platform owner's dashboard. Each one re-checks
 * requirePlatformAdmin() and logs what it did — these touch other
 * businesses' access, never silent.
 */
import { cookies } from "next/headers";
import { z } from "zod";
import { getDb } from "@/db";
import { shopPlan } from "@/db/schema";
import { approveShop, changeShopPlan, IMPERSONATION_COOKIE, logPlatformAction, rejectShop, setShopActive, startImpersonation } from "@/server/platform";
import { requirePlatformAdmin } from "@/server/session";

const shopIdInput = z.object({ shopId: z.uuid() });

export type PlatformActionResult = { ok: true } | { ok: false; error: string };

export async function approveShopAction(raw: z.input<typeof shopIdInput>): Promise<PlatformActionResult> {
  const input = shopIdInput.safeParse(raw);
  if (!input.success) return { ok: false, error: "Neispravan zahtev." };
  const admin = await requirePlatformAdmin();
  const ok = await approveShop(getDb(), input.data.shopId);
  if (!ok) return { ok: false, error: "Radnja više nije na čekanju." };
  await logPlatformAction(getDb(), { adminUserId: admin.id, shopId: input.data.shopId, action: "signup_approved" });
  return { ok: true };
}

export async function rejectShopAction(raw: z.input<typeof shopIdInput>): Promise<PlatformActionResult> {
  const input = shopIdInput.safeParse(raw);
  if (!input.success) return { ok: false, error: "Neispravan zahtev." };
  const admin = await requirePlatformAdmin();
  const ok = await rejectShop(getDb(), input.data.shopId);
  if (!ok) return { ok: false, error: "Radnja više nije na čekanju." };
  await logPlatformAction(getDb(), { adminUserId: admin.id, shopId: input.data.shopId, action: "signup_rejected" });
  return { ok: true };
}

const setActiveInput = z.object({ shopId: z.uuid(), isActive: z.boolean() });

export async function setShopActiveAction(raw: z.input<typeof setActiveInput>): Promise<PlatformActionResult> {
  const input = setActiveInput.safeParse(raw);
  if (!input.success) return { ok: false, error: "Neispravan zahtev." };
  const admin = await requirePlatformAdmin();
  const ok = await setShopActive(getDb(), input.data.shopId, input.data.isActive);
  if (!ok) return { ok: false, error: "Radnja nije pronađena." };
  await logPlatformAction(getDb(), {
    adminUserId: admin.id,
    shopId: input.data.shopId,
    action: input.data.isActive ? "activated" : "suspended",
  });
  return { ok: true };
}

const changePlanInput = z.object({ shopId: z.uuid(), plan: z.enum(shopPlan.enumValues) });

export async function changeShopPlanAction(raw: z.input<typeof changePlanInput>): Promise<PlatformActionResult> {
  const input = changePlanInput.safeParse(raw);
  if (!input.success) return { ok: false, error: "Neispravan zahtev." };
  const admin = await requirePlatformAdmin();
  const ok = await changeShopPlan(getDb(), input.data.shopId, input.data.plan);
  if (!ok) return { ok: false, error: "Radnja nije pronađena." };
  await logPlatformAction(getDb(), {
    adminUserId: admin.id,
    shopId: input.data.shopId,
    action: "plan_changed",
    details: `plan → ${input.data.plan}`,
  });
  return { ok: true };
}

export type StartImpersonationResult = { ok: true; slug: string } | { ok: false; error: string };

/** Grants the platform admin a 1h "Uđi kao" session for this shop and sends them straight into its admin panel. */
export async function startImpersonationAction(raw: z.input<typeof shopIdInput>): Promise<StartImpersonationResult> {
  const input = shopIdInput.safeParse(raw);
  if (!input.success) return { ok: false, error: "Neispravan zahtev." };
  const admin = await requirePlatformAdmin();
  const db = getDb();
  const started = await startImpersonation(db, { adminUserId: admin.id, shopId: input.data.shopId });
  if (!started) return { ok: false, error: "Radnja nije odobrena, pa se ne može podržati." };

  (await cookies()).set(IMPERSONATION_COOKIE, started.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: started.expiresAt,
  });
  await logPlatformAction(db, { adminUserId: admin.id, shopId: input.data.shopId, action: "impersonation_started" });
  return { ok: true, slug: started.shopSlug };
}
