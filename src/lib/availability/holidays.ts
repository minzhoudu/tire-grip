/**
 * Non-working public holidays in Serbia (Zakon o državnim i drugim praznicima): fixed dates, the
 * Orthodox Easter days, and the rule that a non-religious holiday falling on a Sunday moves the day
 * off to the next working day.
 */
import { addDays, isoWeekday } from "./zoned.ts";

export interface Holiday {
  date: string; // YYYY-MM-DD
  name: string;
}

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (year: number, month: number, day: number) => `${year}-${pad(month)}-${pad(day)}`;

/** Orthodox Easter Sunday (Gregorian date), Meeus' Julian algorithm + 13 days (valid 1900–2099). */
export function orthodoxEaster(year: number): string {
  const a = year % 4;
  const b = year % 7;
  const c = year % 19;
  const d = (19 * c + 15) % 30;
  const e = (2 * a + 4 * b - d + 34) % 7;
  const month = Math.floor((d + e + 114) / 31);
  const day = ((d + e + 114) % 31) + 1;
  return addDays(ymd(year, month, day), 13);
}

export function serbianHolidays(year: number): Holiday[] {
  const easter = orthodoxEaster(year);
  // Days that move to the next working day when they fall on a Sunday.
  const civil: Holiday[] = [
    { date: ymd(year, 1, 1), name: "Nova godina" },
    { date: ymd(year, 1, 2), name: "Nova godina" },
    { date: ymd(year, 2, 15), name: "Sretenje (Dan državnosti)" },
    { date: ymd(year, 2, 16), name: "Sretenje (Dan državnosti)" },
    { date: ymd(year, 5, 1), name: "Praznik rada" },
    { date: ymd(year, 5, 2), name: "Praznik rada" },
    { date: ymd(year, 11, 11), name: "Dan primirja" },
  ];
  const religious: Holiday[] = [
    { date: ymd(year, 1, 7), name: "Božić" },
    { date: addDays(easter, -2), name: "Veliki petak" },
    { date: addDays(easter, -1), name: "Velika subota" },
    { date: easter, name: "Vaskrs" },
    { date: addDays(easter, 1), name: "Vaskršnji ponedeljak" },
  ];

  const all = [...civil, ...religious];
  const taken = new Set(all.map((h) => h.date));
  for (const h of civil) {
    if (isoWeekday(h.date) !== 7) continue;
    let next = addDays(h.date, 1);
    while (isoWeekday(next) >= 6 || taken.has(next)) next = addDays(next, 1);
    taken.add(next);
    all.push({ date: next, name: `${h.name} (prenet dan)` });
  }

  // One entry per date (e.g. Praznik rada can coincide with Easter days); the first name wins.
  const byDate = new Map<string, Holiday>();
  for (const h of all) if (!byDate.has(h.date)) byDate.set(h.date, h);
  return [...byDate.values()].sort((x, y) => x.date.localeCompare(y.date));
}

/** Holidays from `today` (inclusive) through the next `days` days. */
export function upcomingSerbianHolidays(today: string, days = 365): Holiday[] {
  const until = addDays(today, days);
  const year = Number(today.slice(0, 4));
  return [...serbianHolidays(year), ...serbianHolidays(year + 1)].filter((h) => h.date >= today && h.date <= until);
}
