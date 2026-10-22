import type { Metadata } from "next";
import { connection } from "next/server";
import { AuthShell } from "@/components/auth-shell";
import { ResendVerification } from "./resend-verification";

export const metadata: Metadata = { title: "Potvrdite email | Moj Vulkanizer", robots: { index: false } };

export default async function SignupConfirmationPage({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  await connection();
  const { email } = await searchParams;

  return (
    <AuthShell title="Proverite email" subtitle="Još jedan korak do naloga">
      <div className="rounded-2xl border-2 border-navy-900 bg-white p-5 text-center">
        <p className="text-4xl" aria-hidden>
          📬
        </p>
        <p className="mt-3 text-sm text-slate-600">
          Poslali smo link za potvrdu naloga{email ? <> na <span className="font-semibold text-slate-900">{email}</span></> : ""}. Kliknite na
          link da biste mogli da se prijavite.
        </p>
        {email && <ResendVerification email={email} />}
      </div>
    </AuthShell>
  );
}
