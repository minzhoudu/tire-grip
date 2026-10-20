import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Tire Grip — zakazivanje za vulkanizere",
  description: "Kupci zakazuju zamenu guma sami, bez zvanja. Vi samo potvrdite termin.",
};

const STEPS = [
  { icon: "🔗", title: "Dobijete svoj link", text: "tiregrip.rs/vasa-radnja — podelite ga na WhatsApp, Instagram, Google profil radnje." },
  { icon: "💬", title: "Kupac zakazuje sam", text: "Bira uslugu, vozilo i slobodan termin kroz kratak chat na telefonu. Bez zvanja, bez čekanja u redu." },
  { icon: "✅", title: "Vi samo potvrdite", text: "Zahtev stiže u panel, potvrdite ga jednim dodirom. Kupac dobija potvrdu na WhatsApp." },
];

export default function LandingPage() {
  return (
    <div className="min-h-dvh bg-slate-100">
      <header className="bg-navy-900 px-5 pt-[max(1.5rem,env(safe-area-inset-top))] pb-10 text-white">
        <div className="mx-auto flex max-w-md items-center gap-3">
          <div className="grid size-10 place-items-center rounded-xl bg-accent-500 text-xl" aria-hidden>
            🛞
          </div>
          <p className="font-mono text-lg font-bold">Tire Grip</p>
        </div>
        <div className="mx-auto mt-8 max-w-md">
          <h1 className="font-mono text-3xl leading-tight font-bold">Zakazivanje za vulkanizere, bez telefona koji stalno zvoni.</h1>
          <p className="mt-3 text-slate-300">
            Kupci sami zakažu termin kroz kratak chat na svom telefonu. Vi vidite zahteve u jednom panelu i potvrđujete jednim dodirom.
          </p>
          <Link
            href="/registracija"
            className="mt-6 inline-block rounded-xl border-2 border-white bg-accent-500 px-6 py-3.5 font-mono font-bold text-navy-950 active:scale-[0.98]"
          >
            Registrujte svoju radnju →
          </Link>
        </div>
      </header>
      <div className="hazard-stripe" />

      <main className="mx-auto max-w-md px-5 py-10">
        <h2 className="font-mono text-sm font-bold tracking-wide text-slate-500 uppercase">Kako radi</h2>
        <div className="mt-4 flex flex-col gap-3">
          {STEPS.map((s, i) => (
            <div key={s.title} className="flex gap-3 rounded-2xl border-2 border-navy-900 bg-white p-4">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-navy-900 font-mono text-sm font-bold text-accent-500">
                {i + 1}
              </div>
              <div>
                <p className="font-bold">
                  {s.icon} {s.title}
                </p>
                <p className="mt-1 text-sm text-slate-600">{s.text}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 rounded-2xl border-2 border-navy-900 bg-white p-5 text-center">
          <p className="font-mono text-lg font-bold">Besplatan probni period</p>
          <p className="mt-1 text-sm text-slate-600">Bez kartice. Registrujte radnju, mi je ručno odobrimo i javimo vam se za dalje.</p>
          <Link
            href="/registracija"
            className="mt-4 inline-block rounded-xl border-2 border-navy-900 bg-accent-500 px-6 py-3 font-mono font-bold text-navy-950 active:scale-[0.98]"
          >
            Registruj radnju
          </Link>
        </div>

        <p className="mt-6 text-center text-sm text-slate-500">
          Već imate nalog?{" "}
          <Link href="/prijava" className="font-semibold text-navy-700 underline">
            Prijavite se
          </Link>
        </p>

        {process.env.NODE_ENV !== "production" && (
          <p className="mt-10 text-center">
            <Link href="/brzi-tocak" className="font-semibold text-navy-700 underline">
              Demo radnja: Brzi Točak →
            </Link>
          </p>
        )}
      </main>
    </div>
  );
}
