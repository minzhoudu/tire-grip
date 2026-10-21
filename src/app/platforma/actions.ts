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
import { isLiveProduction, PROD_ROOT_DOMAIN } from "@/lib/subdomain";
import { MIN_PASSWORD_LENGTH } from "@/server/auth";
import { shopAdminUrl } from "@/server/origin";
import {
  approveShop,
  assignOwner,
  changeShopPlan,
  deleteShop,
  deleteUser,
  IMPERSONATION_COOKIE,
  logPlatformAction,
  rejectShop,
  resetUserPassword,
  setShopActive,
  startImpersonation,
} from "@/server/platform";
import { requirePlatformAdmin } from "@/server/session";

const shopIdInput = z.object({ shopId: z.uuid() });

export type PlatformActionResult = { ok: true } | { ok: false; error: string };

/** Approves a pending signup, or un-rejects a previously rejected one. */
export async function approveShopAction(raw: z.input<typeof shopIdInput>): Promise<PlatformActionResult> {
  const input = shopIdInput.safeParse(raw);
  if (!input.success) return { ok: false, error: "Neispravan zahtev." };
  const admin = await requirePlatformAdmin();
  const ok = await approveShop(getDb(), input.data.shopId);
  if (!ok) return { ok: false, error: "Radnja je već odobrena." };
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

export type StartImpersonationResult = { ok: true; slug: string; adminUrl: string } | { ok: false; error: string };

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
    // "Enter as" now lands on the shop's own subdomain — the cookie must travel with it.
    ...(isLiveProduction() ? { domain: PROD_ROOT_DOMAIN } : {}),
  });
  await logPlatformAction(db, { adminUserId: admin.id, shopId: input.data.shopId, action: "impersonation_started" });
  return { ok: true, slug: started.shopSlug, adminUrl: shopAdminUrl(started.shopSlug) };
}

const resetPasswordInput = z.object({ userId: z.string().min(1), newPassword: z.string().min(MIN_PASSWORD_LENGTH) });

/** Support tooling: set a new password for an owner/staff account that forgot theirs. */
export async function resetUserPasswordAction(raw: z.input<typeof resetPasswordInput>): Promise<PlatformActionResult> {
  const input = resetPasswordInput.safeParse(raw);
  if (!input.success) return { ok: false, error: `Lozinka mora imati bar ${MIN_PASSWORD_LENGTH} karaktera.` };
  const admin = await requirePlatformAdmin();
  const ok = await resetUserPassword(getDb(), input.data.userId, input.data.newPassword);
  if (!ok) return { ok: false, error: "Nalog nije pronađen." };
  await logPlatformAction(getDb(), { adminUserId: admin.id, action: "password_reset", details: `userId=${input.data.userId}` });
  return { ok: true };
}

const userIdInput = z.object({ userId: z.string().min(1) });

/** Permanently deletes an account — sessions, credentials and shop memberships cascade. */
export async function deleteUserAction(raw: z.input<typeof userIdInput>): Promise<PlatformActionResult> {
  const input = userIdInput.safeParse(raw);
  if (!input.success) return { ok: false, error: "Neispravan zahtev." };
  const admin = await requirePlatformAdmin();
  if (input.data.userId === admin.id) return { ok: false, error: "Ne možete obrisati sopstveni nalog." };
  const deleted = await deleteUser(getDb(), input.data.userId);
  if (!deleted) return { ok: false, error: "Nalog nije pronađen." };
  await logPlatformAction(getDb(), { adminUserId: admin.id, action: "user_deleted", details: `${deleted.name} (${deleted.email})` });
  return { ok: true };
}

/** Permanently deletes a shop and everything scoped to it (bookings, customers, services, members, …). */
export async function deleteShopAction(raw: z.input<typeof shopIdInput>): Promise<PlatformActionResult> {
  const input = shopIdInput.safeParse(raw);
  if (!input.success) return { ok: false, error: "Neispravan zahtev." };
  const admin = await requirePlatformAdmin();
  const deleted = await deleteShop(getDb(), input.data.shopId);
  if (!deleted) return { ok: false, error: "Radnja nije pronađena." };
  // shopId is gone now — the audit row just records what it was.
  await logPlatformAction(getDb(), { adminUserId: admin.id, action: "shop_deleted", details: `${deleted.name} (/${deleted.slug})` });
  return { ok: true };
}

const assignOwnerInput = z.object({ shopId: z.uuid(), email: z.email() });

export type AssignOwnerActionResult = { ok: true; userName: string } | { ok: false; error: string };

/** Makes an existing account the owner of a shop — for reconnecting an account after its shop was deleted, or handing a shop to someone else. */
export async function assignOwnerAction(raw: z.input<typeof assignOwnerInput>): Promise<AssignOwnerActionResult> {
  const input = assignOwnerInput.safeParse(raw);
  if (!input.success) return { ok: false, error: "Unesite ispravan email." };
  const admin = await requirePlatformAdmin();
  const result = await assignOwner(getDb(), input.data);
  if (!result.ok) return { ok: false, error: result.reason === "shop_not_found" ? "Radnja nije pronađena." : "Nalog sa tim emailom ne postoji." };
  await logPlatformAction(getDb(), { adminUserId: admin.id, shopId: input.data.shopId, action: "owner_assigned", details: input.data.email });
  return { ok: true, userName: result.userName };
}
