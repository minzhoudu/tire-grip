import Link from "next/link";

/** One row in the "Podešavanja" hub — icon, title, a short live summary, and a chevron. */
export function SettingsRow({ href, icon, title, subtitle }: { href: string; icon: string; title: string; subtitle: string }) {
  return (
    <Link href={href} className="flex items-center gap-3 rounded-2xl border-2 border-navy-900 bg-white p-4 active:bg-slate-50">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-navy-900 text-xl text-accent-500">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-slate-900">{title}</p>
        <p className="truncate text-sm text-slate-500">{subtitle}</p>
      </div>
      <span aria-hidden className="shrink-0 text-xl text-slate-300">
        ›
      </span>
    </Link>
  );
}
