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

interface FormState {
  label: string;
  icon: string;
}

function emptyForm(): FormState {
  return { label: "", icon: "" };
}

function formFromVehicleType(vt: VehicleTypeWithUsage): FormState {
  return { label: vt.label, icon: vt.icon ?? "" };
}

function VehicleTypeForm({
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
          <input className={`${input} mt-1.5`} value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} />
        </label>
        <label className="block">
          <span className="text-sm font-semibold text-slate-700">Ikonica</span>
          <input className={`${input} mt-1.5 text-center`} maxLength={8} value={form.icon} onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))} />
        </label>
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

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        {vehicleTypes.map((vt, idx) =>
          editingId === vt.id ? (
            <li key={vt.id} className="rounded-2xl border-2 border-navy-900 bg-white p-2">
              <VehicleTypeForm
                slug={slug}
                initial={formFromVehicleType(vt)}
                submitLabel="Sačuvaj izmene"
                onCancel={() => setEditingId(null)}
                onSaved={() => {
                  setEditingId(null);
                  toast("Sačuvano.");
                  router.refresh();
                }}
                submit={(slug, form) =>
                  updateVehicleTypeAction({ slug, vehicleTypeId: vt.id, label: form.label, icon: form.icon })
                }
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
          initial={emptyForm()}
          submitLabel="Dodaj vrstu vozila"
          onCancel={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            toast("Dodato.");
            router.refresh();
          }}
          submit={(slug, form) => createVehicleTypeAction({ slug, label: form.label, icon: form.icon })}
        />
      ) : (
        <button type="button" onClick={() => setAdding(true)} className={primaryButton}>
          + Dodaj vrstu vozila
        </button>
      )}
    </div>
  );
}
