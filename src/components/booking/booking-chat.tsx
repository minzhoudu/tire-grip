"use client";

import dynamic from "next/dynamic";
import { useEffect, useReducer, useRef, useState, useTransition } from "react";
import {
  getDaysAction,
  getSlotsAction,
  lookupMyBookingsAction,
  submitBookingAction,
  type BookingConfirmation,
  type DayOption,
  type MyBooking,
  type SlotOption,
} from "@/app/[slug]/actions";
import { formatRsd } from "@/lib/availability/labels";
import { flowReducer, initialFlow, type FlowState } from "@/lib/booking/flow";
import { bookingRequestSchema, fieldErrors } from "@/lib/booking/request";
import { googleMapsUrl } from "@/lib/maps-links";
import { formatPhone } from "@/lib/phone";
import type { PublicService, PublicVehicleType } from "@/server/shops";

/** The map library loads only when the customer opens "Kako do nas". */
const LocationSheet = dynamic(() => import("./location-sheet"), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl bg-white p-6 text-center text-sm text-slate-500">Učitavam mapu…</div>
  ),
});

export interface ChatShop {
  slug: string;
  name: string;
  businessLabel: string | null;
  city: string | null;
  address: string | null;
  phone: string | null;
  latitude: number | null;
  longitude: number | null;
  open: boolean;
  statusText: string;
  services: PublicService[];
  vehicleTypes: PublicVehicleType[];
}

type Load<T> = { state: "idle" } | { state: "loading" } | { state: "error" } | { state: "ready"; data: T };

/** Must match DAYS_PAGE_SIZE in src/app/[slug]/actions.ts — how many day chips "Sledeći dani" advances by. */
const DAYS_PAGE_SIZE = 6;

const LOOKUP_STATUS_LABEL: Record<string, string> = {
  pending: "Čeka potvrdu",
  confirmed: "Potvrđeno",
  completed: "Završeno",
  cancelled: "Otkazano",
  rejected: "Odbijeno",
  no_show: "Niste došli",
};

const LOOKUP_STATUS_STYLE: Record<string, string> = {
  pending: "bg-amber-100 text-amber-900",
  confirmed: "bg-emerald-100 text-emerald-900",
  completed: "bg-slate-200 text-slate-600",
  cancelled: "bg-slate-200 text-slate-600",
  rejected: "bg-red-100 text-red-800",
  no_show: "bg-red-100 text-red-800",
};

export function BookingChat({ shop, reminderToken }: { shop: ChatShop; reminderToken?: string }) {
  const [flow, dispatch] = useReducer(flowReducer, initialFlow);
  const [days, setDays] = useState<Load<{ days: DayOption[]; hasMore: boolean }>>({ state: "idle" });
  const [dayOffset, setDayOffset] = useState(0);
  const [slots, setSlots] = useState<Load<{ dayLabel: string; slots: SlotOption[] }>>({ state: "idle" });
  const [confirmation, setConfirmation] = useState<BookingConfirmation | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const endRef = useRef<HTMLDivElement>(null);

  // "Pogledajte svoje termine" — a small side flow, independent of the booking wizard above.
  const [lookupOpen, setLookupOpen] = useState(false);
  const [lookupPhone, setLookupPhone] = useState("");
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookupResult, setLookupResult] = useState<MyBooking[] | "not_found" | null>(null);
  const [lookupPending, startLookupTransition] = useTransition();

  function submitLookup(e: React.FormEvent) {
    e.preventDefault();
    setLookupError(null);
    startLookupTransition(async () => {
      const r = await lookupMyBookingsAction({ slug: shop.slug, phone: lookupPhone });
      if (!r.ok) {
        if (r.reason === "not_found") setLookupResult("not_found");
        else setLookupError("Unesite ispravan broj telefona.");
        return;
      }
      setLookupResult(r.bookings);
    });
  }

  function closeLookup() {
    setLookupOpen(false);
    setLookupPhone("");
    setLookupError(null);
    setLookupResult(null);
  }

  const service = shop.services.find((s) => s.id === flow.serviceId) ?? null;
  const price = service?.prices.find((p) => p.vehicleTypeId === flow.vehicleTypeId) ?? null;
  const offerKey =
    flow.serviceId && flow.vehicleTypeId ? { slug: shop.slug, serviceId: flow.serviceId, vehicleTypeId: flow.vehicleTypeId } : null;
  const vehicleTypeById = new Map(shop.vehicleTypes.map((vt) => [vt.id, vt]));

  // A fresh service/vehicle choice starts back at the first page of days.
  useEffect(() => {
    setDayOffset(0);
  }, [flow.serviceId, flow.vehicleTypeId]);

  // Load bookable days when entering the "day" step (or paging through them).
  useEffect(() => {
    if (flow.step !== "day" || !offerKey) return;
    let cancelled = false;
    setDays({ state: "loading" });
    getDaysAction({ ...offerKey, offset: dayOffset })
      .then((r) => !cancelled && setDays(r.ok ? { state: "ready", data: { days: r.days, hasMore: r.hasMore } } : { state: "error" }))
      .catch(() => !cancelled && setDays({ state: "error" }));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow.step, flow.serviceId, flow.vehicleTypeId, dayOffset, reloadKey]);

  // Load slots when entering the "time" step (also after "slot just taken").
  useEffect(() => {
    if (flow.step !== "time" || !offerKey || !flow.date) return;
    let cancelled = false;
    setSlots({ state: "loading" });
    getSlotsAction({ ...offerKey, date: flow.date })
      .then((r) => !cancelled && setSlots(r.ok ? { state: "ready", data: r } : { state: "error" }))
      .catch(() => !cancelled && setSlots({ state: "error" }));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow.step, flow.date, flow.serviceId, flow.vehicleTypeId, reloadKey]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [flow, days, slots, confirmation, lookupOpen, lookupResult]);

  const bookable = shop.services.filter((s) => s.bookable && s.prices.length > 0);
  const retry = () => setReloadKey((k) => k + 1);

  return (
    <div className="min-h-dvh bg-slate-100 md:flex md:items-start md:justify-center md:gap-10 md:bg-navy-900 md:px-10 md:py-12">
      <aside className="hidden shrink-0 md:block md:w-72 md:pt-6 md:text-white">
        <p className="font-mono text-3xl font-bold">{shop.name}</p>
        <p className="mt-1 text-slate-300">
          {shop.businessLabel || "Vulkanizer"}
          {shop.city ? ` · ${shop.city}` : ""}
        </p>
        <p className="mt-5 flex items-center gap-1.5 text-sm font-medium">
          <span className={`size-2.5 rounded-full ${shop.open ? "bg-emerald-500" : "bg-slate-400"}`} aria-hidden />
          {shop.statusText}
        </p>
        {shop.address && <p className="mt-2 text-sm text-slate-400">📍 {shop.address}</p>}
        {shop.phone && (
          <a href={`tel:${shop.phone}`} className="mt-5 inline-block rounded-full border-2 border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold">
            📞 Pozovi
          </a>
        )}
      </aside>

      <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-slate-100 md:h-[min(860px,85vh)] md:min-h-0 md:overflow-hidden md:rounded-3xl md:border-2 md:border-navy-900 md:shadow-2xl">
        <Header shop={shop} />

        <main
          className="flex flex-1 flex-col gap-3 px-3 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] md:overflow-y-auto"
          aria-live="polite"
        >
        <Bot>
          <p>
            👋 Dobrodošli u <strong>{shop.name}</strong>!
          </p>
          <p className="mt-2">Zakažite termin za 30 sekundi, bez zvanja i bez čekanja u redu.</p>
          {flow.step === "service" && !lookupOpen && (
            <>
              <p className="mt-2 text-sm text-slate-500">
                Već imate zakazan termin?{" "}
                <button type="button" onClick={() => setLookupOpen(true)} className="font-semibold text-navy-700 underline">
                  Pogledajte svoje termine
                </button>
              </p>
              <Chips>
                {shop.services.map((s) => (
                  <Chip
                    key={s.id}
                    onClick={() =>
                      dispatch({
                        type: "chooseService",
                        serviceId: s.id,
                        vehicleTypeIds: s.bookable ? s.prices.map((p) => p.vehicleTypeId) : [],
                      })
                    }
                  >
                    {s.icon} {s.name}
                  </Chip>
                ))}
                <Chip onClick={() => dispatch({ type: "showPrices" })}>💰 Cenovnik</Chip>
              </Chips>
              {flow.notice && <Notice>{flow.notice}</Notice>}
              {bookable.length === 0 && <Notice>Online zakazivanje trenutno nije dostupno.</Notice>}
            </>
          )}
        </Bot>

        {lookupOpen && (
          <>
            <User>🔎 Pogledajte svoje termine</User>
            <Bot>
              {lookupResult === null ? (
                <form onSubmit={submitLookup} className="flex flex-col gap-2.5">
                  <p>Unesite broj telefona da pronađemo vaše termine:</p>
                  <input
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    autoFocus
                    placeholder="06x xxx xxxx"
                    value={lookupPhone}
                    onChange={(e) => setLookupPhone(e.target.value)}
                    className={inputClass(lookupError ?? undefined)}
                  />
                  {lookupError && <span className="text-sm text-red-700">{lookupError}</span>}
                  <div className="mt-1 flex gap-2">
                    <button
                      type="submit"
                      disabled={lookupPending}
                      className="flex-1 rounded-xl border-2 border-navy-900 bg-accent-500 px-4 py-2.5 font-mono text-[15px] font-bold text-navy-950 active:scale-[0.98] disabled:opacity-60"
                    >
                      {lookupPending ? "Tražim…" : "🔎 Pronađi"}
                    </button>
                    <BackChip onClick={closeLookup} label="Otkaži" />
                  </div>
                </form>
              ) : lookupResult === "not_found" ? (
                <>
                  <Notice>Nema termina sa tim brojem telefona kod ove radnje.</Notice>
                  <Chips>
                    <Chip onClick={() => setLookupResult(null)}>🔁 Probaj drugi broj</Chip>
                    <BackChip onClick={closeLookup} />
                  </Chips>
                </>
              ) : (
                <>
                  <p className="font-semibold">Vaši termini:</p>
                  <ul className="mt-2 flex flex-col gap-2">
                    {lookupResult.map((b) => (
                      <li key={b.id} className="rounded-xl border border-slate-200 p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-mono font-bold">
                              {b.dayLabel} u {b.time}h
                            </p>
                            <p className="text-sm text-slate-600">
                              {b.serviceIcon} {b.serviceName} · {formatRsd(b.priceRsd)}
                            </p>
                          </div>
                          <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${LOOKUP_STATUS_STYLE[b.status]}`}>
                            {LOOKUP_STATUS_LABEL[b.status]}
                          </span>
                        </div>
                        {b.upcoming && (
                          <a href={`/otkazi/${b.id}`} className="mt-2 inline-block text-sm font-semibold text-red-700 underline">
                            Otkaži termin
                          </a>
                        )}
                      </li>
                    ))}
                  </ul>
                  <Chips>
                    <BackChip onClick={closeLookup} />
                  </Chips>
                </>
              )}
            </Bot>
          </>
        )}

        {flow.showPrices && (
          <Bot>
            <PriceList services={shop.services} vehicleTypes={shop.vehicleTypes} />
          </Bot>
        )}

        {service && (
          <>
            <User>
              {service.icon} {service.name}
            </User>

            {!flow.vehicleAuto && (
              <Bot>
                <p>
                  {service.description ? `${service.description}. ` : ""}Koje je vozilo?
                </p>
                {flow.step === "vehicle" && (
                  <Chips>
                    {service.prices.map((p) => (
                      <Chip key={p.vehicleTypeId} onClick={() => dispatch({ type: "chooseVehicle", vehicleTypeId: p.vehicleTypeId })}>
                        {vehicleTypeById.get(p.vehicleTypeId)?.icon} {vehicleTypeById.get(p.vehicleTypeId)?.label}
                      </Chip>
                    ))}
                    <BackChip onClick={() => dispatch({ type: "back" })} />
                  </Chips>
                )}
              </Bot>
            )}

            {flow.vehicleTypeId && !flow.vehicleAuto && (
              <User>
                {vehicleTypeById.get(flow.vehicleTypeId)?.icon} {vehicleTypeById.get(flow.vehicleTypeId)?.label}
              </User>
            )}

            {flow.vehicleTypeId && price && (
              <Bot>
                <p>
                  Cena: <strong className="font-mono text-rust-600">{formatRsd(price.priceRsd)}</strong>, oko {price.durationMin ?? service.durationMin} minuta.
                </p>
                <p>Kada dolazite?</p>
                {flow.step === "day" && (
                  <DayPicker
                    load={days}
                    phone={shop.phone}
                    onPick={(date) => dispatch({ type: "chooseDay", date })}
                    onBack={() => dispatch({ type: "back" })}
                    onMore={() => setDayOffset((o) => o + DAYS_PAGE_SIZE)}
                    onRetry={retry}
                  />
                )}
              </Bot>
            )}

            {flow.date && (
              <>
                <User>{dayChip(days, flow.date)}</User>
                <Bot>
                  {flow.step === "time" ? (
                    <SlotPicker
                      load={slots}
                      notice={flow.notice}
                      onPick={(s) => dispatch({ type: "chooseSlot", time: s.time, startsAt: s.startsAt })}
                      onBack={() => dispatch({ type: "back" })}
                      onRetry={retry}
                    />
                  ) : (
                    <p>Slobodni termini za {slots.state === "ready" ? <strong>{slots.data.dayLabel}</strong> : "izabrani dan"}</p>
                  )}
                </Bot>
              </>
            )}

            {flow.slot && (
              <User>
                <span className="font-mono">{flow.slot.time}</span>
              </User>
            )}

            {flow.step === "details" && flow.slot && offerKey && (
              <DetailsForm
                flow={flow}
                summary={{
                  service: `${service.icon ?? ""} ${service.name}`.trim(),
                  vehicle: flow.vehicleTypeId ? vehicleTypeById.get(flow.vehicleTypeId)?.label ?? "" : "",
                  when: `${slots.state === "ready" ? slots.data.dayLabel : flow.date} u ${flow.slot.time}h`,
                  price: price ? formatRsd(price.priceRsd) : "",
                }}
                showReminderConsent={service.kind === "seasonal_swap"}
                onBack={() => dispatch({ type: "back" })}
                onSubmit={async (fields) => {
                  const result = await submitBookingAction({
                    ...offerKey,
                    startsAt: flow.slot!.startsAt,
                    ...fields,
                    reminderToken,
                  });
                  if (result.ok) {
                    setConfirmation(result.confirmation);
                    dispatch({ type: "submitted" });
                    return null;
                  }
                  if (result.reason === "invalid") return result.errors;
                  if (result.reason === "slot_unavailable") {
                    dispatch({ type: "slotTaken" });
                    return null;
                  }
                  return { form: "Nešto nije u redu. Pokušajte ponovo ili nas pozovite." };
                }}
              />
            )}

            {flow.step === "done" && confirmation && (
              <Bot>
                <Confirmation confirmation={confirmation} />
                {confirmation.shopWhatsappUrl && <p className="mt-3 text-xs text-slate-500">Imate pitanja?</p>}
                <Chips>
                  {confirmation.shopWhatsappUrl && (
                    <a
                      href={confirmation.shopWhatsappUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-full border-2 border-navy-900 bg-[#25d366] px-4 py-2.5 font-mono text-[15px] font-semibold text-white active:scale-[0.98]"
                    >
                      📲 Javite se radnji na WhatsApp
                    </a>
                  )}
                  <Chip
                    onClick={() => {
                      setConfirmation(null);
                      dispatch({ type: "restart" });
                    }}
                  >
                    ↺ Novi termin
                  </Chip>
                </Chips>
              </Bot>
            )}
          </>
        )}
        <div ref={endRef} />
      </main>
      </div>
    </div>
  );
}

function dayChip(days: Load<{ days: DayOption[]; hasMore: boolean }>, date: string): string {
  return days.state === "ready" ? (days.data.days.find((d) => d.date === date)?.label ?? date) : date;
}

/* ------------------------------------------------------------------ pieces */

function Header({ shop }: { shop: ChatShop }) {
  const [showMap, setShowMap] = useState(false);
  const pinned = shop.latitude !== null && shop.longitude !== null ? { ...shop, latitude: shop.latitude, longitude: shop.longitude } : null;
  const mapsUrl = googleMapsUrl(shop);
  return (
    <header className="sticky top-0 z-10 shadow-md">
      <div className="flex items-center gap-3 bg-navy-900 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 text-white">
        <div className="grid size-10 shrink-0 place-items-center rounded-full bg-navy-700 text-xl" aria-hidden>
          🛞
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-mono text-lg leading-tight font-bold">{shop.name}</h1>
          <p className="truncate text-sm text-slate-300">
            {shop.businessLabel || "Vulkanizer"}
            {shop.city ? ` · ${shop.city}` : ""}
          </p>
        </div>
        {shop.phone && (
          <a
            href={`tel:${shop.phone}`}
            className="rounded-full bg-white/10 px-3 py-2 text-sm font-semibold whitespace-nowrap active:bg-white/20"
            aria-label={`Pozovi ${formatPhone(shop.phone)}`}
          >
            📞 Pozovi
          </a>
        )}
      </div>
      <div className="flex items-center justify-between gap-3 bg-amber-50 px-4 py-2 text-sm text-slate-800">
        <span className="flex items-center gap-1.5 font-medium">
          <span className={`size-2.5 rounded-full ${shop.open ? "bg-emerald-500" : "bg-slate-400"}`} aria-hidden />
          {shop.statusText}
        </span>
        {pinned ? (
          <button type="button" onClick={() => setShowMap(true)} className="truncate text-slate-600 underline underline-offset-2">
            📍 {shop.address ?? "Kako do nas"}
          </button>
        ) : (
          mapsUrl && (
            <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="truncate text-slate-600 underline-offset-2 hover:underline">
              📍 {shop.address}
            </a>
          )
        )}
      </div>
      <div className="hazard-stripe" />
      {showMap && pinned && <LocationSheet place={pinned} onClose={() => setShowMap(false)} />}
    </header>
  );
}

function Bot({ children }: { children: React.ReactNode }) {
  return (
    <div className="bubble-in flex items-end gap-2">
      <div className="grid size-8 shrink-0 place-items-center rounded-full bg-navy-900 text-sm" aria-hidden>
        🛞
      </div>
      <div className="max-w-[85%] rounded-2xl rounded-bl-md border-2 border-navy-900 bg-white px-4 py-3 text-[15px] leading-relaxed text-slate-800">
        {children}
      </div>
    </div>
  );
}

function User({ children }: { children: React.ReactNode }) {
  return (
    <div className="bubble-in flex justify-end">
      <div className="max-w-[80%] rounded-2xl rounded-br-md bg-navy-900 px-4 py-2.5 text-[15px] font-medium text-white">
        {children}
      </div>
    </div>
  );
}

function Chips({ children }: { children: React.ReactNode }) {
  return <div className="mt-3 flex flex-wrap gap-2">{children}</div>;
}

function Chip({
  children,
  onClick,
  disabled,
  strike,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  strike?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-full border px-4 py-2.5 text-[15px] font-semibold transition active:scale-[0.97] ${
        disabled
          ? "cursor-not-allowed border-slate-100 bg-slate-50 text-slate-300"
          : "border-slate-200 bg-slate-100 text-slate-800 hover:border-navy-700 hover:bg-white"
      } ${strike ? "line-through" : ""}`}
    >
      {children}
    </button>
  );
}

function BackChip({ onClick, label = "← Nazad" }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full px-3 py-2.5 text-[15px] font-medium text-slate-500 hover:text-slate-800"
    >
      {label}
    </button>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{children}</p>;
}

function Loading() {
  return (
    <div className="mt-3 flex gap-2" aria-label="Učitavanje">
      {[0, 1, 2].map((i) => (
        <span key={i} className="h-10 w-20 animate-pulse rounded-full bg-slate-200" />
      ))}
    </div>
  );
}

function LoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <Notice>
      Nije uspelo učitavanje.{" "}
      <button type="button" onClick={onRetry} className="font-semibold underline">
        Pokušaj ponovo
      </button>
    </Notice>
  );
}

function DayPicker({
  load,
  phone,
  onPick,
  onBack,
  onMore,
  onRetry,
}: {
  load: Load<{ days: DayOption[]; hasMore: boolean }>;
  phone: string | null;
  onPick: (date: string) => void;
  onBack: () => void;
  onMore: () => void;
  onRetry: () => void;
}) {
  if (load.state === "idle" || load.state === "loading") return <Loading />;
  if (load.state === "error") return <LoadError onRetry={onRetry} />;
  if (load.data.days.length === 0) {
    return (
      <>
        <Notice>
          Nema slobodnih termina u narednim danima.
          {phone && (
            <>
              {" "}
              Pozovite nas na{" "}
              <a className="font-semibold underline" href={`tel:${phone}`}>
                {formatPhone(phone)}
              </a>
              .
            </>
          )}
        </Notice>
        <Chips>
          <BackChip onClick={onBack} />
        </Chips>
      </>
    );
  }
  return (
    <Chips>
      {load.data.days.map((d) => (
        <Chip key={d.date} onClick={() => onPick(d.date)}>
          📅 {d.label}
        </Chip>
      ))}
      {load.data.hasMore && <Chip onClick={onMore}>Sledeći dani →</Chip>}
      <BackChip onClick={onBack} />
    </Chips>
  );
}

function SlotPicker({
  load,
  notice,
  onPick,
  onBack,
  onRetry,
}: {
  load: Load<{ dayLabel: string; slots: SlotOption[] }>;
  notice: string | null;
  onPick: (slot: SlotOption) => void;
  onBack: () => void;
  onRetry: () => void;
}) {
  if (load.state === "idle" || load.state === "loading") {
    return (
      <>
        <p>Tražim slobodne termine…</p>
        <Loading />
      </>
    );
  }
  if (load.state === "error") return <LoadError onRetry={onRetry} />;
  const { dayLabel, slots } = load.data;
  const anyFree = slots.some((s) => s.available);
  return (
    <>
      {notice && <Notice>{notice}</Notice>}
      <p className={notice ? "mt-3" : undefined}>
        Slobodni termini za <strong>{dayLabel}</strong>
        {anyFree && slots.some((s) => !s.available) && <span className="text-slate-500"> (precrtano je zauzeto)</span>}:
      </p>
      {!anyFree && <Notice>Ovaj dan je u međuvremenu popunjen. Izaberite drugi dan.</Notice>}
      <div className="mt-3 grid grid-cols-4 gap-2">
        {slots.map((s) => (
          <button
            key={s.startsAt}
            type="button"
            disabled={!s.available}
            onClick={() => onPick(s)}
            aria-label={s.available ? `Termin ${s.time}` : `${s.time}, zauzeto`}
            className={`rounded-full border py-2.5 font-mono text-[15px] font-semibold tabular-nums transition active:scale-[0.97] ${
              s.available
                ? "border-slate-200 bg-slate-100 text-slate-800 hover:border-navy-700 hover:bg-white"
                : "cursor-not-allowed border-transparent bg-slate-50 text-slate-300 line-through"
            }`}
          >
            {s.time}
          </button>
        ))}
      </div>
      <Chips>
        <BackChip onClick={onBack} label="← Drugi dan" />
      </Chips>
    </>
  );
}

/** A menu-style list (service, then one row per vehicle type) so any number of vehicle types fits a phone. */
function PriceList({ services, vehicleTypes }: { services: PublicService[]; vehicleTypes: PublicVehicleType[] }) {
  return (
    <div>
      <p className="font-semibold">💰 Cenovnik</p>
      <div className="mt-2 flex flex-col gap-3">
        {services.map((s) => {
          const rows = vehicleTypes.flatMap((vt) => {
            const p = s.prices.find((x) => x.vehicleTypeId === vt.id);
            return p ? [{ vt, priceRsd: p.priceRsd }] : [];
          });
          return (
            <div key={s.id} className="border-t border-slate-100 pt-2 first:border-t-0 first:pt-0">
              <p className="font-semibold text-slate-900">
                {s.icon} {s.name}
              </p>
              {rows.length === 0 ? (
                <p className="mt-1 text-sm text-slate-500">Cena na upit</p>
              ) : (
                <ul className="mt-1 flex flex-col gap-1 text-sm">
                  {rows.map(({ vt, priceRsd }) => (
                    <li key={vt.id} className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 text-slate-600">
                        {vt.icon} {vt.label}
                      </span>
                      <span className="shrink-0 font-mono font-bold whitespace-nowrap tabular-nums text-rust-600">{formatRsd(priceRsd)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

type Fields = { name: string; phone: string; vehicleLabel: string; note: string; reminderConsent: boolean };

function DetailsForm({
  flow,
  summary,
  showReminderConsent,
  onBack,
  onSubmit,
}: {
  flow: FlowState;
  summary: { service: string; vehicle: string; when: string; price: string };
  /** Only the seasonal tire-swap reminder applies — hide the checkbox for every other service kind. */
  showReminderConsent: boolean;
  onBack: () => void;
  onSubmit: (fields: Fields) => Promise<Record<string, string> | null>;
}) {
  // Consent must be an active choice (ZZPL/GDPR): the box starts unchecked.
  const [fields, setFields] = useState<Fields>({ name: "", phone: "", vehicleLabel: "", note: "", reminderConsent: false });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  const set = <K extends keyof Fields>(key: K, value: Fields[K]) => {
    setFields((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: "", form: "" }));
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    // Instant feedback with the same rules the server uses.
    const check = bookingRequestSchema.safeParse({
      slug: "x",
      serviceId: flow.serviceId,
      vehicleTypeId: flow.vehicleTypeId,
      startsAt: flow.slot?.startsAt,
      ...fields,
    });
    if (!check.success) {
      setErrors(fieldErrors(check.error));
      return;
    }
    startTransition(async () => {
      const result = await onSubmit(fields);
      if (result) setErrors(result);
    });
  };

  return (
    <form onSubmit={submit} className="bubble-in rounded-2xl border-2 border-navy-900 bg-white p-4" noValidate>
      <h2 className="font-mono text-lg font-bold">📝 Još samo vaši podaci</h2>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-xl bg-slate-50 px-3 py-2.5 text-sm">
        <dt className="text-slate-500">Usluga</dt>
        <dd className="font-medium">{summary.service}</dd>
        <dt className="text-slate-500">Vozilo</dt>
        <dd className="font-medium">{summary.vehicle}</dd>
        <dt className="text-slate-500">Termin</dt>
        <dd className="font-mono font-medium">{summary.when}</dd>
        <dt className="text-slate-500">Cena</dt>
        <dd className="font-mono font-bold text-rust-600">{summary.price}</dd>
      </dl>

      <Field label="Ime" required error={errors.name}>
        <input
          className={inputClass(errors.name)}
          autoComplete="given-name"
          placeholder="Vaše ime"
          value={fields.name}
          onChange={(e) => set("name", e.target.value)}
        />
      </Field>
      <Field label="Telefon (Viber/WhatsApp)" required error={errors.phone}>
        <input
          className={inputClass(errors.phone)}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="06x xxx xxxx"
          value={fields.phone}
          onChange={(e) => set("phone", e.target.value)}
        />
      </Field>
      <Field label="Auto (marka i model)" error={errors.vehicleLabel}>
        <input
          className={inputClass(errors.vehicleLabel)}
          placeholder="npr. Golf 7, Škoda Octavia"
          value={fields.vehicleLabel}
          onChange={(e) => set("vehicleLabel", e.target.value)}
        />
      </Field>
      <Field label="Napomena" error={errors.note}>
        <textarea
          className={`${inputClass(errors.note)} min-h-20 resize-y`}
          placeholder="npr. gume su u gepeku, treba i ventil"
          value={fields.note}
          onChange={(e) => set("note", e.target.value)}
        />
      </Field>

      {showReminderConsent && (
        <label className="mt-4 flex items-start gap-3 text-sm text-slate-700">
          <input
            type="checkbox"
            className="mt-0.5 size-5 shrink-0 accent-navy-900"
            checked={fields.reminderConsent}
            onChange={(e) => set("reminderConsent", e.target.checked)}
          />
          <span>Podsetite me pred sledeću sezonu zamene guma (možete se odjaviti bilo kada).</span>
        </label>
      )}

      {errors.form && <Notice>{errors.form}</Notice>}

      <div className="mt-5 grid grid-cols-[auto_1fr] gap-3">
        <button
          type="button"
          onClick={onBack}
          disabled={pending}
          className="rounded-xl bg-slate-200 px-4 py-3.5 font-semibold text-slate-700 active:scale-[0.98] disabled:opacity-50"
        >
          ← Nazad
        </button>
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl border-2 border-navy-900 bg-accent-500 px-4 py-3.5 font-mono text-[17px] font-bold text-navy-950 active:scale-[0.98] disabled:opacity-60"
        >
          {pending ? "Šaljem…" : "📅 Pošalji zahtev"}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="mt-4 block">
      <span className="text-sm font-semibold text-slate-700">
        {label}
        {required && <span className="text-red-600"> *</span>}
      </span>
      <div className="mt-1.5">{children}</div>
      {error && <span className="mt-1 block text-sm text-red-700">{error}</span>}
    </label>
  );
}

function inputClass(error?: string) {
  return `w-full rounded-xl border bg-white px-3.5 py-3 text-base outline-none transition focus:ring-2 ${
    error ? "border-red-400 focus:ring-red-200" : "border-slate-300 focus:border-navy-700 focus:ring-navy-700/20"
  }`;
}

function Confirmation({ confirmation: c }: { confirmation: BookingConfirmation }) {
  return (
    <div>
      <p>
        ✅ Hvala, {c.customerName}! Zahtev za{" "}
        <strong>
          {c.dayLabel} u {c.time}h
        </strong>{" "}
        je poslat.
      </p>
      <p className="mt-2">
        {c.status === "confirmed"
          ? `Termin je potvrđen. Cena: ${formatRsd(c.priceRsd)}.`
          : `Radnja vam potvrđuje termin porukom na ${c.phoneDisplay}.`}
      </p>
      <p className="mt-2 text-sm">
        Planovi se promenili?{" "}
        <a href={c.cancelUrl} className="font-semibold text-navy-700 underline">
          Otkažite termin ovde
        </a>
        .
      </p>
    </div>
  );
}
