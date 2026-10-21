import { headers } from "next/headers";
import { isLiveProduction, PROD_ROOT_DOMAIN, subdomainOf } from "../lib/subdomain.ts";

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

/** The current request's host with any {sub}. prefix stripped — the bare root domain it belongs to. */
async function currentRootHost(): Promise<string> {
  const host = (await headers()).get("host") ?? PROD_ROOT_DOMAIN;
  const sub = subdomainOf(host);
  return sub ? host.slice(sub.length + 1) : host;
}

/** Absolute link to the platform dashboard — always platform.{root}, even called from a shop's own subdomain. */
export async function platformUrl(): Promise<string> {
  const root = await currentRootHost();
  if (subdomainOf((await headers()).get("host")) === "platform") return "/platforma"; // already there
  const proto = root.startsWith("localhost") ? "http" : "https";
  return `${proto}://platform.${root}/platforma`;
}

/** Absolute link to `path` on the bare root domain — unchanged (relative) if we're already there. */
async function toRootUrl(path: string): Promise<string> {
  const host = (await headers()).get("host");
  if (!subdomainOf(host)) return path;
  const root = await currentRootHost();
  const proto = root.startsWith("localhost") ? "http" : "https";
  return `${proto}://${root}${path}`;
}

/**
 * Absolute link to /prijava on the bare root domain. Signing out must always leave whatever
 * subdomain you were on — otherwise logging into a different account there can 404: the next
 * login with no `next` defaults to /admin, which middleware ties to THIS subdomain's shop.
 */
export async function rootLoginUrl(): Promise<string> {
  return toRootUrl("/prijava");
}

/** Absolute link to the "add another shop" form, for a link in a shop's own admin panel (which lives on that shop's subdomain). */
export async function addShopUrl(): Promise<string> {
  return toRootUrl("/admin/nova-radnja");
}
