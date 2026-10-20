/**
 * Session + shop access checks for admin pages and actions.
 * Every admin page AND every admin server action calls requireShopAccess —
 * the shop comes from the URL, so membership must be verified each time.
 */
import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { getDb } from "../db/index.ts";
import { shopMembers, shops, type Shop } from "../db/schema.ts";
import { getAuth } from "./auth.ts";

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
}

/** The signed-in user must be a member of the shop in the URL; 404 otherwise (don't reveal other shops). */
export const requireShopAccess = cache(async (slug: string): Promise<ShopAccess> => {
  const user = await requireUser(`/admin/${slug}`);
  const [row] = await getDb()
    .select({ shop: shops, role: shopMembers.role })
    .from(shopMembers)
    .innerJoin(shops, eq(shops.id, shopMembers.shopId))
    .where(and(eq(shopMembers.userId, user.id), eq(shops.slug, slug)))
    .limit(1);
  if (!row) notFound();
  return { user, shop: row.shop, role: row.role };
});
