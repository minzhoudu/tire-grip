"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { adminSlotsAction, createManualBookingAction } from "@/app/admin/[slug]/actions";
import { useToast } from "@/components/ui/toast";
import { formatRsd } from "@/lib/availability/labels";
import type { PublicService, PublicVehicleType } from "@/server/shops";

type Slots =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "error" }
  | { state: "ready"; status: string; slots: { time: string; startsAt: string; available: boolean }[] };

const input =
  "w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-base outline-none focus:border-navy-700 focus:ring-2 focus:ring-navy-700/20";

export function ManualBookingForm({
  slug,
  services,
  vehicleTypes,
  today,
}: {
  slug: string;
  services: PublicService[];
  vehicleTypes: PublicVehicleType[];
  today: string;
}) {
  const toast = useToast();
  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");
  const service = services.find((s) => s.id === serviceId);
  const [vehicleTypeId, setVehicleTypeId] = useState(service?.prices[0]?.vehicleTypeId ?? "");
  const [date, setDate] = useState(today);
  const [slots, setSlots] = useState<Slots>({ state: "idle" });
  const [startsAt, setStartsAt] = useState<string | null>(null);
  const [fields, setFields] = useState({ name: "", phone: "", vehicleLabel: "", note: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState<{ summary: string; messageUrl: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [reload, setReload] = useState(0);

  const price = service?.prices.find((p) => p.vehicleTypeId === vehicleTypeId);
  const vehicleTypeById = new Map(vehicleTypes.map((vt) => [vt.id, vt]));

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
      .then((r) => !cancelled && setSlots(r.ok ? { state: "ready", status: r.status, slots: r.slots } : { state: "error" }))
      .catch(() => !cancelled && setSlots({ state: "error" }));
    return () => {
      cancelled = true;
    };
  }, [slug, serviceId, vehicleTypeId, date, reload]);

  if (services.length === 0) {
    return <p className="rounded-2xl border-2 border-navy-900 bg-white p-5">Radnja nema nijednu uslugu koja se zakazuje.</p>;
  }

  if (done) {
    return (
      <div className="rounded-2xl border-2 border-navy-900 bg-white p-5">
        <p className="text-lg font-bold">✅ Termin je upisan</p>
        <p className="mt-1 text-slate-700">{done.summary}</p>
        <a
          href={done.messageUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 block rounded-xl border-2 border-navy-900 bg-[#25d366] px-4 py-3 text-center font-mono font-bold text-white"
        >
          📲 POŠALJI POTVRDU KUPCU NA WHATSAPP
        </a>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => {
              setDone(null);
              setFields({ name: "", phone: "", vehicleLabel: "", note: "" });
              setReload((k) => k + 1);
            }}
            className="flex-1 rounded-xl bg-slate-200 px-4 py-3 font-semibold"
          >
            Još jedan termin
          </button>
          <Link href={`/admin/${slug}`} className="flex-1 rounded-xl bg-navy-900 px-4 py-3 text-center font-semibold text-white">
            Na zahteve
          </Link>
        </div>
      </div>
    );
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!startsAt) {
      setErrors({ startsAt: "Izaberite termin." });
      return;
    }
    startTransition(async () => {
      const r = await createManualBookingAction({ slug, serviceId, vehicleTypeId, startsAt, ...fields, reminderConsent: false });
      if (r.ok) {
        setErrors({});
        setDone({ summary: r.summary, messageUrl: r.messageUrl });
      } else if (r.reason === "invalid") {
        setErrors(r.errors);
      } else if (r.reason === "slot_unavailable") {
        setReload((k) => k + 1); // reload slots for the same day
        setErrors({ startsAt: "Termin je upravo zauzet. Izaberite drugi." });
      } else {
        toast("Usluga trenutno nije dostupna.", "error");
      }
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 rounded-2xl border-2 border-navy-900 bg-white p-4" noValidate>
      <label className="block">
        <span className="text-sm font-semibold text-slate-700">Usluga</span>
        <select className={`${input} mt-1.5`} value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.icon} {s.name}
            </option>
          ))}
        </select>
      </label>

      <fieldset>
        <legend className="text-sm font-semibold text-slate-700">Vozilo</legend>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {service?.prices.map((p) => (
            <button
              key={p.vehicleTypeId}
              type="button"
              onClick={() => setVehicleTypeId(p.vehicleTypeId)}
              aria-pressed={vehicleTypeId === p.vehicleTypeId}
              className={`rounded-full border px-4 py-2.5 text-sm font-semibold ${
                vehicleTypeId === p.vehicleTypeId ? "border-navy-900 bg-navy-900 text-white" : "border-slate-200 bg-slate-100"
              }`}
            >
              {vehicleTypeById.get(p.vehicleTypeId)?.icon} {vehicleTypeById.get(p.vehicleTypeId)?.label} · {formatRsd(p.priceRsd)}
            </button>
          ))}
        </div>
      </fieldset>

      <label className="block">
        <span className="text-sm font-semibold text-slate-700">Datum</span>
        <input type="date" className={`${input} mt-1.5`} min={today} value={date} onChange={(e) => setDate(e.target.value)} />
      </label>

      <div>
        <p className="text-sm font-semibold text-slate-700">
          Termin{price && <span className="font-normal text-slate-500"> · traje oko {price.durationMin ?? service?.durationMin} min</span>}
        </p>
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

      {(
        [
          ["name", "Ime kupca", "text", "given-name"],
          ["phone", "Telefon", "tel", "tel"],
          ["vehicleLabel", "Auto (marka i model)", "text", "off"],
          ["note", "Napomena", "text", "off"],
        ] as const
      ).map(([key, label, type, autoComplete]) => (
        <label key={key} className="block">
          <span className="text-sm font-semibold text-slate-700">
            {label}
            {(key === "name" || key === "phone") && <span className="text-red-600"> *</span>}
          </span>
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
