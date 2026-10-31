/**
 * Web app manifest for one shop's admin panel, so "Dodaj na početni ekran"
 * installs it as its own app (name, icon, opens straight into the panel).
 * Public on purpose: browsers fetch manifests without cookies, and it holds
 * nothing beyond the shop name, which the public booking page shows anyway.
 */
import { getDb } from "@/db";
import { getShopBasics } from "@/server/customers";
import { getAdminBase } from "@/server/session";

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const shop = await getShopBasics(getDb(), slug);
  if (!shop) return new Response("Not found", { status: 404 });
  const base = await getAdminBase(slug);

  const manifest = {
    id: base,
    name: shop.name,
    short_name: shop.name.length > 14 ? "Vulkanizer" : shop.name,
    description: "Zahtevi i raspored vaše radnje.",
    lang: "sr-Latn",
    start_url: base,
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#141414",
    theme_color: "#141414",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
  return new Response(JSON.stringify(manifest), {
    headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=3600" },
  });
}
