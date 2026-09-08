/**
 * Central policy for Playwright-only server auth bypass (never active in production builds).
 */

export const E2E_AUTH_BYPASS_PATH = "/api/e2e/auth-bypass";

export function isE2eAuthBypassApiPath(pathname: string): boolean {
  return pathname === E2E_AUTH_BYPASS_PATH || pathname.startsWith(`${E2E_AUTH_BYPASS_PATH}/`);
}

/**
 * Pure evaluation for tests (pass a synthetic env object).
 */
export function getE2eAuthBypassDenialReasonFromEnv(env: {
  NODE_ENV?: string;
  VERCEL_ENV?: string;
  E2E_AUTH_BYPASS_ENABLED?: string;
}): string | null {
  if (env.NODE_ENV === "production") {
    return "NODE_ENV production";
  }
  if (env.VERCEL_ENV === "production") {
    return "VERCEL_ENV production";
  }
  if (env.E2E_AUTH_BYPASS_ENABLED !== "true") {
    return "E2E_AUTH_BYPASS_ENABLED is not true";
  }
  return null;
}

/**
 * Returns null when bypass is permitted for middleware + route handlers.
 * Deny in production Node env, Vercel production, or when flag unset.
 */
export function getE2eAuthBypassDenialReason(): string | null {
  return getE2eAuthBypassDenialReasonFromEnv({
    NODE_ENV: process.env.NODE_ENV,
    VERCEL_ENV: process.env.VERCEL_ENV,
    E2E_AUTH_BYPASS_ENABLED: process.env.E2E_AUTH_BYPASS_ENABLED
  });
}

export function isE2eAuthBypassRuntimeEnabled(): boolean {
  return getE2eAuthBypassDenialReason() === null;
}
