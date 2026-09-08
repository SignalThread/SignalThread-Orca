import { ExhibitorAccessGate } from "@/components/exhibitor/exhibitor-access-gate";
import { requireAuth } from "@/lib/auth/session";
import { isExhibitorAdminRole, isExhibitorViewerRole } from "@/lib/auth/role-scope";
import { exhibitorAdminMayUseAppEventManagementRoutes } from "@/lib/exhibitor/exhibitor-event-management-access";
import { isExhibitorEventLevelTenantUiResolution } from "@/lib/access/event-access-mode";
import {
  getCachedExhibitorAccessibleEventResolution,
  getExhibitorHasAccessibleEvents
} from "@/lib/server/exhibitor-app-access";

export default async function ExhibitorLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const sessionUser = await requireAuth();
  if (isExhibitorViewerRole(sessionUser.role)) {
    /**
     * `exhibitor_viewer` cannot manage events, so the no-accessible-events redirect
     * to `/app/events` is the wrong fallback for this role. Render whatever
     * the page returns (RLS yields an empty set for users with zero
     * accessible events).
     */
    return children;
  }
  if (!isExhibitorAdminRole(sessionUser.role)) {
    return children;
  }
  const hasAccessibleEvents = await getExhibitorHasAccessibleEvents(sessionUser.id);
  const access = await getCachedExhibitorAccessibleEventResolution(sessionUser.id);
  const allowsAppEventsManagementSurfaces = exhibitorAdminMayUseAppEventManagementRoutes({
    role: access.role,
    resolution: access.resolution
  });
  const eventLevelTenantUi = isExhibitorEventLevelTenantUiResolution(access.resolution);
  return (
    <ExhibitorAccessGate
      hasAccessibleEvents={hasAccessibleEvents}
      allowsAppEventsManagementSurfaces={allowsAppEventsManagementSurfaces}
      eventLevelTenantUi={eventLevelTenantUi}
    >
      {children}
    </ExhibitorAccessGate>
  );
}
