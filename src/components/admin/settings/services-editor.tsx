"use client";

import { useRouter } from "next/navigation";
import { useOptimistic, useState, useTransition } from "react";
import {
  createServiceAction,
  deleteServiceAction,
  moveServiceAction,
  setServiceActiveAction,
  updateServiceAction,
} from "@/app/admin/[slug]/podesavanja/actions";
import { formatRsd } from "@/lib/availability/labels";
import { BusyOverlay } from "@/components/ui/busy";
import { useToast } from "@/components/ui/toast";
import { Toggle, ToggleRow } from "@/components/ui/toggle";
import type { ServiceKind, ServiceWithPrices, VehicleTypeWithUsage } from "@/server/settings";
import { input, primaryButton, resultBanner, secondaryButton } from "./ui";

/** Picking a kind pre-fills the name and icon from here ("Drugo" leaves both to the owner). */
const KIND_PRESETS: Record<ServiceKind, { label: string; name: string; icon: string }> = {
  seasonal_swap: { label: "Zamena guma (sezonska)", name: "Zamena guma", icon: "🔄" },
  mount_balance: { label: "Montaža + balansiranje", name: "Montaža + balansiranje", icon: "🛞" },
  new_tires: { label: "Nove gume", name: "Nove gume", icon: "🆕" },
  repair: { label: "Popravka gume", name: "Popravka gume", icon: "🔧" },
  storage: { label: "Čuvanje guma", name: "Čuvanje guma", icon: "📦" },
  other: { label: "Drugo", name: "", icon: "" },
};
const KINDS = Object.keys(KIND_PRESETS) as ServiceKind[];
const ICONS = ["🔄", "🛞", "🔧", "📦", "🆕", "⚙️", "💧", "🧽", "✨"];

interface PriceField {
  enabled: boolean;
  priceRsd: string;
  durationMin: string;
}

interface FormState {
  kind: ServiceKind;
  name: string;
  icon: string;
  /** "Svoja" is selected: the icon comes from the text field, not the chips */
  customIcon: boolean;
  description: string;
  durationMin: string;
  bookable: boolean;
  prices: Record<string, PriceField>;
}

/** Starts on the first kind the shop doesn't offer yet, with its name and icon already filled in. */
function emptyForm(takenKinds: string[]): FormState {
  const kind = KINDS.find((k) => k !== "other" && !takenKinds.includes(k)) ?? "other";
  return {
    kind,
    name: KIND_PRESETS[kind].name,
    icon: KIND_PRESETS[kind].icon,
    customIcon: false,
    description: "",
    durationMin: "30",
    bookable: true,
    prices: {},
  };
}

function formFromService(s: ServiceWithPrices): FormState {
  const prices: Record<string, PriceField> = {};
  for (const p of s.prices) prices[p.vehicleTypeId] = { enabled: true, priceRsd: String(p.priceRsd), durationMin: p.durationMin ? String(p.durationMin) : "" };
  const icon = s.icon ?? "";
  return {
    kind: s.kind as ServiceKind,
    name: s.name,
    icon,
    customIcon: icon !== "" && !ICONS.includes(icon),
    description: s.description ?? "",
    durationMin: String(s.durationMin),
    bookable: s.bookable,
    prices,
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

function Note({ children }: { children: React.ReactNode }) {
  return <span className="mt-1 block text-xs text-slate-500">{children}</span>;
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

  /** Swaps in the new kind's name/icon, unless the owner already typed their own (only the previous default gets replaced). */
  function chooseKind(kind: ServiceKind) {
    setForm((f) => {
      const prev = KIND_PRESETS[f.kind];
      const next = KIND_PRESETS[kind];
      const name = f.name.trim() === "" || f.name === prev.name ? next.name : f.name;
      const keepIcon = f.customIcon || (f.icon !== "" && f.icon !== prev.icon);
      return { ...f, kind, name, icon: keepIcon ? f.icon : next.icon };
    });
  }

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
      <label className="block">
        <span className="text-sm font-semibold text-slate-700">Vrsta usluge</span>
        <select className={`${input} mt-1.5`} value={form.kind} onChange={(e) => chooseKind(e.target.value as ServiceKind)}>
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {KIND_PRESETS[k].icon} {KIND_PRESETS[k].label}
            </option>
          ))}
        </select>
        <Note>
          Popunjava naziv i ikonicu umesto vas. Kod „Zamena guma (sezonska)“ kupac može i da se prijavi za podsetnik pred sledeću sezonu,
          pa ga kasnije možete obavestiti iz Podsetnika. Za sve ostalo izaberite „Drugo“.
        </Note>
      </label>
      <label className="block">
        <span className="text-sm font-semibold text-slate-700">Naziv</span>
        <input
          className={`${input} mt-1.5`}
          placeholder={form.kind === "other" ? "npr. Pranje vozila" : "npr. Zamena guma"}
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        />
        <Note>Ovako kupci vide uslugu u chatu, cenovniku i WhatsApp porukama. Možete ga promeniti.</Note>
      </label>
      <div>
        <span className="text-sm font-semibold text-slate-700">Ikonica (opciono)</span>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {ICONS.map((icon) => {
            const selected = !form.customIcon && form.icon === icon;
            return (
              <button
                key={icon}
                type="button"
                aria-label={`Ikonica ${icon}`}
                aria-pressed={selected}
                onClick={() => setForm((f) => ({ ...f, icon: selected ? "" : icon, customIcon: false }))}
                className={`grid size-11 place-items-center rounded-xl border-2 text-xl ${
                  selected ? "border-navy-900 bg-accent-500" : "border-slate-200 bg-white"
                }`}
              >
                {icon}
              </button>
            );
          })}
          <button
            type="button"
            aria-pressed={form.customIcon}
            onClick={() => setForm((f) => ({ ...f, icon: f.customIcon ? f.icon : "", customIcon: true }))}
            className={`h-11 rounded-xl border-2 px-3 text-sm font-semibold ${
              form.customIcon ? "border-navy-900 bg-accent-500 text-navy-950" : "border-slate-200 bg-white text-slate-700"
            }`}
          >
            Svoja
          </button>
        </div>
        {form.customIcon && (
          <div className="mt-2 w-24">
            <input
              className={`${input} text-center text-xl`}
              maxLength={8}
              placeholder="🚿"
              aria-label="Svoja ikonica"
              autoFocus
              value={form.icon}
              onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))}
            />
          </div>
        )}
        <Note>Prikazuje se pored naziva u chatu. Dodirnite izabranu ponovo da je uklonite.</Note>
      </div>
      <label className="block">
        <span className="text-sm font-semibold text-slate-700">Opis (opciono)</span>
        <input
          className={`${input} mt-1.5`}
          maxLength={300}
          placeholder="npr. Sa balansiranjem 4 gume"
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
        />
        <Note>Kratko objašnjenje koje kupac vidi u chatu kad izabere ovu uslugu.</Note>
      </label>
      <label className="block">
        <span className="text-sm font-semibold text-slate-700">Trajanje (u minutima)</span>
        <input type="number" min={5} max={480} className={`${input} mt-1.5`} value={form.durationMin} onChange={(e) => setForm((f) => ({ ...f, durationMin: e.target.value }))} />
        <Note>
          Koliko vam traje ova usluga. Toliko dugo je boks zauzet, pa od ovoga zavisi koje slobodne termine kupci vide. Za pojedine vrste
          vozila može se upisati drugačije trajanje ispod.
        </Note>
      </label>
      <ToggleRow
        title="Kupci mogu da zakažu ovu uslugu"
        description="Kad je isključeno, usluga se vidi samo u cenovniku i ne može da se zakaže."
        checked={form.bookable}
        onChange={(v) => setForm((f) => ({ ...f, bookable: v }))}
      />

      <div>
        <p className="text-sm font-semibold text-slate-700">Cena po tipu vozila</p>
        <p className="mb-1.5 text-xs text-slate-500">
          Označite vozila za koja radite ovu uslugu i upišite cenu u dinarima. Kupac sa neoznačenim vozilom ne može da zakaže ovu uslugu.
          Trajanje upišite samo ako se razlikuje od gornjeg (npr. SUV traje duže).
        </p>
        {pickable.length === 0 ? (
          <p className="rounded-xl bg-white px-3 py-2.5 text-sm text-slate-500">Radnja nema definisane vrste vozila. Dodajte ih u „Vrste vozila".</p>
        ) : (
          <div className="flex flex-col gap-2">
            {pickable.map((vt) => {
              const f = priceField(form, vt.id);
              return (
                <div key={vt.id} className="rounded-xl bg-white px-3 py-2.5">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={f.enabled}
                      onChange={(e) => setForm((form) => ({ ...form, prices: { ...form.prices, [vt.id]: { ...priceField(form, vt.id), enabled: e.target.checked } } }))}
                    />
                    <span className="text-sm font-semibold">
                      {vt.icon} {vt.label}
                    </span>
                  </label>
                  {f.enabled && (
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <label className="block">
                        <span className="text-xs text-slate-500">Cena (din)</span>
                        <input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          placeholder="npr. 1500"
                          className={`${input} mt-1 py-2`}
                          value={f.priceRsd}
                          onChange={(e) => setForm((form) => ({ ...form, prices: { ...form.prices, [vt.id]: { ...priceField(form, vt.id), priceRsd: e.target.value } } }))}
                        />
                      </label>
                      <label className="block">
                        <span className="text-xs text-slate-500">Trajanje (min), opciono</span>
                        <input
                          type="number"
                          inputMode="numeric"
                          min={5}
                          max={480}
                          placeholder={form.durationMin || "30"}
                          className={`${input} mt-1 py-2`}
                          value={f.durationMin}
                          onChange={(e) => setForm((form) => ({ ...form, prices: { ...form.prices, [vt.id]: { ...priceField(form, vt.id), durationMin: e.target.value } } }))}
                        />
                      </label>
                    </div>
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
  // The toggle flips at once; if the save fails it falls back to the server value when the transition ends.
  const [activeOverride, setActiveOverride] = useOptimistic<Record<string, boolean>, [string, boolean]>({}, (cur, [id, v]) => ({ ...cur, [id]: v }));
  const [busy, setBusy] = useState<{ id: string; label: string } | null>(null);

  function rowAction(id: string, label: string, action: () => Promise<unknown>) {
    setBusy({ id, label });
    startTransition(async () => {
      await action();
      router.refresh();
    });
  }

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
            <li key={s.id} className="relative rounded-2xl border-2 border-navy-900 bg-white p-4">
              {pending && busy?.id === s.id && <BusyOverlay label={busy.label} />}
              <div className={`flex items-start gap-3 ${!(activeOverride[s.id] ?? s.isActive) ? "opacity-60" : ""}`}>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    {s.icon} {s.name}{" "}
                    {!(activeOverride[s.id] ?? s.isActive) && <span className="text-xs font-normal text-slate-500">(isključena)</span>}
                  </p>
                  <p className="text-sm text-slate-600">{KIND_PRESETS[s.kind as ServiceKind]?.label} · {s.durationMin} min{!s.bookable ? " · samo info" : ""}</p>
                  <p className="mt-1 text-sm text-slate-700">
                    {s.prices.length === 0
                      ? "Bez cene"
                      : s.prices.map((p) => `${vehicleTypeById.get(p.vehicleTypeId)?.label ?? "?"} ${formatRsd(p.priceRsd)}`).join(" · ")}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Toggle
                    checked={activeOverride[s.id] ?? s.isActive}
                    disabled={pending}
                    label={(activeOverride[s.id] ?? s.isActive) ? "Isključi uslugu" : "Uključi uslugu"}
                    onChange={(v) =>
                      startTransition(async () => {
                        setActiveOverride([s.id, v]);
                        await setServiceActiveAction({ slug, serviceId: s.id, isActive: v });
                        router.refresh();
                      })
                    }
                  />
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <div className="flex gap-1">
                  <button type="button" disabled={idx === 0 || pending} onClick={() => rowAction(s.id, "Pomeram…", () => moveServiceAction({ slug, serviceId: s.id, direction: "up" }))} className="rounded-lg border border-slate-200 px-2 py-1 text-xs disabled:opacity-30">
                    ↑
                  </button>
                  <button type="button" disabled={idx === services.length - 1 || pending} onClick={() => rowAction(s.id, "Pomeram…", () => moveServiceAction({ slug, serviceId: s.id, direction: "down" }))} className="rounded-lg border border-slate-200 px-2 py-1 text-xs disabled:opacity-30">
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
                        rowAction(s.id, "Brišem…", async () => {
                          const r = await deleteServiceAction({ slug, serviceId: s.id });
                          if (!r.ok) toast(r.reason === "has_bookings" ? "Usluga ima zakazane termine, može se samo isključiti." : "Brisanje nije uspelo.", "error");
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
          initial={emptyForm(services.map((s) => s.kind))}
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
