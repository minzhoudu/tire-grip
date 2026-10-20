import { createAuthClient } from "better-auth/react";

/**
 * Browser client. Sign-in goes through /api/auth/sign-in/email so Better
 * Auth's rate limiter applies (direct auth.api calls from server actions
 * would bypass it).
 */
export const authClient = createAuthClient();
