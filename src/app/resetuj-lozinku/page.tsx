import type { Metadata } from "next";
import { connection } from "next/server";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = { title: "Nova lozinka | Moj Vulkanizer", robots: { index: false } };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string; error?: string }> }) {
  await connection();
  const { token, error } = await searchParams;

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-5 py-10">
      <div className="mb-8 flex items-center gap-3">
        <div className="grid size-12 place-items-center rounded-2xl bg-navy-900 text-2xl" aria-hidden>
          🔑
        </div>
        <div>
          <h1 className="font-mono text-2xl font-bold">Nova lozinka</h1>
          <p className="text-sm text-slate-600">Postavite novu lozinku za nalog</p>
        </div>
      </div>
      {!token || error ? (
        <div className="rounded-2xl border-2 border-navy-900 bg-white p-5 text-center">
          <p className="text-sm text-slate-700">Link je istekao ili nije ispravan. Zatražite nov link za resetovanje.</p>
          <a href="/zaboravljena-lozinka" className="mt-4 inline-block text-sm font-semibold text-navy-700 underline">
            Zatraži nov link
          </a>
        </div>
      ) : (
        <ResetPasswordForm token={token} />
      )}
    </main>
  );
}
