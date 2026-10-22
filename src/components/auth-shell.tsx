import Link from "next/link";
import { toRootUrl } from "@/server/origin";

/**
 * Page frame for the account screens (prijava, registracija, lozinka…). The home link is
 * absolute on a subdomain: there "/" is the platform or a shop's booking chat, not the landing page.
 */
export async function AuthShell({
  title,
  subtitle,
  footer,
  children,
}: {
  title: string;
  subtitle?: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  const homeUrl = await toRootUrl("/");

  return (
    <div className="flex min-h-dvh flex-col bg-slate-100 md:flex-row">
      <aside className="bg-navy-900 text-white md:sticky md:top-0 md:flex md:h-dvh md:w-[42%] md:max-w-xl md:flex-col md:justify-between md:p-12">
        <div className="flex items-center justify-between gap-3 px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-5 md:p-0">
          <Link href={homeUrl} className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-accent-500 text-xl" aria-hidden>
              🛞
            </span>
            <span className="font-mono text-lg font-bold">Moj Vulkanizer</span>
          </Link>
          <Link href={homeUrl} className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold md:hidden">
            ← Početna
          </Link>
        </div>

        <div className="hidden md:block">
          <p className="font-mono text-3xl leading-tight font-bold lg:text-4xl">Zakazivanje za vulkanizere, bez telefona koji stalno zvoni.</p>
          <p className="mt-4 text-lg text-slate-300">Kupci sami zakažu termin, vi potvrdite jednim dodirom.</p>
          <div className="mt-8 rounded-2xl border-2 border-white/20 bg-white/5 p-5 font-mono text-sm text-slate-300">
            <p className="text-accent-400">$ kupac otvara link</p>
            <p className="mt-1">→ bira uslugu i termin</p>
            <p className="mt-1">→ vi potvrđujete</p>
            <p className="mt-1 text-accent-400">✓ gotovo, bez zvanja</p>
          </div>
        </div>

        <Link href={homeUrl} className="hidden text-sm font-semibold text-slate-300 hover:text-white md:block">
          ← Nazad na početnu
        </Link>
      </aside>
      <div className="hazard-stripe md:hidden" />

      <main className="flex flex-1 flex-col px-5 py-8 md:justify-center md:px-12">
        <div className="mx-auto w-full max-w-sm">
          <h1 className="font-mono text-2xl font-bold md:text-3xl">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-slate-600">{subtitle}</p>}
          <div className="mt-6">{children}</div>
          {footer && <div className="mt-6 text-center text-sm text-slate-600">{footer}</div>}
        </div>
      </main>
    </div>
  );
}
