"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  createServiceAction,
  deleteServiceAction,
  moveServiceAction,
  setServiceActiveAction,
  updateServiceAction,
} from "@/app/admin/[slug]/podesavanja/actions";
import { formatRsd } from "@/lib/availability/labels";
import { useToast } from "@/components/ui/toast";
import { Toggle, ToggleRow } from "@/components/ui/toggle";
import type { ServiceKind, ServiceWithPrices, VehicleTypeWithUsage } from "@/server/settings";
import { input, primaryButton, resultBanner, secondaryButton } from "./ui";

const KIND_LABELS: Record<ServiceKind, string> = {
  seasonal_swap: "Zamena guma (sezonska)",
  mount_balance: "Montaža + balansiranje",
  new_tires: "Nove gume",
  repair: "Popravka gume",
  storage: "Čuvanje guma",
  other: "Drugo",
};
const KINDS = Object.keys(KIND_LABELS) as ServiceKind[];

interface PriceField {
  enabled: boolean;
  priceRsd: string;
  durationMin: string;
}

interface FormState {
  kind: ServiceKind;
  name: string;
  icon: string;
  description: string;
  durationMin: string;
  bookable: boolean;
  prices: Record<string, PriceField>;
}

function emptyForm(): FormState {
  return {
    kind: "other",
    name: "",
    icon: "",
    description: "",
    durationMin: "30",
    bookable: true,
    prices: {},
  };
}

function formFromService(s: ServiceWithPrices): FormState {
  const base = emptyForm();
  for (const p of s.prices) base.prices[p.vehicleTypeId] = { enabled: true, priceRsd: String(p.priceRsd), durationMin: p.durationMin ? String(p.durationMin) : "" };
  return {
    kind: s.kind as ServiceKind,
    name: s.name,
    icon: s.icon ?? "",
    description: s.description ?? "",
    durationMin: String(s.durationMin),
    bookable: s.bookable,
    prices: base.prices,
  };
}

function priceField(form: FormState, vehicleTypeId: string): PriceField {
  return form.prices[vehicleTypeId] ?? { enabled: false, priceRsd: "", durationMin: "" };
}

function buildPrices(form: FormState) {
  return Object.entries(form.prices)
    .filter(([, f]) => f.enabled)
    .map(([vehicleTypeId, f]) => ({
      vehicleTypeId,
      priceRsd: Number(f.priceRsd) || 0,
      durationMin: f.durationMin ? Number(f.durationMin) : null,
    }));
}

function ServiceForm({
  slug,
  initial,
  vehicleTypes,
  onSaved,
  onCancel,
  submitLabel,
  submit,
}: {
  slug: string;
  initial: FormState;
  /** Shown in the price picker: active types, plus any inactive one the service already has a price for (so saving doesn't silently drop it). */
  vehicleTypes: VehicleTypeWithUsage[];
  onSaved: () => void;
  onCancel?: () => void;
  submitLabel: string;
  submit: (slug: string, form: FormState) => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const [form, setForm] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const pickable = vehicleTypes.filter((vt) => vt.isActive || priceField(form, vt.id).enabled);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const r = await submit(slug, form);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      onSaved();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-2xl bg-slate-50 p-4">
      <div className="grid grid-cols-[1fr_4.5rem] gap-3">
        <label className="block">
          <span className="text-sm font-semibold text-slate-700">Naziv</span>
          <input className={`${input} mt-1.5`} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        </label>
        <label className="block">
          <span className="text-sm font-semibold text-slate-700">Ikonica</span>
          <input className={`${input} mt-1.5 text-center`} maxLength={8} value={form.icon} onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))} />
        </label>
      </div>
      <label className="block">
        <span className="text-sm font-semibold text-slate-700">Vrsta</span>
        <select className={`${input} mt-1.5`} value={form.kind} onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value as ServiceKind }))}>
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {KIND_LABELS[k]}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="text-sm font-semibold text-slate-700">Opis (opciono)</span>
        <input className={`${input} mt-1.5`} maxLength={300} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
      </label>
      <label className="block">
        <span className="text-sm font-semibold text-slate-700">Trajanje (min, podrazumevano)</span>
        <input type="number" min={5} max={480} className={`${input} mt-1.5`} value={form.durationMin} onChange={(e) => setForm((f) => ({ ...f, durationMin: e.target.value }))} />
      </label>
      <ToggleRow
        title="Kupci mogu da zakažu ovu uslugu"
        description="Isključite za npr. stavku u cenovniku koja se ne zakazuje"
        checked={form.bookable}
        onChange={(v) => setForm((f) => ({ ...f, bookable: v }))}
      />

      <div>
        <p className="mb-1.5 text-sm font-semibold text-slate-700">Cena po tipu vozila</p>
        {pickable.length === 0 ? (
          <p className="rounded-xl bg-white px-3 py-2.5 text-sm text-slate-500">Radnja nema definisane vrste vozila. Dodajte ih u „Vrste vozila".</p>
        ) : (
          <div className="flex flex-col gap-2">
            {pickable.map((vt) => {
              const f = priceField(form, vt.id);
              return (
                <div key={vt.id} className="flex items-center gap-2 rounded-xl bg-white px-3 py-2.5">
                  <label className="flex w-36 shrink-0 items-center gap-2">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={f.enabled}
                      onChange={(e) => setForm((form) => ({ ...form, prices: { ...form.prices, [vt.id]: { ...priceField(form, vt.id), enabled: e.target.checked } } }))}
                    />
                    <span className="text-sm">
                      {vt.icon} {vt.label}
                    </span>
                  </label>
                  {f.enabled && (
                    <>
                      <input
                        type="number"
                        min={0}
                        placeholder="Cena (din)"
                        className={`${input} py-1.5`}
                        value={f.priceRsd}
                        onChange={(e) => setForm((form) => ({ ...form, prices: { ...form.prices, [vt.id]: { ...priceField(form, vt.id), priceRsd: e.target.value } } }))}
                      />
                      <input
                        type="number"
                        min={5}
                        max={480}
                        placeholder="Trajanje"
                        className={`${input} py-1.5`}
                        value={f.durationMin}
                        onChange={(e) => setForm((form) => ({ ...form, prices: { ...form.prices, [vt.id]: { ...priceField(form, vt.id), durationMin: e.target.value } } }))}
                      />
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {error && resultBanner(false, error)}
      <div className="flex gap-2">
        {onCancel && (
          <button type="button" onClick={onCancel} className={`flex-1 ${secondaryButton} py-3`}>
            Otkaži
          </button>
        )}
        <button type="submit" disabled={pending} className={`flex-1 ${primaryButton}`}>
          {pending ? "Čuvam…" : submitLabel}
        </button>
      </div>
    </form>
  );
}

export function ServicesEditor({ slug, services, vehicleTypes }: { slug: string; services: ServiceWithPrices[]; vehicleTypes: VehicleTypeWithUsage[] }) {
  const router = useRouter();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const vehicleTypeById = new Map(vehicleTypes.map((vt) => [vt.id, vt]));

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        {services.map((s, idx) =>
          editingId === s.id ? (
            <li key={s.id} className="rounded-2xl border-2 border-navy-900 bg-white p-2">
              <ServiceForm
                slug={slug}
                initial={formFromService(s)}
                vehicleTypes={vehicleTypes}
                submitLabel="Sačuvaj izmene"
                onCancel={() => setEditingId(null)}
                onSaved={() => {
                  setEditingId(null);
                  toast("Sačuvano.");
                  router.refresh();
                }}
                submit={(slug, form) =>
                  updateServiceAction({
                    slug,
                    serviceId: s.id,
                    kind: form.kind,
                    name: form.name,
                    description: form.description,
                    icon: form.icon,
                    durationMin: Number(form.durationMin) || 0,
                    bookable: form.bookable,
                    prices: buildPrices(form),
                  })
                }
              />
            </li>
          ) : (
            <li key={s.id} className={`rounded-2xl border-2 border-navy-900 bg-white p-4 ${!s.isActive ? "opacity-60" : ""}`}>
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    {s.icon} {s.name} {!s.isActive && <span className="text-xs font-normal text-slate-500">(isključena)</span>}
                  </p>
                  <p className="text-sm text-slate-600">{KIND_LABELS[s.kind as ServiceKind]} · {s.durationMin} min{!s.bookable ? " · samo info" : ""}</p>
                  <p className="mt-1 text-sm text-slate-700">
                    {s.prices.length === 0
                      ? "Bez cene"
                      : s.prices.map((p) => `${vehicleTypeById.get(p.vehicleTypeId)?.label ?? "?"} ${formatRsd(p.priceRsd)}`).join(" · ")}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Toggle
                    checked={s.isActive}
                    disabled={pending}
                    label={s.isActive ? "Isključi uslugu" : "Uključi uslugu"}
                    onChange={(v) =>
                      startTransition(async () => {
                        await setServiceActiveAction({ slug, serviceId: s.id, isActive: v });
                        router.refresh();
                      })
                    }
                  />
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <div className="flex gap-1">
                  <button type="button" disabled={idx === 0 || pending} onClick={() => startTransition(async () => { await moveServiceAction({ slug, serviceId: s.id, direction: "up" }); router.refresh(); })} className="rounded-lg border border-slate-200 px-2 py-1 text-xs disabled:opacity-30">
                    ↑
                  </button>
                  <button type="button" disabled={idx === services.length - 1 || pending} onClick={() => startTransition(async () => { await moveServiceAction({ slug, serviceId: s.id, direction: "down" }); router.refresh(); })} className="rounded-lg border border-slate-200 px-2 py-1 text-xs disabled:opacity-30">
                    ↓
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => setEditingId(s.id)} className={secondaryButton}>
                    Izmeni
                  </button>
                  {!s.hasBookings && (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        startTransition(async () => {
                          const r = await deleteServiceAction({ slug, serviceId: s.id });
                          if (!r.ok) toast(r.reason === "has_bookings" ? "Usluga ima zakazane termine, može se samo isključiti." : "Brisanje nije uspelo.", "error");
                          router.refresh();
                        })
                      }
                      className="rounded-xl border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 disabled:opacity-50"
                    >
                      Obriši
                    </button>
                  )}
                </div>
              </div>
            </li>
          ),
        )}
      </ul>

      {adding ? (
        <ServiceForm
          slug={slug}
          initial={emptyForm()}
          vehicleTypes={vehicleTypes}
          submitLabel="Dodaj uslugu"
          onCancel={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            toast("Dodato.");
            router.refresh();
          }}
          submit={(slug, form) =>
            createServiceAction({
              slug,
              kind: form.kind,
              name: form.name,
              description: form.description,
              icon: form.icon,
              durationMin: Number(form.durationMin) || 0,
              bookable: form.bookable,
              prices: buildPrices(form),
            })
          }
        />
      ) : (
        <button type="button" onClick={() => setAdding(true)} className={primaryButton}>
          + Dodaj uslugu
        </button>
      )}
    </div>
  );
}
