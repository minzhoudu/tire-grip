"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createBlockAction, deleteBlockAction } from "@/app/admin/[slug]/actions";
import { useToast } from "@/components/ui/toast";

const input =
  "w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-base outline-none focus:border-navy-700 focus:ring-2 focus:ring-navy-700/20";

function BaySelector({ bays, value, onChange }: { bays: number; value: number | null; onChange: (v: number | null) => void }) {
  const options: { value: number | null; label: string }[] = [
    { value: null, label: "Sve" },
    ...Array.from({ length: bays }, (_, i) => ({ value: i + 1, label: `Boks ${i + 1}` })),
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.label}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={`rounded-full border px-4 py-2.5 text-sm font-semibold ${
            value === o.value ? "border-navy-900 bg-navy-900 text-white" : "border-slate-200 bg-slate-100 text-slate-700"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function BlockForm({ slug, bays, today }: { slug: string; bays: number; today: string }) {
  const router = useRouter();
  const toast = useToast();
  const [date, setDate] = useState(today);
  const [from, setFrom] = useState("12:00");
  const [to, setTo] = useState("13:00");
  const [bay, setBay] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [warning, setWarning] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setWarning(null);
    startTransition(async () => {
      const r = await createBlockAction({ slug, date, from, to, bay, reason });
      if (!r.ok) {
        toast(r.error, "error");
        return;
      }
      if (r.overlappingBookings > 0) {
        setWarning(`Pažnja: u tom periodu već ima ${r.overlappingBookings} zakazan(ih) termin(a). Oni nisu pomereni, javite kupcima.`);
      } else {
        toast("Blokirano.");
      }
      setReason("");
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-2xl border-2 border-navy-900 bg-white p-4">
      <label className="block">
        <span className="text-sm font-semibold text-slate-700">Datum</span>
        <input type="date" min={today} required className={`${input} mt-1.5`} value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-sm font-semibold text-slate-700">Od</span>
          <input type="time" step={300} required className={`${input} mt-1.5`} value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="block">
          <span className="text-sm font-semibold text-slate-700">Do</span>
          <input type="time" step={300} required className={`${input} mt-1.5`} value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
      </div>
      {bays > 1 && (
        <div>
          <span className="text-sm font-semibold text-slate-700">Boks</span>
          <div className="mt-1.5">
            <BaySelector bays={bays} value={bay} onChange={setBay} />
          </div>
        </div>
      )}
      <label className="block">
        <span className="text-sm font-semibold text-slate-700">Razlog (vidite samo vi)</span>
        <input className={`${input} mt-1.5`} placeholder="npr. pauza, servis boksa" maxLength={120} value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
      {warning && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{warning}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-xl border-2 border-navy-900 bg-navy-900 px-4 py-3.5 font-mono font-bold text-white active:scale-[0.98] disabled:opacity-60"
      >
        {pending ? "Čuvam…" : "Blokiraj vreme"}
      </button>
    </form>
  );
}

export function BlockList({
  slug,
  blocks,
}: {
  slug: string;
  blocks: { id: string; when: string; bay: string | null; reason: string | null }[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  if (blocks.length === 0) return <p className="px-1 text-sm text-slate-500">Nema predstojećih blokada.</p>;

  return (
    <ul className="flex flex-col gap-2">
      {blocks.map((b) => (
        <li key={b.id} className="flex items-center gap-3 rounded-2xl border-2 border-navy-900 bg-white p-4">
          <div className="min-w-0 flex-1">
            <p className="font-mono font-bold">{b.when}</p>
            <p className="truncate text-sm text-slate-600">{[b.bay, b.reason].filter(Boolean).join(" · ") || "Bez razloga"}</p>
          </div>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await deleteBlockAction({ slug, blockId: b.id });
                toast("Uklonjeno.");
                router.refresh();
              })
            }
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
          >
            Ukloni
          </button>
        </li>
      ))}
    </ul>
  );
}
