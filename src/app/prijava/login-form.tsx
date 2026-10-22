"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    // callbackURL only matters if the account isn't verified yet — it's where the re-sent
    // verification link lands after it's clicked (see emailVerification.sendOnSignIn in auth.ts).
    // `next` is already host-aware (/admin on a shop subdomain, /platforma on platform.*).
    const { error } = await authClient.signIn.email({ email: email.trim(), password, rememberMe: true, callbackURL: next });
    if (error) {
      setPending(false);
      setError(
        error.code === "EMAIL_NOT_VERIFIED"
          ? "Niste potvrdili email. Poslali smo vam nov link, proverite inbox (i spam folder)."
          : error.status === 429
            ? "Previše pokušaja. Sačekajte malo pa probajte ponovo."
            : error.status === 401 || error.status === 400
              ? "Pogrešan email ili lozinka."
              : "Prijava nije uspela. Proverite internet vezu i pokušajte ponovo.",
      );
      return;
    }
    router.replace(next);
    router.refresh();
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
      <label className="block">
        <span className="text-sm font-semibold text-slate-700">Lozinka</span>
        <input
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-3 text-base outline-none focus:border-navy-700 focus:ring-2 focus:ring-navy-700/20"
        />
        <Link href="/zaboravljena-lozinka" className="mt-1.5 inline-block text-sm font-semibold text-navy-700 underline">
          Zaboravili ste lozinku?
        </Link>
      </label>
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="mt-1 rounded-xl bg-navy-900 px-4 py-3.5 text-base font-bold text-white active:scale-[0.98] disabled:opacity-60"
      >
        {pending ? "Prijavljujem…" : "Prijavi se"}
      </button>
    </form>
  );
}
