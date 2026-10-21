"use client";

import { useEffect, useRef, useState } from "react";

export interface MenuItem {
  label: string;
  onClick: () => void;
  variant?: "danger";
  disabled?: boolean;
}

/** Small "⋯" dropdown for secondary actions on a card — closes on an outside click or after picking an item. */
export function Menu({ items }: { items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Više opcija"
        className="grid size-8 place-items-center rounded-full border-2 border-slate-300 text-slate-500 active:scale-95"
      >
        ⋯
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-10 mt-1.5 w-52 overflow-hidden rounded-xl border-2 border-navy-900 bg-white shadow-lg">
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              disabled={it.disabled}
              onClick={() => {
                setOpen(false);
                it.onClick();
              }}
              className={`block w-full px-4 py-2.5 text-left text-sm font-semibold disabled:opacity-50 ${
                it.variant === "danger" ? "text-red-700 hover:bg-red-50" : "text-slate-700 hover:bg-slate-50"
              }`}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
