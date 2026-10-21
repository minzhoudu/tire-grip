import { headers } from "next/headers";
import { isLiveProduction, PROD_ROOT_DOMAIN } from "../lib/subdomain.ts";

/** Public origin for links in messages (https://app.example.rs). */
export async function getOrigin(): Promise<string> {
  const configured = process.env.APP_URL ?? process.env.BETTER_AUTH_URL;
  if (configured) return configured.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/** Public booking link for a shop, to show/send to customers: the shop's own subdomain in production, {origin}/{slug} otherwise. */
export function shopPublicUrl(slug: string, origin: string): string {
  return isLiveProduction() ? `https://${slug}.${PROD_ROOT_DOMAIN}/` : `${origin}/${slug}`;
}

/** Absolute link to a shop's admin panel, for cross-subdomain navigation (platform admin, the bare-domain shop picker). */
export function shopAdminUrl(slug: string): string {
  return isLiveProduction() ? `https://${slug}.${PROD_ROOT_DOMAIN}/admin` : `/admin/${slug}`;
}
