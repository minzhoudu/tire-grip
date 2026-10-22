/**
 * Transactional email (Resend): email verification + password reset links.
 * Created lazily, like getAuth()/getDb(), so imports and `next build` don't
 * need RESEND_API_KEY. Without a key configured (local dev without one set),
 * we log the email instead of sending it — handy for copying the link by hand.
 */
import { Resend } from "resend";

const FROM = process.env.EMAIL_FROM ?? "Moj Vulkanizer <onboarding@resend.dev>";

const globalForResend = globalThis as unknown as { resend?: Resend };

function getResend(): Resend {
  globalForResend.resend ??= new Resend(process.env.RESEND_API_KEY);
  return globalForResend.resend;
}

export async function sendEmail(input: { to: string; subject: string; html: string }): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    console.warn(`[email] RESEND_API_KEY nije podešen, preskačem slanje.\nTo: ${input.to}\nSubject: ${input.subject}\n${input.html}`);
    return;
  }
  const { error } = await getResend().emails.send({ from: FROM, to: input.to, subject: input.subject, html: input.html });
  if (error) throw new Error(`Slanje emaila nije uspelo: ${error.message}`);
}
