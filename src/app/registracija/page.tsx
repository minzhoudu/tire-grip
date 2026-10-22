import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { connection } from "next/server";
import { defaultLoginTarget } from "@/server/origin";
import { getSessionUser } from "@/server/session";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Registracija | Moj Vulkanizer" };

export default async function SignupPage() {
  await connection();
  if (await getSessionUser()) redirect(await defaultLoginTarget());

  return (
    <AuthShell
      title="Registracija"
      subtitle="Dovedite svoju radnju na Moj Vulkanizer"
      footer={
        <>
          Već imate nalog?{" "}
          <Link href="/prijava" className="font-semibold text-navy-700 underline">
            Prijavite se
          </Link>
        </>
      }
    >
      <SignupForm />
    </AuthShell>
  );
}
