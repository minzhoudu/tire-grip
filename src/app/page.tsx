import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Moj Vulkanizer | Zakazivanje za vulkanizere",
  description: "Kupci zakazuju zamenu guma sami, bez zvanja. Vi samo potvrdite termin.",
};

const STEPS = [
  { icon: "🔗", title: "Dobijete svoj link", text: "Vaš link je vasa-radnja.mojvulkanizer.com. Podelite ga na WhatsApp, Instagram i Google profil radnje." },
  { icon: "💬", title: "Kupac zakazuje sam", text: "Bira uslugu, vozilo i slobodan termin kroz kratak chat na telefonu. Bez zvanja, bez čekanja u redu." },
  { icon: "✅", title: "Vi samo potvrdite", text: "Zahtev stiže u panel, potvrdite ga jednim dodirom. Kupac dobija potvrdu na WhatsApp." },
];

export default function LandingPage() {
  return (
    <div className="min-h-dvh bg-slate-100">
      <header className="bg-navy-900 px-5 pt-[max(1.5rem,env(safe-area-inset-top))] pb-10 text-white md:px-10 md:pt-10 md:pb-16">
        <div className="mx-auto max-w-md md:max-w-5xl">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl bg-accent-500 text-xl" aria-hidden>
              🛞
            </div>
            <p className="font-mono text-lg font-bold">Moj Vulkanizer</p>
            <Link href="/vulkanizeri" className="ml-auto rounded-full bg-white/10 px-3.5 py-2 text-sm font-semibold whitespace-nowrap active:bg-white/20">
              🗺️ <span className="sm:hidden">Mapa</span>
              <span className="hidden sm:inline">Pronađi vulkanizera</span>
            </Link>
          </div>
          <div className="mt-8 md:flex md:items-end md:justify-between md:gap-10">
            <div className="md:max-w-xl">
              <h1 className="font-mono text-3xl leading-tight font-bold md:text-5xl">
                Zakazivanje za vulkanizere, bez telefona koji stalno zvoni.
              </h1>
              <p className="mt-3 text-slate-300 md:mt-5 md:text-lg">
                Kupci sami zakažu termin kroz kratak chat na svom telefonu. Vi vidite zahteve u jednom panelu i potvrđujete jednim dodirom.
              </p>
              <Link
                href="/registracija"
                className="mt-6 inline-block rounded-xl border-2 border-white bg-accent-500 px-6 py-3.5 font-mono font-bold text-navy-950 active:scale-[0.98] md:mt-8 md:px-8 md:py-4 md:text-lg"
              >
                Registrujte svoju radnju →
              </Link>
              <p className="mt-4 text-sm text-slate-300">
                Vozite i tražite vulkanizera?{" "}
                <Link href="/vulkanizeri" className="font-semibold text-white underline underline-offset-2">
                  Pogledajte mapu
                </Link>
              </p>
            </div>
            <div className="mt-10 hidden shrink-0 rounded-2xl border-2 border-white/20 bg-white/5 p-6 font-mono text-sm text-slate-300 md:block">
              <p className="text-accent-400">$ kupac otvara link</p>
              <p className="mt-1">→ bira uslugu i termin</p>
              <p className="mt-1">→ vi potvrđujete</p>
              <p className="mt-1 text-accent-400">✓ gotovo, bez zvanja</p>
            </div>
          </div>
        </div>
      </header>
      <div className="hazard-stripe" />

      <main className="mx-auto max-w-md px-5 py-10 md:max-w-5xl md:px-10 md:py-16">
        <h2 className="font-mono text-sm font-bold tracking-wide text-slate-500 uppercase">Kako radi</h2>
        <div className="mt-4 flex flex-col gap-3 md:grid md:grid-cols-3 md:gap-5">
          {STEPS.map((s, i) => (
            <div key={s.title} className="flex gap-3 rounded-2xl border-2 border-navy-900 bg-white p-4 md:flex-col md:gap-2 md:p-5">
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

        <div className="mt-8 rounded-2xl border-2 border-navy-900 bg-white p-5 text-center md:mx-auto md:mt-12 md:max-w-xl md:p-8">
          <p className="font-mono text-lg font-bold md:text-xl">Besplatan probni period</p>
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
      </main>
    </div>
  );
}
