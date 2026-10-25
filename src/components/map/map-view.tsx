"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import type { Map as MlMap, Marker as MlMarker, StyleSpecification } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import { InlineSpinner } from "@/components/ui/busy";

/**
 * MapLibre map with OpenFreeMap tiles: free (also commercially), no key, no request limit.
 * The library is loaded only when a map is on screen, so other pages stay light.
 */
const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";
/** Center of Serbia, for when nothing else is known */
export const SERBIA_CENTER = { lat: 44.1, lng: 20.8 };

/**
 * The style with Latin labels only: "Beograd", not "Belgrade" or "Novi Sad Нови Сад". Done before
 * the map starts (not with setLayoutProperty after load), so no label is ever drawn the old way.
 * Fetched once per page load and shared by every map on it.
 */
let stylePromise: Promise<StyleSpecification> | null = null;
function loadStyle(): Promise<StyleSpecification> {
  stylePromise ??= fetch(STYLE_URL)
    .then((r) => {
      if (!r.ok) throw new Error(`style ${r.status}`);
      return r.json() as Promise<StyleSpecification>;
    })
    .then((style) => {
      for (const layer of style.layers) {
        if (layer.type !== "symbol" || !layer.layout?.["text-field"]) continue;
        if (!JSON.stringify(layer.layout["text-field"]).includes("name")) continue; // road numbers etc.
        layer.layout["text-field"] = ["coalesce", ["get", "name:sr-Latn"], ["get", "name:latin"], ["get", "name"]];
      }
      return style;
    })
    .catch((e) => {
      stylePromise = null; // try again next time
      throw e;
    });
  return stylePromise;
}

export interface LatLng {
  lat: number;
  lng: number;
}

export interface MapMarker extends LatLng {
  id: string;
  /** Shown on the pin (e.g. the shop's name); omitted = a plain pin */
  label?: string;
  active?: boolean;
}

function pinElement(label: string | undefined, active: boolean): HTMLElement {
  const el = document.createElement("div");
  el.className = "flex flex-col items-center";
  el.style.cursor = "pointer";
  if (label) {
    const tag = document.createElement("div");
    tag.className = `mb-1 max-w-40 truncate rounded-full border-2 px-2 py-0.5 text-xs font-bold shadow ${
      active ? "border-navy-900 bg-accent-500 text-navy-950" : "border-navy-900 bg-white text-navy-900"
    }`;
    tag.textContent = label; // never innerHTML: names come from shop owners
    el.appendChild(tag);
  }
  const dot = document.createElement("div");
  dot.className = `size-5 rounded-full border-[3px] border-white shadow-md ${active || !label ? "bg-rust-600" : "bg-navy-900"}`;
  el.appendChild(dot);
  return el;
}

export function MapView({
  center,
  zoom = 13,
  markers = [],
  pin,
  onPinMove,
  onMarkerClick,
  fitToMarkers = false,
  height = 260,
  className = "",
}: {
  center: LatLng;
  zoom?: number;
  markers?: MapMarker[];
  /** A draggable pin (setting the shop's location); tapping the map also moves it there. */
  pin?: LatLng | null;
  onPinMove?: (p: LatLng) => void;
  onMarkerClick?: (id: string) => void;
  /** Zoom out so every marker is visible */
  fitToMarkers?: boolean;
  height?: number | string;
  className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const lib = useRef<typeof import("maplibre-gl") | null>(null);
  const markerRefs = useRef<MlMarker[]>([]);
  const pinRef = useRef<MlMarker | null>(null);
  const callbacks = useRef({ onPinMove, onMarkerClick });
  callbacks.current = { onPinMove, onMarkerClick };
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  // Create the map once.
  useEffect(() => {
    let cancelled = false;
    Promise.all([import("maplibre-gl"), loadStyle()])
      .then(([ml, style]) => {
        if (cancelled || !box.current) return;
        lib.current = ml;
        // The bundler moves maplibre's code into its own chunks, so the worker file next to it
        // isn't where maplibre looks; point it at the copy the bundler emits.
        ml.setWorkerUrl(new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).href);
        const m = new ml.Map({
          container: box.current,
          style,
          center: [center.lng, center.lat],
          zoom,
          attributionControl: { compact: true },
          // One finger scrolls the page on phones; two fingers move the map.
          cooperativeGestures: true,
        });
        m.addControl(new ml.NavigationControl({ showCompass: false }), "top-right");
        m.on("load", () => setState("ready"));
        m.on("error", (e) => {
          if (!m.loaded()) setState("error");
          console.warn("map:", e.error?.message);
        });
        m.on("click", (e) => callbacks.current.onPinMove?.({ lat: e.lngLat.lat, lng: e.lngLat.lng }));
        map.current = m;
      })
      .catch(() => !cancelled && setState("error"));
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- created once; later center changes fly there below
  }, []);

  // Follow center/zoom changes (e.g. the owner picked a town).
  useEffect(() => {
    map.current?.flyTo({ center: [center.lng, center.lat], zoom, essential: true });
  }, [center.lat, center.lng, zoom]);

  // Markers
  useEffect(() => {
    const ml = lib.current;
    const m = map.current;
    if (!ml || !m) return;
    markerRefs.current.forEach((mk) => mk.remove());
    markerRefs.current = markers.map((mk) => {
      const el = pinElement(mk.label, !!mk.active);
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        callbacks.current.onMarkerClick?.(mk.id);
      });
      return new ml.Marker({ element: el, anchor: "bottom" }).setLngLat([mk.lng, mk.lat]).addTo(m);
    });
    if (fitToMarkers && markers.length === 1) {
      m.jumpTo({ center: [markers[0]!.lng, markers[0]!.lat], zoom: 13 });
    } else if (fitToMarkers && markers.length > 1) {
      const b = new ml.LngLatBounds();
      markers.forEach((mk) => b.extend([mk.lng, mk.lat]));
      m.fitBounds(b, { padding: 60, maxZoom: 14, duration: 0 });
    }
  }, [markers, fitToMarkers, state]);

  // Draggable pin
  useEffect(() => {
    const ml = lib.current;
    const m = map.current;
    if (!ml || !m) return;
    if (!pin) {
      pinRef.current?.remove();
      pinRef.current = null;
      return;
    }
    if (!pinRef.current) {
      pinRef.current = new ml.Marker({ color: "#c1501f", draggable: true }).setLngLat([pin.lng, pin.lat]).addTo(m);
      pinRef.current.on("dragend", () => {
        const p = pinRef.current!.getLngLat();
        callbacks.current.onPinMove?.({ lat: p.lat, lng: p.lng });
      });
    } else {
      pinRef.current.setLngLat([pin.lng, pin.lat]);
    }
  }, [pin?.lat, pin?.lng, state]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={`relative overflow-hidden rounded-xl border border-slate-300 bg-slate-100 ${className}`} style={{ height }}>
      {/* Sized with h-full, not absolute: maplibre's own CSS makes its container position: relative. */}
      <div ref={box} className="h-full w-full" />
      {state === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-slate-500">
          <InlineSpinner /> Učitavam mapu…
        </div>
      )}
      {state === "error" && (
        <div className="absolute inset-0 flex items-center justify-center px-4 text-center text-sm text-slate-500">Mapa trenutno nije dostupna.</div>
      )}
    </div>
  );
}
