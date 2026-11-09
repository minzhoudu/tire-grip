"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { adminSlotsAction, createManualBookingAction, firstFreeSlotAction } from "@/app/admin/[slug]/actions";
import { useToast } from "@/components/ui/toast";
import { dayChipLabel, formatRsd } from "@/lib/availability/labels";
import { addDays } from "@/lib/availability/zoned";
import type { PublicService, PublicVehicleType } from "@/server/shops";

type Slots =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "error" }
  | { state: "ready"; status: string; slots: { time: string; startsAt: string; available: boolean }[] };

const input =
  "w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-base outline-none focus:border-navy-700 focus:ring-2 focus:ring-navy-700/20";

const chip = (selected: boolean) =>
  `rounded-full border px-4 py-2.5 text-sm font-semibold ${selected ? "border-navy-900 bg-navy-900 text-white" : "border-slate-200 bg-slate-100"}`;

/** Day chips shown before "Drugi datum": today and the next few days. */
const QUICK_DAYS = 7;

const EMPTY_FIELDS = { name: "", phone: "", vehicleLabel: "", note: "" };

type FirstFree = { state: "loading" } | { state: "error" } | { state: "ready"; slot: { date: string; time: string; startsAt: string } | null };

/** Last service + vehicle used on this device, so the usual one (e.g. Zamena guma, Putničko) is already picked. */
function lastChoiceKey(slug: string) {
  return `manual-booking:${slug}`;
}

/**
 * The shop entering a booking itself (a phone call, someone at the door), in as few taps as possible:
 * service and vehicle are remembered, the day is a chip, then a time and "Upiši termin". The customer's
 * details are optional, behind "Upiši podatke kupca": without a phone it's saved as a "Rezervacija radnje",
 * and the details can be added later on the booking's card.
 */
export function ManualBookingForm({
  slug,
  base,
  services,
  vehicleTypes,
  today,
  initial,
}: {
  slug: string;
  base: string;
  services: PublicService[];
  vehicleTypes: PublicVehicleType[];
  today: string;
  /** Prefill from a tap in Raspored; time and bay are null when opened from the menu. */
  initial: { date: string; time: string | null; bay: number | null };
}) {
  const toast = useToast();
  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");
  const service = services.find((s) => s.id === serviceId);
  const [vehicleTypeId, setVehicleTypeId] = useState(service?.prices[0]?.vehicleTypeId ?? "");
  const [date, setDate] = useState(initial.date);
  const quickDays = Array.from({ length: QUICK_DAYS }, (_, i) => addDays(today, i));
  const [otherDate, setOtherDate] = useState(!quickDays.includes(initial.date));
  // The tapped time is picked as soon as the slots load (and again after a service change), until a time is chosen by hand.
  const wantedTime = useRef(initial.time);
  const [wantedMissing, setWantedMissing] = useState<string | null>(null);
  const [bay, setBay] = useState(initial.bay);
  const [slots, setSlots] = useState<Slots>({ state: "idle" });
  const [startsAt, setStartsAt] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [fields, setFields] = useState(EMPTY_FIELDS);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState<{ summary: string; messageUrl: string | null } | null>(null);
  const [pending, startTransition] = useTransition();
  const [reload, setReload] = useState(0);
  const [firstFree, setFirstFree] = useState<FirstFree>({ state: "loading" });

  const price = service?.prices.find((p) => p.vehicleTypeId === vehicleTypeId);
  const vehicleTypeById = new Map(vehicleTypes.map((vt) => [vt.id, vt]));

  // Start from the service + vehicle used last time on this device.
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(lastChoiceKey(slug)) ?? "null") as { serviceId?: string; vehicleTypeId?: string } | null;
      const s = services.find((x) => x.id === saved?.serviceId);
      if (!s) return;
      setServiceId(s.id);
      if (s.prices.some((p) => p.vehicleTypeId === saved?.vehicleTypeId)) setVehicleTypeId(saved!.vehicleTypeId!);
    } catch {
      // No storage (private mode): the first service is fine.
    }
    // Only on first render: later changes are the user's own picks.
  }, []);

  // Keep the vehicle type valid for the chosen service.
  useEffect(() => {
    if (service && !service.prices.some((p) => p.vehicleTypeId === vehicleTypeId)) {
      setVehicleTypeId(service.prices[0]?.vehicleTypeId ?? "");
    }
  }, [service, vehicleTypeId]);

  useEffect(() => {
    if (!serviceId || !date || !vehicleTypeId) return;
    let cancelled = false;
    setSlots({ state: "loading" });
    setStartsAt(null);
    adminSlotsAction({ slug, serviceId, vehicleTypeId, date })
      .then((r) => {
        if (cancelled) return;
        setSlots(r.ok ? { state: "ready", status: r.status, slots: r.slots } : { state: "error" });
        const want = wantedTime.current;
        if (!r.ok || !want) return;
        const hit = r.slots.find((s) => s.time === want && s.available);
        setStartsAt(hit?.startsAt ?? null);
        setWantedMissing(hit ? null : want);
      })
      .catch(() => !cancelled && setSlots({ state: "error" }));
    return () => {
      cancelled = true;
    };
  }, [slug, serviceId, vehicleTypeId, date, reload]);

  // The earliest free time from now, shown on the "Zakaži prvi slobodan termin" button before it's tapped.
  useEffect(() => {
    if (!serviceId || !vehicleTypeId) return;
    let cancelled = false;
    setFirstFree({ state: "loading" });
    firstFreeSlotAction({ slug, serviceId, vehicleTypeId })
      .then((r) => !cancelled && setFirstFree(r.ok ? { state: "ready", slot: r.slot } : { state: "error" }))
      .catch(() => !cancelled && setFirstFree({ state: "error" }));
    return () => {
      cancelled = true;
    };
  }, [slug, serviceId, vehicleTypeId, reload]);

  if (services.length === 0) {
    return <p className="rounded-2xl border-2 border-navy-900 bg-white p-5">Radnja nema nijednu uslugu koja se zakazuje.</p>;
  }

  function pickDate(d: string) {
    wantedTime.current = null;
    setWantedMissing(null);
    setDate(d);
  }

  if (done) {
    return (
      <div className="rounded-2xl border-2 border-navy-900 bg-white p-5">
        <p className="text-lg font-bold">✅ Termin je upisan</p>
        <p className="mt-1 text-slate-700">{done.summary}</p>
        {done.messageUrl ? (
          <a
            href={done.messageUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 block rounded-xl border-2 border-navy-900 bg-[#25d366] px-4 py-3 text-center font-mono font-bold text-white"
          >
            📲 POŠALJI POTVRDU KUPCU NA WHATSAPP
          </a>
        ) : (
          <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
            Upisano bez broja kupca. Podatke možete dopisati kasnije na kartici termina („Upiši podatke kupca“).
          </p>
        )}
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => {
              setDone(null);
              setFields(EMPTY_FIELDS);
              setShowDetails(false);
              wantedTime.current = null;
              setWantedMissing(null);
              setReload((k) => k + 1);
            }}
            className="flex-1 rounded-xl bg-slate-200 px-4 py-3 font-semibold"
          >
            Još jedan termin
          </button>
          <Link href={base} className="flex-1 rounded-xl bg-navy-900 px-4 py-3 text-center font-semibold text-white">
            Na zahteve
          </Link>
        </div>
      </div>
    );
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!startsAt) {
      setErrors({ startsAt: "Izaberite vreme." });
      return;
    }
    book(startsAt, bay, false);
  }

  /** One tap: the earliest free time from now (shown on the button), any bay. */
  function bookFirstFree() {
    if (firstFree.state !== "ready" || !firstFree.slot) return;
    book(firstFree.slot.startsAt, null, true);
  }

  function book(at: string, preferredBay: number | null, firstFreeTap: boolean) {
    startTransition(async () => {
      const r = await createManualBookingAction({ slug, serviceId, vehicleTypeId, startsAt: at, ...fields, reminderConsent: false, bay: preferredBay ?? undefined });
      if (r.ok) {
        setErrors({});
        setDone({ summary: r.summary, messageUrl: r.messageUrl });
        try {
          localStorage.setItem(lastChoiceKey(slug), JSON.stringify({ serviceId, vehicleTypeId }));
        } catch {
          // Not remembered this time; nothing else depends on it.
        }
      } else if (r.reason === "invalid") {
        setErrors(r.errors);
        setShowDetails(true); // the only fields that can be invalid are in there
      } else if (r.reason === "slot_unavailable") {
        setReload((k) => k + 1); // reload slots for the same day, and the first free time
        if (firstFreeTap) toast("Taj termin je upravo zauzet. Na dugmetu je sada sledeći slobodan.", "error");
        else setErrors({ startsAt: "Termin je upravo zauzet. Izaberite drugi." });
      } else {
        toast("Usluga trenutno nije dostupna.", "error");
      }
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 rounded-2xl border-2 border-navy-900 bg-white p-4" noValidate>
      {services.length > 1 && (
        <fieldset>
          <legend className="text-sm font-semibold text-slate-700">Usluga</legend>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {services.map((s) => (
              <button key={s.id} type="button" onClick={() => setServiceId(s.id)} aria-pressed={serviceId === s.id} className={chip(serviceId === s.id)}>
                {s.icon} {s.name}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      {(service?.prices.length ?? 0) > 1 && (
        <fieldset>
          <legend className="text-sm font-semibold text-slate-700">Vozilo</legend>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {service?.prices.map((p) => (
              <button
                key={p.vehicleTypeId}
                type="button"
                onClick={() => setVehicleTypeId(p.vehicleTypeId)}
                aria-pressed={vehicleTypeId === p.vehicleTypeId}
                className={chip(vehicleTypeId === p.vehicleTypeId)}
              >
                {vehicleTypeById.get(p.vehicleTypeId)?.icon} {vehicleTypeById.get(p.vehicleTypeId)?.label} · {formatRsd(p.priceRsd)}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      <div className="rounded-xl border-2 border-accent-500 bg-amber-50 p-3">
        <button
          type="button"
          onClick={bookFirstFree}
          disabled={pending || firstFree.state !== "ready" || !firstFree.slot}
          className="w-full rounded-xl border-2 border-navy-900 bg-navy-900 px-4 py-3 font-bold text-white active:scale-[0.98] disabled:opacity-60"
        >
          ⚡ Zakaži prvi slobodan termin
          {firstFree.state === "ready" && firstFree.slot && (
            <span className="block text-sm font-semibold text-accent-500">
              {dayChipLabel(firstFree.slot.date, today)} u {firstFree.slot.time}h
            </span>
          )}
        </button>
        <p className="mt-2 text-xs text-slate-600">
          {firstFree.state === "loading"
            ? "Tražim prvi slobodan termin…"
            : firstFree.state === "error"
              ? "Nije uspelo traženje slobodnog termina. Izaberite dan i vreme ispod."
              : !firstFree.slot
                ? "Nema slobodnog termina za ovu uslugu u narednih 120 dana."
                : `Jednim dodirom upisuje „${service?.name}“ (${vehicleTypeById.get(vehicleTypeId)?.label ?? "vozilo"}) u najraniji slobodan termin od ovog trenutka, prikazan iznad, bez biranja dana i vremena. Ako ste upisali podatke kupca ispod, čuvaju se uz termin.`}
        </p>
      </div>

      <p className="-my-1 text-center text-xs font-semibold tracking-wide text-slate-400 uppercase">ili izaberite dan i vreme</p>

      <fieldset>
        <legend className="text-sm font-semibold text-slate-700">Dan</legend>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {quickDays.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => {
                setOtherDate(false);
                pickDate(d);
              }}
              aria-pressed={!otherDate && date === d}
              className={chip(!otherDate && date === d)}
            >
              {dayChipLabel(d, today)}
            </button>
          ))}
          <button type="button" onClick={() => setOtherDate(true)} aria-pressed={otherDate} className={chip(otherDate)}>
            📅 Drugi datum
          </button>
        </div>
        {otherDate && (
          <input type="date" aria-label="Datum" className={`${input} mt-2`} min={today} value={date} onChange={(e) => pickDate(e.target.value)} />
        )}
      </fieldset>

      <div>
        <p className="text-sm font-semibold text-slate-700">
          Vreme{price && <span className="font-normal text-slate-500"> · traje oko {price.durationMin ?? service?.durationMin} min</span>}
        </p>
        {bay !== null && (
          <p className="mt-1.5 flex items-center gap-2 text-sm text-slate-600">
            <span className="rounded-full bg-navy-900 px-2.5 py-0.5 text-xs font-bold text-white">Boks {bay}</span>
            <span>ako je slobodan, inače drugi</span>
            <button type="button" onClick={() => setBay(null)} className="ml-auto text-xs font-semibold text-slate-500 underline">
              bilo koji boks
            </button>
          </p>
        )}
        {wantedMissing && slots.state === "ready" && (
          <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            U {wantedMissing}h nema mesta za ovu uslugu. Izaberite drugo vreme.
          </p>
        )}
        {slots.state === "loading" || slots.state === "idle" ? (
          <p className="mt-2 text-sm text-slate-500">Učitavam termine…</p>
        ) : slots.state === "error" ? (
          <p className="mt-2 text-sm text-red-700">Nije uspelo učitavanje termina.</p>
        ) : slots.status === "closed" ? (
          <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">Tog dana radnja ne radi.</p>
        ) : slots.slots.length === 0 ? (
          <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">Nema više termina za ovaj dan.</p>
        ) : (
          <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-6">
            {slots.slots.map((s) => (
              <button
                key={s.startsAt}
                type="button"
                disabled={!s.available}
                onClick={() => {
                  wantedTime.current = null;
                  setWantedMissing(null);
                  setStartsAt(s.startsAt);
                  setErrors((e) => ({ ...e, startsAt: "" }));
                }}
                className={`rounded-full border py-2.5 font-mono text-[15px] font-semibold tabular-nums ${
                  startsAt === s.startsAt
                    ? "border-navy-900 bg-navy-900 text-white"
                    : s.available
                      ? "border-slate-200 bg-slate-100"
                      : "cursor-not-allowed border-transparent bg-slate-50 text-slate-300 line-through"
                }`}
              >
                {s.time}
              </button>
            ))}
          </div>
        )}
        {errors.startsAt && <p className="mt-1 text-sm text-red-700">{errors.startsAt}</p>}
      </div>

      {showDetails ? (
        <fieldset className="flex flex-col gap-3 rounded-xl bg-slate-50 p-3">
          <legend className="sr-only">Podaci kupca</legend>
          <p className="text-sm text-slate-600">Sve je opciono. Sa brojem telefona kupac dobija WhatsApp potvrdu i podsetnike.</p>
          {(
            [
              ["name", "Ime kupca", "text", "given-name"],
              ["phone", "Telefon", "tel", "tel"],
              ["vehicleLabel", "Auto (marka i model)", "text", "off"],
              ["note", "Napomena", "text", "off"],
            ] as const
          ).map(([key, label, type, autoComplete]) => (
            <label key={key} className="block">
              <span className="text-sm font-semibold text-slate-700">{label}</span>
              <input
                type={type}
                autoComplete={autoComplete}
                className={`${input} mt-1.5 ${errors[key] ? "border-red-400" : ""}`}
                value={fields[key]}
                onChange={(e) => {
                  setFields((f) => ({ ...f, [key]: e.target.value }));
                  setErrors((er) => ({ ...er, [key]: "" }));
                }}
              />
              {errors[key] && <span className="mt-1 block text-sm text-red-700">{errors[key]}</span>}
            </label>
          ))}
        </fieldset>
      ) : (
        <button
          type="button"
          onClick={() => setShowDetails(true)}
          className="rounded-xl border-2 border-dashed border-slate-300 px-4 py-3 text-left text-sm font-semibold text-navy-700"
        >
          ✍️ Upiši podatke kupca <span className="font-normal text-slate-500">(opciono, bez toga se upisuje kao rezervacija radnje)</span>
        </button>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-xl border-2 border-navy-900 bg-accent-500 px-4 py-3.5 font-mono text-[17px] font-bold text-navy-950 active:scale-[0.98] disabled:opacity-60"
      >
        {pending ? "Upisujem…" : "Upiši termin"}
      </button>
    </form>
  );
}
