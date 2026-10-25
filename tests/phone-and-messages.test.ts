import { describe, expect, it } from "vitest";
import { openStatusText } from "../src/lib/availability/labels.ts";
import { confirmationMessage, dayBeforeReminderMessage } from "../src/lib/booking/messages.ts";
import { directionsUrls, googleMapsUrl } from "../src/lib/maps-links.ts";
import { formatPhone, normalizePhone, whatsappLink } from "../src/lib/phone.ts";

describe("normalizePhone", () => {
  it.each([
    ["064 123 4567", "+381641234567"],
    ["064/123-45-67", "+381641234567"],
    ["0641234567", "+381641234567"],
    ["+381 64 1234567", "+381641234567"],
    ["00381641234567", "+381641234567"],
    ["381641234567", "+381641234567"],
    ["060 123 456", "+38160123456"],
    ["011 123 4567", "+381111234567"],
    ["+387 65 123 456", "+38765123456"],
  ])("%s → %s", (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it.each(["", "abc", "064", "123", "0641234567890", "+381 0641234567", "06x xxx xxxx"])("rejects %j", (input) => {
    expect(normalizePhone(input)).toBeNull();
  });
});

describe("formatPhone / whatsappLink", () => {
  it("shows Serbian numbers the national way", () => {
    expect(formatPhone("+381641234567")).toBe("064 123 4567");
    expect(formatPhone("+38765123456")).toBe("+38765123456");
  });

  it("builds a wa.me link with an encoded message", () => {
    expect(whatsappLink("+381641234567", "Zdravo, termin 8:30?")).toBe(
      "https://wa.me/381641234567?text=Zdravo%2C%20termin%208%3A30%3F",
    );
  });

  it("builds a plain wa.me link with no prefilled text when none is given", () => {
    expect(whatsappLink("+381641234567")).toBe("https://wa.me/381641234567");
  });
});

describe("confirmationMessage", () => {
  const base = {
    shopName: "Vulkanizer Brzi Točak",
    serviceName: "Zamena guma",
    dayLabel: "petak 23.10.",
    time: "08:30",
    priceRsd: 1500,
    bookingUrl: "https://tiregrip.rs/brzi-tocak",
  };

  it("points to 'javite nam' when there's no cancel link", () => {
    expect(confirmationMessage(base)).toContain("Ako ne možete da dođete, javite nam. Vidimo se!");
  });

  it("includes the self-service cancel link when given one", () => {
    const text = confirmationMessage({ ...base, cancelUrl: "https://tiregrip.rs/otkazi/abc-123" });
    expect(text).toContain("Ako ne možete da dođete, otkažite ovde: https://tiregrip.rs/otkazi/abc-123");
    expect(text).not.toContain("javite nam");
  });

  it("adds the map link only when the shop has a pin", () => {
    expect(confirmationMessage(base)).not.toContain("Mapa:");
    const text = confirmationMessage({ ...base, mapUrl: "https://www.google.com/maps/search/?api=1&query=45.233032,19.817513" });
    expect(text).toContain("Mapa: https://www.google.com/maps/search/?api=1&query=45.233032,19.817513");
  });
});

describe("dayBeforeReminderMessage", () => {
  it("says it's for tomorrow, with time, address and the cancel link", () => {
    const text = dayBeforeReminderMessage({
      shopName: "Vulkanizer Brzi Točak",
      serviceName: "Zamena guma",
      dayLabel: "petak 23.10.",
      time: "08:30",
      priceRsd: 1500,
      address: "Bulevar 1, Novi Sad",
      bookingUrl: "https://brzi-tocak.mojvulkanizer.com/",
      cancelUrl: "https://mojvulkanizer.com/otkazi/abc-123",
    });
    expect(text).toContain("podsetnik za sutra");
    expect(text).toContain("Zamena guma, petak 23.10. u 08:30h.");
    expect(text).toContain("Adresa: Bulevar 1, Novi Sad");
    expect(text).toContain("otkažite ovde: https://mojvulkanizer.com/otkazi/abc-123");
  });
});

describe("openStatusText", () => {
  const today = "2026-10-19";
  it.each([
    [{ open: true as const, closesAt: "17:00" }, "Radimo do 17h"],
    [{ open: true as const, closesAt: "16:30" }, "Radimo do 16:30h"],
    [{ open: false as const, nextOpen: { date: "2026-10-19", opensAt: "08:00" } }, "Zatvoreno · otvaramo danas u 08:00"],
    [{ open: false as const, nextOpen: { date: "2026-10-20", opensAt: "08:00" } }, "Zatvoreno · otvaramo sutra u 08:00"],
    [{ open: false as const, nextOpen: { date: "2026-10-22", opensAt: "09:00" } }, "Zatvoreno · otvaramo čet 22.10. u 09:00"],
    [{ open: false as const, nextOpen: null }, "Trenutno ne radimo"],
  ])("%j", (status, expected) => {
    expect(openStatusText(status, today)).toBe(expected);
  });
});

describe("map links", () => {
  const shop = { name: "Brzi Točak", address: "Bolmanska 20", city: "Novi Sad", latitude: 45.2330320436, longitude: 19.8175134183 };

  it("points at the exact pin when the shop has one", () => {
    expect(googleMapsUrl(shop)).toBe("https://www.google.com/maps/search/?api=1&query=45.233032,19.817513");
    expect(directionsUrls(shop)).toEqual({
      google: "https://www.google.com/maps/dir/?api=1&destination=45.233032,19.817513",
      waze: "https://waze.com/ul?ll=45.233032,19.817513&navigate=yes",
    });
  });

  it("falls back to a search by name and address, and has no directions without a pin", () => {
    const noPin = { ...shop, latitude: null, longitude: null };
    expect(googleMapsUrl(noPin)).toBe("https://www.google.com/maps/search/?api=1&query=Brzi%20To%C4%8Dak%2C%20Bolmanska%2020%2C%20Novi%20Sad");
    expect(directionsUrls(noPin)).toBeNull();
    expect(googleMapsUrl({ ...noPin, address: null })).toBeNull();
  });
});
