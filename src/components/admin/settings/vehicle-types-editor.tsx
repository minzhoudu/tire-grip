"use client";

import { useRouter } from "next/navigation";
import { useOptimistic, useState, useTransition } from "react";
import {
  createVehicleSubcategoryAction,
  createVehicleTypeAction,
  deleteVehicleTypeAction,
  moveVehicleTypeAction,
  setVehicleTypeActiveAction,
  updateVehicleTypeAction,
} from "@/app/admin/[slug]/podesavanja/actions";
import { BusyOverlay } from "@/components/ui/busy";
import { useToast } from "@/components/ui/toast";
import { Toggle } from "@/components/ui/toggle";
import type { VehicleTypeWithUsage } from "@/server/settings";
import { input, primaryButton, resultBanner, secondaryButton } from "./ui";

/** Labels match the 3 defaults every existing shop already has, so editing one of those shows it as a preset. */
const PRESETS = [
  { label: "Putničko", icon: "🚗" },
  { label: "SUV / džip", icon: "🚙" },
  { label: "Kombi", icon: "🚐" },
  { label: "Pikap", icon: "🛻" },
  { label: "Kamion", icon: "🚚" },
  { label: "Motor", icon: "🏍️" },
  { label: "Skuter", icon: "🛵" },
  { label: "Traktor", icon: "🚜" },
];
const ICONS = [...PRESETS.map((p) => p.icon), "🚌", "🏎️"];
const OTHER = "__other__";

interface FormState {
  choice: string;
  customLabel: string;
  icon: string;
  customIcon: boolean;
}

function presetFor(label: string) {
  return PRESETS.find((p) => p.label === label);
}

function emptyForm(takenLabels: string[]): FormState {
  const first = PRESETS.find((p) => !takenLabels.includes(p.label));
  return first
    ? { choice: first.label, customLabel: "", icon: first.icon, customIcon: false }
    : { choice: OTHER, customLabel: "", icon: "", customIcon: false };
}

function formFromVehicleType(vt: VehicleTypeWithUsage): FormState {
  const icon = vt.icon ?? "";
  const customIcon = icon !== "" && !ICONS.includes(icon);
  return presetFor(vt.label)
    ? { choice: vt.label, customLabel: "", icon, customIcon }
    : { choice: OTHER, customLabel: vt.label, icon, customIcon };
}

function VehicleTypeForm({
  slug,
  initial,
  takenLabels,
  onSaved,
  onCancel,
  submitLabel,
  submit,
}: {
  slug: string;
  initial: FormState;
  /** Presets the shop already has, hidden from the list (except the one being edited). */
  takenLabels: string[];
  onSaved: () => void;
  onCancel?: () => void;
  submitLabel: string;
  submit: (slug: string, values: { label: string; icon: string }) => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const [form, setForm] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const presets = PRESETS.filter((p) => p.label === initial.choice || !takenLabels.includes(p.label));

  function choose(choice: string) {
    const preset = presetFor(choice);
    // A preset brings its own icon; switching to "Drugo" keeps whatever was picked.
    setForm((f) => (preset ? { ...f, choice, icon: preset.icon, customIcon: false } : { ...f, choice }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const label = form.choice === OTHER ? form.customLabel : form.choice;
    startTransition(async () => {
      const r = await submit(slug, { label, icon: form.icon });
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
        <span className="text-sm font-semibold text-slate-700">Vrsta vozila</span>
        <select className={`${input} mt-1.5`} value={form.choice} onChange={(e) => choose(e.target.value)}>
          {presets.map((p) => (
            <option key={p.label} value={p.label}>
              {p.icon} {p.label}
            </option>
          ))}
          <option value={OTHER}>Drugo (upišite naziv)</option>
        </select>
      </label>

      {form.choice === OTHER && (
        <label className="block">
          <span className="text-sm font-semibold text-slate-700">Naziv</span>
          <input
            className={`${input} mt-1.5`}
            placeholder="npr. Autobus"
            autoFocus
            value={form.customLabel}
            onChange={(e) => setForm((f) => ({ ...f, customLabel: e.target.value }))}
          />
        </label>
      )}

      <div>
        <span className="text-sm font-semibold text-slate-700">Ikonica</span>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {ICONS.map((icon) => {
            const selected = !form.customIcon && form.icon === icon;
            return (
              <button
                key={icon}
                type="button"
                aria-label={`Ikonica ${icon}`}
                aria-pressed={selected}
                onClick={() => setForm((f) => ({ ...f, icon, customIcon: false }))}
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
              placeholder="🚘"
              aria-label="Svoja ikonica"
              autoFocus
              value={form.icon}
              onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))}
            />
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

export function VehicleTypesEditor({ slug, vehicleTypes }: { slug: string; vehicleTypes: VehicleTypeWithUsage[] }) {
  const router = useRouter();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const tops = vehicleTypes.filter((vt) => vt.parentId === null);
  const takenLabels = tops.map((vt) => vt.label);
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
        {tops.map((vt, idx) =>
          editingId === vt.id ? (
            <li key={vt.id} className="rounded-2xl border-2 border-navy-900 bg-white p-2">
              <VehicleTypeForm
                slug={slug}
                initial={formFromVehicleType(vt)}
                takenLabels={takenLabels}
                submitLabel="Sačuvaj izmene"
                onCancel={() => setEditingId(null)}
                onSaved={() => {
                  setEditingId(null);
                  toast("Sačuvano.");
                  router.refresh();
                }}
                submit={(slug, values) => updateVehicleTypeAction({ slug, vehicleTypeId: vt.id, ...values })}
              />
            </li>
          ) : (
            <li key={vt.id} className="relative rounded-2xl border-2 border-navy-900 bg-white p-4">
              {pending && busy?.id === vt.id && <BusyOverlay label={busy.label} />}
              <div className={`flex items-start gap-3 ${!(activeOverride[vt.id] ?? vt.isActive) ? "opacity-60" : ""}`}>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    {vt.icon} {vt.label}{" "}
                    {!(activeOverride[vt.id] ?? vt.isActive) && <span className="text-xs font-normal text-slate-500">(isključeno)</span>}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Toggle
                    checked={activeOverride[vt.id] ?? vt.isActive}
                    disabled={pending}
                    label={(activeOverride[vt.id] ?? vt.isActive) ? "Isključi vrstu vozila" : "Uključi vrstu vozila"}
                    onChange={(v) =>
                      startTransition(async () => {
                        setActiveOverride([vt.id, v]);
                        await setVehicleTypeActiveAction({ slug, vehicleTypeId: vt.id, isActive: v });
                        router.refresh();
                      })
                    }
                  />
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <div className="flex gap-1">
                  <button
                    type="button"
                    disabled={idx === 0 || pending}
                    onClick={() => rowAction(vt.id, "Pomeram…", () => moveVehicleTypeAction({ slug, vehicleTypeId: vt.id, direction: "up" }))}
                    className="rounded-lg border border-slate-200 px-2 py-1 text-xs disabled:opacity-30"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    disabled={idx === tops.length - 1 || pending}
                    onClick={() => rowAction(vt.id, "Pomeram…", () => moveVehicleTypeAction({ slug, vehicleTypeId: vt.id, direction: "down" }))}
                    className="rounded-lg border border-slate-200 px-2 py-1 text-xs disabled:opacity-30"
                  >
                    ↓
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => setEditingId(vt.id)} className={secondaryButton}>
                    Izmeni
                  </button>
                  {!vt.hasBookings && (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        rowAction(vt.id, "Brišem…", async () => {
                          const r = await deleteVehicleTypeAction({ slug, vehicleTypeId: vt.id });
                          if (!r.ok) toast(r.reason === "has_bookings" ? "Vrsta vozila ima zakazane termine, može se samo isključiti." : "Brisanje nije uspelo.", "error");
                        })
                      }
                      className="rounded-xl border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 disabled:opacity-50"
                    >
                      Obriši
                    </button>
                  )}
                </div>
              </div>
              <Subcategories slug={slug} parent={vt} subcategories={vehicleTypes.filter((c) => c.parentId === vt.id)} />
            </li>
          ),
        )}
      </ul>

      {adding ? (
        <VehicleTypeForm
          slug={slug}
          initial={emptyForm(takenLabels)}
          takenLabels={takenLabels}
          submitLabel="Dodaj vrstu vozila"
          onCancel={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            toast("Dodato.");
            router.refresh();
          }}
          submit={(slug, values) => createVehicleTypeAction({ slug, ...values })}
        />
      ) : (
        <button type="button" onClick={() => setAdding(true)} className={primaryButton}>
          + Dodaj vrstu vozila
        </button>
      )}
    </div>
  );
}

/**
 * Optional subcategories of one vehicle type, for when the price depends on more than the type
 * (e.g. "Kamion stočar" by number of floors). With subcategories, prices are set per subcategory
 * and customers pick one after tapping the vehicle.
 */
function Subcategories({ slug, parent, subcategories }: { slug: string; parent: VehicleTypeWithUsage; subcategories: VehicleTypeWithUsage[] }) {
  const router = useRouter();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [editing, setEditing] = useState<{ id: string; label: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<unknown>) {
    startTransition(async () => {
      await action();
      router.refresh();
    });
  }

  function add(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const r = await createVehicleSubcategoryAction({ slug, parentId: parent.id, label });
      if (!r.ok) return setError(r.error);
      setLabel("");
      toast(
        r.movedPrices
          ? `Dodato. Dosadašnje cene za „${parent.label}“ važe za „${label.trim()}“. Za ostale podkategorije upišite cene u Usluge i cene.`
          : "Dodato.",
      );
      router.refresh();
    });
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setError(null);
    startTransition(async () => {
      const r = await updateVehicleTypeAction({ slug, vehicleTypeId: editing.id, label: editing.label, icon: "" });
      if (!r.ok) return setError(r.error);
      setEditing(null);
      router.refresh();
    });
  }

  if (subcategories.length === 0 && !adding) {
    return (
      <button type="button" onClick={() => setAdding(true)} className="mt-3 text-left text-sm font-semibold text-navy-700">
        + Podkategorije{" "}
        <span className="font-normal text-slate-500">(ako cena zavisi od još nečega, npr. broja spratova)</span>
      </button>
    );
  }

  return (
    <div className="mt-3 rounded-xl bg-slate-50 p-3">
      <p className="text-sm font-semibold text-slate-700">Podkategorije</p>
      <p className="text-xs text-slate-500">Kupac posle „{parent.label}“ bira jednu od ovih. Cene se upisuju po podkategoriji u Usluge i cene.</p>
      <ul className="mt-2 flex flex-col gap-1.5">
        {subcategories.map((sub, idx) =>
          editing?.id === sub.id ? (
            <li key={sub.id}>
              <form onSubmit={save} className="flex gap-2">
                <input
                  className={`${input} py-2`}
                  autoFocus
                  aria-label="Naziv podkategorije"
                  value={editing.label}
                  onChange={(e) => setEditing({ id: sub.id, label: e.target.value })}
                />
                <button type="submit" disabled={pending} className="shrink-0 rounded-xl bg-navy-900 px-3 text-sm font-bold text-white disabled:opacity-60">
                  Sačuvaj
                </button>
                <button type="button" onClick={() => setEditing(null)} className="shrink-0 px-1 text-sm text-slate-500">
                  Otkaži
                </button>
              </form>
            </li>
          ) : (
            <li key={sub.id} className={`flex items-center gap-2 rounded-lg bg-white px-3 py-2 ${sub.isActive ? "" : "opacity-60"}`}>
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                {sub.label} {!sub.isActive && <span className="text-xs font-normal text-slate-500">(isključeno)</span>}
              </span>
              <button
                type="button"
                aria-label="Pomeri gore"
                disabled={idx === 0 || pending}
                onClick={() => run(() => moveVehicleTypeAction({ slug, vehicleTypeId: sub.id, direction: "up" }))}
                className="rounded-lg border border-slate-200 px-2 py-1 text-xs disabled:opacity-30"
              >
                ↑
              </button>
              <button
                type="button"
                aria-label="Pomeri dole"
                disabled={idx === subcategories.length - 1 || pending}
                onClick={() => run(() => moveVehicleTypeAction({ slug, vehicleTypeId: sub.id, direction: "down" }))}
                className="rounded-lg border border-slate-200 px-2 py-1 text-xs disabled:opacity-30"
              >
                ↓
              </button>
              <Toggle
                checked={sub.isActive}
                disabled={pending}
                label={sub.isActive ? "Isključi podkategoriju" : "Uključi podkategoriju"}
                onChange={(v) => run(() => setVehicleTypeActiveAction({ slug, vehicleTypeId: sub.id, isActive: v }))}
              />
              <button type="button" onClick={() => setEditing({ id: sub.id, label: sub.label })} className="text-xs font-semibold text-navy-700">
                Izmeni
              </button>
              {!sub.hasBookings && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    run(async () => {
                      const r = await deleteVehicleTypeAction({ slug, vehicleTypeId: sub.id });
                      if (!r.ok) toast(r.reason === "has_bookings" ? "Podkategorija ima zakazane termine, može se samo isključiti." : "Brisanje nije uspelo.", "error");
                    })
                  }
                  className="text-xs font-semibold text-red-700 disabled:opacity-50"
                >
                  Obriši
                </button>
              )}
            </li>
          ),
        )}
      </ul>
      {adding || subcategories.length === 0 ? (
        <form onSubmit={add} className="mt-2 flex gap-2">
          <input
            className={`${input} py-2`}
            autoFocus
            placeholder="npr. 2 sprata"
            aria-label="Nova podkategorija"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
          <button type="submit" disabled={pending || !label.trim()} className="shrink-0 rounded-xl bg-navy-900 px-3 text-sm font-bold text-white disabled:opacity-60">
            Dodaj
          </button>
          <button
            type="button"
            onClick={() => {
              setAdding(false);
              setLabel("");
              setError(null);
            }}
            className="shrink-0 px-1 text-sm text-slate-500"
          >
            Otkaži
          </button>
        </form>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="mt-2 text-sm font-semibold text-navy-700">
          + Dodaj podkategoriju
        </button>
      )}
      {error && <div className="mt-2">{resultBanner(false, error)}</div>}
    </div>
  );
}
