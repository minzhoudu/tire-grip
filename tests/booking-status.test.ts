import { describe, expect, it } from "vitest";
import { cancellationMessage, confirmationMessage, rejectionMessage } from "../src/lib/booking/messages.ts";
import { ACTIONS, FINAL_STATUSES, allowedActions, notifiesCustomer, type BookingStatus } from "../src/lib/booking/status.ts";
import { safeNextPath } from "../src/lib/safe-next.ts";

const slot = new Date("2026-10-23T08:00:00Z");
const before = new Date("2026-10-23T07:00:00Z");
const after = new Date("2026-10-23T08:05:00Z");

describe("allowedActions", () => {
  it("a new request can be confirmed or rejected, before or after its time", () => {
    expect(allowedActions("pending", slot, before)).toEqual(["confirm", "reject"]);
    expect(allowedActions("pending", slot, after)).toEqual(["confirm", "reject"]);
  });

  it("a confirmed booking can be cancelled only before it starts, marked no-show only after", () => {
    expect(allowedActions("confirmed", slot, before)).toEqual(["complete", "cancel"]);
    expect(allowedActions("confirmed", slot, after)).toEqual(["complete", "noShow"]);
  });

  it("final statuses allow nothing", () => {
    for (const s of FINAL_STATUSES) expect(allowedActions(s, slot, after)).toEqual([]);
  });

  it("every offered action is consistent with its from-statuses", () => {
    const all: BookingStatus[] = ["pending", "confirmed", ...FINAL_STATUSES];
    for (const status of all) {
      for (const now of [before, after]) {
        for (const action of allowedActions(status, slot, now)) {
          expect(ACTIONS[action].from).toContain(status);
        }
      }
    }
  });

  it("only confirm/reject/cancel produce a message to the customer", () => {
    expect(notifiesCustomer("confirm")).toBe(true);
    expect(notifiesCustomer("reject")).toBe(true);
    expect(notifiesCustomer("cancel")).toBe(true);
    expect(notifiesCustomer("complete")).toBe(false);
    expect(notifiesCustomer("noShow")).toBe(false);
  });
});

describe("customer messages", () => {
  const m = {
    shopName: "Vulkanizer Brzi Točak",
    serviceName: "Zamena guma",
    dayLabel: "petak 23.10.",
    time: "10:00",
    priceRsd: 1500,
    address: "Primer adresa 12, Inđija",
    bookingUrl: "https://app.example.rs/brzi-tocak",
  };

  it("confirmation has the time, price and address", () => {
    expect(confirmationMessage(m).split("\n")).toEqual([
      "✅ Vulkanizer Brzi Točak: potvrđen termin",
      "Zamena guma, petak 23.10. u 10:00h.",
      "Cena: 1.500 din.",
      "Adresa: Primer adresa 12, Inđija",
      "Ako ne možete da dođete, javite nam. Vidimo se!",
    ]);
    expect(confirmationMessage({ ...m, address: null })).not.toContain("Adresa");
  });

  it("rejection and cancellation link back to the booking page", () => {
    expect(rejectionMessage(m)).toContain("https://app.example.rs/brzi-tocak");
    expect(rejectionMessage(m)).toContain("petak 23.10. u 10:00h");
    expect(cancellationMessage(m)).toContain("https://app.example.rs/brzi-tocak");
  });
});

describe("safeNextPath", () => {
  it.each([
    [undefined, "/admin"],
    ["/admin/brzi-tocak", "/admin/brzi-tocak"],
    ["/admin/brzi-tocak?view=history", "/admin/brzi-tocak?view=history"],
    ["/platforma", "/platforma"],
    ["https://evil.example", "/admin"],
    ["//evil.example/admin", "/admin"],
    ["/brzi-tocak", "/admin"],
    ["/admin\\..\\x", "/admin"],
    ["/platforma\\..\\x", "/admin"],
  ])("%s → %s", (next, expected) => {
    expect(safeNextPath(next, "/admin")).toBe(expected);
  });

  it("falls back to the given default when next is empty or unsafe", () => {
    expect(safeNextPath(undefined, "/platforma")).toBe("/platforma");
    expect(safeNextPath("https://evil.example", "/platforma")).toBe("/platforma");
    expect(safeNextPath("/platforma/statistika", "/admin")).toBe("/platforma/statistika");
  });
});
