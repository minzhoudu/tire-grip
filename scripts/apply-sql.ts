/**
 * Apply hand-written SQL (e.g. the booking exclusion constraint) to DATABASE_URL.
 * Cross-platform replacement for `psql "$DATABASE_URL" -f …` (PowerShell has no $DATABASE_URL).
 * Objects that already exist are skipped, so it is safe to re-run.
 *
 *   pnpm db:constraints
 */
import "dotenv/config";
import { readFile } from "node:fs/promises";
import postgres from "postgres";

const files = process.argv.slice(2);
const url = process.env.DATABASE_URL;
if (!url || files.length === 0) {
  console.error("Upotreba: tsx scripts/apply-sql.ts <fajl.sql>…  (potreban je DATABASE_URL u .env)");
  process.exit(1);
}

// duplicate_object, duplicate_table: already applied
const ALREADY_EXISTS = new Set(["42710", "42P07"]);
const sql = postgres(url, { max: 1, onnotice: () => {} });

try {
  for (const file of files) {
    const statements = (await readFile(file, "utf8"))
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter((s) => s.replace(/--.*$/gm, "").trim().length > 0);
    for (const statement of statements) {
      try {
        await sql.unsafe(statement);
      } catch (err) {
        const code = (err as { code?: string }).code;
        if (code && ALREADY_EXISTS.has(code)) {
          console.log(`  već postoji, preskačem: ${statement.split("\n").find((l) => !l.startsWith("--"))?.slice(0, 70)}…`);
          continue;
        }
        throw err;
      }
    }
    console.log(`✓ ${file}`);
  }
} finally {
  await sql.end();
}
