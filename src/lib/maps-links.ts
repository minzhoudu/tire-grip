/**
 * Links that open the customer's own maps app at the shop. Plain URLs: no API key, no cost.
 * With coordinates they point at the exact spot; without, Google searches the name and address.
 */
export interface ShopPlace {
  name: string;
  address: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
}

const coords = (p: ShopPlace) => (p.latitude !== null && p.longitude !== null ? `${p.latitude.toFixed(6)},${p.longitude.toFixed(6)}` : null);

/** Google Maps with the shop pinned (for messages and "Prikaži na mapi"). */
export function googleMapsUrl(p: ShopPlace): string | null {
  const c = coords(p);
  if (c) return `https://www.google.com/maps/search/?api=1&query=${c}`;
  if (!p.address) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([p.name, p.address, p.city].filter(Boolean).join(", "))}`;
}

/** Turn-by-turn navigation to the shop: Google Maps and Waze. Only with coordinates. */
export function directionsUrls(p: ShopPlace): { google: string; waze: string } | null {
  const c = coords(p);
  if (!c) return null;
  return {
    google: `https://www.google.com/maps/dir/?api=1&destination=${c}`,
    waze: `https://waze.com/ul?ll=${c}&navigate=yes`,
  };
}
