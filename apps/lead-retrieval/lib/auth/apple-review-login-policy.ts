/**
 * Apple App Review: tightly gated POST /api/auth/apple-review-login (separate from E2E bypass).
 */

export const APPLE_REVIEW_LOGIN_PATH = "/api/auth/apple-review-login";

export function isAppleReviewLoginApiPath(pathname: string): boolean {
  return pathname === APPLE_REVIEW_LOGIN_PATH;
}

/** Default when `APPLE_REVIEW_EMAIL` is unset — set explicit env in production review windows. */
export const DEFAULT_APPLE_REVIEW_EMAIL = "kamyab.ali+app@gmail.com";

export function normalizeConfiguredAppleReviewEmail(raw: unknown): string {
  return String(raw ?? "").trim().toLowerCase();
}

export function resolveConfiguredAppleReviewEmailFromEnv(env: {
  APPLE_REVIEW_EMAIL?: string;
}): string | null {
  const v = normalizeConfiguredAppleReviewEmail(env.APPLE_REVIEW_EMAIL ?? "");
  return v.includes("@") ? v : null;
}

/**
 * Pure policy evaluation for middleware + handlers + tests.
 */
export function getAppleReviewLoginDenialReasonFromEnv(env: {
  APPLE_REVIEW_LOGIN_ENABLED?: string;
  APPLE_REVIEW_EMAIL?: string;
}): string | null {
  if (env.APPLE_REVIEW_LOGIN_ENABLED !== "true") {
    return "APPLE_REVIEW_LOGIN_ENABLED is not true";
  }
  if (!resolveConfiguredAppleReviewEmailFromEnv(env)) {
    return "APPLE_REVIEW_EMAIL is missing or invalid";
  }
  return null;
}

export function getAppleReviewLoginDenialReason(): string | null {
  return getAppleReviewLoginDenialReasonFromEnv({
    APPLE_REVIEW_LOGIN_ENABLED: process.env.APPLE_REVIEW_LOGIN_ENABLED,
    APPLE_REVIEW_EMAIL: process.env.APPLE_REVIEW_EMAIL ?? DEFAULT_APPLE_REVIEW_EMAIL
  });
}

export function isAppleReviewLoginRuntimeEnabled(): boolean {
  return getAppleReviewLoginDenialReason() === null;
}

/** Only exhibitor-mobile roles allowed for reviewers (never platform/organizer). */
export function isAppleReviewAllowedPublicUsersRole(role: string | null | undefined): boolean {
  const r = String(role ?? "").trim().toLowerCase();
  return r === "exhibitor_admin" || r === "exhibitor_viewer";
}

export function isAppleReviewPrivilegedRole(role: string | null | undefined): boolean {
  const r = String(role ?? "").trim().toLowerCase();
  return r === "platform_admin" || r === "organizer_admin";
}

/**
 * Request body must include `email` and it must equal the configured review address (case-insensitive).
 */
export function isAppleReviewLoginRequestEmailValid(
  configuredEmailLower: string,
  requestedEmailUnknown: unknown
): boolean {
  const requested = normalizeConfiguredAppleReviewEmail(requestedEmailUnknown);
  if (!requested.includes("@")) {
    return false;
  }
  return requested === configuredEmailLower;
}

/**
 * Returns null when the demo user row is safe to mint a magic-link session.
 */
export function getAppleReviewUserRowDenialReason(input: {
  userId: string | null | undefined;
  role: string | null | undefined;
}): string | null {
  const uid = String(input.userId ?? "").trim();
  if (!uid) {
    return "missing user";
  }
  if (isAppleReviewPrivilegedRole(input.role)) {
    return "privileged role blocked";
  }
  if (!isAppleReviewAllowedPublicUsersRole(input.role)) {
    return "role not allowed for Apple review demo";
  }
  return null;
}
