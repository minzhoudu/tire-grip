"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addHolidaysAction } from "@/app/admin/[slug]/podesavanja/actions";
import { InlineSpinner } from "@/components/ui/busy";
import { useToast } from "@/components/ui/toast";
import { primaryButton, secondaryButton } from "./ui";

export interface HolidayOption {
  date: string;
  /** e.g. "sreda 11.11." */
  label: string;
  name: string;
  /** The shop already has an exception (closed or custom hours) on this date. */
  added: boolean;
}

/** One tap to close on Serbia's public holidays; each can be unticked for days the shop works anyway. */
export function HolidayPresets({ slug, holidays }: { slug: string; holidays: HolidayOption[] }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const notAdded = holidays.filter((h) => !h.added);
  const [picked, setPicked] = useState<Set<string>>(() => new Set(notAdded.map((h) => h.date)));
  const [warning, setWarning] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();

  function toggle(date: string) {
    setPicked((p) => {
      const next = new Set(p);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  }

  function add() {
    const dates = notAdded.filter((h) => picked.has(h.date)).map((h) => h.date);
    startTransition(async () => {
      const r = await addHolidaysAction({ slug, dates });
      if (!r.ok) {
        toast("Dodavanje nije uspelo.", "error");
        return;
      }
      toast(r.added === 1 ? "Dodat 1 praznik." : `Dodato praznika: ${r.added}.`);
      setWarning(r.datesWithBookings.map((d) => holidays.find((h) => h.date === d)?.label ?? d));
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="rounded-2xl border-2 border-navy-900 bg-white p-4">
      <div className="flex items-start gap-3">
        <span className="text-2xl" aria-hidden>
          📅
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Državni praznici</p>
          <p className="text-sm text-slate-600">
            {notAdded.length === 0
              ? "Svi praznici za narednih 12 meseci su već dodati."
              : `Zatvorite radnju za ${notAdded.length} ${notAdded.length === 1 ? "praznik" : "praznika"} u narednih 12 meseci jednim dodirom.`}
          </p>
        </div>
      </div>

      {warning.length > 0 && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          ⚠️ Neki praznici već imaju zakazane termine. Oni nisu otkazani, javite se tim kupcima. Dani: {warning.join(", ")}
        </p>
      )}

      {notAdded.length > 0 && !open && (
        <button type="button" onClick={() => setOpen(true)} className={`mt-3 w-full ${primaryButton}`}>
          Dodaj državne praznike
        </button>
      )}

      {open && (
        <div className="mt-3">
          <p className="text-xs text-slate-500">Isključite dane kada ipak radite.</p>
          <ul className="mt-2 flex flex-col gap-1">
            {holidays.map((h) => (
              <li key={h.date}>
                <label className={`flex items-center gap-3 rounded-xl px-3 py-2 ${h.added ? "opacity-50" : "active:bg-slate-50"}`}>
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    disabled={h.added || pending}
                    checked={h.added || picked.has(h.date)}
                    onChange={() => toggle(h.date)}
                  />
                  <span className="w-24 shrink-0 font-mono text-sm">{h.label}</span>
                  <span className="min-w-0 flex-1 text-sm">
                    {h.name}
                    {h.added && <span className="text-slate-500"> (već dodato)</span>}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex gap-2">
            <button type="button" disabled={pending} onClick={() => setOpen(false)} className={`flex-1 ${secondaryButton} py-3`}>
              Otkaži
            </button>
            <button
              type="button"
              disabled={pending || picked.size === 0}
              onClick={add}
              className={`flex flex-1 items-center justify-center gap-1.5 ${primaryButton}`}
            >
              {pending ? (
                <>
                  <InlineSpinner />
                  Dodajem…
                </>
              ) : (
                `Dodaj izabrane (${notAdded.filter((h) => picked.has(h.date)).length})`
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
