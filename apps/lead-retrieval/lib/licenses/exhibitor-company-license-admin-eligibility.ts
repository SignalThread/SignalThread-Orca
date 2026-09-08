/**
 * Pure helpers: company-scoped exhibitor license eligibility for admin-app multi-event access.
 * Does not use can_create_events, seats, or max_events — only active company-scoped entitlement.
 */

import { pickValidatedEventIdForAccess } from "@/lib/access/event-access-mode";

export type CompanyScopedLicenseAdminAccessFields = {
  scope: string | null;
  status: string | null;
  expires_at: string | null;
  starts_at: string | null;
} | null;

function isActiveStatus(status: string | null | undefined): boolean {
  return String(status ?? "").trim().toLowerCase() === "active";
}

function isExpired(expiresAt: string | null | undefined, nowMs: number): boolean {
  if (!expiresAt) return false;
  const t = new Date(expiresAt).getTime();
  if (Number.isNaN(t)) return false;
  return t <= nowMs;
}

function isNotYetStarted(startsAt: string | null | undefined, nowMs: number): boolean {
  if (!startsAt) return false;
  const t = new Date(startsAt).getTime();
  if (Number.isNaN(t)) return false;
  return t > nowMs;
}

/**
 * Eligible when a company-scoped row exists, is active, has started, and is not expired.
 */
export function isEligibleExhibitorCompanyLicenseForAdminMultiEventAccess(
  license: CompanyScopedLicenseAdminAccessFields,
  nowMs: number
): boolean {
  if (!license) return false;
  if (String(license.scope ?? "").trim().toLowerCase() !== "company") return false;
  if (!isActiveStatus(license.status)) return false;
  if (isNotYetStarted(license.starts_at, nowMs)) return false;
  if (isExpired(license.expires_at, nowMs)) return false;
  return true;
}

export type AdminAppAccessibleEvent = { id: string; name: string };

/**
 * Resolves exhibitor accessible events from loaded data (no I/O). Used by the canonical server resolver and tests.
 */
export function buildExhibitorAdminAccessibleEvents(input: {
  multiEventLicensed: boolean;
  companyId: string | null;
  companyOwnedEvents: AdminAppAccessibleEvent[];
  membershipEvent: AdminAppAccessibleEvent | null;
}): AdminAppAccessibleEvent[] {
  if (!input.companyId) return [];
  if (input.multiEventLicensed) {
    return [...input.companyOwnedEvents];
  }
  return input.membershipEvent ? [input.membershipEvent] : [];
}

/**
 * Validates a preferred active event id against the resolved accessible set (server-authoritative).
 */
export function pickValidatedActiveAdminEventId(
  accessibleEventIds: string[],
  preferredEventId: string | null | undefined
): string | null {
  return pickValidatedEventIdForAccess(accessibleEventIds, preferredEventId);
}

/** Organizer admins use a single primary event in admin scope resolution (ordered list from organizer scope). */
export function primaryOrganizerAdminAccessibleEvents(events: AdminAppAccessibleEvent[]): AdminAppAccessibleEvent[] {
  const first = events[0];
  return first ? [first] : [];
}
