import { headers } from "next/headers";

/** Public origin for links in messages (https://app.example.rs). */
export async function getOrigin(): Promise<string> {
  const configured = process.env.APP_URL ?? process.env.BETTER_AUTH_URL;
  if (configured) return configured.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
