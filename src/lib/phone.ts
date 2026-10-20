/**
 * Phone numbers are stored in E.164 (+381641234567) so one customer = one
 * phone per shop, and wa.me / viber links work. Customers type them any way:
 * "064 123 4567", "064/123-45-67", "+381 64 1234567", "00381641234567".
 */

/** Normalize to E.164, assuming Serbia (+381) for national numbers. null if invalid. */
export function normalizePhone(input: string): string | null {
  let s = input.trim().replace(/[\s\-/().]/g, "");
  if (s.startsWith("00")) s = `+${s.slice(2)}`;
  else if (s.startsWith("0")) s = `+381${s.slice(1)}`;
  else if (s.startsWith("381")) s = `+${s}`;
  if (!/^\+[1-9]\d{7,14}$/.test(s)) return null;
  // Serbian numbers: +381 then 8–9 digits (mobile 6x…, landline 1x–3x…)
  if (s.startsWith("+381") && !/^\+381[1-9]\d{7,8}$/.test(s)) return null;
  return s;
}

/** +381641234567 → "064 123 4567" (other countries are returned as-is). */
export function formatPhone(e164: string): string {
  if (!e164.startsWith("+381")) return e164;
  const national = `0${e164.slice(4)}`;
  return `${national.slice(0, 3)} ${national.slice(3, 6)} ${national.slice(6)}`;
}

/** Click-to-chat link with a prefilled message. */
export function whatsappLink(e164: string, text: string): string {
  return `https://wa.me/${e164.replace(/^\+/, "")}?text=${encodeURIComponent(text)}`;
}
