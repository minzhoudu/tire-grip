import { NextResponse, type NextRequest } from "next/server";

/**
 * Maps `{slug}.mojvulkanizer.com` → `/admin/{slug}` and `platform.mojvulkanizer.com` → `/platforma`,
 * so the admin panel and platform dashboard live on their own subdomains while the customer
 * booking chat stays at the plain `mojvulkanizer.com/{slug}` (unchanged, never rewritten).
 *
 * Idempotent on purpose: every existing nav link/redirect in the app already points at
 * `/admin/{slug}/...` or `/platforma` (built before subdomains existed). If this always
 * prepended the prefix, clicking any of those links from a subdomain would double it
 * (`/admin/brzi-tocak/admin/brzi-tocak/...`). Passing through paths that already have the
 * right prefix means none of those existing links needed to change.
 */
const ROOT_DOMAINS = ["mojvulkanizer.com", "localhost:3000"];

/** Always served as-is, regardless of host, so sign-in and Better Auth work identically everywhere. */
const PASSTHROUGH_PREFIXES = ["/prijava", "/registracija", "/api/auth"];

function isPassthrough(pathname: string): boolean {
  return PASSTHROUGH_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Subdomain relative to one of ROOT_DOMAINS, or null for the bare/www host, previews, or an unrecognized host. */
function subdomainOf(host: string): string | null {
  for (const root of ROOT_DOMAINS) {
    if (host === root || host === `www.${root}`) return null;
    if (host.endsWith(`.${root}`)) return host.slice(0, -(root.length + 1));
  }
  return null;
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (isPassthrough(pathname)) return NextResponse.next();

  const sub = subdomainOf(req.headers.get("host") ?? "");
  if (!sub) return NextResponse.next();

  const prefix = sub === "platform" ? "/platforma" : `/admin/${sub}`;
  if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = `${prefix}${pathname}`;
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
