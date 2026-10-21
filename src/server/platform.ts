/**
 * Data access for the platform owner's dashboard (/platforma): every shop on
 * the platform, approving/rejecting new signups, suspending shops and
 * changing their plan. Every mutation is logged to platform_audit_log —
 * never silent, since these actions touch other businesses' access.
 */
import { hashPassword } from "better-auth/crypto";
import { and, desc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import type { DB } from "../db/index.ts";
import { accounts, bookings, platformAuditLog, platformImpersonationSessions, shopMembers, shops, users, type Shop } from "../db/schema.ts";

/** Cookie that carries the active impersonation session's id. Shared by the action that sets it and the session check that reads it. */
export const IMPERSONATION_COOKIE = "impersonation_session";
const IMPERSONATION_TTL_MS = 60 * 60 * 1000; // 1h

export interface PlatformShopRow {
  id: string;
  slug: string;
  name: string;
  city: string | null;
  phone: string | null;
  plan: Shop["plan"];
  isActive: boolean;
  signupStatus: Shop["signupStatus"];
  createdAt: Date;
  ownerName: string | null;
  ownerEmail: string | null;
  bookingCount: number;
}

export async function listAllShops(db: DB): Promise<PlatformShopRow[]> {
  const [shopRows, ownerRows, countRows] = await Promise.all([
    db.select().from(shops).orderBy(desc(shops.createdAt)),
    db
      .select({ shopId: shopMembers.shopId, name: users.name, email: users.email })
      .from(shopMembers)
      .innerJoin(users, eq(users.id, shopMembers.userId))
      .where(eq(shopMembers.role, "owner")),
    db.select({ shopId: bookings.shopId, n: sql<number>`count(*)::int` }).from(bookings).groupBy(bookings.shopId),
  ]);
  const ownerByShop = new Map(ownerRows.map((o) => [o.shopId, o]));
  const countByShop = new Map(countRows.map((c) => [c.shopId, c.n]));

  return shopRows.map((s) => {
    const owner = ownerByShop.get(s.id);
    return {
      id: s.id,
      slug: s.slug,
      name: s.name,
      city: s.city,
      phone: s.phone,
      plan: s.plan,
      isActive: s.isActive,
      signupStatus: s.signupStatus,
      createdAt: s.createdAt,
      ownerName: owner?.name ?? null,
      ownerEmail: owner?.email ?? null,
      bookingCount: countByShop.get(s.id) ?? 0,
    };
  });
}

export interface PlatformUserRow {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
  shops: { slug: string; shopName: string; role: "owner" | "staff" }[];
}

/** Every account on the platform, with the shop(s) it belongs to — for the platform admin's support tooling. */
export async function listAllUsers(db: DB): Promise<PlatformUserRow[]> {
  const [userRows, memberRows] = await Promise.all([
    db.select({ id: users.id, name: users.name, email: users.email, createdAt: users.createdAt }).from(users).orderBy(desc(users.createdAt)),
    db
      .select({ userId: shopMembers.userId, role: shopMembers.role, slug: shops.slug, shopName: shops.name })
      .from(shopMembers)
      .innerJoin(shops, eq(shops.id, shopMembers.shopId)),
  ]);
  const shopsByUser = new Map<string, PlatformUserRow["shops"]>();
  for (const m of memberRows) {
    const list = shopsByUser.get(m.userId) ?? [];
    list.push({ slug: m.slug, shopName: m.shopName, role: m.role });
    shopsByUser.set(m.userId, list);
  }
  return userRows.map((u) => ({ ...u, shops: shopsByUser.get(u.id) ?? [] }));
}

/** Resets the email+password credential for support ("forgot my password"). False if the account has none (shouldn't happen — every account here was created with one). */
export async function resetUserPassword(db: DB, userId: string, newPassword: string): Promise<boolean> {
  const hash = await hashPassword(newPassword);
  const rows = await db
    .update(accounts)
    .set({ password: hash })
    .where(and(eq(accounts.userId, userId), eq(accounts.providerId, "credential")))
    .returning({ id: accounts.id });
  return rows.length > 0;
}

/**
 * Deletes an account entirely — sessions, credentials and shop memberships cascade. Any shop
 * left without an owner can get a new one via assignOwner(). Returns the deleted account's
 * name/email for the audit log, since the id is gone once this returns.
 */
export async function deleteUser(db: DB, userId: string): Promise<{ name: string; email: string } | null> {
  const rows = await db.delete(users).where(eq(users.id, userId)).returning({ name: users.name, email: users.email });
  return rows[0] ?? null;
}

export async function logPlatformAction(
  db: DB,
  input: { adminUserId: string; shopId?: string | null; action: string; details?: string | null },
): Promise<void> {
  await db.insert(platformAuditLog).values({
    adminUserId: input.adminUserId,
    shopId: input.shopId ?? null,
    action: input.action,
    details: input.details ?? null,
  });
}

/** Approves a pending signup, or un-rejects a previously rejected one — no-op once already approved. */
export async function approveShop(db: DB, shopId: string): Promise<boolean> {
  const rows = await db
    .update(shops)
    .set({ signupStatus: "approved", isActive: true })
    .where(and(eq(shops.id, shopId), inArray(shops.signupStatus, ["pending", "rejected"])))
    .returning({ id: shops.id });
  return rows.length > 0;
}

export async function rejectShop(db: DB, shopId: string): Promise<boolean> {
  const rows = await db
    .update(shops)
    .set({ signupStatus: "rejected" })
    .where(and(eq(shops.id, shopId), eq(shops.signupStatus, "pending")))
    .returning({ id: shops.id });
  return rows.length > 0;
}

/** Suspend/reactivate an already-approved shop (signupStatus is untouched, unlike approve/reject). */
export async function setShopActive(db: DB, shopId: string, isActive: boolean): Promise<boolean> {
  const rows = await db.update(shops).set({ isActive }).where(eq(shops.id, shopId)).returning({ id: shops.id });
  return rows.length > 0;
}

export async function changeShopPlan(db: DB, shopId: string, plan: Shop["plan"]): Promise<boolean> {
  const rows = await db.update(shops).set({ plan }).where(eq(shops.id, shopId)).returning({ id: shops.id });
  return rows.length > 0;
}

/**
 * Deletes a shop and everything scoped to it (bookings, customers, services, members, …) —
 * every shop_id foreign key cascades. Returns the deleted shop's name/slug for the audit log,
 * since the id is gone once this returns and platform_audit_log.shop_id only accepts a live id.
 */
export async function deleteShop(db: DB, shopId: string): Promise<{ name: string; slug: string } | null> {
  const rows = await db.delete(shops).where(eq(shops.id, shopId)).returning({ name: shops.name, slug: shops.slug });
  return rows[0] ?? null;
}

export type AssignOwnerResult = { ok: true; userName: string } | { ok: false; reason: "shop_not_found" | "user_not_found" };

/**
 * Makes an existing account the owner of a shop (adds the membership, or upgrades it to
 * owner if already staff) — for reconnecting an account after its shop was deleted, or
 * handing a shop to a different owner.
 */
export async function assignOwner(db: DB, input: { shopId: string; email: string }): Promise<AssignOwnerResult> {
  const email = input.email.trim().toLowerCase();
  const [shop] = await db.select({ id: shops.id }).from(shops).where(eq(shops.id, input.shopId)).limit(1);
  if (!shop) return { ok: false, reason: "shop_not_found" };
  const [user] = await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.email, email)).limit(1);
  if (!user) return { ok: false, reason: "user_not_found" };

  await db
    .insert(shopMembers)
    .values({ shopId: shop.id, userId: user.id, role: "owner" })
    .onConflictDoUpdate({ target: [shopMembers.shopId, shopMembers.userId], set: { role: "owner" } });
  return { ok: true, userName: user.name };
}

/* ----------------------------------------------------------------- impersonation ("Uđi kao") */

export interface StartedImpersonation {
  id: string;
  shopSlug: string;
  expiresAt: Date;
}

/** Only an approved shop can be impersonated — a pending signup has no admin panel to support yet. */
export async function startImpersonation(db: DB, input: { adminUserId: string; shopId: string }): Promise<StartedImpersonation | null> {
  const [shop] = await db.select({ slug: shops.slug }).from(shops).where(and(eq(shops.id, input.shopId), eq(shops.signupStatus, "approved")));
  if (!shop) return null;
  const expiresAt = new Date(Date.now() + IMPERSONATION_TTL_MS);
  const [row] = await db
    .insert(platformImpersonationSessions)
    .values({ adminUserId: input.adminUserId, shopId: input.shopId, expiresAt })
    .returning({ id: platformImpersonationSessions.id });
  return { id: row!.id, shopSlug: shop.slug, expiresAt };
}

/** The shop an impersonation session grants access to, or null if it doesn't exist / expired / already ended / owner mismatch / slug mismatch. */
export async function getImpersonatedShop(db: DB, input: { sessionId: string; adminUserId: string; slug: string }): Promise<Shop | null> {
  const [row] = await db
    .select({ shop: shops })
    .from(platformImpersonationSessions)
    .innerJoin(shops, eq(shops.id, platformImpersonationSessions.shopId))
    .where(
      and(
        eq(platformImpersonationSessions.id, input.sessionId),
        eq(platformImpersonationSessions.adminUserId, input.adminUserId),
        eq(shops.slug, input.slug),
        isNull(platformImpersonationSessions.endedAt),
        gt(platformImpersonationSessions.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return row?.shop ?? null;
}

/** Ends a session early (idempotent); no-ops if it doesn't belong to this admin or is already over. */
export async function endImpersonation(db: DB, sessionId: string, adminUserId: string): Promise<{ shopId: string } | null> {
  const [row] = await db
    .update(platformImpersonationSessions)
    .set({ endedAt: new Date() })
    .where(
      and(
        eq(platformImpersonationSessions.id, sessionId),
        eq(platformImpersonationSessions.adminUserId, adminUserId),
        isNull(platformImpersonationSessions.endedAt),
      ),
    )
    .returning({ shopId: platformImpersonationSessions.shopId });
  return row ?? null;
}
