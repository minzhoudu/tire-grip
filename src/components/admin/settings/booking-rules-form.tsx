"use client";

import { useState, useTransition } from "react";
import { updateBookingRulesAction } from "@/app/admin/[slug]/podesavanja/actions";
import { Stepper } from "@/components/ui/stepper";
import { useToast } from "@/components/ui/toast";
import { ToggleRow } from "@/components/ui/toggle";
import { primaryButton } from "./ui";

export interface BookingRules {
  bays: number;
  slotStepMin: number;
  bookingHorizonDays: number;
  minNoticeMin: number;
  autoConfirm: boolean;
}

const FIELDS: { key: keyof Omit<BookingRules, "autoConfirm">; label: string; min: number; max: number; step: number; suffix: string }[] = [
  { key: "bays", label: "Broj boksova", min: 1, max: 20, step: 1, suffix: "" },
  { key: "slotStepMin", label: "Korak termina", min: 5, max: 240, step: 5, suffix: "min" },
  { key: "bookingHorizonDays", label: "Horizont zakazivanja", min: 1, max: 120, step: 1, suffix: "dana" },
  { key: "minNoticeMin", label: "Minimalna najava", min: 0, max: 2880, step: 5, suffix: "min" },
];

export function BookingRulesForm({ slug, rules }: { slug: string; rules: BookingRules }) {
  const toast = useToast();
  const [fields, setFields] = useState(rules);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const r = await updateBookingRulesAction({ slug, ...fields });
      toast(r.ok ? "Sačuvano." : r.error, r.ok ? "success" : "error");
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-2xl border-2 border-navy-900 bg-white p-4">
      {FIELDS.map((f) => (
        <div key={f.key} className="flex items-center justify-between gap-3">
          <span className="text-sm font-semibold text-slate-700">{f.label}</span>
          <Stepper
            label={f.label}
            value={fields[f.key]}
            min={f.min}
            max={f.max}
            step={f.step}
            suffix={f.suffix}
            onChange={(v) => setFields((cur) => ({ ...cur, [f.key]: v }))}
          />
        </div>
      ))}
      <ToggleRow
        title="Automatski potvrdi nove zahteve"
        description="Bez čekanja na vas — termin se odmah potvrđuje"
        checked={fields.autoConfirm}
        onChange={(v) => setFields((f) => ({ ...f, autoConfirm: v }))}
      />
      <button type="submit" disabled={pending} className={primaryButton}>
        {pending ? "Čuvam…" : "Sačuvaj"}
      </button>
    </form>
  );
}
