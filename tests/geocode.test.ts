import { describe, expect, it } from "vitest";
import { parsePhoton } from "../src/server/geocode.ts";

const feature = (properties: Record<string, string>, lng = 20.6, lat = 43.7) => ({ geometry: { coordinates: [lng, lat] as [number, number] }, properties });

describe("parsePhoton", () => {
  it("keeps Serbian towns in Latin script with their district, skipping other countries and non-places", () => {
    const r = parsePhoton(
      {
        features: [
          feature({ name: "Краљево", county: "Рашки управни округ", countrycode: "RS", osm_key: "place", osm_value: "city" }),
          feature({ name: "Kraljevo Kolo", county: "Opština Mojkovac", countrycode: "ME", osm_key: "place", osm_value: "hamlet" }),
          feature({ name: "Град Краљево", countrycode: "RS", osm_key: "boundary", osm_value: "administrative" }),
          feature({ name: "Земун", city: "Градска општина Земун", county: "Град Београд", countrycode: "RS", osm_key: "place", osm_value: "suburb" }),
        ],
      },
      "city",
    );
    expect(r).toEqual([
      { name: "Kraljevo", detail: "Raški upravni okrug", lat: 43.7, lng: 20.6 },
      { name: "Zemun", detail: "Beograd", lat: 43.7, lng: 20.6 },
    ]);
  });

  it("lists each street once (OSM splits streets into segments), with house numbers when known", () => {
    const r = parsePhoton(
      {
        features: [
          feature({ name: "Кнеза Милоша", type: "street", district: "МЗ Палилула", city: "Чачак", countrycode: "RS" }),
          feature({ name: "Кнеза Милоша", type: "street", district: "МЗ Палилула", city: "Чачак", countrycode: "RS" }, 20.35, 43.89),
          feature({ name: "Кнеза Милоша", type: "street", district: "МЗ Парк", city: "Чачак", countrycode: "RS" }),
          feature({ name: "Пошта", type: "house", street: "Кнеза Милоша", housenumber: "12", city: "Чачак", countrycode: "RS" }),
          feature({ name: "Без улице", type: "house", countrycode: "RS" }),
        ],
      },
      "street",
    );
    expect(r.map((x) => [x.name, x.detail])).toEqual([
      ["Kneza Miloša", "MZ Palilula"],
      ["Kneza Miloša", "MZ Park"],
      ["Kneza Miloša 12", "Čačak"],
    ]);
  });
});
