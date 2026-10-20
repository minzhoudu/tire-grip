"use client";

/** +/- numeric control, used instead of a raw <input type="number"> for small ranges. */
export function Stepper({
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix,
  label,
}: {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  label?: string;
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  return (
    <div className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-1.5 py-1.5">
      <button
        type="button"
        aria-label={label ? `Smanji ${label}` : "Smanji"}
        disabled={value <= min}
        onClick={() => onChange(clamp(value - step))}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-lg leading-none font-bold text-navy-900 active:bg-slate-100 disabled:opacity-25"
      >
        −
      </button>
      <span className="min-w-0 flex-1 text-center text-base font-bold tabular-nums text-slate-900">
        {value}
        {suffix ? <span className="ml-1 text-xs font-semibold text-slate-400">{suffix}</span> : null}
      </span>
      <button
        type="button"
        aria-label={label ? `Povećaj ${label}` : "Povećaj"}
        disabled={value >= max}
        onClick={() => onChange(clamp(value + step))}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-lg leading-none font-bold text-navy-900 active:bg-slate-100 disabled:opacity-25"
      >
        +
      </button>
    </div>
  );
}
