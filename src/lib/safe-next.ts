/** Only allow redirects back into the admin or platform areas (no open redirects). `fallback` is host-aware: "/admin" on a shop subdomain, "/platforma" on platform.*. */
export function safeNextPath(next: string | null | undefined, fallback: string): string {
  if (!next || next.startsWith("//") || next.includes("\\")) return fallback;
  if (next.startsWith("/admin") || next.startsWith("/platforma")) return next;
  return fallback;
}
