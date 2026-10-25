"use client";

import { useEffect, useId, useRef, useState } from "react";
import { searchPlacesAction } from "@/app/admin/[slug]/podesavanja/actions";
import { MapView, SERBIA_CENTER, type LatLng } from "@/components/map/map-view";
import { InlineSpinner } from "@/components/ui/busy";
import type { PlaceKind, PlaceResult } from "@/server/geocode";
import { input } from "./ui";

export interface LocationValue {
  city: string;
  address: string;
  location: LatLng | null;
}

/**
 * Town → street → pin. Picking a town centers the map there, so the street search only looks
 * nearby (no more "Kneza Miloša" in the wrong city). The pin is what's saved as the location:
 * OSM often lacks house numbers, so the owner drags it to the shop's entrance.
 */
export function LocationPicker({ slug, value, onChange }: { slug: string; value: LocationValue; onChange: (v: LocationValue) => void }) {
  // Where street search looks: the chosen town, else the pin.
  const [cityCenter, setCityCenter] = useState<LatLng | null>(null);
  const [view, setView] = useState<{ center: LatLng; zoom: number }>(() =>
    value.location ? { center: value.location, zoom: 16 } : { center: SERBIA_CENTER, zoom: 6.5 },
  );
  const near = cityCenter ?? value.location ?? undefined;

  return (
    <div className="flex flex-col gap-3">
      <PlaceField
        slug={slug}
        kind="city"
        label="Grad"
        placeholder="npr. Kraljevo"
        text={value.city}
        onText={(city) => onChange({ ...value, city })}
        onPick={(r) => {
          setCityCenter(r);
          setView({ center: r, zoom: 13 });
          // A rough pin right away; the street (or a drag) makes it exact.
          onChange({ ...value, city: r.name, location: value.location ?? { lat: r.lat, lng: r.lng } });
        }}
      />
      <PlaceField
        slug={slug}
        kind="street"
        label="Adresa"
        placeholder="Ulica i broj"
        hint={near || value.city.trim() ? undefined : "Prvo izaberite grad, pa ulicu iz tog grada."}
        near={near}
        cityText={value.city}
        text={value.address}
        onText={(address) => onChange({ ...value, address })}
        onPick={(r, typed) => {
          setView({ center: r, zoom: 17 });
          // OSM rarely knows the house number: keep the one the owner typed ("bolmanska 20" → "Bolmanska 20").
          const number = /\d/.test(r.name) ? null : typed.match(/(\d+\s*[a-zA-Zа-шА-Ш]?)\s*$/)?.[1];
          onChange({ ...value, address: number ? `${r.name} ${number}` : r.name, location: { lat: r.lat, lng: r.lng } });
        }}
      />

      <div>
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm font-semibold text-slate-700">Lokacija na mapi</span>
          {value.location && (
            <button type="button" onClick={() => onChange({ ...value, location: null })} className="text-xs font-semibold text-slate-500 underline">
              Ukloni pin
            </button>
          )}
        </div>
        <p className="mt-0.5 mb-2 text-xs text-slate-500">
          {value.location
            ? "Prevucite pin tačno na ulaz u radnju. Kupci će po njemu dobiti put do vas."
            : "Dodirnite mapu na mestu gde je radnja, ili izaberite grad i ulicu iznad."}
        </p>
        <MapView
          center={view.center}
          zoom={view.zoom}
          pin={value.location}
          onPinMove={(p) => onChange({ ...value, location: p })}
          height={280}
        />
      </div>
    </div>
  );
}

/** Text field with suggestions as you type; free text stays allowed (a village OSM doesn't know). */
function PlaceField({
  slug,
  kind,
  label,
  placeholder,
  hint,
  near,
  cityText,
  text,
  onText,
  onPick,
}: {
  slug: string;
  kind: PlaceKind;
  label: string;
  placeholder: string;
  hint?: string;
  near?: LatLng;
  /** A town typed but not picked from the list: added to the street search instead of a map position */
  cityText?: string;
  text: string;
  onText: (s: string) => void;
  /** `typed` = what was in the field when the suggestion was picked */
  onPick: (r: PlaceResult, typed: string) => void;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<PlaceResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const typed = useRef(false); // search only for what the owner typed, not for saved values
  const request = useRef(0);

  useEffect(() => {
    if (!typed.current) return;
    const q = text.trim();
    if (q.length < 2) {
      setResults(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const id = ++request.current;
    const t = setTimeout(async () => {
      const query = kind === "street" && !near && cityText?.trim() ? `${q}, ${cityText.trim()}` : q;
      const r = await searchPlacesAction({ slug, q: query, kind, near }).catch(() => ({ ok: false as const }));
      if (id !== request.current) return; // a newer search is on its way
      setLoading(false);
      setFailed(!r.ok);
      setResults(r.ok ? r.results : []);
      setHighlight(0);
    }, 350);
    return () => clearTimeout(t);
    // near is read at search time; a new town doesn't re-run an old query
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, slug, kind]);

  function pick(r: PlaceResult) {
    typed.current = false;
    setOpen(false);
    setResults(null);
    onPick(r, text);
  }

  const showList = open && (loading || results !== null);

  return (
    <label className="relative block">
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      <div className="relative mt-1.5">
        <input
          className={`${input} pr-10`}
          value={text}
          placeholder={placeholder}
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          onChange={(e) => {
            typed.current = true;
            setOpen(true);
            onText(e.target.value);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (!showList || !results?.length) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setHighlight((h) => Math.min(h + 1, results.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setHighlight((h) => Math.max(h - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              pick(results[highlight]!);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
        />
        {loading && (
          <span className="absolute top-1/2 right-3.5 -translate-y-1/2">
            <InlineSpinner />
          </span>
        )}
      </div>
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}

      {showList && (
        <ul id={listId} role="listbox" className="absolute inset-x-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-xl border-2 border-navy-900 bg-white py-1 shadow-lg">
          {loading && !results ? (
            <li className="flex items-center gap-2 px-3.5 py-2.5 text-sm text-slate-500">
              <InlineSpinner /> Tražim…
            </li>
          ) : results && results.length === 0 ? (
            <li className="px-3.5 py-2.5 text-sm text-slate-500">
              {failed ? "Pretraga trenutno ne radi. Upišite ručno i postavite pin na mapi." : "Nema predloga. Možete upisati ručno."}
            </li>
          ) : (
            results?.map((r, i) => (
              <li
                key={`${r.name}-${r.lat}-${r.lng}`}
                role="option"
                aria-selected={i === highlight}
                onMouseDown={(e) => e.preventDefault()} // keep focus so blur doesn't close before the click
                onClick={() => pick(r)}
                onMouseEnter={() => setHighlight(i)}
                className={`cursor-pointer px-3.5 py-2.5 ${i === highlight ? "bg-slate-100" : ""}`}
              >
                <span className="block font-medium">{r.name}</span>
                {r.detail && <span className="block text-xs text-slate-500">{r.detail}</span>}
              </li>
            ))
          )}
        </ul>
      )}
    </label>
  );
}
