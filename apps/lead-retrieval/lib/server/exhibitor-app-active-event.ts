import "server-only";

import { cookies } from "next/headers";
import {
  getCachedExhibitorAccessibleEventSummaries,
  getCachedExhibitorAccessibleEventResolution
} from "@/lib/server/exhibitor-app-access";
import {
  mayUseExhibitorAppEventResolution,
  pickExhibitorAppActiveEventId
} from "@/lib/exhibitor/exhibitor-app-active-event-logic";
import { EXHIBITOR_APP_ACTIVE_EVENT_COOKIE } from "@/lib/exhibitor/exhibitor-app-active-event-constants";
import type { ExhibitorAppShellEventChrome } from "@/lib/exhibitor/exhibitor-app-shell-types";
import { exhibitorTopBarShowsManageEventsLink } from "@/lib/exhibitor/exhibitor-top-bar-manage-events";
import { isExhibitorEventLevelTenantUiResolution } from "@/lib/access/event-access-mode";

export async function readExhibitorAppActiveEventCookie(): Promise<string | null> {
  const store = await cookies();
  const raw = store.get(EXHIBITOR_APP_ACTIVE_EVENT_COOKIE)?.value;
  if (raw == null || raw === "") return null;
  try {
    const decoded = decodeURIComponent(raw).trim();
    return decoded || null;
  } catch {
    return String(raw).trim() || null;
  }
}

/**
 * Canonical active event for exhibitor app surfaces: URL wins, then cookie, then first accessible.
 * A platform admin is eligible only through the validated company-scoped
 * resolution; platform-wide access never becomes an exhibitor app scope here.
 */
export async function resolveExhibitorAppActiveEventId(
  userId: string,
  urlEventId: string | null | undefined
): Promise<string | null> {
  const { resolution } = await getCachedExhibitorAccessibleEventSummaries(userId);
  if (
    !mayUseExhibitorAppEventResolution(resolution.role, resolution.resolution) ||
    resolution.eventIds.length === 0
  ) {
    return null;
  }
  const cookieId = await readExhibitorAppActiveEventCookie();
  return pickExhibitorAppActiveEventId(resolution.eventIds, urlEventId, cookieId);
}

export async function getExhibitorAppShellEventChrome(userId: string): Promise<ExhibitorAppShellEventChrome | null> {
  const { resolution, events } = await getCachedExhibitorAccessibleEventSummaries(userId);
  if (!mayUseExhibitorAppEventResolution(resolution.role, resolution.resolution) || events.length === 0) {
    return null;
  }

  const activeEventId = await resolveExhibitorAppActiveEventId(userId, null);
  const activeEventName = activeEventId ? (events.find((e) => e.id === activeEventId)?.name ?? null) : null;

  const showManageEventsLink = exhibitorTopBarShowsManageEventsLink({
    role: resolution.role,
    resolution: resolution.resolution
  });

  const eventSelectorLocked = isExhibitorEventLevelTenantUiResolution(resolution.resolution);

  return {
    accessibleEvents: events,
    activeEventId,
    activeEventName,
    showManageEventsLink,
    eventSelectorLocked
  };
}

/** For pages that only need the multi-event count (breadcrumb / gates). */
export async function getExhibitorAccessibleEventCount(userId: string): Promise<number> {
  const r = await getCachedExhibitorAccessibleEventResolution(userId);
  return r.eventIds.length;
}
