import type { Metadata } from "next";
import { connection } from "next/server";
import { AuthShell } from "@/components/auth-shell";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = { title: "Nova lozinka | Moj Vulkanizer", robots: { index: false } };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string; error?: string }> }) {
  await connection();
  const { token, error } = await searchParams;

  return (
    <AuthShell title="Nova lozinka" subtitle="Postavite novu lozinku za nalog">
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
    </AuthShell>
  );
}
