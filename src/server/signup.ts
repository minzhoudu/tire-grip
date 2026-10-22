/**
 * Public self-signup (/registracija): creates the shop AND its owner account
 * together. Unlike `createShopUser` (CLI, existing shop required), both rows
 * are new here — the shop starts `signupStatus: 'pending', isActive: false`
 * until the platform owner approves it from /platforma.
 */
import { and, eq } from "drizzle-orm";
import type { DB } from "../db/index.ts";
import { shopMembers, shops, users } from "../db/schema.ts";
import { MIN_PASSWORD_LENGTH, type Auth } from "./auth.ts";

export interface RegisterShopInput {
  shopName: string;
  slug: string;
  city: string;
  ownerName: string;
  email: string;
  password: string;
  /** Already normalized to E.164 */
  phone: string;
}

export type RegisterShopResult =
  | { ok: true; slug: string }
  | { ok: false; reason: "slug_taken" | "email_taken" | "weak_password" };

export async function isSlugAvailable(db: DB, slug: string): Promise<boolean> {
  const [row] = await db.select({ id: shops.id }).from(shops).where(eq(shops.slug, slug)).limit(1);
  return !row;
}

export async function registerShop(db: DB, auth: Auth, input: RegisterShopInput): Promise<RegisterShopResult> {
  const email = input.email.trim().toLowerCase();
  if (input.password.length < MIN_PASSWORD_LENGTH) return { ok: false, reason: "weak_password" };

  const [existingUser] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existingUser) return { ok: false, reason: "email_taken" };
  if (!(await isSlugAvailable(db, input.slug))) return { ok: false, reason: "slug_taken" };

  const ctx = await auth.$context;
  const hash = await ctx.password.hash(input.password);
  const user = await ctx.internalAdapter.createUser({ email, name: input.ownerName.trim() || email, emailVerified: false }, { method: "email-password" });
  if (!user) throw new Error("Better Auth did not create the user");
  await ctx.internalAdapter.linkAccount({ userId: user.id, providerId: "credential", accountId: user.id, password: hash });
  await auth.api.sendVerificationEmail({ body: { email, callbackURL: "/admin" } });

  try {
    const [shop] = await db
      .insert(shops)
      .values({
        slug: input.slug,
        name: input.shopName.trim(),
        city: input.city.trim() || null,
        phone: input.phone,
        signupStatus: "pending",
        isActive: false,
      })
      .returning({ id: shops.id, slug: shops.slug });
    await db.insert(shopMembers).values({ shopId: shop!.id, userId: user.id, role: "owner" });
    return { ok: true, slug: shop!.slug };
  } catch {
    // Lost a race on the slug's unique index — the pre-check passed a moment too early.
    return { ok: false, reason: "slug_taken" };
  }
}

export interface AddShopInput {
  userId: string;
  shopName: string;
  slug: string;
  city: string;
  /** Already normalized to E.164 */
  phone: string;
}

export type AddShopResult = { ok: true; slug: string } | { ok: false; reason: "slug_taken" | "too_many_pending" };

/**
 * Self-service (/admin/nova-radnja): an already signed-in account adds another shop, still
 * pending approval like any new signup. One pending request at a time per account, so the
 * review queue can't be spammed.
 */
export async function addShop(db: DB, input: AddShopInput): Promise<AddShopResult> {
  if (!(await isSlugAvailable(db, input.slug))) return { ok: false, reason: "slug_taken" };

  const [existingPending] = await db
    .select({ id: shopMembers.id })
    .from(shopMembers)
    .innerJoin(shops, eq(shops.id, shopMembers.shopId))
    .where(and(eq(shopMembers.userId, input.userId), eq(shops.signupStatus, "pending")))
    .limit(1);
  if (existingPending) return { ok: false, reason: "too_many_pending" };

  try {
    const [shop] = await db
      .insert(shops)
      .values({
        slug: input.slug,
        name: input.shopName.trim(),
        city: input.city.trim() || null,
        phone: input.phone,
        signupStatus: "pending",
        isActive: false,
      })
      .returning({ id: shops.id, slug: shops.slug });
    await db.insert(shopMembers).values({ shopId: shop!.id, userId: input.userId, role: "owner" });
    return { ok: true, slug: shop!.slug };
  } catch {
    return { ok: false, reason: "slug_taken" };
  }
}
