import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { AuthShell } from "@/components/auth-shell";
import { defaultLoginTarget } from "@/server/origin";
import { getSessionUser } from "@/server/session";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = { title: "Zaboravljena lozinka | Moj Vulkanizer", robots: { index: false } };

export default async function ForgotPasswordPage() {
  await connection();
  if (await getSessionUser()) redirect(await defaultLoginTarget());

  return (
    <AuthShell title="Zaboravljena lozinka" subtitle="Pošaljemo vam link za resetovanje">
      <ForgotPasswordForm />
    </AuthShell>
  );
}
