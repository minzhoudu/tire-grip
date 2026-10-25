/**
 * Place search for setting a shop's location: towns, then streets in that town. Uses Photon
 * (photon.komoot.io, OpenStreetMap data): free, no key, allows search-as-you-type. Results are
 * OSM data (ODbL), so coordinates may be stored. The pin on the map is what finally counts:
 * house numbers are often missing in OSM, and the owner drags the pin to the exact spot.
 */
import { toLatin } from "../lib/translit.ts";

export type PlaceKind = "city" | "street";

export interface PlaceResult {
  /** "Kraljevo" / "Kneza Miloša 12" */
  name: string;
  /** "Raški upravni okrug" / "Čačak" */
  detail: string | null;
  lat: number;
  lng: number;
}

/** Serbia's bounding box (lon/lat), so neighbouring countries' towns don't crowd the list. */
const SERBIA_BBOX = "18.8,42.2,23.1,46.2";
const TOWN_VALUES = new Set(["city", "town", "village", "suburb", "hamlet"]);

interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: {
    name?: string;
    street?: string;
    housenumber?: string;
    city?: string;
    district?: string;
    county?: string;
    countrycode?: string;
    osm_key?: string;
    osm_value?: string;
    type?: string;
  };
}

const clean = (s: string | undefined) => (s ? toLatin(s).replace(/^(Grad|Gradska opština|Opština)\s+/, "") : null);

/** Photon's GeoJSON → our results: Serbia only, Latin script, one entry per name (streets come in many segments). */
export function parsePhoton(json: { features?: PhotonFeature[] }, kind: PlaceKind, limit = 6): PlaceResult[] {
  const out: PlaceResult[] = [];
  const seen = new Set<string>();
  for (const f of json.features ?? []) {
    const p = f.properties;
    if (p.countrycode && p.countrycode !== "RS") continue;
    let name: string | null;
    let detail: string | null;
    if (kind === "city") {
      if (p.osm_key !== "place" || !TOWN_VALUES.has(p.osm_value ?? "")) continue;
      name = clean(p.name);
      // A suburb ("Zemun") says which city it's in; a town says its district.
      const parent = clean(p.city);
      detail = (p.osm_value === "suburb" || p.osm_value === "hamlet") && parent && parent !== name ? parent : clean(p.county);
    } else {
      const street = p.type === "street" ? p.name : p.street;
      if (!street) continue;
      name = toLatin(p.type === "street" || !p.housenumber ? street : `${street} ${p.housenumber}`);
      detail = clean(p.district) ?? clean(p.city);
    }
    if (!name) continue;
    const key = `${name}|${detail ?? ""}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const [lng, lat] = f.geometry.coordinates;
    out.push({ name, detail, lat, lng });
    if (out.length >= limit) break;
  }
  return out;
}

export async function searchPlaces(q: string, kind: PlaceKind, near?: { lat: number; lng: number }): Promise<PlaceResult[] | null> {
  // "bolmanska 20" finds nothing (OSM rarely has the number), "bolmanska" does; the picker puts the number back.
  const query = kind === "street" ? q.replace(/\s+\d+\s*[a-zA-Zа-шА-Ш]?(?=\s*(,|$))/, "").trim() || q : q;
  const params = new URLSearchParams({ q: query, limit: "15" });
  if (kind === "city") {
    for (const layer of ["city", "district", "locality"]) params.append("layer", layer);
    params.set("bbox", SERBIA_BBOX);
  } else {
    params.append("layer", "street");
    params.append("layer", "house");
    if (near) {
      // Within ~25 km of the chosen town, nearest first.
      params.set("lat", String(near.lat));
      params.set("lon", String(near.lng));
      params.set("zoom", "12");
      params.set("bbox", [near.lng - 0.3, near.lat - 0.2, near.lng + 0.3, near.lat + 0.2].join(","));
    } else {
      params.set("bbox", SERBIA_BBOX);
    }
  }
  try {
    const res = await fetch(`https://photon.komoot.io/api/?${params}`, {
      // Photon asks for an identifiable client.
      headers: { "User-Agent": "MojVulkanizer/1.0 (https://mojvulkanizer.com)" },
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
    if (!res.ok) return null;
    return parsePhoton(await res.json(), kind);
  } catch {
    return null;
  }
}
