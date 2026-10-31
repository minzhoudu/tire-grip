/** Browser-side Web Push helpers shared by the admin panel's push components. */

export interface PushSupport {
  /** Service worker + Push API + Notification API all present. */
  supported: boolean;
  /** iPhone/iPad (iPadOS reports itself as a Mac, hence the touch check). */
  ios: boolean;
  /** Opened from the home screen, not a browser tab. iOS only allows push there. */
  standalone: boolean;
}

export function pushSupport(): PushSupport {
  const nav = navigator as Navigator & { standalone?: boolean };
  const ios = /iPad|iPhone|iPod/.test(nav.userAgent) || (nav.platform === "MacIntel" && nav.maxTouchPoints > 1);
  const standalone = window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
  const supported = "serviceWorker" in nav && "PushManager" in window && "Notification" in window;
  return { supported, ios, standalone };
}

export function registerServiceWorker(): Promise<ServiceWorkerRegistration> {
  return navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!("serviceWorker" in navigator)) return null;
  const reg = await navigator.serviceWorker.getRegistration("/");
  return (await reg?.pushManager.getSubscription()) ?? null;
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export interface SubscriptionJson {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export function toJson(sub: PushSubscription): SubscriptionJson {
  const json = sub.toJSON();
  return { endpoint: sub.endpoint, keys: { p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "" } };
}

/**
 * Asks for permission and subscribes this device. Must be called straight from a tap:
 * iOS only shows the permission prompt in response to a user gesture.
 */
export async function subscribeThisDevice(vapidPublicKey: string): Promise<PushSubscription | "denied"> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return "denied";
  await registerServiceWorker();
  const reg = await navigator.serviceWorker.ready;
  const options = { userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) };
  try {
    return await withTimeout(reg.pushManager.subscribe(options));
  } catch (err) {
    // Subscribed earlier with a different server key (keys were rotated): start over.
    const old = await reg.pushManager.getSubscription();
    if (!old) throw err;
    await old.unsubscribe();
    return withTimeout(reg.pushManager.subscribe(options));
  }
}

/** subscribe() talks to the push service (Apple/Google) and can hang on a bad connection: give up instead of spinning forever. */
function withTimeout<T>(promise: Promise<T>, ms = 20_000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("push subscribe timed out")), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}
