"use server";

/** Push devices and email preference of the signed-in member, for this shop only. */
import { headers } from "next/headers";
import { z } from "zod";
import { getDb } from "@/db";
import { isAllowedPushEndpoint } from "@/lib/notifications/endpoint";
import { absoluteAdminUrl, removePushSubscription, savePushSubscription, sendTestNotification, setEmailNotifications } from "@/server/notifications";
import { getOrigin } from "@/server/origin";
import { requireShopAccess } from "@/server/session";

const slugSchema = z.string().min(1).max(80);
const key = z.string().min(1).max(256).regex(/^[A-Za-z0-9_-]+={0,2}$/);
const endpointSchema = z.string().max(2048).refine(isAllowedPushEndpoint);

const subscribeInput = z.object({
  slug: slugSchema,
  subscription: z.object({ endpoint: endpointSchema, keys: z.object({ p256dh: key, auth: key }) }),
});

export type PushActionResult = { ok: true } | { ok: false; error: string };

/** Members only: a platform admin "Uđi kao" session must not start receiving the shop's notifications. */
async function memberAccess(slug: string) {
  const access = await requireShopAccess(slug);
  return access.isImpersonating ? null : access;
}

export async function savePushSubscriptionAction(raw: z.input<typeof subscribeInput>): Promise<PushActionResult> {
  const input = subscribeInput.safeParse(raw);
  if (!input.success) return { ok: false, error: "Ovaj uređaj nije podržan." };
  const access = await memberAccess(input.data.slug);
  if (!access) return { ok: false, error: "Nije dostupno u režimu podrške." };

  const { subscription } = input.data;
  await savePushSubscription(getDb(), {
    shopId: access.shop.id,
    userId: access.user.id,
    endpoint: subscription.endpoint,
    p256dh: subscription.keys.p256dh,
    auth: subscription.keys.auth,
    userAgent: (await headers()).get("user-agent")?.slice(0, 300) ?? null,
  });
  return { ok: true };
}

const unsubscribeInput = z.object({ slug: slugSchema, endpoint: z.string().max(2048) });

export async function removePushSubscriptionAction(raw: z.input<typeof unsubscribeInput>): Promise<PushActionResult> {
  const input = unsubscribeInput.safeParse(raw);
  if (!input.success) return { ok: false, error: "Neispravan zahtev." };
  const access = await memberAccess(input.data.slug);
  if (!access) return { ok: false, error: "Nije dostupno u režimu podrške." };
  await removePushSubscription(getDb(), { shopId: access.shop.id, userId: access.user.id, endpoint: input.data.endpoint });
  return { ok: true };
}

export async function sendTestNotificationAction(raw: { slug: string }): Promise<PushActionResult> {
  const slug = slugSchema.safeParse(raw.slug);
  if (!slug.success) return { ok: false, error: "Neispravan zahtev." };
  const access = await memberAccess(slug.data);
  if (!access) return { ok: false, error: "Nije dostupno u režimu podrške." };
  const url = `${absoluteAdminUrl(access.shop.slug, await getOrigin())}/obavestenja`;
  const sent = await sendTestNotification(getDb(), { shopId: access.shop.id, userId: access.user.id, url });
  return sent > 0 ? { ok: true } : { ok: false, error: "Obaveštenje nije poslato. Isključite pa ponovo uključite obaveštenja." };
}

const emailInput = z.object({ slug: slugSchema, enabled: z.boolean() });

export async function setEmailNotificationsAction(raw: z.input<typeof emailInput>): Promise<PushActionResult> {
  const input = emailInput.safeParse(raw);
  if (!input.success) return { ok: false, error: "Neispravan zahtev." };
  const access = await memberAccess(input.data.slug);
  if (!access) return { ok: false, error: "Nije dostupno u režimu podrške." };
  await setEmailNotifications(getDb(), access.shop.id, access.user.id, input.data.enabled);
  return { ok: true };
}
