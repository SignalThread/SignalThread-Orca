import { AppShell } from "@/components/layout/app-shell";
import { hasActivePlatformAdminAccountContext, requireAuth } from "@/lib/auth/session";
import { isExhibitorScopedRole } from "@/lib/auth/role-scope";
import { exhibitorAdminMayUseAppEventManagementRoutes } from "@/lib/exhibitor/exhibitor-event-management-access";
import { isExhibitorEventLevelTenantUiResolution } from "@/lib/access/event-access-mode";
import {
  getCachedExhibitorAccessibleEventResolution,
  getCachedExhibitorDisplayEventName,
  getExhibitorHasAccessibleEvents
} from "@/lib/server/exhibitor-app-access";
import { getExhibitorAppShellEventChrome } from "@/lib/server/exhibitor-app-active-event";

export default async function CampaignLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const sessionUser = await requireAuth();
  const platformAdminAccountContextActive = hasActivePlatformAdminAccountContext(sessionUser);
  const isExhibitor = isExhibitorScopedRole(sessionUser.role) || platformAdminAccountContextActive;
  const exhibitorHasAccessibleEvents = isExhibitor
    ? await getExhibitorHasAccessibleEvents(sessionUser.id)
    : null;
  const exhibitorActiveEventName = isExhibitor
    ? await getCachedExhibitorDisplayEventName(sessionUser.id)
    : null;
  const exhibitorEventChrome =
    isExhibitor && exhibitorHasAccessibleEvents
      ? await getExhibitorAppShellEventChrome(sessionUser.id)
      : null;
  let exhibitorAllowsAppEventsManagementSurfaces: boolean | undefined;
  let exhibitorEventLevelTenantUi: boolean | undefined;
  if (isExhibitor) {
    const r = await getCachedExhibitorAccessibleEventResolution(sessionUser.id);
    exhibitorAllowsAppEventsManagementSurfaces = exhibitorAdminMayUseAppEventManagementRoutes({
      role: r.role,
      resolution: r.resolution
    });
    exhibitorEventLevelTenantUi = isExhibitorEventLevelTenantUiResolution(r.resolution);
  }

  return (
    <AppShell
      sessionUser={sessionUser}
      exhibitorHasAccessibleEvents={exhibitorHasAccessibleEvents}
      exhibitorActiveEventName={exhibitorActiveEventName}
      exhibitorEventChrome={exhibitorEventChrome}
      exhibitorAllowsAppEventsManagementSurfaces={exhibitorAllowsAppEventsManagementSurfaces}
      exhibitorEventLevelTenantUi={exhibitorEventLevelTenantUi}
      platformAdminAccountContext={
        platformAdminAccountContextActive
          ? { companyId: sessionUser.active_company_id!, companyName: sessionUser.active_company_name ?? "Company" }
          : null
      }
    >
      {children}
    </AppShell>
  );
}
