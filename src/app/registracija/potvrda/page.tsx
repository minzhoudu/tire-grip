import type { Metadata } from "next";
import { connection } from "next/server";
import { ResendVerification } from "./resend-verification";

export const metadata: Metadata = { title: "Potvrdite email · Moj Vulkanizer", robots: { index: false } };

export default async function SignupConfirmationPage({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  await connection();
  const { email } = await searchParams;

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-5 py-10 text-center">
      <div className="mb-6 flex flex-col items-center gap-3">
        <div className="grid size-14 place-items-center rounded-2xl bg-navy-900 text-3xl" aria-hidden>
          📬
        </div>
        <h1 className="font-mono text-2xl font-bold">Proverite email</h1>
      </div>
      <p className="text-sm text-slate-600">
        Poslali smo link za potvrdu naloga{email ? <> na <span className="font-semibold text-slate-900">{email}</span></> : ""}. Kliknite na link da
        biste mogli da se prijavite.
      </p>
      {email && <ResendVerification email={email} />}
    </main>
  );
}
