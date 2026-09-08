import "server-only";

import { cache } from "react";

import { loadAuthorizedEventOverview, type OverviewLoadInput, type OverviewEventRow } from "@/lib/event-overview/load";
import type { EventOverviewModel } from "@/lib/event-overview/view-model";
import { getPlatformAdminClient } from "./admin-client";
import { getProductAppUrl } from "./handoff";
import { buildLaunchHref } from "./launcher";
import { getOrganizationAccessForUser } from "./registry";

/**
 * Data for the single-event overview.
 *
 * Runs with the service role, so access is scoped here explicitly: the event's
 * owning organization must be in the user's *derived* access (ACTIVE membership
 * of an ACTIVE org), the same rule the launcher applies. An event the user
 * cannot reach is reported as absent rather than as forbidden, so the route
 * cannot be used to probe which ids exist.
 */

const CORE_COLUMNS = "id, slug, name, status, starts_at, ends_at, organization_id";
const DESCRIPTIVE_COLUMNS = "venue, timezone";

/**
 * `venue` and `timezone` arrive with a later migration. Until it is applied to
 * a given Platform Core project the select falls back to the core columns and
 * the page shows those fields as not set — degrading, not failing.
 */
async function readEvent(eventId: string): Promise<OverviewEventRow | null> {
  const supabase = getPlatformAdminClient();
  const full = await supabase
    .from("events")
    .select(`${CORE_COLUMNS}, ${DESCRIPTIVE_COLUMNS}`)
    .eq("id", eventId)
    .maybeSingle();

  if (!full.error) return (full.data as OverviewEventRow | null) ?? null;
  if (full.error.code !== "42703") throw new Error(`Failed to read event: ${full.error.message}`);

  const core = await supabase.from("events").select(CORE_COLUMNS).eq("id", eventId).maybeSingle();
  if (core.error) throw new Error(`Failed to read event: ${core.error.message}`);
  return (core.data as OverviewEventRow | null) ?? null;
}

/**
 * Memoised per request: the event layout (for the header's organization) and
 * the page (for the dashboard) both call this for the same viewer and event.
 * Keyed on primitives because React's cache compares arguments by identity.
 */
export const loadEventOverview = cache(
  (userId: string, eventId: string, platformAdmin: boolean): Promise<EventOverviewModel | null> =>
    loadEventOverviewWith({ userId, eventId, platformAdmin }),
);

/** The un-memoised loader, with injectable clock and sources. */
export async function loadEventOverviewWith(input: OverviewLoadInput): Promise<EventOverviewModel | null> {
  return loadAuthorizedEventOverview(input, {
    getAccess: getOrganizationAccessForUser,
    readEvent,
    async getProductNames() {
      const { data, error } = await getPlatformAdminClient().from("products").select("key, name");
      if (error) throw new Error(`Failed to read products: ${error.message}`);
      return new Map((data ?? []).map((p) => [String(p.key), String(p.name)]));
    },
    getProductAppUrl,
    buildLaunchHref,
  });
}
