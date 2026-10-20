/**
 * Creating shop accounts outside the HTTP sign-up flow (which is disabled).
 * Uses Better Auth's own password hashing and adapter, the same calls its
 * sign-up endpoint makes, so the account signs in normally afterwards.
 */
import { and, eq } from "drizzle-orm";
import type { DB } from "../db/index.ts";
import { shopMembers, shops, users } from "../db/schema.ts";
import { MIN_PASSWORD_LENGTH, type Auth } from "./auth.ts";

export interface CreateShopUserInput {
  email: string;
  password: string;
  name: string;
  shopSlug: string;
  role?: "owner" | "staff";
}

export type CreateShopUserResult =
  | { ok: true; userId: string; created: boolean }
  | { ok: false; reason: "shop_not_found" | "weak_password" | "invalid_email" };

/**
 * Creates the user if the email is new (an existing user keeps their
 * password) and makes them a member of the shop. Idempotent.
 */
export async function createShopUser(db: DB, auth: Auth, input: CreateShopUserInput): Promise<CreateShopUserResult> {
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, reason: "invalid_email" };

  const [shop] = await db.select({ id: shops.id }).from(shops).where(eq(shops.slug, input.shopSlug)).limit(1);
  if (!shop) return { ok: false, reason: "shop_not_found" };

  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  let userId = existing?.id;
  const created = !userId;

  if (!userId) {
    if (input.password.length < MIN_PASSWORD_LENGTH) return { ok: false, reason: "weak_password" };
    const ctx = await auth.$context;
    const hash = await ctx.password.hash(input.password);
    const user = await ctx.internalAdapter.createUser(
      { email, name: input.name.trim() || email, emailVerified: true },
      { method: "email-password" },
    );
    if (!user) throw new Error("Better Auth did not create the user");
    await ctx.internalAdapter.linkAccount({ userId: user.id, providerId: "credential", accountId: user.id, password: hash });
    userId = user.id;
  }

  await db
    .insert(shopMembers)
    .values({ shopId: shop.id, userId, role: input.role ?? "owner" })
    .onConflictDoNothing({ target: [shopMembers.shopId, shopMembers.userId] });

  return { ok: true, userId, created };
}

/** Shops the user can manage, by name. */
export async function listUserShops(db: DB, userId: string) {
  return db
    .select({ slug: shops.slug, name: shops.name, role: shopMembers.role })
    .from(shopMembers)
    .innerJoin(shops, eq(shops.id, shopMembers.shopId))
    .where(and(eq(shopMembers.userId, userId), eq(shops.isActive, true)))
    .orderBy(shops.name);
}
