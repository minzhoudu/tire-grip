import { describe, expect, it } from "vitest";
import { isAllowedPushEndpoint } from "../src/lib/notifications/endpoint.ts";
import { shopNotification, shopNotificationEmail, type ShopEventDetails } from "../src/lib/notifications/messages.ts";

const base: ShopEventDetails = {
  kind: "new_booking",
  bookingId: "b1",
  status: "pending",
  shopName: "Brzi Točak",
  customerName: "Marko",
  serviceName: "Zamena guma",
  serviceIcon: "🛞",
  vehicleLabel: "Golf 7",
  priceRsd: 2500,
  date: "2026-11-02",
  time: "10:30",
  today: "2026-11-01",
};

describe("shopNotification", () => {
  it("new request waiting for the shop", () => {
    expect(shopNotification(base)).toEqual({
      title: "🛞 Novi zahtev: Marko",
      body: "🛞 Zamena guma, Sutra u 10:30h · Golf 7. Čeka vašu potvrdu.",
      tag: "booking-b1",
    });
  });

  it("auto-confirmed booking says so", () => {
    const n = shopNotification({ ...base, status: "confirmed" });
    expect(n.title).toBe("✅ Nova rezervacija: Marko");
    expect(n.body).toContain("Automatski potvrđeno.");
  });

  it("customer cancellation, without vehicle or icon", () => {
    const n = shopNotification({ ...base, kind: "customer_cancelled", status: "cancelled", vehicleLabel: null, serviceIcon: null, date: "2026-11-01" });
    expect(n).toEqual({ title: "❌ Otkazan termin: Marko", body: "Zamena guma, Danas u 10:30h. Termin je ponovo slobodan.", tag: "booking-b1" });
  });

  it("uses the same tag for one booking, so a cancel replaces its request notification", () => {
    expect(shopNotification(base).tag).toBe(shopNotification({ ...base, kind: "customer_cancelled" }).tag);
  });

  it("email escapes customer-entered text", () => {
    const mail = shopNotificationEmail({ ...base, customerName: "<b>Ana</b>" }, "https://x.mojvulkanizer.com/admin");
    expect(mail.subject).toBe("🛞 Novi zahtev: <b>Ana</b> | Moj Vulkanizer");
    expect(mail.html).toContain("&lt;b&gt;Ana&lt;/b&gt;");
    expect(mail.html).not.toContain("<b>Ana</b>");
    expect(mail.html).toContain("2.500 din");
    expect(mail.html).toContain('href="https://x.mojvulkanizer.com/admin"');
  });
});

describe("isAllowedPushEndpoint", () => {
  it.each([
    "https://fcm.googleapis.com/fcm/send/abc:123",
    "https://web.push.apple.com/QGx",
    "https://updates.push.services.mozilla.com/wpush/v2/gAAA",
    "https://wns2-par02p.notify.windows.com/w/?token=x",
  ])("accepts %s", (url) => expect(isAllowedPushEndpoint(url)).toBe(true));

  it.each([
    "http://fcm.googleapis.com/fcm/send/abc",
    "https://fcm.googleapis.com:8443/x",
    "https://localhost/x",
    "https://169.254.169.254/latest/meta-data",
    "https://evilpush.apple.com.attacker.rs/x",
    "https://user:pass@fcm.googleapis.com/x",
    "not a url",
  ])("rejects %s", (url) => expect(isAllowedPushEndpoint(url)).toBe(false));
});
