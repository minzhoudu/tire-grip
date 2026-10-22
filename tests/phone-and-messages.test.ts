import { describe, expect, it } from "vitest";
import { openStatusText } from "../src/lib/availability/labels.ts";
import { confirmationMessage, dayBeforeReminderMessage } from "../src/lib/booking/messages.ts";
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
