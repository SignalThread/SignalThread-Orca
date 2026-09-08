import "server-only";

/**
 * Scoped data loaders for the canonical Event Workspace at
 * /exhibitor/dashboard. One loading path per lifecycle state; derivation lives
 * in `lib/events/event-workspace-*-core.ts`.
 *
 * Contract:
 * - Callers pass an eventId that has ALREADY been validated against the
 *   canonical access resolution (`access.eventIds`) — these loaders use the
 *   admin client and scope every query explicitly; they never widen access.
 * - Every secondary query degrades to `null` on failure ("unavailable"),
 *   never to fabricated zeros. Queries are narrow and bounded.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { loadEventBriefingCounts } from "@/lib/server/event-briefing-counts";
import type {
  ReadinessBriefingCounts,
  ReadinessLicenseRow,
  ReadinessTeamMemberRow
} from "@/lib/events/event-workspace-readiness-core";

/** Narrow events row for identity + lifecycle + readiness (single select). */
export type EventWorkspaceEventRow = {
  id: string;
  name: string | null;
  status: string | null;
  start_date: string | null;
  end_date: string | null;
  city: string | null;
  state: string | null;
  location: string | null;
  timezone: string | null;
  container_kind: string | null;
  briefing_strategy: unknown;
};

const TEAM_ROWS_LIMIT = 100;

async function tryQuery<T>(run: () => PromiseLike<{ data: T | null; error: unknown | null }>): Promise<T | null> {
  try {
    const { data, error } = await run();
    if (error) return null;
    return data ?? null;
  } catch {
    return null;
  }
}

async function tryCount(
  run: () => PromiseLike<{ count: number | null; error: unknown | null }>
): Promise<number | null> {
  try {
    const { count, error } = await run();
    if (error) return null;
    return typeof count === "number" ? count : null;
  } catch {
    return null;
  }
}

/**
 * The canonical events row for the resolved active event. `null` when the
 * query fails — the caller renders honest degraded state, never invented data.
 */
export async function loadEventWorkspaceEventRow(
  eventId: string
): Promise<EventWorkspaceEventRow | null> {
  const supabase = createAdminClient();
  return tryQuery<EventWorkspaceEventRow>(() =>
    (supabase as any)
      .from("events")
      .select("id, name, status, start_date, end_date, city, state, location, timezone, container_kind, briefing_strategy")
      .eq("id", eventId)
      .maybeSingle()
  );
}

export type EventWorkspaceReadinessData = {
  teamMembers: ReadinessTeamMemberRow[] | null;
  pendingInviteCount: number | null;
  licenses: ReadinessLicenseRow[] | null;
  leadCount: number | null;
  briefingCounts: ReadinessBriefingCounts | null;
  knowledgeItemCount: number | null;
};

/**
 * Everything the Upcoming / Event Readiness state needs beyond the events row
 * and the page's leads slice. All queries run in parallel; each degrades to
 * `null` independently.
 */
export async function loadEventWorkspaceReadinessData(input: {
  companyId: string;
  eventId: string;
}): Promise<EventWorkspaceReadinessData> {
  const { companyId, eventId } = input;
  const supabase = createAdminClient();

  const [membershipRows, pendingInviteCount, licenses, leadCount, briefingCounts, knowledgeItemCount] =
    await Promise.all([
      tryQuery<Array<{ user_id: string; status: string | null; permissions: unknown }>>(() =>
        (supabase as any)
          .from("event_users")
          .select("user_id, status, permissions")
          .eq("event_id", eventId)
          .eq("exhibitor_company_id", companyId)
          .limit(TEAM_ROWS_LIMIT)
      ),
      tryCount(() =>
        (supabase as any)
          .from("invite_codes")
          .select("id", { count: "exact", head: true })
          .eq("event_id", eventId)
          .eq("exhibitor_company_id", companyId)
          .is("used_at", null)
      ),
      tryQuery<ReadinessLicenseRow[]>(() =>
        (supabase as any)
          .from("licenses")
          .select("seats_total, seats_used")
          .eq("exhibitor_company_id", companyId)
          .eq("status", "active")
      ),
      tryCount(() =>
        (supabase as any)
          .from("leads")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .eq("event_id", eventId)
      ),
      // Exact company/event-scoped briefing counts; failure remains null.
      loadEventBriefingCounts({ companyId, eventId }),
      tryCount(() =>
        (supabase as any)
          .from("briefing_event_knowledge_items")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .eq("event_id", eventId)
      )
    ]);

  // Join member identity (names/emails) in one bounded follow-up query.
  let teamMembers: ReadinessTeamMemberRow[] | null = null;
  if (membershipRows !== null) {
    const userIds = [...new Set(membershipRows.map((r) => r.user_id).filter(Boolean))];
    const identityRows =
      userIds.length === 0
        ? []
        : await tryQuery<Array<{ id: string; full_name: string | null; email: string | null }>>(() =>
            (supabase as any)
              .from("users")
              .select("id, full_name, email")
              .in("id", userIds)
              .eq("company_id", companyId)
          );
    const identityById = new Map((identityRows ?? []).map((row) => [row.id, row]));
    teamMembers = membershipRows.map((row) => ({
      user_id: row.user_id,
      status: row.status,
      permissions: row.permissions,
      full_name: identityById.get(row.user_id)?.full_name ?? null,
      email: identityById.get(row.user_id)?.email ?? null
    }));
  }

  return {
    teamMembers,
    pendingInviteCount,
    licenses,
    leadCount,
    briefingCounts,
    knowledgeItemCount
  };
}
