"use client";

import { useLayoutEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  EXHIBITOR_ACCOUNT_HREF,
  EXHIBITOR_EVENTS_ENTRY_HREF,
  EXHIBITOR_EVENT_LEVEL_SETTINGS_HREF,
  isExhibitorEntryPathAllowedWithNoEvents
} from "@/lib/exhibitor/exhibitor-app-nav";

type ExhibitorAccessGateProps = {
  hasAccessibleEvents: boolean;
  /**
   * When false, zero-event users are sent to account settings instead of `/app/events`
   * (direct-license admins land there only when portfolio routes apply).
   */
  allowsAppEventsManagementSurfaces?: boolean;
  /**
   * Assigned-only / legacy event-scoped: zero-event fallback goes to `/exhibitor/settings`;
   * `/app/settings` is blocked until portfolio-shaped tenants apply.
   */
  eventLevelTenantUi?: boolean;
  children: React.ReactNode;
};

/**
 * When the user has no accessible events, allow portfolio onboarding routes (`/app/events`,
 * `/app/settings`, …) or event-level settings (`/exhibitor/settings`), and block `/exhibitor/*`
 * workflows until the canonical resolver reports at least one accessible event (unless an allowed
 * entry path applies).
 */
export function ExhibitorAccessGate({
  hasAccessibleEvents,
  allowsAppEventsManagementSurfaces = true,
  eventLevelTenantUi = false,
  children
}: ExhibitorAccessGateProps) {
  const pathname = usePathname();
  const router = useRouter();
  const gateOpts = {
    allowsAppEventsManagementSurfaces,
    eventLevelTenantUi
  };
  const entryAllowed = isExhibitorEntryPathAllowedWithNoEvents(pathname, gateOpts);
  const fallbackHref = allowsAppEventsManagementSurfaces
    ? EXHIBITOR_EVENTS_ENTRY_HREF
    : eventLevelTenantUi
      ? EXHIBITOR_EVENT_LEVEL_SETTINGS_HREF
      : EXHIBITOR_ACCOUNT_HREF;

  useLayoutEffect(() => {
    if (hasAccessibleEvents || entryAllowed) {
      return;
    }
    router.replace(fallbackHref);
  }, [hasAccessibleEvents, pathname, router, allowsAppEventsManagementSurfaces, eventLevelTenantUi, fallbackHref, entryAllowed]);

  if (!hasAccessibleEvents && !entryAllowed) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-slate-500" role="status">
        Opening Events…
      </div>
    );
  }

  return <>{children}</>;
}
