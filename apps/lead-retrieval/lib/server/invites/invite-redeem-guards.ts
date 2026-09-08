/**
 * Pure checks for app invite redeem/claim — no I/O.
 */

export function normalizeRedeemEmail(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

export function emailMatchesExactCaseInsensitive(candidateEmail: unknown, inputEmail: unknown): boolean {
  const candidate = normalizeRedeemEmail(candidateEmail);
  const input = normalizeRedeemEmail(inputEmail);
  return Boolean(candidate && input && candidate === input);
}

export function inviteEmailMatchesSession(inviteEmail: unknown, sessionEmail: string): boolean {
  return emailMatchesExactCaseInsensitive(inviteEmail, sessionEmail);
}

/**
 * When the profile already has a company, it must match the invite's exhibitor company.
 */
export function isExhibitorCompanyConflict(existingCompanyId: unknown, inviteCompanyId: string): boolean {
  const existing = String(existingCompanyId ?? "").trim();
  if (!existing) return false;
  return existing !== String(inviteCompanyId ?? "").trim();
}

/** Supabase GoTrue / common client errors when the auth user already exists. */
export function isAuthUserAlreadyExistsError(message: string): boolean {
  return /already\s+(been\s+)?registered|already\s+exists|duplicate|user\s+already/i.test(
    String(message ?? "")
  );
}

const EXHIBITOR_SIDE_USERS_ROLES = new Set([
  "exhibitor_admin",
  "exhibitor_viewer",
  "exhibitor" // legacy row; same company scope as admin/viewer
]);

export function isExhibitorSideUsersRole(role: string | null | undefined): boolean {
  return EXHIBITOR_SIDE_USERS_ROLES.has(String(role ?? "").trim().toLowerCase());
}
