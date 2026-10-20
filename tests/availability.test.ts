import { describe, expect, it } from "vitest";
import {
  type AvailabilityInput,
  type BusyInterval,
  type WeeklyHours,
  dayChipLabel,
  dayLongLabel,
  findFreeBay,
  formatRsd,
  getDayAvailability,
  getOpenStatus,
  hoursForDate,
  listBookableDays,
  resolveOffer,
} from "../src/lib/availability/index.ts";
import { parseTime, zonedToUtc } from "../src/lib/availability/zoned.ts";

/*
 * Calendar used below (Europe/Belgrade):
 *   Fri 16.10.2026, Sat 17.10., Sun 18.10., Mon 19.10. … Sun 25.10. = DST ends (03:00 → 02:00)
 *   Before 25.10. local = UTC+2, after = UTC+1.
 */
const TZ = "Europe/Belgrade";
const at = (date: string, time: string) => zonedToUtc(date, parseTime(time), TZ);

const shop = { timezone: TZ, bays: 2, slotStepMin: 30, bookingHorizonDays: 14, minNoticeMin: 60 };

const weeklyHours: WeeklyHours[] = [
  ...[1, 2, 3, 4, 5].map((weekday) => ({ weekday, opensAt: "08:00:00", closesAt: "17:00:00" })),
  { weekday: 6, opensAt: "08:00", closesAt: "14:00" },
];

function input(over: Partial<AvailabilityInput> = {}): AvailabilityInput {
  return {
    shop,
    weeklyHours,
    exceptions: [],
    busy: [],
    durationMin: 30,
    now: at("2026-10-18", "12:00"), // Sunday noon
    ...over,
  };
}

const booking = (date: string, from: string, to: string, bay: number | null): BusyInterval => ({
  startsAt: at(date, from),
  endsAt: at(date, to),
  bay,
});

const times = (date: string, over: Partial<AvailabilityInput> = {}) =>
  getDayAvailability({ ...input(over), date }).slots.map((s) => s.time);
const takenTimes = (date: string, over: Partial<AvailabilityInput> = {}) =>
  getDayAvailability({ ...input(over), date })
    .slots.filter((s) => !s.available)
    .map((s) => s.time);

describe("time grid", () => {
  it("offers every 30 minutes from opening until the service no longer fits", () => {
    const day = getDayAvailability({ ...input(), date: "2026-10-19" });
    expect(day.status).toBe("open");
    expect(day.hours).toEqual([{ opensAt: "08:00", closesAt: "17:00" }]);
    expect(day.slots).toHaveLength(18);
    expect(day.slots[0]!.time).toBe("08:00");
    expect(day.slots.at(-1)!.time).toBe("16:30");
    expect(day.slots.every((s) => s.available && s.freeBays.length === 2)).toBe(true);
  });

  it("a longer service ends before closing time", () => {
    expect(times("2026-10-19", { durationMin: 45 }).at(-1)).toBe("16:00");
    expect(times("2026-10-17", { durationMin: 60, now: at("2026-10-16", "12:00") }).at(-1)).toBe("13:00");
  });

  it("start and end instants are correct in UTC", () => {
    const slot = getDayAvailability({ ...input(), date: "2026-10-19" }).slots[0]!;
    expect(slot.startsAt.toISOString()).toBe("2026-10-19T06:00:00.000Z");
    expect(slot.endsAt.toISOString()).toBe("2026-10-19T06:30:00.000Z");
  });

  it("respects a lunch break: the service must fit inside one interval", () => {
    const split: WeeklyHours[] = [
      { weekday: 1, opensAt: "08:00", closesAt: "12:00" },
      { weekday: 1, opensAt: "13:00", closesAt: "17:00" },
    ];
    const t = times("2026-10-19", { weeklyHours: split, durationMin: 60 });
    expect(t).toContain("11:00");
    expect(t).not.toContain("11:30");
    expect(t).not.toContain("12:00");
    expect(t).not.toContain("12:30");
    expect(t).toContain("13:00");
  });

  it("aligns the grid to the opening time (08:15 opening → 08:15, 08:45 …)", () => {
    const odd: WeeklyHours[] = [{ weekday: 1, opensAt: "08:15", closesAt: "10:00" }];
    expect(times("2026-10-19", { weeklyHours: odd })).toEqual(["08:15", "08:45", "09:15"]);
  });

  it("duplicate or overlapping hour rows don't produce duplicate slots", () => {
    const dup: WeeklyHours[] = [
      { weekday: 1, opensAt: "08:00", closesAt: "10:00" },
      { weekday: 1, opensAt: "09:00", closesAt: "11:00" },
    ];
    expect(hoursForDate("2026-10-19", dup, [])).toEqual([{ open: 480, close: 660 }]);
    expect(times("2026-10-19", { weeklyHours: dup })).toEqual(["08:00", "08:30", "09:00", "09:30", "10:00", "10:30"]);
  });
});

describe("bays and busy time", () => {
  it("a slot stays available while at least one bay is free", () => {
    const busy = [booking("2026-10-19", "10:00", "10:30", 1)];
    const slot = getDayAvailability({ ...input({ busy }), date: "2026-10-19" }).slots.find((s) => s.time === "10:00")!;
    expect(slot.available).toBe(true);
    expect(slot.freeBays).toEqual([2]);
  });

  it("a slot is taken when every bay is busy", () => {
    const busy = [booking("2026-10-19", "10:00", "10:30", 1), booking("2026-10-19", "10:00", "10:30", 2)];
    expect(takenTimes("2026-10-19", { busy })).toEqual(["10:00"]);
  });

  it("back-to-back is fine, real overlap is not", () => {
    const busy = [booking("2026-10-19", "10:00", "10:30", 1), booking("2026-10-19", "10:00", "10:30", 2)];
    // 30-min service at 09:30 ends exactly at 10:00 → free
    expect(takenTimes("2026-10-19", { busy })).not.toContain("09:30");
    // 60-min service at 09:30 runs into 10:00 → taken; 09:00 (ends 10:00) still free
    const long = takenTimes("2026-10-19", { busy, durationMin: 60 });
    expect(long).toEqual(["09:30", "10:00"]);
  });

  it("a shop-wide block (bay = null) takes every bay", () => {
    const busy = [booking("2026-10-19", "12:00", "13:00", null)];
    expect(takenTimes("2026-10-19", { busy })).toEqual(["12:00", "12:30"]);
  });

  it("bookings on bays that no longer exist are ignored", () => {
    const busy = [booking("2026-10-19", "10:00", "10:30", 3)];
    expect(takenTimes("2026-10-19", { busy })).toEqual([]);
  });

  it("findFreeBay picks the lowest free bay or null", () => {
    const busy = [booking("2026-10-19", "10:00", "10:30", 1)];
    expect(findFreeBay(2, busy, at("2026-10-19", "10:00"), at("2026-10-19", "10:30"))).toBe(2);
    expect(findFreeBay(1, busy, at("2026-10-19", "10:00"), at("2026-10-19", "10:30"))).toBeNull();
    expect(findFreeBay(1, busy, at("2026-10-19", "10:30"), at("2026-10-19", "11:00"))).toBe(1);
  });
});

describe("closed days and exceptions", () => {
  it("a weekday without hours is closed", () => {
    const day = getDayAvailability({ ...input(), date: "2026-10-18" }); // Sunday
    expect(day.status).toBe("closed");
    expect(day.slots).toEqual([]);
  });

  it("a holiday exception closes a normal working day", () => {
    const exceptions = [{ date: "2026-11-11", closed: true, opensAt: null, closesAt: null }];
    const day = getDayAvailability({ ...input({ exceptions, now: at("2026-11-01", "12:00") }), date: "2026-11-11" });
    expect(day.status).toBe("closed");
  });

  it("special hours replace the weekly hours for that date only", () => {
    const exceptions = [{ date: "2026-10-24", closed: false, opensAt: "09:00", closesAt: "10:30" }];
    expect(times("2026-10-24", { exceptions })).toEqual(["09:00", "09:30", "10:00"]);
    expect(times("2026-10-17", { exceptions, now: at("2026-10-16", "12:00") })[0]).toBe("08:00");
  });

  it("an exception can open a day that is normally closed", () => {
    const exceptions = [{ date: "2026-10-18", closed: false, opensAt: "14:00", closesAt: "15:00" }];
    expect(times("2026-10-18", { exceptions, now: at("2026-10-18", "08:00") })).toEqual(["14:00", "14:30"]);
  });
});

describe("now, notice and horizon", () => {
  it("hides start times sooner than the minimum notice", () => {
    // Monday 10:10, 60 min notice → earliest 11:10 → first offered 11:30
    const t = times("2026-10-19", { now: at("2026-10-19", "10:10") });
    expect(t[0]).toBe("11:30");
  });

  it("zero notice still hides start times in the past", () => {
    const t = times("2026-10-19", { now: at("2026-10-19", "10:00"), shop: { ...shop, minNoticeMin: 0 } });
    expect(t[0]).toBe("10:00");
  });

  it("dates before today or beyond the horizon are out of range", () => {
    const now = at("2026-10-19", "09:00");
    expect(getDayAvailability({ ...input({ now }), date: "2026-10-16" }).status).toBe("out_of_range");
    expect(getDayAvailability({ ...input({ now }), date: "2026-11-02" }).status).toBe("open"); // today + 14
    expect(getDayAvailability({ ...input({ now }), date: "2026-11-03" }).status).toBe("out_of_range");
  });

  it("'today' is the shop's local date, not UTC (late evening)", () => {
    // 23:30 local on Mon 19.10. is 21:30Z, still Monday in UTC; 00:30 local Tue is still Monday in UTC
    const now = at("2026-10-20", "00:30");
    expect(getDayAvailability({ ...input({ now }), date: "2026-10-19" }).status).toBe("out_of_range");
    expect(getDayAvailability({ ...input({ now }), date: "2026-10-20" }).slots[0]!.time).toBe("08:00");
  });
});

describe("daylight saving time", () => {
  it("08:00 is 06:00Z before and 07:00Z after the clocks go back on 25.10.", () => {
    const now = at("2026-10-22", "12:00");
    const fri = getDayAvailability({ ...input({ now }), date: "2026-10-23" }).slots[0]!;
    const mon = getDayAvailability({ ...input({ now }), date: "2026-10-26" }).slots[0]!;
    expect(fri.startsAt.toISOString()).toBe("2026-10-23T06:00:00.000Z");
    expect(mon.startsAt.toISOString()).toBe("2026-10-26T07:00:00.000Z");
    expect(mon.time).toBe("08:00");
  });

  it("a shop open on the DST night still produces a consistent grid", () => {
    const exceptions = [{ date: "2026-10-25", closed: false, opensAt: "01:00", closesAt: "04:00" }];
    const day = getDayAvailability({ ...input({ exceptions, now: at("2026-10-24", "12:00") }), date: "2026-10-25" });
    // Each start is a distinct instant and ends 30 real minutes later.
    const starts = day.slots.map((s) => s.startsAt.getTime());
    expect(new Set(starts).size).toBe(starts.length);
    expect(day.slots.every((s) => s.endsAt.getTime() - s.startsAt.getTime() === 30 * 60_000)).toBe(true);
  });
});

describe("bookable days (chat chips)", () => {
  it("skips closed days and days with nothing left", () => {
    // Saturday 13:30: closes 14:00, earliest start 14:30 → nothing left today; Sunday closed
    const now = at("2026-10-17", "13:30");
    const days = listBookableDays({ ...input({ now }), limit: 3 }).map((d) => d.date);
    expect(days).toEqual(["2026-10-19", "2026-10-20", "2026-10-21"]);
  });

  it("drops a fully booked day", () => {
    const now = at("2026-10-17", "13:30");
    const busy = [booking("2026-10-20", "08:00", "17:00", null)];
    const days = listBookableDays({ ...input({ now, busy }), limit: 3 }).map((d) => d.date);
    expect(days).toEqual(["2026-10-19", "2026-10-21", "2026-10-22"]);
  });

  it("offset pages through the bookable days instead of listing from the start", () => {
    const now = at("2026-10-17", "13:30");
    const firstPage = listBookableDays({ ...input({ now }), limit: 3 }).map((d) => d.date);
    const secondPage = listBookableDays({ ...input({ now }), offset: 3, limit: 3 }).map((d) => d.date);
    expect(firstPage).toEqual(["2026-10-19", "2026-10-20", "2026-10-21"]);
    expect(secondPage).toEqual(["2026-10-22", "2026-10-23", "2026-10-24"]);
    // skipping 1 then taking 3 overlaps the tail of the first page
    expect(listBookableDays({ ...input({ now }), offset: 1, limit: 3 }).map((d) => d.date)).toEqual([
      "2026-10-20",
      "2026-10-21",
      "2026-10-22",
    ]);
  });

  it("chip labels read like the chat: Danas, Sutra, sub 24.10.", () => {
    expect(dayChipLabel("2026-10-19", "2026-10-19")).toBe("Danas");
    expect(dayChipLabel("2026-10-20", "2026-10-19")).toBe("Sutra");
    expect(dayChipLabel("2026-10-24", "2026-10-19")).toBe("sub 24.10.");
    expect(dayLongLabel("2026-10-16")).toBe("petak 16.10.");
  });

  it("formats dinars with a thousands dot", () => {
    expect(formatRsd(1500)).toBe("1.500 din");
    expect(formatRsd(800)).toBe("800 din");
    expect(formatRsd(12500)).toBe("12.500 din");
  });
});

describe("open status banner", () => {
  const base = { shop, weeklyHours, exceptions: [] };

  it("open now → closing time", () => {
    expect(getOpenStatus({ ...base, now: at("2026-10-17", "13:30") })).toEqual({ open: true, closesAt: "14:00" });
  });

  it("before opening → opens later today", () => {
    expect(getOpenStatus({ ...base, now: at("2026-10-19", "07:00") })).toEqual({
      open: false,
      nextOpen: { date: "2026-10-19", opensAt: "08:00" },
    });
  });

  it("after Saturday closing → next working day", () => {
    expect(getOpenStatus({ ...base, now: at("2026-10-17", "15:00") })).toEqual({
      open: false,
      nextOpen: { date: "2026-10-19", opensAt: "08:00" },
    });
  });
});

describe("price and duration per vehicle type", () => {
  const service = { durationMin: 30, bookable: true, isActive: true };
  const prices = [
    { vehicleTypeId: "car", priceRsd: 1500, durationMin: null },
    { vehicleTypeId: "suv", priceRsd: 2000, durationMin: 40 },
  ];

  it("uses the service duration unless the price row overrides it", () => {
    expect(resolveOffer(service, prices, "car")).toEqual({ priceRsd: 1500, durationMin: 30 });
    expect(resolveOffer(service, prices, "suv")).toEqual({ priceRsd: 2000, durationMin: 40 });
  });

  it("returns null when the shop doesn't offer it", () => {
    expect(resolveOffer(service, prices, "van")).toBeNull();
    expect(resolveOffer({ ...service, bookable: false }, prices, "car")).toBeNull();
    expect(resolveOffer({ ...service, isActive: false }, prices, "car")).toBeNull();
  });
});
