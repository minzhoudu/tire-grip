import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { AuthShell } from "@/components/auth-shell";
import { safeNextPath } from "@/lib/safe-next";
import { defaultLoginTarget, toRootUrl } from "@/server/origin";
import { getSessionUser } from "@/server/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Prijava | Moj Vulkanizer", robots: { index: false } };

type Props = { searchParams: Promise<{ next?: string; reset?: string }> };

export default async function LoginPage({ searchParams }: Props) {
  await connection();
  const { next, reset } = await searchParams;
  const target = safeNextPath(next, await defaultLoginTarget());
  if (await getSessionUser()) redirect(target);

  return (
    <AuthShell
      title="Prijava"
      subtitle="Panel za vulkanizere"
      footer={
        <>
          Nemate nalog?{" "}
          <Link href={await toRootUrl("/registracija")} className="font-semibold text-navy-700 underline">
            Registrujte radnju
          </Link>
        </>
      }
    >
      {reset === "1" && (
        <p className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Lozinka je promenjena. Prijavite se novom lozinkom.</p>
      )}
      <LoginForm next={target} />
    </AuthShell>
  );
}
