"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteExceptionAction, upsertExceptionAction } from "@/app/admin/[slug]/podesavanja/actions";
import { useToast } from "@/components/ui/toast";
import { ToggleRow } from "@/components/ui/toggle";
import { input, primaryButton, secondaryButton } from "./ui";

export interface ExceptionRow {
  id: string;
  date: string;
  closed: boolean;
  opensAt: string | null;
  closesAt: string | null;
  note: string | null;
}

export function ExceptionsEditor({ slug, exceptions, today }: { slug: string; exceptions: ExceptionRow[]; today: string }) {
  const router = useRouter();
  const toast = useToast();
  const [date, setDate] = useState(today);
  const [closed, setClosed] = useState(true);
  const [opensAt, setOpensAt] = useState("08:00");
  const [closesAt, setClosesAt] = useState("17:00");
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const r = await upsertExceptionAction({ slug, date, closed, opensAt: closed ? undefined : opensAt, closesAt: closed ? undefined : closesAt, note });
      if (!r.ok) {
        toast(r.error, "error");
        return;
      }
      toast("Sačuvano.");
      setNote("");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={submit} className="flex flex-col gap-3 rounded-2xl border-2 border-navy-900 bg-white p-4">
        <label className="block">
          <span className="text-sm font-semibold text-slate-700">Datum</span>
          <input type="date" min={today} required className={`${input} mt-1.5`} value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <ToggleRow title="Radnja ne radi tog dana" checked={closed} onChange={setClosed} />
        {!closed && (
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-sm font-semibold text-slate-700">Od</span>
              <input type="time" step={300} className={`${input} mt-1.5`} value={opensAt} onChange={(e) => setOpensAt(e.target.value)} />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-slate-700">Do</span>
              <input type="time" step={300} className={`${input} mt-1.5`} value={closesAt} onChange={(e) => setClosesAt(e.target.value)} />
            </label>
          </div>
        )}
        <label className="block">
          <span className="text-sm font-semibold text-slate-700">Napomena (npr. „Dan primirja“)</span>
          <input className={`${input} mt-1.5`} maxLength={120} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        <button type="submit" disabled={pending} className={primaryButton}>
          {pending ? "Čuvam…" : "Sačuvaj izuzetak"}
        </button>
      </form>

      {exceptions.length === 0 ? (
        <p className="px-1 text-sm text-slate-500">Nema predstojećih praznika ili posebnog radnog vremena.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {exceptions.map((ex) => (
            <li key={ex.id} className="flex items-center gap-3 rounded-2xl border-2 border-navy-900 bg-white p-4">
              <div className="min-w-0 flex-1">
                <p className="font-mono font-bold">{ex.date}</p>
                <p className="truncate text-sm text-slate-600">
                  {ex.closed ? "Zatvoreno" : `${ex.opensAt?.slice(0, 5)}–${ex.closesAt?.slice(0, 5)}`}
                  {ex.note ? ` · ${ex.note}` : ""}
                </p>
              </div>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    await deleteExceptionAction({ slug, id: ex.id });
                    toast("Uklonjeno.");
                    router.refresh();
                  })
                }
                className={secondaryButton}
              >
                Ukloni
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
