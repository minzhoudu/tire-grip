/**
 * Session + shop access checks for admin pages and actions.
 * Every admin page AND every admin server action calls requireShopAccess —
 * the shop comes from the URL, so membership must be verified each time.
 */
import { and, eq } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { getDb } from "../db/index.ts";
import { shopMembers, shops, type Shop } from "../db/schema.ts";
import { getAuth } from "./auth.ts";
import { getImpersonatedShop, IMPERSONATION_COOKIE } from "./platform.ts";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
}

/** Signed-in user for this request, or null. Cached per request. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return null;
  return { id: session.user.id, name: session.user.name, email: session.user.email };
});

export async function requireUser(next?: string): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect(next ? `/prijava?next=${encodeURIComponent(next)}` : "/prijava");
  return user;
}

export interface ShopAccess {
  user: SessionUser;
  shop: Shop;
  role: "owner" | "staff";
  /** True when access comes from a platform-admin "Uđi kao" session, not real shop membership. */
  isImpersonating: boolean;
}

/**
 * The signed-in user must be a member of the shop in the URL, OR have an
 * active impersonation session for it (platform admin, support) — 404
 * otherwise (don't reveal other shops).
 */
export const requireShopAccess = cache(async (slug: string): Promise<ShopAccess> => {
  const user = await requireUser(`/admin/${slug}`);
  const db = getDb();
  const [row] = await db
    .select({ shop: shops, role: shopMembers.role })
    .from(shopMembers)
    .innerJoin(shops, eq(shops.id, shopMembers.shopId))
    .where(and(eq(shopMembers.userId, user.id), eq(shops.slug, slug)))
    .limit(1);
  if (row) return { user, shop: row.shop, role: row.role, isImpersonating: false };

  const sessionId = (await cookies()).get(IMPERSONATION_COOKIE)?.value;
  if (sessionId) {
    const shop = await getImpersonatedShop(db, { sessionId, adminUserId: user.id, slug });
    if (shop) return { user, shop, role: "owner", isImpersonating: true };
  }
  notFound();
});

/** Like requireShopAccess, but only the owner may proceed (e.g. shop settings). */
export async function requireOwnerAccess(slug: string): Promise<ShopAccess> {
  const access = await requireShopAccess(slug);
  if (access.role !== "owner") notFound();
  return access;
}

/**
 * The platform owner(s), identified by email allowlist (PLATFORM_ADMIN_EMAILS,
 * comma-separated) rather than a DB flag — deploy-time config nobody can
 * escalate into through an app bug.
 */
function isPlatformAdminEmail(email: string): boolean {
  const list = (process.env.PLATFORM_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.toLowerCase());
}

/** The signed-in user must be a platform admin; 404 otherwise (don't reveal the dashboard exists). */
export async function requirePlatformAdmin(): Promise<SessionUser> {
  const user = await requireUser("/platforma");
  if (!isPlatformAdminEmail(user.email)) notFound();
  return user;
}
