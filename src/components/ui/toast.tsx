"use client";

/**
 * Lightweight toast/snackbar: floating pill at the bottom, auto-dismisses.
 * Replaces the inline success/error banners that used to push the layout
 * around on every save.
 */
import { createContext, useCallback, useContext, useRef, useState } from "react";

type Variant = "success" | "error";
interface ToastItem {
  id: number;
  text: string;
  variant: Variant;
}

const ToastContext = createContext<{ show: (text: string, variant?: Variant) => void } | null>(null);

const DURATION: Record<Variant, number> = { success: 2600, error: 4500 };

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const show = useCallback((text: string, variant: Variant = "success") => {
    const id = ++nextId.current;
    setToasts((t) => [...t, { id, text, variant }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), DURATION[variant]);
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-[max(1.25rem,env(safe-area-inset-bottom))] z-50 flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`bubble-in pointer-events-auto max-w-sm rounded-full px-4 py-2.5 text-center text-sm font-semibold text-white shadow-lg ${
              t.variant === "success" ? "bg-navy-900" : "bg-red-600"
            }`}
          >
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx.show;
}
