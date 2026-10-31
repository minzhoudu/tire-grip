/**
 * Notifying a shop's members when a customer books or cancels on their own.
 *
 * Every current member gets a push on each device they turned it on for
 * (Obaveštenja page). A member with no device that took the push gets an
 * email instead, unless they switched email off — so nobody misses a request
 * because push isn't set up yet or the phone's subscription expired.
 *
 * Senders are injectable so tests run without a push service or Resend.
 */
import { and, eq } from "drizzle-orm";
import type { DB } from "../db/index.ts";
import { bookings, customers, pushSubscriptions, services, shopMembers, shops, users, vehicles } from "../db/schema.ts";
import { shopToday, utcToZoned } from "../lib/availability/index.ts";
import { formatMinutes } from "../lib/availability/zoned.ts";
import { shopNotification, shopNotificationEmail, type ShopEventDetails, type ShopEventKind } from "../lib/notifications/messages.ts";
import { countPending } from "./admin.ts";
import { sendEmail } from "./email.ts";
import { shopAdminUrl } from "./origin.ts";
import { sendWebPush, type PushPayload, type PushSender } from "./push.ts";

export interface ShopEvent {
  kind: ShopEventKind;
  bookingId: string;
}

export interface NotifyDeps {
  push?: PushSender;
  email?: (input: { to: string; subject: string; html: string }) => Promise<void>;
  /** Public origin (https://…), for links when the admin URL isn't absolute (dev, previews). */
  origin: string;
  now?: Date;
}

export interface NotifyReport {
  pushed: number;
  emailed: number;
  removed: number;
}

async function loadEvent(db: DB, event: ShopEvent, now: Date) {
  const [row] = await db
    .select({
      shopId: shops.id,
      shopSlug: shops.slug,
      shopName: shops.name,
      timezone: shops.timezone,
      status: bookings.status,
      startsAt: bookings.startsAt,
      priceRsd: bookings.priceRsd,
      customerName: customers.name,
      serviceName: services.name,
      serviceIcon: services.icon,
      vehicleLabel: vehicles.label,
    })
    .from(bookings)
    .innerJoin(shops, eq(shops.id, bookings.shopId))
    .innerJoin(services, and(eq(services.id, bookings.serviceId), eq(services.shopId, bookings.shopId)))
    .innerJoin(customers, and(eq(customers.id, bookings.customerId), eq(customers.shopId, bookings.shopId)))
    .leftJoin(vehicles, and(eq(vehicles.id, bookings.vehicleId), eq(vehicles.shopId, bookings.shopId)))
    .where(eq(bookings.id, event.bookingId))
    .limit(1);
  if (!row) return null;
  const local = utcToZoned(row.startsAt, row.timezone);
  const details: ShopEventDetails = {
    kind: event.kind,
    bookingId: event.bookingId,
    status: row.status,
    shopName: row.shopName,
    customerName: row.customerName,
    serviceName: row.serviceName,
    serviceIcon: row.serviceIcon,
    vehicleLabel: row.vehicleLabel,
    priceRsd: row.priceRsd,
    date: local.date,
    time: formatMinutes(local.minutes),
    today: shopToday({ timezone: row.timezone }, now),
  };
  return { details, shop: { id: row.shopId, slug: row.shopSlug, timezone: row.timezone } };
}

/** Absolute link to the shop's panel: its own subdomain in production, {origin}/admin/{slug} elsewhere. */
export function absoluteAdminUrl(slug: string, origin: string): string {
  const url = shopAdminUrl(slug);
  return url.startsWith("http") ? url : `${origin.replace(/\/$/, "")}${url}`;
}

export async function notifyShop(db: DB, event: ShopEvent, deps: NotifyDeps): Promise<NotifyReport> {
  const { push = sendWebPush, email = sendEmail, origin, now = new Date() } = deps;
  const report: NotifyReport = { pushed: 0, emailed: 0, removed: 0 };

  const loaded = await loadEvent(db, event, now);
  if (!loaded) return report;
  const { details, shop } = loaded;

  const adminUrl = absoluteAdminUrl(shop.slug, origin);
  // New booking → straight to its card (BookingCard has id="booking-{id}"); a cancellation → the list.
  const url = event.kind === "new_booking" ? `${adminUrl}#booking-${event.bookingId}` : adminUrl;
  const n = shopNotification(details);
  const payload: PushPayload = { title: n.title, body: n.body, tag: n.tag, url, badge: await countPending(db, shop, now) };

  const rows = await db
    .select({
      userId: shopMembers.userId,
      email: users.email,
      emailVerified: users.emailVerified,
      emailNotifications: shopMembers.emailNotifications,
      subId: pushSubscriptions.id,
      endpoint: pushSubscriptions.endpoint,
      p256dh: pushSubscriptions.p256dh,
      auth: pushSubscriptions.auth,
    })
    .from(shopMembers)
    .innerJoin(users, eq(users.id, shopMembers.userId))
    .leftJoin(pushSubscriptions, and(eq(pushSubscriptions.shopId, shopMembers.shopId), eq(pushSubscriptions.userId, shopMembers.userId)))
    .where(eq(shopMembers.shopId, shop.id));

  const members = new Map<string, { email: string; wantsEmail: boolean; delivered: boolean }>();
  for (const r of rows) {
    if (!members.has(r.userId)) members.set(r.userId, { email: r.email, wantsEmail: r.emailNotifications && r.emailVerified, delivered: false });
  }

  await Promise.all(
    rows.map(async (r) => {
      if (!r.subId || !r.endpoint || !r.p256dh || !r.auth) return;
      const result = await push({ endpoint: r.endpoint, p256dh: r.p256dh, auth: r.auth }, payload);
      if (result === "sent") {
        report.pushed++;
        members.get(r.userId)!.delivered = true;
        await db.update(pushSubscriptions).set({ lastSuccessAt: now }).where(eq(pushSubscriptions.id, r.subId));
      } else if (result === "gone") {
        report.removed++;
        await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, r.subId));
      }
    }),
  );

  const mail = shopNotificationEmail(details, url);
  await Promise.all(
    [...members.values()]
      .filter((m) => !m.delivered && m.wantsEmail)
      .map(async (m) => {
        try {
          await email({ to: m.email, subject: mail.subject, html: mail.html });
          report.emailed++;
        } catch (err) {
          console.error("[notify] email nije poslat", err);
        }
      }),
  );
  return report;
}

/* ------------------------------------------------------------------ devices & settings (Obaveštenja page) */

export interface SubscriptionInput {
  shopId: string;
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string | null;
}

/** Same device subscribing again (or after another member signed in on it) just takes the row over. */
export async function savePushSubscription(db: DB, s: SubscriptionInput): Promise<void> {
  const values = { userId: s.userId, p256dh: s.p256dh, auth: s.auth, userAgent: s.userAgent ?? null };
  await db
    .insert(pushSubscriptions)
    .values({ shopId: s.shopId, endpoint: s.endpoint, ...values })
    .onConflictDoUpdate({ target: [pushSubscriptions.shopId, pushSubscriptions.endpoint], set: values });
}

export async function removePushSubscription(db: DB, s: { shopId: string; userId: string; endpoint: string }): Promise<void> {
  await db
    .delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.shopId, s.shopId), eq(pushSubscriptions.userId, s.userId), eq(pushSubscriptions.endpoint, s.endpoint)));
}

export async function getNotificationSettings(db: DB, shopId: string, userId: string): Promise<{ emailNotifications: boolean; deviceCount: number }> {
  const [member] = await db
    .select({ emailNotifications: shopMembers.emailNotifications })
    .from(shopMembers)
    .where(and(eq(shopMembers.shopId, shopId), eq(shopMembers.userId, userId)))
    .limit(1);
  const devices = await db
    .select({ id: pushSubscriptions.id })
    .from(pushSubscriptions)
    .where(and(eq(pushSubscriptions.shopId, shopId), eq(pushSubscriptions.userId, userId)));
  return { emailNotifications: member?.emailNotifications ?? true, deviceCount: devices.length };
}

export async function setEmailNotifications(db: DB, shopId: string, userId: string, enabled: boolean): Promise<void> {
  await db
    .update(shopMembers)
    .set({ emailNotifications: enabled })
    .where(and(eq(shopMembers.shopId, shopId), eq(shopMembers.userId, userId)));
}

/** "Pošalji probno": to every device of this member for this shop. Returns how many took it. */
export async function sendTestNotification(
  db: DB,
  { shopId, userId, url }: { shopId: string; userId: string; url: string },
  push: PushSender = sendWebPush,
): Promise<number> {
  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(and(eq(pushSubscriptions.shopId, shopId), eq(pushSubscriptions.userId, userId)));
  const payload: PushPayload = { title: "🔔 Obaveštenja rade", body: "Ovako će izgledati obaveštenje o novom zahtevu.", url, tag: "test" };
  let sent = 0;
  await Promise.all(
    subs.map(async (s) => {
      const result = await push(s, payload);
      if (result === "sent") sent++;
      if (result === "gone") await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, s.id));
    }),
  );
  return sent;
}
