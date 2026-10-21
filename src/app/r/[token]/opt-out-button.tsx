"use client";

import { useState, useTransition } from "react";
import { optOutAction } from "./actions";

export function OptOutButton({ token }: { token: string }) {
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  if (done) {
    return <p className="mt-4 text-center text-sm text-slate-500">Odjavljeni ste od podsetnika.</p>;
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(async () => setDone((await optOutAction({ token })).ok))}
      className="mt-4 block w-full text-center text-sm font-medium text-slate-500 underline disabled:opacity-50"
    >
      {pending ? "Odjavljujem…" : "Odjavite me od podsetnika"}
    </button>
  );
}
