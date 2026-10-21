import Link from "next/link";

export function SubpageHeader({ base, title, description }: { base: string; title: string; description?: string }) {
  return (
    <div className="px-1">
      <Link href={`${base}/podesavanja`} className="inline-flex items-center gap-1 text-sm font-semibold text-navy-700 active:opacity-60 md:hidden">
        <span aria-hidden>‹</span> Podešavanja
      </Link>
      <h1 className="mt-1 font-mono text-xl font-bold">{title}</h1>
      {description && <p className="text-sm text-slate-600">{description}</p>}
    </div>
  );
}
