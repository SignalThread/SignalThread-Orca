import "server-only";

import { redirect } from "next/navigation";
import { normalizeSessionRole, type SessionUser } from "@/lib/auth/session";
import { getCachedExhibitorAccessibleEventResolution } from "@/lib/server/exhibitor-app-access";
import { exhibitorAdminMayUseAppEventManagementRoutes } from "@/lib/exhibitor/exhibitor-event-management-access";
import { isExhibitorEventLevelTenantUiResolution } from "@/lib/access/event-access-mode";
import { EXHIBITOR_EVENT_LEVEL_SETTINGS_HREF } from "@/lib/exhibitor/exhibitor-app-nav";

/**
 * Blocks exhibitor admins on event-level / assigned-only licenses from `/app/events*` management routes.
 */
export async function redirectExhibitorAdminFromAppEventsManagementRoutesIfBlocked(
  sessionUser: SessionUser
): Promise<void> {
  const role = normalizeSessionRole(sessionUser.role);
  if (role !== "exhibitor_admin") return;

  const access = await getCachedExhibitorAccessibleEventResolution(sessionUser.id);
  if (
    exhibitorAdminMayUseAppEventManagementRoutes({
      role: access.role,
      resolution: access.resolution
    })
  ) {
    return;
  }

  const first = access.eventIds[0] ?? null;
  redirect(
    first
      ? `/exhibitor/dashboard?eventId=${encodeURIComponent(first)}`
      : isExhibitorEventLevelTenantUiResolution(access.resolution)
        ? EXHIBITOR_EVENT_LEVEL_SETTINGS_HREF
        : "/app/settings"
  );
}
