"use client";

import { useEffect, useReducer, useRef, useState, useTransition } from "react";
import {
  getDaysAction,
  getSlotsAction,
  submitBookingAction,
  type BookingConfirmation,
  type DayOption,
  type SlotOption,
} from "@/app/[slug]/actions";
import { formatRsd } from "@/lib/availability/labels";
import type { VehicleType } from "@/lib/availability/pricing";
import { flowReducer, initialFlow, type FlowState } from "@/lib/booking/flow";
import { vehicleTypeIcons, vehicleTypeLabels } from "@/lib/booking/messages";
import { bookingRequestSchema, fieldErrors } from "@/lib/booking/request";
import { formatPhone } from "@/lib/phone";
import type { PublicService } from "@/server/shops";

export interface ChatShop {
  slug: string;
  name: string;
  city: string | null;
  address: string | null;
  phone: string | null;
  open: boolean;
  statusText: string;
  services: PublicService[];
}

type Load<T> = { state: "idle" } | { state: "loading" } | { state: "error" } | { state: "ready"; data: T };

export function BookingChat({ shop }: { shop: ChatShop }) {
  const [flow, dispatch] = useReducer(flowReducer, initialFlow);
  const [days, setDays] = useState<Load<DayOption[]>>({ state: "idle" });
  const [slots, setSlots] = useState<Load<{ dayLabel: string; slots: SlotOption[] }>>({ state: "idle" });
  const [confirmation, setConfirmation] = useState<BookingConfirmation | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const endRef = useRef<HTMLDivElement>(null);

  const service = shop.services.find((s) => s.id === flow.serviceId) ?? null;
  const price = service?.prices.find((p) => p.vehicleType === flow.vehicleType) ?? null;
  const offerKey = flow.serviceId && flow.vehicleType ? { slug: shop.slug, serviceId: flow.serviceId, vehicleType: flow.vehicleType } : null;

  // Load bookable days when entering the "day" step.
  useEffect(() => {
    if (flow.step !== "day" || !offerKey) return;
    let cancelled = false;
    setDays({ state: "loading" });
    getDaysAction(offerKey)
      .then((r) => !cancelled && setDays(r.ok ? { state: "ready", data: r.days } : { state: "error" }))
      .catch(() => !cancelled && setDays({ state: "error" }));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow.step, flow.serviceId, flow.vehicleType, reloadKey]);

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
  }, [flow.step, flow.date, flow.serviceId, flow.vehicleType, reloadKey]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [flow, days, slots, confirmation]);

  const bookable = shop.services.filter((s) => s.bookable && s.prices.length > 0);
  const retry = () => setReloadKey((k) => k + 1);

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-slate-100">
      <Header shop={shop} />

      <main className="flex flex-1 flex-col gap-3 px-3 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]" aria-live="polite">
        <Bot>
          <p>
            👋 Dobrodošli u <strong>{shop.name}</strong>!
          </p>
          <p className="mt-2">Zakažite termin za 30 sekundi, bez zvanja i bez čekanja u redu.</p>
          {flow.step === "service" && (
            <>
              <Chips>
                {shop.services.map((s) => (
                  <Chip
                    key={s.id}
                    onClick={() =>
                      dispatch({
                        type: "chooseService",
                        serviceId: s.id,
                        vehicleTypes: s.bookable ? s.prices.map((p) => p.vehicleType) : [],
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

        {flow.showPrices && (
          <Bot>
            <PriceList services={shop.services} />
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
                      <Chip key={p.vehicleType} onClick={() => dispatch({ type: "chooseVehicle", vehicleType: p.vehicleType })}>
                        {vehicleTypeIcons[p.vehicleType]} {vehicleTypeLabels[p.vehicleType]}
                      </Chip>
                    ))}
                    <BackChip onClick={() => dispatch({ type: "back" })} />
                  </Chips>
                )}
              </Bot>
            )}

            {flow.vehicleType && !flow.vehicleAuto && (
              <User>
                {vehicleTypeIcons[flow.vehicleType]} {vehicleTypeLabels[flow.vehicleType]}
              </User>
            )}

            {flow.vehicleType && price && (
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
                  vehicle: flow.vehicleType ? vehicleTypeLabels[flow.vehicleType] : "",
                  when: `${slots.state === "ready" ? slots.data.dayLabel : flow.date} u ${flow.slot.time}h`,
                  price: price ? formatRsd(price.priceRsd) : "",
                }}
                onBack={() => dispatch({ type: "back" })}
                onSubmit={async (fields) => {
                  const result = await submitBookingAction({
                    ...offerKey,
                    startsAt: flow.slot!.startsAt,
                    ...fields,
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
                <Chips>
                  {confirmation.shopWhatsappUrl && (
                    <a
                      href={confirmation.shopWhatsappUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-full border-2 border-navy-900 bg-[#25d366] px-4 py-2.5 font-mono text-[15px] font-semibold text-white active:scale-[0.98]"
                    >
                      📲 JAVI RADNJI NA WHATSAPP
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
  );
}

function dayChip(days: Load<DayOption[]>, date: string): string {
  return days.state === "ready" ? (days.data.find((d) => d.date === date)?.label ?? date) : date;
}

/* ------------------------------------------------------------------ pieces */

function Header({ shop }: { shop: ChatShop }) {
  const mapsUrl = shop.address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([shop.name, shop.address, shop.city].filter(Boolean).join(", "))}`
    : null;
  return (
    <header className="sticky top-0 z-10 shadow-md">
      <div className="flex items-center gap-3 bg-navy-900 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 text-white">
        <div className="grid size-10 shrink-0 place-items-center rounded-full bg-navy-700 text-xl" aria-hidden>
          🛞
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-mono text-lg leading-tight font-bold">{shop.name}</h1>
          <p className="truncate text-sm text-slate-300">Vulkanizer{shop.city ? ` · ${shop.city}` : ""}</p>
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
        {mapsUrl && (
          <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="truncate text-slate-600 underline-offset-2 hover:underline">
            📍 {shop.address}
          </a>
        )}
      </div>
      <div className="hazard-stripe" />
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
  onRetry,
}: {
  load: Load<DayOption[]>;
  phone: string | null;
  onPick: (date: string) => void;
  onBack: () => void;
  onRetry: () => void;
}) {
  if (load.state === "idle" || load.state === "loading") return <Loading />;
  if (load.state === "error") return <LoadError onRetry={onRetry} />;
  if (load.data.length === 0) {
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
      {load.data.map((d) => (
        <Chip key={d.date} onClick={() => onPick(d.date)}>
          📅 {d.label}
        </Chip>
      ))}
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

function PriceList({ services }: { services: PublicService[] }) {
  const types: VehicleType[] = ["car", "suv", "van"];
  const used = types.filter((t) => services.some((s) => s.prices.some((p) => p.vehicleType === t)));
  return (
    <div>
      <p className="font-semibold">💰 Cenovnik</p>
      <table className="mt-2 w-full text-sm">
        <thead>
          <tr className="text-left text-slate-500">
            <th className="py-1 pr-2 font-medium">Usluga</th>
            {used.map((t) => (
              <th key={t} className="py-1 pl-2 text-right font-medium" title={vehicleTypeLabels[t]}>
                {vehicleTypeIcons[t]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {services.map((s) => (
            <tr key={s.id} className="border-t border-slate-100">
              <td className="py-1.5 pr-2">{s.name}</td>
              {used.map((t) => {
                const p = s.prices.find((x) => x.vehicleType === t);
                return (
                  <td key={t} className="py-1.5 pl-2 text-right font-mono font-bold whitespace-nowrap tabular-nums text-rust-600">
                    {p ? formatRsd(p.priceRsd) : "–"}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-slate-500">🚗 putničko · 🚙 SUV / džip · 🚐 kombi</p>
    </div>
  );
}

type Fields = { name: string; phone: string; vehicleLabel: string; note: string; reminderConsent: boolean };

function DetailsForm({
  flow,
  summary,
  onBack,
  onSubmit,
}: {
  flow: FlowState;
  summary: { service: string; vehicle: string; when: string; price: string };
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
      vehicleType: flow.vehicleType,
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

      <label className="mt-4 flex items-start gap-3 text-sm text-slate-700">
        <input
          type="checkbox"
          className="mt-0.5 size-5 shrink-0 accent-navy-900"
          checked={fields.reminderConsent}
          onChange={(e) => set("reminderConsent", e.target.checked)}
        />
        <span>Podsetite me pred sledeću sezonu zamene guma (možete se odjaviti bilo kada).</span>
      </label>

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
    </div>
  );
}
