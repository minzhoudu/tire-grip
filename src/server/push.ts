/**
 * Web Push (VAPID) — works for home-screen apps on iPhone (iOS 16.4+), and in
 * Chrome/Firefox/Edge on Android and desktop. No Firebase or Apple account:
 * the browser hands us a push-service URL and we POST an encrypted payload.
 *
 * Keys come from env (generate once with `pnpm dlx web-push generate-vapid-keys`).
 * Without them push is simply off: the UI says so and members get email instead.
 */
import webpush from "web-push";

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** What public/sw.js reads in its "push" handler. */
export interface PushPayload {
  title: string;
  body: string;
  /** Opened on tap */
  url: string;
  tag: string;
  /** Number on the home-screen icon (pending requests); omitted = leave as is. */
  badge?: number;
}

/** "gone" = the device unsubscribed or the app was removed (404/410) — delete the row. */
export type PushResult = "sent" | "gone" | "failed";
export type PushSender = (target: PushTarget, payload: PushPayload) => Promise<PushResult>;

export function vapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY || null;
}

function vapidDetails() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return null;
  return { subject: process.env.VAPID_SUBJECT || "https://mojvulkanizer.com", publicKey, privateKey };
}

export const sendWebPush: PushSender = async (target, payload) => {
  const vapid = vapidDetails();
  if (!vapid) {
    console.warn("[push] VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY nisu podešeni, preskačem push.");
    return "failed";
  }
  try {
    await webpush.sendNotification({ endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } }, JSON.stringify(payload), {
      vapidDetails: vapid,
      TTL: 60 * 60 * 24, // a request is still worth knowing about the next morning
      urgency: "high", // deliver right away, also to a phone in power-saving mode
      timeout: 10_000,
    });
    return "sent";
  } catch (err) {
    if (err instanceof webpush.WebPushError && (err.statusCode === 404 || err.statusCode === 410)) return "gone";
    console.error("[push] slanje nije uspelo", err);
    return "failed";
  }
};
