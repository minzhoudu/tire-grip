/**
 * Better Auth: email + password sign-in for shop owners and staff.
 *
 * Public sign-up is disabled — accounts are created with `pnpm admin:create`
 * (and later by an onboarding flow). Created lazily so imports and
 * `next build` don't need DATABASE_URL / BETTER_AUTH_SECRET.
 */
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { getDb } from "../db/index.ts";
import * as schema from "../db/schema.ts";

export const MIN_PASSWORD_LENGTH = 10;

function createAuth() {
  return betterAuth({
    appName: "Tire Grip",
    secret: process.env.BETTER_AUTH_SECRET,
    baseURL: process.env.BETTER_AUTH_URL,
    database: drizzleAdapter(getDb(), { provider: "pg", schema, usePlural: true }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: MIN_PASSWORD_LENGTH,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30, // 30 days: owners stay signed in on their phone
      updateAge: 60 * 60 * 24, // refresh the expiry at most once a day
    },
    // Must be last: lets server actions set the session cookie.
    plugins: [nextCookies()],
  });
}

export type Auth = ReturnType<typeof createAuth>;

const globalForAuth = globalThis as unknown as { auth?: Auth };

export function getAuth(): Auth {
  globalForAuth.auth ??= createAuth();
  return globalForAuth.auth;
}
