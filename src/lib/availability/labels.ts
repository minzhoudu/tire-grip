/** Serbian (Latin) labels for dates shown in the booking chat. */
import { diffDays, isoWeekday } from "./zoned.ts";

const SHORT = ["pon", "uto", "sre", "čet", "pet", "sub", "ned"];
const LONG = ["ponedeljak", "utorak", "sreda", "četvrtak", "petak", "subota", "nedelja"];

function dayMonth(date: string): string {
  const [, m, d] = date.split("-");
  return `${Number(d)}.${Number(m)}.`;
}

/** Chip label: "Danas", "Sutra", or "sub 10.10." */
export function dayChipLabel(date: string, today: string): string {
  const offset = diffDays(today, date);
  if (offset === 0) return "Danas";
  if (offset === 1) return "Sutra";
  return `${SHORT[isoWeekday(date) - 1]} ${dayMonth(date)}`;
}

/** Long form for messages: "petak 9.10." */
export function dayLongLabel(date: string): string {
  return `${LONG[isoWeekday(date) - 1]} ${dayMonth(date)}`;
}

/** Price in dinars: 1500 → "1.500 din" */
export function formatRsd(amount: number): string {
  return `${String(amount).replace(/\B(?=(\d{3})+(?!\d))/g, ".")} din`;
}
