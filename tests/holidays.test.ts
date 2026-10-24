import { describe, expect, it } from "vitest";
import { orthodoxEaster, serbianHolidays, upcomingSerbianHolidays } from "../src/lib/availability/holidays.ts";

const dates = (year: number) => serbianHolidays(year).map((h) => h.date);

describe("orthodoxEaster", () => {
  it.each([
    [2024, "2024-05-05"],
    [2025, "2025-04-20"],
    [2026, "2026-04-12"],
    [2027, "2027-05-02"],
  ])("%i → %s", (year, expected) => {
    expect(orthodoxEaster(year)).toBe(expected);
  });
});

describe("serbianHolidays", () => {
  it("2026: Sretenje's Sunday moves the day off to Tuesday the 17th, plus the Easter days", () => {
    expect(dates(2026)).toEqual([
      "2026-01-01",
      "2026-01-02",
      "2026-01-07",
      "2026-02-15",
      "2026-02-16",
      "2026-02-17",
      "2026-04-10",
      "2026-04-11",
      "2026-04-12",
      "2026-04-13",
      "2026-05-01",
      "2026-05-02",
      "2026-11-11",
    ]);
    expect(serbianHolidays(2026).find((h) => h.date === "2026-02-17")?.name).toBe("Sretenje (Dan državnosti) (prenet dan)");
  });

  it("2023: New Year's Day on a Sunday makes 3 January a day off", () => {
    expect(dates(2023)).toContain("2023-01-03");
  });

  it("2027: Easter on Praznik rada — one entry per date, and the Sunday's day off skips Easter Monday", () => {
    const d = dates(2027);
    expect(new Set(d).size).toBe(d.length);
    expect(d).toEqual(expect.arrayContaining(["2027-04-30", "2027-05-01", "2027-05-02", "2027-05-03", "2027-05-04"]));
  });

  it("religious holidays don't move: Božić on a Sunday stays a single day", () => {
    // 7 January 2029 is a Sunday.
    expect(dates(2029).filter((x) => x.startsWith("2029-01-0"))).toEqual(["2029-01-01", "2029-01-02", "2029-01-07"]);
  });
});

describe("upcomingSerbianHolidays", () => {
  it("spans into next year and starts from today", () => {
    const upcoming = upcomingSerbianHolidays("2026-10-25");
    expect(upcoming[0]).toEqual({ date: "2026-11-11", name: "Dan primirja" });
    expect(upcoming.some((h) => h.date === "2027-01-07")).toBe(true);
    expect(upcoming.every((h) => h.date >= "2026-10-25" && h.date <= "2027-10-25")).toBe(true);
  });
});
