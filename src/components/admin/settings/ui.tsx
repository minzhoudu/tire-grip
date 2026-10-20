/** Shared styling bits for the settings forms, matching the rest of the admin panel. */
export const input =
  "w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-base outline-none focus:border-navy-700 focus:ring-2 focus:ring-navy-700/20";

export const primaryButton = "rounded-xl bg-navy-900 px-4 py-3.5 font-bold text-white active:scale-[0.98] disabled:opacity-60";

export const secondaryButton = "rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50";

export function resultBanner(ok: boolean, text: string) {
  return <p className={`rounded-lg px-3 py-2 text-sm ${ok ? "bg-emerald-50 text-emerald-900" : "bg-red-50 text-red-800"}`}>{text}</p>;
}
