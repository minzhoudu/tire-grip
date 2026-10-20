/** Only allow redirects back into the admin or platform areas (no open redirects). */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || next.startsWith("//") || next.includes("\\")) return "/admin";
  if (next.startsWith("/admin") || next.startsWith("/platforma")) return next;
  return "/admin";
}
