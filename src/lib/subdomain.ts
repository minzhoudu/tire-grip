/**
 * Shared between src/middleware.ts (Edge) and server-only code (session.ts, origin.ts)
 * so the "what host are we on" logic never drifts between the two.
 */
export const ROOT_DOMAINS = ["mojvulkanizer.com", "localhost:3000"];

/** The real production domain, for building absolute cross-subdomain URLs. */
export const PROD_ROOT_DOMAIN = "mojvulkanizer.com";

/** True only on the real Vercel production deployment — not local dev, not `pnpm start`, not a preview. */
export function isLiveProduction(): boolean {
  return process.env.VERCEL_ENV === "production";
}

/** Subdomain relative to one of ROOT_DOMAINS, or null for the bare/www host, previews, or an unrecognized host. */
export function subdomainOf(host: string | null): string | null {
  if (!host) return null;
  for (const root of ROOT_DOMAINS) {
    if (host === root || host === `www.${root}`) return null;
    if (host.endsWith(`.${root}`)) return host.slice(0, -(root.length + 1));
  }
  return null;
}
