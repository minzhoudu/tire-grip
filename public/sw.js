/*
 * Service worker for the shop's admin panel as a home-screen app.
 * Only shows push notifications and opens the panel on tap — no offline
 * caching, so the panel always shows live data.
 *
 * iOS revokes push permission from an app that receives a push without
 * showing a notification, so every "push" event shows one, even if the
 * payload is unreadable.
 */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Moj Vulkanizer";
  const options = {
    body: data.body || "Imate novo obaveštenje.",
    tag: data.tag || undefined,
    renotify: Boolean(data.tag),
    icon: "/icons/icon-192.png",
    badge: "/icons/badge-96.png",
    data: { url: data.url || "/admin" },
  };
  const jobs = [self.registration.showNotification(title, options)];
  if (typeof data.badge === "number" && "setAppBadge" in self.navigator) {
    jobs.push(data.badge > 0 ? self.navigator.setAppBadge(data.badge) : self.navigator.clearAppBadge());
  }
  event.waitUntil(Promise.all(jobs).catch(() => undefined));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/admin", self.location.origin);
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      // Reuse an open panel window on the same origin instead of opening another one.
      const existing = windows.find((w) => new URL(w.url).origin === target.origin);
      if (existing) {
        await existing.focus();
        if ("navigate" in existing) return existing.navigate(target.href);
        return undefined;
      }
      return self.clients.openWindow(target.href);
    })(),
  );
});
