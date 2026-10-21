/**
 * Integration tests for the platform owner's dashboard data layer:
 * listing shops, approving/rejecting signups, suspending, changing plan,
 * and the audit log every mutation writes to.
 */
import "dotenv/config";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, getDb } from "../src/db/index.ts";
import { accounts, platformAuditLog, platformImpersonationSessions, shopMembers, shops, users } from "../src/db/schema.ts";
import {
  approveShop,
  assignOwner,
  changeShopPlan,
  deleteShop,
  deleteUser,
  endImpersonation,
  getImpersonatedShop,
  listAllShops,
  listAllUsers,
  logPlatformAction,
  rejectShop,
  resetUserPassword,
  setShopActive,
  startImpersonation,
} from "../src/server/platform.ts";

if (process.env.CI && !process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for integration tests in CI");

const run = Date.now().toString(36);
const pendingSlug = `it-platform-pending-${run}`;
const approvedSlug = `it-platform-approved-${run}`;
const adminUserId = `it-admin-${run}`;
const platformAdminUserId = `it-platform-admin-${run}`;
let pendingShopId = "";
let approvedShopId = "";

describe.skipIf(!process.env.DATABASE_URL)("platform dashboard (Postgres)", () => {
  beforeAll(async () => {
    const db = getDb();
    const [pendingShop] = await db
      .insert(shops)
      .values({ slug: pendingSlug, name: "IT Platforma Pending", signupStatus: "pending", isActive: false })
      .returning();
    pendingShopId = pendingShop!.id;

    const [approvedShop] = await db
      .insert(shops)
      .values({ slug: approvedSlug, name: "IT Platforma Approved", signupStatus: "approved", isActive: true, plan: "trial" })
      .returning();
    approvedShopId = approvedShop!.id;

    await db.insert(users).values({ id: adminUserId, email: `platform-owner-${run}@example.rs`, name: "Vlasnik radnje", emailVerified: true });
    await db.insert(shopMembers).values({ shopId: approvedShopId, userId: adminUserId, role: "owner" });
    await db.insert(users).values({ id: platformAdminUserId, email: `platform-admin-${run}@example.rs`, name: "Vlasnik platforme", emailVerified: true });
  });

  afterAll(async () => {
    const db = getDb();
    await db.delete(platformImpersonationSessions).where(eq(platformImpersonationSessions.adminUserId, platformAdminUserId));
    await db.delete(platformAuditLog).where(eq(platformAuditLog.adminUserId, adminUserId));
    await db.delete(shopMembers).where(eq(shopMembers.userId, adminUserId));
    for (const id of [pendingShopId, approvedShopId].filter(Boolean)) {
      await db.delete(shops).where(eq(shops.id, id));
    }
    await db.delete(users).where(eq(users.id, adminUserId));
    await db.delete(users).where(eq(users.id, platformAdminUserId));
    await closeDb();
  });

  it("lists shops with owner info and booking counts", async () => {
    const db = getDb();
    const rows = await listAllShops(db);
    const pending = rows.find((r) => r.id === pendingShopId);
    const approved = rows.find((r) => r.id === approvedShopId);
    expect(pending).toMatchObject({ signupStatus: "pending", isActive: false, bookingCount: 0, ownerName: null });
    expect(approved).toMatchObject({ signupStatus: "approved", isActive: true, bookingCount: 0, ownerName: "Vlasnik radnje" });
  });

  it("lists users with the shop(s) and role they belong to", async () => {
    const db = getDb();
    const rows = await listAllUsers(db);
    const owner = rows.find((r) => r.id === adminUserId);
    const platformAdmin = rows.find((r) => r.id === platformAdminUserId);
    expect(owner?.shops).toEqual([{ slug: approvedSlug, shopName: "IT Platforma Approved", role: "owner" }]);
    expect(platformAdmin?.shops).toEqual([]);
  });

  it("resets a user's password credential", async () => {
    const db = getDb();
    const oldHash = await hashPassword("stara-lozinka-123");
    await db.insert(accounts).values({ id: `it-account-${run}`, accountId: adminUserId, providerId: "credential", userId: adminUserId, password: oldHash });

    expect(await resetUserPassword(db, adminUserId, "nova-lozinka-456")).toBe(true);
    const [row] = await db.select({ password: accounts.password }).from(accounts).where(eq(accounts.userId, adminUserId));
    expect(await verifyPassword({ hash: row!.password!, password: "nova-lozinka-456" })).toBe(true);
    expect(await verifyPassword({ hash: row!.password!, password: "stara-lozinka-123" })).toBe(false);

    // no credential account for this user → nothing to update
    expect(await resetUserPassword(db, platformAdminUserId, "nova-lozinka-456")).toBe(false);

    await db.delete(accounts).where(eq(accounts.userId, adminUserId));
  });

  it("approves a pending shop, and a second approve attempt is a no-op", async () => {
    const db = getDb();
    expect(await approveShop(db, pendingShopId)).toBe(true);
    const [row] = await db.select().from(shops).where(eq(shops.id, pendingShopId));
    expect(row).toMatchObject({ signupStatus: "approved", isActive: true });

    // already approved: the conditional update matches nothing
    expect(await approveShop(db, pendingShopId)).toBe(false);
    expect(await rejectShop(db, pendingShopId)).toBe(false);
  });

  it("rejecting a pending shop leaves it inactive and marks it rejected", async () => {
    const db = getDb();
    const [shop] = await db.insert(shops).values({ slug: `${pendingSlug}-2`, name: "Za odbijanje", signupStatus: "pending", isActive: false }).returning();
    expect(await rejectShop(db, shop!.id)).toBe(true);
    const [row] = await db.select().from(shops).where(eq(shops.id, shop!.id));
    expect(row).toMatchObject({ signupStatus: "rejected", isActive: false });
    await db.delete(shops).where(eq(shops.id, shop!.id));
  });

  it("re-approving a rejected shop makes it active again, but approving an already-approved shop is a no-op", async () => {
    const db = getDb();
    const [shop] = await db.insert(shops).values({ slug: `${pendingSlug}-4`, name: "Za ponovno odobrenje", signupStatus: "rejected", isActive: false }).returning();
    expect(await approveShop(db, shop!.id)).toBe(true);
    const [row] = await db.select().from(shops).where(eq(shops.id, shop!.id));
    expect(row).toMatchObject({ signupStatus: "approved", isActive: true });

    expect(await approveShop(db, shop!.id)).toBe(false); // already approved
    await db.delete(shops).where(eq(shops.id, shop!.id));
  });

  it("deletes a shop and cascades to its bookings and memberships, leaving other shops untouched", async () => {
    const db = getDb();
    const [shop] = await db.insert(shops).values({ slug: `${pendingSlug}-5`, name: "Za brisanje", signupStatus: "approved", isActive: true }).returning();
    const deleteUserId = `it-delete-owner-${run}`;
    await db.insert(users).values({ id: deleteUserId, email: `delete-owner-${run}@example.rs`, name: "Brisani Vlasnik", emailVerified: true });
    await db.insert(shopMembers).values({ shopId: shop!.id, userId: deleteUserId, role: "owner" });

    const deleted = await deleteShop(db, shop!.id);
    expect(deleted).toMatchObject({ name: "Za brisanje", slug: `${pendingSlug}-5` });

    expect(await db.select().from(shops).where(eq(shops.id, shop!.id))).toHaveLength(0);
    expect(await db.select().from(shopMembers).where(eq(shopMembers.shopId, shop!.id))).toHaveLength(0);
    // the other test shop is unaffected
    expect(await db.select().from(shops).where(eq(shops.id, approvedShopId))).toHaveLength(1);

    expect(await deleteShop(db, shop!.id)).toBeNull(); // already gone
    await db.delete(users).where(eq(users.id, deleteUserId));
  });

  it("deletes a user and cascades to their shop membership, leaving the shop itself untouched", async () => {
    const db = getDb();
    const id = `it-delete-user-${run}`;
    await db.insert(users).values({ id, email: `delete-user-${run}@example.rs`, name: "Za brisanje", emailVerified: true });
    await db.insert(shopMembers).values({ shopId: approvedShopId, userId: id, role: "staff" });

    const deleted = await deleteUser(db, id);
    expect(deleted).toMatchObject({ name: "Za brisanje", email: `delete-user-${run}@example.rs` });

    expect(await db.select().from(users).where(eq(users.id, id))).toHaveLength(0);
    expect(await db.select().from(shopMembers).where(eq(shopMembers.userId, id))).toHaveLength(0);
    // the shop itself is unaffected
    expect(await db.select().from(shops).where(eq(shops.id, approvedShopId))).toHaveLength(1);

    expect(await deleteUser(db, id)).toBeNull(); // already gone
  });

  describe("assignOwner", () => {
    it("adds the membership for an account with none yet", async () => {
      const db = getDb();
      const newOwnerId = `it-new-owner-${run}`;
      const email = `new-owner-${run}@example.rs`;
      await db.insert(users).values({ id: newOwnerId, email, name: "Novi Vlasnik", emailVerified: true });

      const result = await assignOwner(db, { shopId: approvedShopId, email: email.toUpperCase() }); // case-insensitive
      expect(result).toMatchObject({ ok: true, userName: "Novi Vlasnik" });
      const [row] = await db.select().from(shopMembers).where(and(eq(shopMembers.shopId, approvedShopId), eq(shopMembers.userId, newOwnerId)));
      expect(row).toMatchObject({ role: "owner" });

      await db.delete(shopMembers).where(eq(shopMembers.userId, newOwnerId));
      await db.delete(users).where(eq(users.id, newOwnerId));
    });

    it("upgrades an existing staff membership to owner instead of duplicating it", async () => {
      const db = getDb();
      const staffId = `it-staff-${run}`;
      const email = `staff-${run}@example.rs`;
      await db.insert(users).values({ id: staffId, email, name: "Osoblje", emailVerified: true });
      await db.insert(shopMembers).values({ shopId: approvedShopId, userId: staffId, role: "staff" });

      expect(await assignOwner(db, { shopId: approvedShopId, email })).toMatchObject({ ok: true });
      const rows = await db.select().from(shopMembers).where(and(eq(shopMembers.shopId, approvedShopId), eq(shopMembers.userId, staffId)));
      expect(rows).toHaveLength(1); // upgraded in place, not duplicated
      expect(rows[0]).toMatchObject({ role: "owner" });

      await db.delete(shopMembers).where(eq(shopMembers.userId, staffId));
      await db.delete(users).where(eq(users.id, staffId));
    });

    it("fails closed for an unknown shop or email", async () => {
      const db = getDb();
      expect(await assignOwner(db, { shopId: "00000000-0000-0000-0000-000000000000", email: "nobody@example.rs" })).toEqual({
        ok: false,
        reason: "shop_not_found",
      });
      expect(await assignOwner(db, { shopId: approvedShopId, email: "nobody@example.rs" })).toEqual({ ok: false, reason: "user_not_found" });
    });
  });

  it("suspends and reactivates an approved shop without touching signupStatus", async () => {
    const db = getDb();
    expect(await setShopActive(db, approvedShopId, false)).toBe(true);
    let [row] = await db.select().from(shops).where(eq(shops.id, approvedShopId));
    expect(row).toMatchObject({ isActive: false, signupStatus: "approved" });

    expect(await setShopActive(db, approvedShopId, true)).toBe(true);
    [row] = await db.select().from(shops).where(eq(shops.id, approvedShopId));
    expect(row).toMatchObject({ isActive: true, signupStatus: "approved" });
  });

  it("changes a shop's plan", async () => {
    const db = getDb();
    expect(await changeShopPlan(db, approvedShopId, "pro")).toBe(true);
    const [row] = await db.select().from(shops).where(eq(shops.id, approvedShopId));
    expect(row!.plan).toBe("pro");
  });

  it("logs every action to the audit log", async () => {
    const db = getDb();
    await logPlatformAction(db, { adminUserId, shopId: approvedShopId, action: "plan_changed", details: "plan → pro" });
    const rows = await db.select().from(platformAuditLog).where(eq(platformAuditLog.adminUserId, adminUserId));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ shopId: approvedShopId, action: "plan_changed", details: "plan → pro" });
  });

  describe("impersonation (\"Uđi kao\")", () => {
    it("refuses to start a session for a shop that isn't approved", async () => {
      const db = getDb();
      const [pending] = await db.insert(shops).values({ slug: `${pendingSlug}-3`, name: "Nije odobrena", signupStatus: "pending", isActive: false }).returning();
      expect(await startImpersonation(db, { adminUserId: platformAdminUserId, shopId: pending!.id })).toBeNull();
      await db.delete(shops).where(eq(shops.id, pending!.id));
    });

    it("grants access to the right admin, shop and slug only", async () => {
      const db = getDb();
      const started = await startImpersonation(db, { adminUserId: platformAdminUserId, shopId: approvedShopId });
      expect(started?.shopSlug).toBe(approvedSlug);
      expect(started!.expiresAt.getTime()).toBeGreaterThan(Date.now());

      const granted = await getImpersonatedShop(db, { sessionId: started!.id, adminUserId: platformAdminUserId, slug: approvedSlug });
      expect(granted?.id).toBe(approvedShopId);

      // wrong slug, wrong admin, or a made-up session id all fail closed
      expect(await getImpersonatedShop(db, { sessionId: started!.id, adminUserId: platformAdminUserId, slug: pendingSlug })).toBeNull();
      expect(await getImpersonatedShop(db, { sessionId: started!.id, adminUserId, slug: approvedSlug })).toBeNull();
      expect(await getImpersonatedShop(db, { sessionId: "00000000-0000-0000-0000-000000000000", adminUserId: platformAdminUserId, slug: approvedSlug })).toBeNull();

      expect(await endImpersonation(db, started!.id, platformAdminUserId)).toMatchObject({ shopId: approvedShopId });
    });

    it("an ended session stops granting access immediately, and ending twice is a no-op", async () => {
      const db = getDb();
      const started = await startImpersonation(db, { adminUserId: platformAdminUserId, shopId: approvedShopId });
      expect(await endImpersonation(db, started!.id, platformAdminUserId)).not.toBeNull();
      expect(await getImpersonatedShop(db, { sessionId: started!.id, adminUserId: platformAdminUserId, slug: approvedSlug })).toBeNull();
      expect(await endImpersonation(db, started!.id, platformAdminUserId)).toBeNull();
    });

    it("an expired session stops granting access even if never explicitly ended", async () => {
      const db = getDb();
      const [row] = await db
        .insert(platformImpersonationSessions)
        .values({ adminUserId: platformAdminUserId, shopId: approvedShopId, expiresAt: new Date(Date.now() - 1000) })
        .returning({ id: platformImpersonationSessions.id });
      expect(await getImpersonatedShop(db, { sessionId: row!.id, adminUserId: platformAdminUserId, slug: approvedSlug })).toBeNull();
    });

    it("someone else can't end another admin's session", async () => {
      const db = getDb();
      const started = await startImpersonation(db, { adminUserId: platformAdminUserId, shopId: approvedShopId });
      expect(await endImpersonation(db, started!.id, adminUserId)).toBeNull(); // wrong admin
      expect(await getImpersonatedShop(db, { sessionId: started!.id, adminUserId: platformAdminUserId, slug: approvedSlug })).not.toBeNull();
      await endImpersonation(db, started!.id, platformAdminUserId); // cleanup
    });
  });
});
