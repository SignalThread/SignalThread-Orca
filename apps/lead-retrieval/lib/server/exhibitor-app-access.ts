import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import type { EventContainerKind } from "@/lib/events/event-container-kind";
import { normalizeEventContainerKind } from "@/lib/events/event-container-kind";
import { resolveAccessibleEventIdsForUser } from "@/lib/server/company-event-access";
import { pickExhibitorAppActiveEventId } from "@/lib/exhibitor/exhibitor-app-active-event-logic";
import { EXHIBITOR_APP_ACTIVE_EVENT_COOKIE } from "@/lib/exhibitor/exhibitor-app-active-event-constants";

/**
 * Per-request cached access resolution for exhibitor UI (nav + gates + entry pages).
 * Do not duplicate event-id logic elsewhere for these surfaces.
 */
export const getCachedExhibitorAccessibleEventResolution = cache(async (userId: string) => {
  return resolveAccessibleEventIdsForUser({ userId });
});

export type ExhibitorAccessibleEventSummary = {
  id: string;
  name: string;
  container_kind: EventContainerKind;
};

/**
 * Accessible events with display names, in canonical resolver order (cached per request).
 */
export const getCachedExhibitorAccessibleEventSummaries = cache(
  async (userId: string): Promise<{
    resolution: Awaited<ReturnType<typeof resolveAccessibleEventIdsForUser>>;
    events: ExhibitorAccessibleEventSummary[];
  }> => {
    const resolution = await getCachedExhibitorAccessibleEventResolution(userId);
    if (resolution.eventIds.length === 0) {
      return { resolution, events: [] };
    }

    const supabase = createAdminClient();
    const { data, error } = await (supabase as any)
      .from("events")
      .select("id, name, container_kind")
      .in("id", resolution.eventIds);

    if (error) {
      console.error("[exhibitor-app-access] event names fetch failed:", error.message, error.code);
      return {
        resolution,
        events: resolution.eventIds.map((id) => ({
          id,
          name: "Event",
          container_kind: normalizeEventContainerKind(null)
        }))
      };
    }

    const byId = new Map(
      (
        (data ?? []) as Array<{
          id: string;
          name: string | null;
          container_kind: string | null;
        }>
      ).map((row) => [
        row.id,
        {
          name: String(row.name ?? "").trim() || "Event",
          container_kind: normalizeEventContainerKind(row.container_kind)
        }
      ])
    );

    const events = resolution.eventIds.map((id) => {
      const meta = byId.get(id);
      return {
        id,
        name: meta?.name ?? "Event",
        container_kind: meta?.container_kind ?? normalizeEventContainerKind(null)
      };
    });

    return { resolution, events };
  }
);

export async function getExhibitorHasAccessibleEvents(userId: string): Promise<boolean> {
  const r = await getCachedExhibitorAccessibleEventResolution(userId);
  return r.eventIds.length > 0;
}

/**
 * Active event name for surfaces that only need a label (cookie + canonical order; not client state).
 * Returns `null` for platform_admin and users with no accessible events.
 */
export const getCachedExhibitorDisplayEventName = cache(async (userId: string): Promise<string | null> => {
  const { resolution, events } = await getCachedExhibitorAccessibleEventSummaries(userId);
  if (resolution.resolution === "platform_all" || events.length === 0) return null;

  const store = await cookies();
  const raw = store.get(EXHIBITOR_APP_ACTIVE_EVENT_COOKIE)?.value;
  let cookieId: string | null = null;
  if (raw != null && raw !== "") {
    try {
      cookieId = decodeURIComponent(raw).trim() || null;
    } catch {
      cookieId = String(raw).trim() || null;
    }
  }

  const activeId = pickExhibitorAppActiveEventId(resolution.eventIds, null, cookieId);
  if (!activeId) return null;
  return events.find((e) => e.id === activeId)?.name ?? null;
});
