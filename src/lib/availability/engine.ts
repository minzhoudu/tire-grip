/**
 * Availability engine — the heart of the booking flow.
 *
 * Pure functions, no database access: the caller loads the shop's settings,
 * hours, exceptions and busy intervals (active bookings + blocked times) and
 * the engine answers "which start times can this service take on this day?".
 *
 * Rules
 *  - Hours for a date come from schedule exceptions if the date has any,
 *    otherwise from the weekly hours of that weekday. Several intervals per
 *    day are supported (lunch break); a service must fit inside one interval.
 *  - Start times form a grid every `slotStepMin`, aligned to each interval's
 *    opening time.
 *  - A start time is offered only if it is at least `minNoticeMin` from now,
 *    and the date is between today and today + `bookingHorizonDays`
 *    (both in the shop's timezone).
 *  - A start time is available if at least one bay (1..bays) has no busy
 *    interval overlapping [start, start + duration). Busy intervals with
 *    `bay: null` (shop-wide blocks) occupy every bay. Intervals are half-open,
 *    so back-to-back bookings are fine.
 *  - Taken start times are still returned (available: false), so the UI can
 *    show them struck through like the demo does.
 *
 * The database exclusion constraint `bookings_no_overlap` remains the final
 * guard against races; the API re-checks with `findFreeBay` inside the
 * insert transaction.
 */
import { addDays, diffDays, formatMinutes, isoWeekday, parseTime, utcToZoned, zonedToUtc } from "./zoned.ts";

export interface ShopSettings {
  timezone: string;
  /** Lifts that work in parallel */
  bays: number;
  slotStepMin: number;
  bookingHorizonDays: number;
  minNoticeMin: number;
}

/** Weekly hours row; ISO weekday 1 = Monday … 7 = Sunday */
export interface WeeklyHours {
  weekday: number;
  opensAt: string;
  closesAt: string;
}

/** Override for one calendar date (holiday or special hours) */
export interface DateException {
  date: string;
  closed: boolean;
  opensAt: string | null;
  closesAt: string | null;
}

/** Something that occupies a bay: an active booking, or a block (`bay: null` = all bays) */
export interface BusyInterval {
  startsAt: Date;
  endsAt: Date;
  bay: number | null;
}

export interface Slot {
  /** Local start time in the shop's timezone, "HH:MM" */
  time: string;
  startsAt: Date;
  endsAt: Date;
  available: boolean;
  /** Free bays for this slot, ascending — the first one is used for the booking */
  freeBays: number[];
}

export type DayStatus = "open" | "closed" | "out_of_range";

export interface DayAvailability {
  date: string;
  status: DayStatus;
  /** Opening intervals for the day in local time, e.g. [{ opensAt: "08:00", closesAt: "17:00" }] */
  hours: { opensAt: string; closesAt: string }[];
  slots: Slot[];
}

export interface AvailabilityInput {
  shop: ShopSettings;
  weeklyHours: WeeklyHours[];
  exceptions: DateException[];
  busy: BusyInterval[];
  /** Duration of the chosen service for the chosen vehicle type */
  durationMin: number;
  now: Date;
}

const MINUTE = 60_000;

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}

/** Local opening intervals (minutes since midnight) for a date, sorted and merged. */
export function hoursForDate(
  date: string,
  weeklyHours: WeeklyHours[],
  exceptions: DateException[],
): { open: number; close: number }[] {
  const forDate = exceptions.filter((e) => e.date === date);
  let raw: { open: number; close: number }[];

  if (forDate.length > 0) {
    if (forDate.some((e) => e.closed)) return [];
    raw = forDate
      .filter((e) => e.opensAt && e.closesAt)
      .map((e) => ({ open: parseTime(e.opensAt!), close: parseTime(e.closesAt!) }));
  } else {
    const weekday = isoWeekday(date);
    raw = weeklyHours
      .filter((h) => h.weekday === weekday)
      .map((h) => ({ open: parseTime(h.opensAt), close: parseTime(h.closesAt) }));
  }

  // Sort and merge overlapping/touching intervals so duplicates can't create duplicate slots.
  const sorted = raw.filter((i) => i.open < i.close).sort((a, b) => a.open - b.open);
  const merged: { open: number; close: number }[] = [];
  for (const i of sorted) {
    const last = merged.at(-1);
    if (last && i.open <= last.close) last.close = Math.max(last.close, i.close);
    else merged.push({ ...i });
  }
  return merged;
}

/** Bays (1..bays) with nothing overlapping [startsAt, endsAt), ascending. */
export function freeBaysFor(bays: number, busy: BusyInterval[], startsAt: Date, endsAt: Date): number[] {
  const taken = new Set<number>();
  for (const b of busy) {
    if (!overlaps(startsAt, endsAt, b.startsAt, b.endsAt)) continue;
    if (b.bay === null) return [];
    taken.add(b.bay);
  }
  const free: number[] = [];
  for (let bay = 1; bay <= bays; bay++) if (!taken.has(bay)) free.push(bay);
  return free;
}

/** First free bay for an exact interval, or null. Used when inserting a booking. */
export function findFreeBay(bays: number, busy: BusyInterval[], startsAt: Date, endsAt: Date): number | null {
  return freeBaysFor(bays, busy, startsAt, endsAt)[0] ?? null;
}

/** Today's date in the shop's timezone. */
export function shopToday(shop: Pick<ShopSettings, "timezone">, now: Date): string {
  return utcToZoned(now, shop.timezone).date;
}

/** All start times for one day, with availability. */
export function getDayAvailability(input: AvailabilityInput & { date: string }): DayAvailability {
  const { shop, date, durationMin, now } = input;
  if (durationMin <= 0) throw new Error("durationMin must be positive");
  if (shop.slotStepMin <= 0) throw new Error("slotStepMin must be positive");

  const today = shopToday(shop, now);
  const dayOffset = diffDays(today, date);
  if (dayOffset < 0 || dayOffset > shop.bookingHorizonDays) {
    return { date, status: "out_of_range", hours: [], slots: [] };
  }

  const intervals = hoursForDate(date, input.weeklyHours, input.exceptions);
  const hours = intervals.map((i) => ({ opensAt: formatMinutes(i.open), closesAt: formatMinutes(i.close) }));
  if (intervals.length === 0) return { date, status: "closed", hours, slots: [] };

  const earliest = now.getTime() + shop.minNoticeMin * MINUTE;
  const slots: Slot[] = [];

  for (const interval of intervals) {
    const closesAt = zonedToUtc(date, interval.close, shop.timezone);
    for (let m = interval.open; m < interval.close; m += shop.slotStepMin) {
      const startsAt = zonedToUtc(date, m, shop.timezone);
      const endsAt = new Date(startsAt.getTime() + durationMin * MINUTE);
      if (endsAt.getTime() > closesAt.getTime()) break;
      if (startsAt.getTime() < earliest) continue;

      const freeBays = freeBaysFor(shop.bays, input.busy, startsAt, endsAt);
      slots.push({ time: formatMinutes(m), startsAt, endsAt, available: freeBays.length > 0, freeBays });
    }
  }

  return { date, status: "open", hours, slots };
}

/**
 * Days (today … horizon) that are open and still have at least one free slot
 * for this service — the "Danas / Sutra / sub 10.10." chips in the chat.
 */
export function listBookableDays(input: AvailabilityInput & { limit?: number }): DayAvailability[] {
  const today = shopToday(input.shop, input.now);
  const days: DayAvailability[] = [];
  for (let i = 0; i <= input.shop.bookingHorizonDays; i++) {
    const day = getDayAvailability({ ...input, date: addDays(today, i) });
    if (day.status === "open" && day.slots.some((s) => s.available)) {
      days.push(day);
      if (input.limit && days.length >= input.limit) break;
    }
  }
  return days;
}

export type OpenStatus =
  | { open: true; closesAt: string }
  | { open: false; nextOpen: { date: string; opensAt: string } | null };

/** "Radimo do 17h" / "Otvaramo sutra u 08:00" banner. Looks up to 14 days ahead. */
export function getOpenStatus(input: {
  shop: Pick<ShopSettings, "timezone">;
  weeklyHours: WeeklyHours[];
  exceptions: DateException[];
  now: Date;
}): OpenStatus {
  const { date: today, minutes: nowMin } = utcToZoned(input.now, input.shop.timezone);

  for (const i of hoursForDate(today, input.weeklyHours, input.exceptions)) {
    if (nowMin >= i.open && nowMin < i.close) return { open: true, closesAt: formatMinutes(i.close) };
  }
  for (let d = 0; d <= 14; d++) {
    const date = addDays(today, d);
    const next = hoursForDate(date, input.weeklyHours, input.exceptions).find((i) => d > 0 || i.open > nowMin);
    if (next) return { open: false, nextOpen: { date, opensAt: formatMinutes(next.open) } };
  }
  return { open: false, nextOpen: null };
}
