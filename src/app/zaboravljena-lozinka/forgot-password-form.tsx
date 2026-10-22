"use client";

import Link from "next/link";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    // Same response whether or not the email exists — don't leak which accounts are registered.
    await authClient.requestPasswordReset({ email: email.trim(), redirectTo: "/resetuj-lozinku" });
    setPending(false);
    setSent(true);
  }

  if (sent) {
    return (
      <div className="rounded-2xl border-2 border-navy-900 bg-white p-5 text-center">
        <p className="text-sm text-slate-700">
          Ako nalog sa adresom <span className="font-semibold text-slate-900">{email}</span> postoji, poslali smo link za resetovanje lozinke.
        </p>
        <Link href="/prijava" className="mt-4 inline-block text-sm font-semibold text-navy-700 underline">
          Nazad na prijavu
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 rounded-2xl border-2 border-navy-900 bg-white p-5">
      <label className="block">
        <span className="text-sm font-semibold text-slate-700">Email</span>
        <input
          type="email"
          autoComplete="username"
          inputMode="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-3 text-base outline-none focus:border-navy-700 focus:ring-2 focus:ring-navy-700/20"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="mt-1 rounded-xl bg-navy-900 px-4 py-3.5 text-base font-bold text-white active:scale-[0.98] disabled:opacity-60"
      >
        {pending ? "Šaljem…" : "Pošalji link"}
      </button>
      <Link href="/prijava" className="text-center text-sm font-semibold text-navy-700 underline">
        Nazad na prijavu
      </Link>
    </form>
  );
}
