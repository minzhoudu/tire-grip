"use client";

import dynamic from "next/dynamic";
import { useMemo, useRef, useState } from "react";
import { SERBIA_CENTER, type LatLng } from "@/components/map/map-view";
import { InlineSpinner } from "@/components/ui/busy";
import { directionsUrls } from "@/lib/maps-links";

/** The map library loads after the list is already on screen. */
const MapView = dynamic(() => import("@/components/map/map-view").then((m) => m.MapView), {
  ssr: false,
  loading: () => <div className="h-full w-full rounded-xl bg-slate-200" />,
});

export interface DirectoryItem {
  slug: string;
  url: string;
  name: string;
  businessLabel: string;
  city: string | null;
  address: string | null;
  lat: number;
  lng: number;
  open: boolean;
  statusText: string;
  firstFree: string | null;
  firstFreeService: string | null;
  services: { name: string; icon: string | null }[];
}

/** Great-circle distance in km */
function distanceKm(a: LatLng, b: LatLng): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

function formatKm(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km < 10 ? km.toFixed(1).replace(".", ",") : Math.round(km)} km`;
}

export function DirectoryView({ shops }: { shops: DirectoryItem[] }) {
  const [city, setCity] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [me, setMe] = useState<LatLng | null>(null);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);
  const cardRefs = useRef(new Map<string, HTMLElement>());

  const cities = useMemo(() => [...new Set(shops.map((s) => s.city).filter((c): c is string => !!c))].sort((a, b) => a.localeCompare(b, "sr")), [shops]);

  const visible = useMemo(() => {
    const list = shops.filter((s) => !city || s.city === city).map((s) => ({ ...s, km: me ? distanceKm(me, s) : null }));
    if (me) list.sort((a, b) => a.km! - b.km!);
    return list;
  }, [shops, city, me]);

  const markers = useMemo(() => visible.map((s) => ({ id: s.slug, lat: s.lat, lng: s.lng, label: s.name, active: s.slug === selected })), [visible, selected]);
  const sel = visible.find((s) => s.slug === selected);
  const view = sel ? { center: { lat: sel.lat, lng: sel.lng }, zoom: 14 } : me ? { center: me, zoom: 11 } : { center: SERBIA_CENTER, zoom: 6.5 };

  function locate() {
    if (!navigator.geolocation) {
      setLocateError("Vaš pregledač ne može da odredi lokaciju.");
      return;
    }
    setLocating(true);
    setLocateError(null);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLocating(false);
        setCity(null);
        setSelected(null);
        setMe({ lat: p.coords.latitude, lng: p.coords.longitude });
      },
      () => {
        setLocating(false);
        setLocateError("Lokacija nije dostupna. Izaberite grad.");
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    );
  }

  function selectFromMap(slug: string) {
    setSelected(slug);
    cardRefs.current.get(slug)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  if (shops.length === 0) {
    return (
      <div className="rounded-2xl border-2 border-navy-900 bg-white p-6 text-center text-slate-600">
        <p className="text-3xl" aria-hidden>
          🗺️
        </p>
        <p className="mt-2 font-semibold">Uskoro ovde.</p>
        <p className="mt-1 text-sm">Radnje koje koriste Moj Vulkanizer pojaviće se na mapi.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] md:items-start">
      <div className="h-[45dvh] min-h-64 md:sticky md:top-4 md:order-2 md:h-[calc(100dvh-2rem)]">
        <MapView
          center={view.center}
          zoom={view.zoom}
          markers={markers}
          fitToMarkers={!sel && !me}
          onMarkerClick={selectFromMap}
          height="100%"
        />
      </div>

      <div className="flex flex-col gap-3 md:order-1">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={locate}
            disabled={locating}
            className={`flex items-center gap-1.5 rounded-full border-2 border-navy-900 px-3.5 py-2 text-sm font-semibold active:scale-[0.98] ${me ? "bg-navy-900 text-white" : "bg-white"}`}
          >
            {locating ? <InlineSpinner /> : "📍"} Najbliži meni
          </button>
          {cities.length > 1 &&
            cities.map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={city === c}
                onClick={() => {
                  setCity(city === c ? null : c);
                  setSelected(null);
                }}
                className={`rounded-full border px-3.5 py-2 text-sm font-semibold ${city === c ? "border-navy-900 bg-navy-900 text-white" : "border-slate-300 bg-white"}`}
              >
                {c}
              </button>
            ))}
        </div>
        {locateError && <p className="text-sm text-amber-800">{locateError}</p>}

        <ul className="flex flex-col gap-3">
          {visible.map((s) => {
            const dir = directionsUrls({ name: s.name, address: s.address, city: s.city, latitude: s.lat, longitude: s.lng });
            return (
              <li
                key={s.slug}
                ref={(el) => {
                  if (el) cardRefs.current.set(s.slug, el);
                  else cardRefs.current.delete(s.slug);
                }}
              >
                <article
                  onClick={() => setSelected(s.slug)}
                  className={`cursor-pointer rounded-2xl border-2 bg-white p-4 ${selected === s.slug ? "border-navy-900 ring-2 ring-accent-500" : "border-navy-900"}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="font-mono text-lg leading-tight font-bold">{s.name}</h2>
                      <p className="text-sm text-slate-600">
                        {s.businessLabel}
                        {s.city ? ` · ${s.city}` : ""}
                        {s.address ? ` · ${s.address}` : ""}
                      </p>
                    </div>
                    {s.km !== null && <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">{formatKm(s.km)}</span>}
                  </div>

                  <p className="mt-2 flex items-center gap-1.5 text-sm font-medium">
                    <span className={`size-2.5 rounded-full ${s.open ? "bg-emerald-500" : "bg-slate-400"}`} aria-hidden />
                    {s.statusText}
                  </p>
                  {s.firstFree && (
                    <p className="mt-1 text-sm">
                      Prvi slobodan termin: <span className="font-bold">{s.firstFree}</span>
                      <span className="text-slate-500"> · {s.firstFreeService}</span>
                    </p>
                  )}
                  {s.services.length > 0 && (
                    <p className="mt-2 text-xs text-slate-500">{s.services.map((x) => `${x.icon ?? ""} ${x.name}`.trim()).join(" · ")}</p>
                  )}

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <a
                      href={s.url}
                      onClick={(e) => e.stopPropagation()}
                      className="rounded-xl border-2 border-navy-900 bg-accent-500 px-4 py-2.5 text-center font-mono font-bold text-navy-950 active:scale-[0.98]"
                    >
                      Zakaži
                    </a>
                    {dir && (
                      <a
                        href={dir.google}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="rounded-xl border-2 border-navy-900 bg-white px-3 py-2.5 text-center text-sm font-semibold whitespace-nowrap active:scale-[0.98]"
                      >
                        🧭 Kako do nas
                      </a>
                    )}
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
