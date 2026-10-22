/**
 * Integration tests for public self-signup (/registracija): registerShop
 * creates a pending shop + owner account together, and listUserShops
 * reflects that status so /admin can show the right message.
 */
import "dotenv/config";
import { isAPIError } from "better-auth/api";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, getDb } from "../src/db/index.ts";
import { shopMembers, shops, users } from "../src/db/schema.ts";
import { listUserShops } from "../src/server/accounts.ts";
import { getAuth } from "../src/server/auth.ts";
import { addShop, isSlugAvailable, registerShop } from "../src/server/signup.ts";

if (process.env.CI && !process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for integration tests in CI");
if (process.env.CI && !process.env.BETTER_AUTH_SECRET) throw new Error("BETTER_AUTH_SECRET is required for integration tests in CI");

const run = Date.now().toString(36);
const slug = `it-signup-${run}`;
const email = `vlasnik-signup-${run}@example.rs`;
const password = "dovoljno-duga-lozinka";
const createdSlugs: string[] = [];

const input = (over: Partial<Parameters<typeof registerShop>[2]> = {}) => ({
  shopName: "IT Signup Radnja",
  slug,
  city: "Kragujevac",
  ownerName: "Nova Vlasnica",
  email,
  password,
  phone: "+381641234567",
  ...over,
});

describe.skipIf(!process.env.DATABASE_URL || !process.env.BETTER_AUTH_SECRET)("public signup (Postgres)", () => {
  afterAll(async () => {
    const db = getDb();
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
    if (user) {
      await db.delete(shopMembers).where(eq(shopMembers.userId, user.id));
      await db.delete(users).where(eq(users.id, user.id));
    }
    for (const s of createdSlugs) {
      await db.delete(shops).where(eq(shops.slug, s));
    }
    await closeDb();
  });

  it("creates a pending, inactive shop with its owner, unverified until the email link is clicked", async () => {
    const db = getDb();
    const auth = getAuth();
    const result = await registerShop(db, auth, input());
    expect(result).toEqual({ ok: true, slug });
    createdSlugs.push(slug);

    const [shop] = await db.select().from(shops).where(eq(shops.slug, slug));
    expect(shop).toMatchObject({ signupStatus: "pending", isActive: false, name: "IT Signup Radnja", city: "Kragujevac", phone: "+381641234567" });

    const [user] = await db.select({ id: users.id, emailVerified: users.emailVerified }).from(users).where(eq(users.email, email));
    expect(user?.emailVerified).toBe(false);

    // Can't sign in until the verification link is clicked.
    const blocked = await auth.api.signInEmail({ body: { email, password } }).catch((e: unknown) => e);
    expect(isAPIError(blocked)).toBe(true);

    // Simulates clicking the link (Better Auth flips emailVerified itself; we only assert the gate lifts).
    await db.update(users).set({ emailVerified: true }).where(eq(users.id, user!.id));
    const signedIn = await auth.api.signInEmail({ body: { email, password } });
    expect(signedIn.user.email).toBe(email);

    const userShops = await listUserShops(db, user!.id);
    expect(userShops).toEqual([{ slug, name: "IT Signup Radnja", role: "owner", isActive: false, signupStatus: "pending" }]);
  });

  it("refuses a slug that's already taken", async () => {
    const db = getDb();
    const auth = getAuth();
    const result = await registerShop(db, auth, input({ email: `other-${run}@example.rs` }));
    expect(result).toEqual({ ok: false, reason: "slug_taken" });
  });

  it("refuses an email that's already registered", async () => {
    const db = getDb();
    const auth = getAuth();
    const otherSlug = `${slug}-2`;
    const result = await registerShop(db, auth, input({ slug: otherSlug }));
    expect(result).toEqual({ ok: false, reason: "email_taken" });
  });

  it("refuses a weak password before touching the database", async () => {
    const db = getDb();
    const auth = getAuth();
    const otherSlug = `${slug}-3`;
    const result = await registerShop(db, auth, input({ slug: otherSlug, email: `weak-${run}@example.rs`, password: "kratka" }));
    expect(result).toEqual({ ok: false, reason: "weak_password" });
    expect(await isSlugAvailable(db, otherSlug)).toBe(true); // nothing was written
  });

  describe("addShop (an existing account adds another shop)", () => {
    const ownerId = `it-addshop-owner-${run}`;
    const firstSlug = `it-addshop-first-${run}`;
    const secondSlug = `it-addshop-second-${run}`;

    beforeAll(async () => {
      await getDb()
        .insert(users)
        .values({ id: ownerId, email: `addshop-owner-${run}@example.rs`, name: "Vlasnik Više Radnji", emailVerified: true });
    });

    afterAll(async () => {
      const db = getDb();
      await db.delete(shopMembers).where(eq(shopMembers.userId, ownerId));
      await db.delete(shops).where(inArray(shops.slug, [firstSlug, secondSlug]));
      await db.delete(users).where(eq(users.id, ownerId));
    });

    it("creates a second pending shop owned by the same account", async () => {
      const db = getDb();
      const result = await addShop(db, { userId: ownerId, shopName: "Druga Radnja", slug: firstSlug, city: "Niš", phone: "+381641234567" });
      expect(result).toEqual({ ok: true, slug: firstSlug });

      const [shop] = await db.select().from(shops).where(eq(shops.slug, firstSlug));
      expect(shop).toMatchObject({ signupStatus: "pending", isActive: false, name: "Druga Radnja" });
      const [member] = await db.select().from(shopMembers).where(and(eq(shopMembers.shopId, shop!.id), eq(shopMembers.userId, ownerId)));
      expect(member).toMatchObject({ role: "owner" });
    });

    it("refuses a slug that's already taken", async () => {
      const result = await addShop(getDb(), { userId: ownerId, shopName: "X", slug: firstSlug, city: "", phone: "+381641234567" });
      expect(result).toEqual({ ok: false, reason: "slug_taken" });
    });

    it("refuses a second request while one is still pending", async () => {
      const db = getDb();
      const result = await addShop(db, { userId: ownerId, shopName: "Treća Radnja", slug: secondSlug, city: "", phone: "+381641234567" });
      expect(result).toEqual({ ok: false, reason: "too_many_pending" });
      expect(await isSlugAvailable(db, secondSlug)).toBe(true); // nothing was written
    });

    it("allows a new request once the pending one is resolved", async () => {
      const db = getDb();
      await db.update(shops).set({ signupStatus: "approved", isActive: true }).where(eq(shops.slug, firstSlug));
      const result = await addShop(db, { userId: ownerId, shopName: "Treća Radnja", slug: secondSlug, city: "", phone: "+381641234567" });
      expect(result).toEqual({ ok: true, slug: secondSlug });
    });
  });
});
