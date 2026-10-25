"use client";

import { useEffect } from "react";
import { MapView } from "@/components/map/map-view";
import { directionsUrls, googleMapsUrl, type ShopPlace } from "@/lib/maps-links";

/** "Kako do nas": the shop on a map, with one tap into Google Maps or Waze. Loaded only when opened. */
export default function LocationSheet({ place, onClose }: { place: ShopPlace & { latitude: number; longitude: number }; onClose: () => void }) {
  const dir = directionsUrls(place)!;
  const maps = googleMapsUrl(place)!;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-label="Kako do nas"
        className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:inset-x-auto md:top-1/2 md:bottom-auto md:left-1/2 md:w-[28rem] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl"
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-semibold">{place.name}</p>
            <p className="text-sm text-slate-600">{[place.address, place.city].filter(Boolean).join(", ")}</p>
          </div>
          <button type="button" onClick={onClose} className="shrink-0 rounded-full bg-slate-100 px-3 py-1.5 text-sm font-semibold">
            Zatvori
          </button>
        </div>
        <MapView center={{ lat: place.latitude, lng: place.longitude }} zoom={15} markers={[{ id: "shop", lat: place.latitude, lng: place.longitude }]} height={240} />
        <div className="mt-3 grid grid-cols-2 gap-2">
          <a href={dir.google} target="_blank" rel="noopener noreferrer" className="rounded-xl bg-navy-900 px-4 py-3 text-center font-bold text-white active:scale-[0.98]">
            🧭 Google Maps
          </a>
          <a href={dir.waze} target="_blank" rel="noopener noreferrer" className="rounded-xl border-2 border-navy-900 px-4 py-3 text-center font-bold active:scale-[0.98]">
            🚗 Waze
          </a>
        </div>
        <a href={maps} target="_blank" rel="noopener noreferrer" className="mt-2 block text-center text-sm text-slate-500 underline">
          Prikaži radnju na Google mapi
        </a>
      </div>
    </>
  );
}
