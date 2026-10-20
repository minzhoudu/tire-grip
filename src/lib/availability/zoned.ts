/**
 * Minimal, dependency-free timezone helpers built on Intl.
 *
 * Working hours are stored as local wall-clock times ("08:00") in the shop's
 * IANA timezone; bookings are absolute instants (timestamptz). These helpers
 * convert between the two and stay correct across DST changes.
 *
 * Dates are plain "YYYY-MM-DD" strings, times are "HH:MM" or "HH:MM:SS"
 * (Postgres `time` columns come back with seconds).
 */

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(timeZone, f);
  }
  return f;
}

interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function wallClock(instant: Date, timeZone: string): WallClock {
  const parts = formatterFor(timeZone).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

/** Offset of `timeZone` from UTC at `instant`, in milliseconds (Belgrade summer: +2h). */
function offsetMs(instant: Date, timeZone: string): number {
  const w = wallClock(instant, timeZone);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  const truncated = Math.floor(instant.getTime() / 1000) * 1000;
  return asUtc - truncated;
}

const pad = (n: number) => String(n).padStart(2, "0");

function parseDate(date: string): [number, number, number] {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) throw new Error(`Invalid date "${date}", expected YYYY-MM-DD`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** "08:30" | "08:30:00" → minutes since midnight */
export function parseTime(time: string): number {
  const m = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(time);
  if (!m) throw new Error(`Invalid time "${time}", expected HH:MM`);
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59 || (h === 24 && min > 0)) throw new Error(`Invalid time "${time}"`);
  return h * 60 + min;
}

/** minutes since midnight → "HH:MM" */
export function formatMinutes(minutes: number): string {
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

/**
 * Local wall-clock time in `timeZone` → absolute instant.
 * Times inside a spring-forward gap (02:30 on the DST day) resolve to the
 * equivalent instant after the jump, which is what a shop clock would show.
 */
export function zonedToUtc(date: string, minutes: number, timeZone: string): Date {
  const [y, mo, d] = parseDate(date);
  const guess = Date.UTC(y, mo - 1, d, 0, minutes);
  const first = guess - offsetMs(new Date(guess), timeZone);
  const second = guess - offsetMs(new Date(first), timeZone);
  return new Date(second);
}

/** Absolute instant → local date, minutes since midnight and ISO weekday in `timeZone`. */
export function utcToZoned(instant: Date, timeZone: string): { date: string; minutes: number; weekday: number } {
  const w = wallClock(instant, timeZone);
  const date = `${w.year}-${pad(w.month)}-${pad(w.day)}`;
  return { date, minutes: w.hour * 60 + w.minute, weekday: isoWeekday(date) };
}

/** ISO weekday for a calendar date: 1 = Monday … 7 = Sunday */
export function isoWeekday(date: string): number {
  const [y, m, d] = parseDate(date);
  const js = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  return js === 0 ? 7 : js;
}

/** Calendar arithmetic on "YYYY-MM-DD" (no timezone involved). */
export function addDays(date: string, days: number): string {
  const [y, m, d] = parseDate(date);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** Whole days from `a` to `b` (b − a). */
export function diffDays(a: string, b: string): number {
  const [ya, ma, da] = parseDate(a);
  const [yb, mb, db] = parseDate(b);
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86_400_000);
}
