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
import { vehicleTypeLabels } from "@/lib/booking/messages";
import { useToast } from "@/components/ui/toast";
import { Toggle, ToggleRow } from "@/components/ui/toggle";
import type { ServiceKind, ServiceWithPrices } from "@/server/settings";
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
const VEHICLE_TYPES = ["car", "suv", "van"] as const;

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
  prices: Record<(typeof VEHICLE_TYPES)[number], PriceField>;
}

function emptyForm(): FormState {
  return {
    kind: "other",
    name: "",
    icon: "",
    description: "",
    durationMin: "30",
    bookable: true,
    prices: { car: { enabled: true, priceRsd: "", durationMin: "" }, suv: { enabled: false, priceRsd: "", durationMin: "" }, van: { enabled: false, priceRsd: "", durationMin: "" } },
  };
}

function formFromService(s: ServiceWithPrices): FormState {
  const base = emptyForm();
  for (const vt of VEHICLE_TYPES) base.prices[vt] = { enabled: false, priceRsd: "", durationMin: "" };
  for (const p of s.prices) base.prices[p.vehicleType] = { enabled: true, priceRsd: String(p.priceRsd), durationMin: p.durationMin ? String(p.durationMin) : "" };
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

function buildPrices(form: FormState) {
  return VEHICLE_TYPES.filter((vt) => form.prices[vt].enabled).map((vt) => ({
    vehicleType: vt,
    priceRsd: Number(form.prices[vt].priceRsd) || 0,
    durationMin: form.prices[vt].durationMin ? Number(form.prices[vt].durationMin) : null,
  }));
}

function ServiceForm({
  slug,
  initial,
  onSaved,
  onCancel,
  submitLabel,
  submit,
}: {
  slug: string;
  initial: FormState;
  onSaved: () => void;
  onCancel?: () => void;
  submitLabel: string;
  submit: (slug: string, form: FormState) => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const [form, setForm] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

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
        <div className="flex flex-col gap-2">
          {VEHICLE_TYPES.map((vt) => (
            <div key={vt} className="flex items-center gap-2 rounded-xl bg-white px-3 py-2.5">
              <label className="flex w-36 shrink-0 items-center gap-2">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={form.prices[vt].enabled}
                  onChange={(e) => setForm((f) => ({ ...f, prices: { ...f.prices, [vt]: { ...f.prices[vt], enabled: e.target.checked } } }))}
                />
                <span className="text-sm">{vehicleTypeLabels[vt]}</span>
              </label>
              {form.prices[vt].enabled && (
                <>
                  <input
                    type="number"
                    min={0}
                    placeholder="Cena (din)"
                    className={`${input} py-1.5`}
                    value={form.prices[vt].priceRsd}
                    onChange={(e) => setForm((f) => ({ ...f, prices: { ...f.prices, [vt]: { ...f.prices[vt], priceRsd: e.target.value } } }))}
                  />
                  <input
                    type="number"
                    min={5}
                    max={480}
                    placeholder="Trajanje"
                    className={`${input} py-1.5`}
                    value={form.prices[vt].durationMin}
                    onChange={(e) => setForm((f) => ({ ...f, prices: { ...f.prices, [vt]: { ...f.prices[vt], durationMin: e.target.value } } }))}
                  />
                </>
              )}
            </div>
          ))}
        </div>
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

export function ServicesEditor({ slug, services }: { slug: string; services: ServiceWithPrices[] }) {
  const router = useRouter();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        {services.map((s, idx) =>
          editingId === s.id ? (
            <li key={s.id} className="rounded-2xl border-2 border-navy-900 bg-white p-2">
              <ServiceForm
                slug={slug}
                initial={formFromService(s)}
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
                      : s.prices.map((p) => `${vehicleTypeLabels[p.vehicleType]} ${formatRsd(p.priceRsd)}`).join(" · ")}
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
