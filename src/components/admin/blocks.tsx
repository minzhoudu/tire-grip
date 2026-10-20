"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createBlockAction, deleteBlockAction } from "@/app/admin/[slug]/actions";

const input =
  "w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-base outline-none focus:border-navy-700 focus:ring-2 focus:ring-navy-700/20";

export function BlockForm({ slug, bays, today }: { slug: string; bays: number; today: string }) {
  const router = useRouter();
  const [date, setDate] = useState(today);
  const [from, setFrom] = useState("12:00");
  const [to, setTo] = useState("13:00");
  const [bay, setBay] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const r = await createBlockAction({ slug, date, from, to, bay, reason });
      if (!r.ok) {
        setMessage({ ok: false, text: r.error });
        return;
      }
      setMessage({
        ok: true,
        text:
          r.overlappingBookings > 0
            ? `Blokirano. Pažnja: u tom periodu već ima ${r.overlappingBookings} zakazan(ih) termin(a). Oni nisu pomereni, javite kupcima.`
            : "Blokirano.",
      });
      setReason("");
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm">
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
        <label className="block">
          <span className="text-sm font-semibold text-slate-700">Dizalica</span>
          <select
            className={`${input} mt-1.5`}
            value={bay ?? ""}
            onChange={(e) => setBay(e.target.value === "" ? null : Number(e.target.value))}
          >
            <option value="">Sve dizalice (cela radnja)</option>
            {Array.from({ length: bays }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                Dizalica {i + 1}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="block">
        <span className="text-sm font-semibold text-slate-700">Razlog (vidite samo vi)</span>
        <input className={`${input} mt-1.5`} placeholder="npr. pauza, servis dizalice" maxLength={120} value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
      {message && (
        <p className={`rounded-lg px-3 py-2 text-sm ${message.ok ? "bg-emerald-50 text-emerald-900" : "bg-red-50 text-red-800"}`}>{message.text}</p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-navy-900 px-4 py-3.5 font-bold text-white active:scale-[0.98] disabled:opacity-60"
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
  const [pending, startTransition] = useTransition();

  if (blocks.length === 0) return <p className="px-1 text-sm text-slate-500">Nema predstojećih blokada.</p>;

  return (
    <ul className="flex flex-col gap-2">
      {blocks.map((b) => (
        <li key={b.id} className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm">
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{b.when}</p>
            <p className="truncate text-sm text-slate-600">{[b.bay, b.reason].filter(Boolean).join(" · ") || "Bez razloga"}</p>
          </div>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await deleteBlockAction({ slug, blockId: b.id });
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
