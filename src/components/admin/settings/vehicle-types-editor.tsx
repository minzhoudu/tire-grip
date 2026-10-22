"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  createVehicleTypeAction,
  deleteVehicleTypeAction,
  moveVehicleTypeAction,
  setVehicleTypeActiveAction,
  updateVehicleTypeAction,
} from "@/app/admin/[slug]/podesavanja/actions";
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
  const takenLabels = vehicleTypes.map((vt) => vt.label);

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        {vehicleTypes.map((vt, idx) =>
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
            <li key={vt.id} className={`rounded-2xl border-2 border-navy-900 bg-white p-4 ${!vt.isActive ? "opacity-60" : ""}`}>
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    {vt.icon} {vt.label} {!vt.isActive && <span className="text-xs font-normal text-slate-500">(isključeno)</span>}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Toggle
                    checked={vt.isActive}
                    disabled={pending}
                    label={vt.isActive ? "Isključi vrstu vozila" : "Uključi vrstu vozila"}
                    onChange={(v) =>
                      startTransition(async () => {
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
                    onClick={() => startTransition(async () => { await moveVehicleTypeAction({ slug, vehicleTypeId: vt.id, direction: "up" }); router.refresh(); })}
                    className="rounded-lg border border-slate-200 px-2 py-1 text-xs disabled:opacity-30"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    disabled={idx === vehicleTypes.length - 1 || pending}
                    onClick={() => startTransition(async () => { await moveVehicleTypeAction({ slug, vehicleTypeId: vt.id, direction: "down" }); router.refresh(); })}
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
                        startTransition(async () => {
                          const r = await deleteVehicleTypeAction({ slug, vehicleTypeId: vt.id });
                          if (!r.ok) toast(r.reason === "has_bookings" ? "Vrsta vozila ima zakazane termine, može se samo isključiti." : "Brisanje nije uspelo.", "error");
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
