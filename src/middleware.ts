import { NextResponse, type NextRequest } from "next/server";
import { subdomainOf } from "./lib/subdomain.ts";

/**
 * `{slug}.mojvulkanizer.com`: `/` → customer booking chat (`/{slug}`), `/admin[/...]` →
 * the shop's admin panel (`/admin/{slug}[/...]`). `platform.mojvulkanizer.com`: everything
 * → `/platforma[/...]`. Everything else (root domain, previews, `/otkazi/*`, `/r/*`, `/api/*`)
 * passes through unchanged.
 *
 * Every in-app link is built relative to this (see getAdminBase/shopAdminUrl/shopPublicUrl in
 * server/session.ts and server/origin.ts) so the address bar never shows the internal
 * `/admin/{slug}` path once you're already on that shop's own subdomain. The `/admin/{slug}`
 * idempotent check below is just a safety net for a stray old-style link.
 */
const PASSTHROUGH_PREFIXES = ["/prijava", "/registracija", "/api/auth"];

function isPassthrough(pathname: string): boolean {
  return PASSTHROUGH_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function rewrite(req: NextRequest, pathname: string) {
  const url = req.nextUrl.clone();
  url.pathname = pathname;
  return NextResponse.rewrite(url);
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (isPassthrough(pathname)) return NextResponse.next();

  const sub = subdomainOf(req.headers.get("host"));
  if (!sub) return NextResponse.next();

  if (sub === "platform") {
    if (pathname === "/platforma" || pathname.startsWith("/platforma/")) return NextResponse.next();
    return rewrite(req, `/platforma${pathname}`);
  }

  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    const target = `/admin/${sub}${pathname.slice("/admin".length)}`;
    if (pathname === target || pathname.startsWith(`${target}/`)) return NextResponse.next();
    return rewrite(req, target);
  }

  if (pathname === "/") return rewrite(req, `/${sub}`);

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
