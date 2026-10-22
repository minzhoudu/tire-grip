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

/** Day column header in the multi-day schedule: "Danas" / "Sutra" / "sub", over "24.10." */
export function dayColumnLabel(date: string, today: string): { label: string; sublabel: string } {
  const offset = diffDays(today, date);
  return { label: offset === 0 ? "Danas" : offset === 1 ? "Sutra" : SHORT[isoWeekday(date) - 1]!, sublabel: dayMonth(date) };
}

/** "22.10.–24.10." */
export function dayRangeLabel(from: string, to: string): string {
  return `${dayMonth(from)}–${dayMonth(to)}`;
}

/** Long form for messages: "petak 9.10." */
export function dayLongLabel(date: string): string {
  return `${LONG[isoWeekday(date) - 1]} ${dayMonth(date)}`;
}

/** "17:00" → "17h", "16:30" → "16:30h" */
function hourLabel(time: string): string {
  return time.endsWith(":00") ? `${Number(time.slice(0, 2))}h` : `${time}h`;
}

/** Banner under the header: "Radimo do 17h", "Otvaramo sutra u 08:00", … */
export function openStatusText(
  status: { open: true; closesAt: string } | { open: false; nextOpen: { date: string; opensAt: string } | null },
  today: string,
): string {
  if (status.open) return `Radimo do ${hourLabel(status.closesAt)}`;
  if (!status.nextOpen) return "Trenutno ne radimo";
  const { date, opensAt } = status.nextOpen;
  const offset = diffDays(today, date);
  const when = offset === 0 ? "danas" : offset === 1 ? "sutra" : dayChipLabel(date, today);
  return `Zatvoreno · otvaramo ${when} u ${opensAt}`;
}

/** Price in dinars: 1500 → "1.500 din" */
export function formatRsd(amount: number): string {
  return `${String(amount).replace(/\B(?=(\d{3})+(?!\d))/g, ".")} din`;
}
