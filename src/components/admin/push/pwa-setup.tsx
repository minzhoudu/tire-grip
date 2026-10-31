"use client";

import { useEffect } from "react";
import { savePushSubscriptionAction } from "@/app/admin/[slug]/obavestenja/actions";
import { currentSubscription, pushSupport, registerServiceWorker, toJson } from "./push-client";

/**
 * Mounted once in the admin layout: registers the service worker, keeps the
 * home-screen icon's number in sync with pending requests, and re-sends this
 * device's push subscription so the server always has the current one (and
 * it follows whoever is signed in on this device).
 */
export function PwaSetup({ slug, pending, syncSubscription }: { slug: string; pending: number; syncSubscription: boolean }) {
  useEffect(() => {
    if (!pushSupport().supported) return;
    void (async () => {
      try {
        await registerServiceWorker();
        if (!syncSubscription || Notification.permission !== "granted") return;
        const sub = await currentSubscription();
        if (sub) await savePushSubscriptionAction({ slug, subscription: toJson(sub) });
      } catch {
        // Not fatal: the Obaveštenja page shows the real state and lets them retry.
      }
    })();
  }, [slug, syncSubscription]);

  useEffect(() => {
    const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
    if (!nav.setAppBadge) return;
    void (pending > 0 ? nav.setAppBadge(pending) : nav.clearAppBadge?.())?.catch(() => undefined);
  }, [pending]);

  return null;
}
