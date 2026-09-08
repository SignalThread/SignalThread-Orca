import { AdminShell } from "@/components/admin/admin-shell";
import { ImportWizardSessionTracker } from "@/components/import-wizard/import-wizard-session-tracker";
import { AppShell } from "@/components/layout/app-shell";
import { requireAuth } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { headers, cookies } from "next/headers";
import { resolveAdminAppEventScopeForUser } from "@/lib/server/admin-app-event-scope";
import { EXHIBITOR_ADMIN_ACTIVE_EVENT_COOKIE } from "@/lib/admin/exhibitor-admin-constants";
import { pickValidatedActiveAdminEventId } from "@/lib/licenses/exhibitor-company-license-admin-eligibility";
import { EXHIBITOR_WEB_ENTRY_RESOLVER_PATH } from "@/lib/exhibitor/exhibitor-web-home";
import { exhibitorAdminMayUseAppEventManagementRoutes } from "@/lib/exhibitor/exhibitor-event-management-access";
import { isExhibitorEventLevelTenantUiResolution } from "@/lib/access/event-access-mode";
import {
  getCachedExhibitorAccessibleEventResolution,
  getCachedExhibitorDisplayEventName,
  getExhibitorHasAccessibleEvents
} from "@/lib/server/exhibitor-app-access";
import { getExhibitorAppShellEventChrome } from "@/lib/server/exhibitor-app-active-event";

export default async function AdminLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const sessionUser = await requireAuth();
  const requestHeaders = await headers();
  const isSalesforceAdminSurface = requestHeaders.get("x-admin-salesforce-surface") === "1";
  const isAdminIntegrationSurface = requestHeaders.get("x-admin-integration-surface") === "1";

  if (sessionUser.role !== "platform_admin") {
    if (sessionUser.role === "exhibitor_admin") {
      const scope = await resolveAdminAppEventScopeForUser(sessionUser);
      const multi = scope.kind === "exhibitor" && scope.multiEventLicensed;

      if (!multi && !isAdminIntegrationSurface) {
        redirect(EXHIBITOR_WEB_ENTRY_RESOLVER_PATH);
      }

      if (isSalesforceAdminSurface) {
        const exhibitorHasAccessibleEvents = await getExhibitorHasAccessibleEvents(sessionUser.id);
        const exhibitorActiveEventName = await getCachedExhibitorDisplayEventName(sessionUser.id);
        const exhibitorEventChrome = exhibitorHasAccessibleEvents
          ? await getExhibitorAppShellEventChrome(sessionUser.id)
          : null;
        const exhibitorAccess = await getCachedExhibitorAccessibleEventResolution(sessionUser.id);
        const exhibitorAllowsAppEventsManagementSurfaces = exhibitorAdminMayUseAppEventManagementRoutes({
          role: exhibitorAccess.role,
          resolution: exhibitorAccess.resolution
        });
        const exhibitorEventLevelTenantUi = isExhibitorEventLevelTenantUiResolution(exhibitorAccess.resolution);

        return (
          <AppShell
            sessionUser={sessionUser}
            exhibitorHasAccessibleEvents={exhibitorHasAccessibleEvents}
            exhibitorActiveEventName={exhibitorActiveEventName}
            exhibitorEventChrome={exhibitorEventChrome}
            exhibitorAllowsAppEventsManagementSurfaces={exhibitorAllowsAppEventsManagementSurfaces}
            exhibitorEventLevelTenantUi={exhibitorEventLevelTenantUi}
          >
            <ImportWizardSessionTracker />
            {children}
          </AppShell>
        );
      }

      const cookieStore = await cookies();
      const rawCookie = cookieStore.get(EXHIBITOR_ADMIN_ACTIVE_EVENT_COOKIE)?.value ?? null;
      const decodedCookie = rawCookie ? decodeURIComponent(rawCookie) : null;
      const activeEventId =
        scope.kind === "exhibitor"
          ? pickValidatedActiveAdminEventId(
              scope.accessibleEvents.map((e) => e.id),
              decodedCookie
            )
          : null;

      if (process.env.DEBUG_ACTIVE_EVENT_RESOLUTION === "1") {
        console.info(
          "[DEBUG_ACTIVE_EVENT_RESOLUTION]",
          JSON.stringify({
            stage: "adminLayout.exhibitor_admin",
            userId: sessionUser.id,
            role: sessionUser.role,
            companyId: sessionUser.company_id,
            exhibitorAdminActiveEventCookie: decodedCookie,
            accessibleEventIds: scope.kind === "exhibitor" ? scope.accessibleEvents.map((e) => e.id) : [],
            resolvedActiveEventId: activeEventId
          })
        );
      }

      const sidebarMode = multi ? "exhibitor_multi" : "exhibitor_integrations";
      const eventChrome =
        scope.kind === "exhibitor" && scope.accessibleEvents.length > 0
          ? { accessibleEvents: scope.accessibleEvents, activeEventId }
          : null;

      return (
        <AdminShell
          sessionUser={sessionUser}
          sidebarMode={sidebarMode}
          exhibitorAdminEventSwitcher={eventChrome}
        >
          {children}
        </AdminShell>
      );
    }
    if (sessionUser.role === "organizer_admin") {
      redirect("/app/organizer");
    }
    redirect("/app");
  }

  return <AdminShell sessionUser={sessionUser}>{children}</AdminShell>;
}
