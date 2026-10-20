/**
 * Create a shop owner/staff account (public sign-up is disabled).
 *
 *   pnpm admin:create <email> <password> "<name>" <shop-slug> [owner|staff]
 *   pnpm admin:create pera@example.rs 'dugacka-lozinka' "Pera" brzi-tocak
 *
 * Re-running for an existing email only adds the shop membership.
 */
import "dotenv/config";
import { closeDb, getDb } from "../src/db/index.ts";
import { createShopUser } from "../src/server/accounts.ts";
import { pgErrorCode } from "../src/server/bookings.ts";
import { MIN_PASSWORD_LENGTH, getAuth } from "../src/server/auth.ts";

const [email, password, name, shopSlug, role = "owner"] = process.argv.slice(2);

if (!email || !password || !name || !shopSlug || (role !== "owner" && role !== "staff")) {
  console.error('Upotreba: pnpm admin:create <email> <lozinka> "<ime>" <slug-radnje> [owner|staff]');
  process.exit(1);
}

const messages = {
  shop_not_found: `Radnja "${shopSlug}" ne postoji.`,
  weak_password: `Lozinka mora imati bar ${MIN_PASSWORD_LENGTH} karaktera.`,
  invalid_email: "Email adresa nije ispravna.",
} as const;

try {
  const result = await createShopUser(getDb(), getAuth(), { email, password, name, shopSlug, role });
  if (!result.ok) {
    console.error(messages[result.reason]);
    process.exitCode = 1;
  } else {
    console.log(
      result.created
        ? `Nalog ${email} je napravljen i dodat u radnju ${shopSlug} (${role}).`
        : `Nalog ${email} već postoji; dodat je u radnju ${shopSlug} (${role}). Lozinka nije menjana.`,
    );
  }
} catch (err) {
  if (pgErrorCode(err) === "42P01") {
    console.error("Tabele u bazi ne postoje ili nisu ažurne. Pokreni: pnpm db:setup (pa pnpm db:seed ako radnja još ne postoji).");
    process.exitCode = 1;
  } else {
    throw err;
  }
} finally {
  await closeDb();
}
