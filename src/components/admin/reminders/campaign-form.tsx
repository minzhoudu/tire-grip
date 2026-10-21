"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createCampaignAction } from "@/app/admin/[slug]/podsetnici/actions";
import { useToast } from "@/components/ui/toast";
import { DEFAULT_REMINDER_TEMPLATE } from "@/lib/booking/messages";

const input =
  "w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-base outline-none focus:border-navy-700 focus:ring-2 focus:ring-navy-700/20";

const SEASONS = [
  { value: "winter" as const, label: "❄️ Zimske" },
  { value: "summer" as const, label: "☀️ Letnje" },
];

export function CampaignForm({ slug }: { slug: string }) {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState("");
  const [season, setSeason] = useState<"winter" | "summer">("winter");
  const [messageTemplate, setMessageTemplate] = useState(DEFAULT_REMINDER_TEMPLATE);
  const [dailyLimit, setDailyLimit] = useState("20");
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const r = await createCampaignAction({
        slug,
        name,
        season,
        messageTemplate,
        dailyLimit: dailyLimit ? Number(dailyLimit) : null,
      });
      if (!r.ok) {
        toast(r.error, "error");
        return;
      }
      router.push(`/admin/${slug}/podsetnici/${r.id}`);
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-2xl border-2 border-navy-900 bg-white p-4">
      <label className="block">
        <span className="text-sm font-semibold text-slate-700">Naziv kampanje</span>
        <input required className={`${input} mt-1.5`} placeholder="npr. Zimske gume 2026" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <div>
        <span className="text-sm font-semibold text-slate-700">Sezona</span>
        <div className="mt-1.5 flex gap-2">
          {SEASONS.map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => setSeason(s.value)}
              aria-pressed={season === s.value}
              className={`rounded-full border px-4 py-2.5 text-sm font-semibold ${
                season === s.value ? "border-navy-900 bg-navy-900 text-white" : "border-slate-200 bg-slate-100 text-slate-700"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
      <label className="block">
        <span className="text-sm font-semibold text-slate-700">Tekst poruke</span>
        <textarea
          required
          rows={3}
          className={`${input} mt-1.5`}
          value={messageTemplate}
          onChange={(e) => setMessageTemplate(e.target.value)}
        />
        <span className="mt-1 block text-xs text-slate-500">Dostupno: {"{ime}"}, {"{link}"}, {"{radnja}"} — bez vozila, kupac zakazuje za koje želi iz chata.</span>
      </label>
      <label className="block">
        <span className="text-sm font-semibold text-slate-700">Dnevni limit za slanje</span>
        <input
          type="number"
          min={1}
          max={500}
          className={`${input} mt-1.5`}
          value={dailyLimit}
          onChange={(e) => setDailyLimit(e.target.value)}
        />
        <span className="mt-1 block text-xs text-slate-500">Koliko poruka najviše da se prikaže za slanje u jednom danu (da kupci ne navale na termine istog dana).</span>
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-xl border-2 border-navy-900 bg-navy-900 px-4 py-3.5 font-mono font-bold text-white active:scale-[0.98] disabled:opacity-60"
      >
        {pending ? "Čuvam…" : "Napravi kampanju"}
      </button>
    </form>
  );
}
