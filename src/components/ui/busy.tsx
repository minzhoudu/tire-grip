/** Small spinning wheel for "something is happening" next to a label. */
export function InlineSpinner({ className = "" }: { className?: string }) {
  return (
    <span aria-hidden className={`inline-block animate-spin ${className}`}>
      🛞
    </span>
  );
}

/** Covers a card/row while its own action runs. The parent needs `relative`. */
export function BusyOverlay({ label = "Čuvam…" }: { label?: string }) {
  return (
    <div role="status" className="absolute inset-0 z-10 grid place-items-center rounded-[inherit] bg-white/75">
      <span className="flex items-center gap-2 text-sm font-semibold text-navy-900">
        <InlineSpinner />
        {label}
      </span>
    </div>
  );
}
