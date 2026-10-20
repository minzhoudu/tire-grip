"use client";

import { useState, useTransition } from "react";
import { cancelBookingAction } from "./actions";

export function CancelForm({ id }: { id: string }) {
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (done) {
    return <p className="mt-5 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-900">✅ Termin je otkazan.</p>;
  }

  function submit() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    startTransition(async () => {
      const r = await cancelBookingAction({ id });
      if (r.ok) setDone(true);
      else setError(r.error);
    });
  }

  return (
    <div className="mt-5">
      <button
        type="button"
        disabled={pending}
        onClick={submit}
        className={`w-full rounded-xl border-2 border-red-300 px-4 py-3.5 font-semibold text-red-700 active:scale-[0.98] disabled:opacity-50 ${
          confirming ? "bg-red-50" : "bg-white"
        }`}
      >
        {pending ? "Otkazujem…" : confirming ? "Sigurno? Dodirnite ponovo da otkažete" : "Otkaži termin"}
      </button>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}
