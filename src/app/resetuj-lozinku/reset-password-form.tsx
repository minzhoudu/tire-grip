"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Lozinke se ne poklapaju.");
      return;
    }
    setPending(true);
    const { error } = await authClient.resetPassword({ newPassword: password, token });
    if (error) {
      setPending(false);
      setError(
        error.code === "INVALID_TOKEN"
          ? "Link je istekao ili je već iskorišćen. Zatražite nov."
          : "Lozinka mora imati bar 10 karaktera.",
      );
      return;
    }
    router.replace("/prijava?reset=1");
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 rounded-2xl border-2 border-navy-900 bg-white p-5">
      <label className="block">
        <span className="text-sm font-semibold text-slate-700">Nova lozinka</span>
        <input
          type="password"
          autoComplete="new-password"
          minLength={10}
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-3 text-base outline-none focus:border-navy-700 focus:ring-2 focus:ring-navy-700/20"
        />
      </label>
      <label className="block">
        <span className="text-sm font-semibold text-slate-700">Ponovite lozinku</span>
        <input
          type="password"
          autoComplete="new-password"
          minLength={10}
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-3 text-base outline-none focus:border-navy-700 focus:ring-2 focus:ring-navy-700/20"
        />
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
        {pending ? "Čuvam…" : "Postavi lozinku"}
      </button>
    </form>
  );
}
