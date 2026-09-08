import type { EventAccessResolution } from "@/lib/access/event-access-mode";
import { exhibitorAdminMayUseAppEventManagementRoutes } from "@/lib/exhibitor/exhibitor-event-management-access";

/**
 * Whether the exhibitor app top-bar event dropdown may show "Manage events" → /app/events.
 *
 * Source of truth: {@link resolveAccessibleEventIdsForUser} — same rule as
 * {@link exhibitorAdminMayUseAppEventManagementRoutes}.
 */
export function exhibitorTopBarShowsManageEventsLink(params: {
  role: string | null;
  resolution: EventAccessResolution;
}): boolean {
  return exhibitorAdminMayUseAppEventManagementRoutes(params);
}
