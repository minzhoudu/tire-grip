"use client";

import { useState, useTransition } from "react";
import { resendVerificationAction } from "../actions";

export function ResendVerification({ email }: { email: string }) {
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <div className="mt-6 flex flex-col items-center gap-2">
      <button
        type="button"
        disabled={pending || sent}
        onClick={() => startTransition(async () => {
          await resendVerificationAction({ email });
          setSent(true);
        })}
        className="rounded-full border-2 border-navy-900 bg-white px-4 py-2 text-sm font-bold disabled:opacity-60"
      >
        {sent ? "Poslato ✓" : pending ? "Šaljem…" : "Pošalji ponovo"}
      </button>
      <p className="text-xs text-slate-500">Niste dobili mejl? Proverite i spam folder.</p>
    </div>
  );
}
