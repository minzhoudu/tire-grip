/**
 * Seasonal tire-change reminders: owner creates a campaign, generates the
 * list of consenting customers with swap history, and sends a wa.me link to
 * each in batches of a set size (no messaging API — same trust model as the
 * "send confirmation" button on booking requests).
 *
 * One message per customer per campaign (not per vehicle): the reminder is
 * generic ("vreme je za zamenu guma"), the customer books whichever/however
 * many vehicles they want from the usual chat. `reminder_messages_campaign_customer_uq`
 * already enforces this.
 */
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { DB } from "../db/index.ts";
import { bookings, customers, reminderCampaigns, reminderMessages, services, shops } from "../db/schema.ts";
import { ACTIVE_STATUSES } from "./shops.ts";

export type Season = (typeof reminderCampaigns.$inferSelect)["season"];
export type CampaignStatus = (typeof reminderCampaigns.$inferSelect)["status"];

export interface CampaignWithCounts {
  id: string;
  name: string;
  season: Season;
  messageTemplate: string;
  dailyLimit: number | null;
  status: CampaignStatus;
  createdAt: Date;
  queued: number;
  sent: number;
  booked: number;
}

export async function listCampaigns(db: DB, shopId: string): Promise<CampaignWithCounts[]> {
  const [campaigns, counts] = await Promise.all([
    db.select().from(reminderCampaigns).where(eq(reminderCampaigns.shopId, shopId)).orderBy(asc(reminderCampaigns.createdAt)),
    db
      .select({ campaignId: reminderMessages.campaignId, status: reminderMessages.status, n: sql<number>`count(*)::int` })
      .from(reminderMessages)
      .where(eq(reminderMessages.shopId, shopId))
      .groupBy(reminderMessages.campaignId, reminderMessages.status),
  ]);

  return campaigns.map((c) => {
    const forCampaign = counts.filter((row) => row.campaignId === c.id);
    const countOf = (status: string) => forCampaign.find((row) => row.status === status)?.n ?? 0;
    return {
      id: c.id,
      name: c.name,
      season: c.season,
      messageTemplate: c.messageTemplate,
      dailyLimit: c.dailyLimit,
      status: c.status,
      createdAt: c.createdAt,
      queued: countOf("queued"),
      sent: countOf("sent") + countOf("clicked"), // "clicked" is still a sent message, just opened
      booked: countOf("booked"),
    };
  });
}

/** Deletes the campaign and its messages (cascade): links in already-sent reminders stop working. Bookings stay. */
export async function deleteCampaign(db: DB, shopId: string, campaignId: string): Promise<boolean> {
  const deleted = await db
    .delete(reminderCampaigns)
    .where(and(eq(reminderCampaigns.shopId, shopId), eq(reminderCampaigns.id, campaignId)))
    .returning({ id: reminderCampaigns.id });
  return deleted.length > 0;
}

export interface CampaignInput {
  name: string;
  season: Season;
  messageTemplate: string;
  dailyLimit: number | null;
}

export async function createCampaign(db: DB, shopId: string, input: CampaignInput): Promise<string> {
  const [row] = await db
    .insert(reminderCampaigns)
    .values({ shopId, name: input.name, season: input.season, messageTemplate: input.messageTemplate, dailyLimit: input.dailyLimit })
    .returning({ id: reminderCampaigns.id });
  return row!.id;
}

/** Customers worth reminding: consented, not opted out, with real (non-cancelled) seasonal-swap history. */
async function eligibleCustomerIds(db: DB, shopId: string): Promise<string[]> {
  const swapRows = await db
    .select({ customerId: bookings.customerId })
    .from(bookings)
    .innerJoin(services, and(eq(services.id, bookings.serviceId), eq(services.shopId, bookings.shopId)))
    .where(and(eq(bookings.shopId, shopId), eq(services.kind, "seasonal_swap"), inArray(bookings.status, ACTIVE_STATUSES)));
  // A Rezervacija radnje (no customer) has no one to remind.
  const withHistory = [...new Set(swapRows.flatMap((r) => (r.customerId ? [r.customerId] : [])))];
  if (withHistory.length === 0) return [];

  const rows = await db
    .select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.shopId, shopId), eq(customers.reminderConsent, true), isNull(customers.optedOutAt), inArray(customers.id, withHistory)));
  return rows.map((r) => r.id);
}

/** Count only — shown before "Generiši listu" so the owner knows what they're about to queue. */
export async function previewAudience(db: DB, shopId: string): Promise<number> {
  return (await eligibleCustomerIds(db, shopId)).length;
}

export type GenerateQueueResult = { ok: true; created: number } | { ok: false; reason: "not_found" };

/** Idempotent: re-running only adds customers who weren't already queued (unique constraint + onConflictDoNothing). */
export async function generateQueue(db: DB, shopId: string, campaignId: string): Promise<GenerateQueueResult> {
  const [campaign] = await db.select().from(reminderCampaigns).where(and(eq(reminderCampaigns.shopId, shopId), eq(reminderCampaigns.id, campaignId)));
  if (!campaign) return { ok: false, reason: "not_found" };

  const customerIds = await eligibleCustomerIds(db, shopId);
  if (customerIds.length === 0) return { ok: true, created: 0 };

  const created = await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(reminderMessages)
      .values(customerIds.map((customerId) => ({ shopId, campaignId, customerId, token: crypto.randomUUID() })))
      .onConflictDoNothing({ target: [reminderMessages.campaignId, reminderMessages.customerId] })
      .returning({ id: reminderMessages.id });
    if (campaign.status === "draft") {
      await tx.update(reminderCampaigns).set({ status: "active" }).where(eq(reminderCampaigns.id, campaignId));
    }
    return inserted.length;
  });
  return { ok: true, created };
}

export interface QueueItem {
  id: string;
  customerName: string;
  customerPhone: string;
  token: string;
}

/** The next batch still to send: at most `dailyLimit` (all if null), oldest first. Despite the column name it's a batch size, not a per-day cap. */
export async function listTodayQueue(db: DB, shopId: string, campaignId: string): Promise<QueueItem[]> {
  const [campaign] = await db.select().from(reminderCampaigns).where(and(eq(reminderCampaigns.shopId, shopId), eq(reminderCampaigns.id, campaignId)));
  if (!campaign) return [];

  const rows = await db
    .select({ id: reminderMessages.id, customerName: customers.name, customerPhone: customers.phone, token: reminderMessages.token })
    .from(reminderMessages)
    .innerJoin(customers, and(eq(customers.id, reminderMessages.customerId), eq(customers.shopId, reminderMessages.shopId)))
    .where(and(eq(reminderMessages.shopId, shopId), eq(reminderMessages.campaignId, campaignId), eq(reminderMessages.status, "queued")))
    .orderBy(asc(reminderMessages.createdAt))
    .limit(campaign.dailyLimit ?? 1000);
  return rows;
}

/** Conditional UPDATE (still queued) so a double tap can't double-count; flips the campaign to "done" once nothing is left. */
export async function markSent(db: DB, shopId: string, campaignId: string, messageId: string): Promise<boolean> {
  const updated = await db
    .update(reminderMessages)
    .set({ status: "sent", sentAt: new Date() })
    .where(and(eq(reminderMessages.shopId, shopId), eq(reminderMessages.id, messageId), eq(reminderMessages.status, "queued")))
    .returning({ id: reminderMessages.id });
  if (updated.length === 0) return false;

  const [remaining] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(reminderMessages)
    .where(and(eq(reminderMessages.campaignId, campaignId), eq(reminderMessages.status, "queued")));
  if ((remaining?.n ?? 0) === 0) {
    await db.update(reminderCampaigns).set({ status: "done" }).where(eq(reminderCampaigns.id, campaignId));
  }
  return true;
}

export interface ReminderLanding {
  shopSlug: string;
  shopName: string;
  customerName: string;
  status: string;
}

/** Public lookup by token — no shop/session check, same unguessable-token pattern as /otkazi/{bookingId}. */
export async function getReminderByToken(db: DB, token: string): Promise<ReminderLanding | null> {
  const [row] = await db
    .select({ shopSlug: shops.slug, shopName: shops.name, customerName: customers.name, status: reminderMessages.status })
    .from(reminderMessages)
    .innerJoin(shops, eq(shops.id, reminderMessages.shopId))
    .innerJoin(customers, and(eq(customers.id, reminderMessages.customerId), eq(customers.shopId, reminderMessages.shopId)))
    .where(eq(reminderMessages.token, token))
    .limit(1);
  return row ?? null;
}

/** Customer-initiated opt-out from the /r/{token} page. */
export async function optOutByToken(db: DB, token: string): Promise<boolean> {
  const [row] = await db.select({ shopId: reminderMessages.shopId, customerId: reminderMessages.customerId }).from(reminderMessages).where(eq(reminderMessages.token, token));
  if (!row) return false;
  await db.update(customers).set({ reminderConsent: false, optedOutAt: new Date() }).where(and(eq(customers.shopId, row.shopId), eq(customers.id, row.customerId)));
  return true;
}

/** Attributes a successful booking back to the reminder that prompted it. No-op if the token is unknown or already attributed. */
export async function linkBookingToReminder(db: DB, input: { shopId: string; token: string; bookingId: string }): Promise<void> {
  await db
    .update(reminderMessages)
    .set({ status: "booked", bookingId: input.bookingId })
    .where(and(eq(reminderMessages.shopId, input.shopId), eq(reminderMessages.token, input.token), sql`${reminderMessages.status} != 'booked'`));
}
