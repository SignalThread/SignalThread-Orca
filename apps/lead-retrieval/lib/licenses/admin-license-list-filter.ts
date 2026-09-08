import type { AdminLicenseScope } from "@/lib/data/admin-licenses-types";

/**
 * Canonical predicate for admin/organizer license tables filtered by a selected event.
 *
 * A license row is visible on the selected event when either:
 *   1. It is event-scoped and `license.eventId === selectedEventId`, OR
 *   2. It is company-scoped and the license's exhibitor/company participates in the
 *      selected event — where "participates" means the company is an exhibitor on the
 *      event OR the company owns the event (events.company_id === exhibitorCompanyId),
 *      which is the direct-buyer case with no exhibitors row.
 *
 * When `selectedEventId` is empty, all rows remain visible.
 *
 * This is the single source of truth for list/filter visibility. Callers should build
 * `participatingCompanyIdsOnSelectedEvent` once and reuse it here — do not re-implement
 * the predicate inline.
 */
export function licenseRowMatchesSelectedEventFilter(input: {
  license: {
    eventId: string | null;
    scope: AdminLicenseScope;
    exhibitorCompanyId: string;
  };
  selectedEventId: string;
  /**
   * Set of company ids considered "present on" the selected event. Must include both
   * exhibitors on the event AND the event's owning company (events.company_id) so that
   * direct-buyer company-scoped licenses surface on events they own.
   */
  participatingCompanyIdsOnSelectedEvent: Set<string>;
}): boolean {
  if (!input.selectedEventId) return true;
  const matchesEvent = input.license.eventId === input.selectedEventId;
  const companyScopedVisible =
    input.license.scope === "company" &&
    input.participatingCompanyIdsOnSelectedEvent.has(input.license.exhibitorCompanyId);
  return matchesEvent || companyScopedVisible;
}
