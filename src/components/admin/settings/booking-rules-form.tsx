"use client";

import { useState, useTransition } from "react";
import { updateBookingRulesAction } from "@/app/admin/[slug]/podesavanja/actions";
import { input, primaryButton, resultBanner } from "./ui";

export interface BookingRules {
  bays: number;
  slotStepMin: number;
  bookingHorizonDays: number;
  minNoticeMin: number;
  autoConfirm: boolean;
}

export function BookingRulesForm({ slug, rules }: { slug: string; rules: BookingRules }) {
  const [fields, setFields] = useState(rules);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function num(key: keyof BookingRules) {
    return (e: React.ChangeEvent<HTMLInputElement>) => setFields((f) => ({ ...f, [key]: Number(e.target.value) }));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const r = await updateBookingRulesAction({ slug, ...fields });
      setMessage(r.ok ? { ok: true, text: "Sačuvano." } : { ok: false, text: r.error });
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm">
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-sm font-semibold text-slate-700">Broj dizalica</span>
          <input type="number" min={1} max={20} className={`${input} mt-1.5`} value={fields.bays} onChange={num("bays")} />
        </label>
        <label className="block">
          <span className="text-sm font-semibold text-slate-700">Korak termina (min)</span>
          <input type="number" min={5} max={240} step={5} className={`${input} mt-1.5`} value={fields.slotStepMin} onChange={num("slotStepMin")} />
        </label>
        <label className="block">
          <span className="text-sm font-semibold text-slate-700">Horizont zakazivanja (dana)</span>
          <input
            type="number"
            min={1}
            max={120}
            className={`${input} mt-1.5`}
            value={fields.bookingHorizonDays}
            onChange={num("bookingHorizonDays")}
          />
        </label>
        <label className="block">
          <span className="text-sm font-semibold text-slate-700">Minimalna najava (min)</span>
          <input type="number" min={0} max={2880} step={5} className={`${input} mt-1.5`} value={fields.minNoticeMin} onChange={num("minNoticeMin")} />
        </label>
      </div>
      <label className="flex items-center gap-2.5 rounded-xl bg-slate-50 px-3.5 py-3">
        <input
          type="checkbox"
          className="h-5 w-5"
          checked={fields.autoConfirm}
          onChange={(e) => setFields((f) => ({ ...f, autoConfirm: e.target.checked }))}
        />
        <span className="text-sm font-semibold text-slate-700">Automatski potvrdi nove zahteve (bez čekanja na vas)</span>
      </label>
      {message && resultBanner(message.ok, message.text)}
      <button type="submit" disabled={pending} className={primaryButton}>
        {pending ? "Čuvam…" : "Sačuvaj"}
      </button>
    </form>
  );
}
