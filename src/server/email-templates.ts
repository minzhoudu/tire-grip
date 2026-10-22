/** Minimal inline-styled HTML so it renders consistently across email clients. */
function layout(title: string, body: string): string {
  return `<div style="font-family:system-ui,sans-serif;max-width:420px;margin:0 auto;padding:24px">
  <p style="font-family:monospace;font-size:20px;font-weight:bold;color:#0a1a33;margin:0 0 20px">🛞 Moj Vulkanizer</p>
  <h1 style="font-size:18px;color:#0a1a33;margin:0 0 12px">${title}</h1>
  ${body}
  <p style="font-size:12px;color:#94a3b8;margin-top:32px">Ako niste vi ovo tražili, slobodno ignorišite ovaj email.</p>
</div>`;
}

function button(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;margin:16px 0;padding:12px 20px;background:#f5b700;color:#0a1a33;font-weight:bold;text-decoration:none;border-radius:10px;border:2px solid #0a1a33">${label}</a>`;
}

export function verifyEmailHtml(url: string): string {
  return layout(
    "Potvrdite svoj email",
    `<p style="color:#334155;font-size:14px">Hvala na registraciji. Potvrdite email da biste mogli da se prijavite na nalog.</p>
     ${button(url, "Potvrdi email")}`,
  );
}

export function resetPasswordEmailHtml(url: string): string {
  return layout(
    "Resetujte lozinku",
    `<p style="color:#334155;font-size:14px">Tražili ste resetovanje lozinke za vaš nalog. Link važi 1 sat.</p>
     ${button(url, "Postavi novu lozinku")}`,
  );
}
