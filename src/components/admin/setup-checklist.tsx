import Link from "next/link";
import type { SetupChecklist } from "@/server/settings";

const STEPS: { key: keyof SetupChecklist; label: string; path: string }[] = [
  { key: "radnoVreme", label: "Radno vreme", path: "/podesavanja/radno-vreme" },
  { key: "vrsteVozila", label: "Vrste vozila", path: "/podesavanja/vrste-vozila" },
  { key: "uslugeICene", label: "Usluge i cene", path: "/podesavanja/usluge" },
];

/** Shown on the Zahtevi page until all 3 are done — in the order they actually depend on each other. */
export function SetupChecklistCard({ checklist, base }: { checklist: SetupChecklist; base: string }) {
  if (STEPS.every((s) => checklist[s.key])) return null;

  return (
    <div className="rounded-2xl border-2 border-amber-400 bg-amber-50 p-4">
      <p className="font-mono font-bold text-amber-900">⚠️ Radnja još nije spremna za kupce</p>
      <p className="mt-1 text-sm text-amber-800">Dovršite ovo da bi kupci mogli da zakažu termin:</p>
      <ul className="mt-3 flex flex-col gap-2">
        {STEPS.map((s, i) => {
          const done = checklist[s.key];
          return (
            <li key={s.key}>
              <Link
                href={`${base}${s.path}`}
                className={`flex items-center gap-2.5 rounded-xl border-2 p-3 text-sm font-semibold ${
                  done ? "border-emerald-200 bg-white text-emerald-800" : "border-amber-300 bg-white text-amber-900 active:bg-amber-50"
                }`}
              >
                <span aria-hidden>{done ? "✅" : `${i + 1}️⃣`}</span>
                {s.label}
                {!done && <span aria-hidden className="ml-auto text-amber-400">›</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
