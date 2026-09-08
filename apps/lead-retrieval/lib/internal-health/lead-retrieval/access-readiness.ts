/**
 * P0 Auth / Tenant / Event Access readiness health.
 *
 * Answers: "Can the right users get into the right event/company during showtime?"
 *
 * Strictly read-only and server-side-truth. Reads `users`, `event_users`, `events`, and
 * `companies`, then reports aggregate access risk. IDs are used only for orphan/scope-gap
 * set membership and are never emitted — the response carries counts only, no user/company/
 * event identifiers, emails, or names.
 *
 * Canonical role set mirrors `types/app.ts` `AppRole`. Exhibitor-scoped roles
 * (`exhibitor_admin`, `exhibitor_viewer`) require company context to be scoped at all.
 */
import type { createAdminClient } from "@/lib/supabase/admin";
import {
  buildHealthResponse,
  loadAllHealthRows,
  normalizeId,
  normalizeText,
  pushCountIssue,
  type LeadRetrievalHealthResponse,
  type ProductHealthIssue,
} from "@/lib/internal-health/shared";

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

export const ACCESS_READINESS_SOURCE = "access-readiness";

/** Mirror of `types/app.ts` AppRole. Roles outside this set are treated as invalid. */
export const VALID_ROLES = [
  "platform_admin",
  "organizer_admin",
  "exhibitor_admin",
  "exhibitor_viewer",
  "viewer",
] as const;

const EXHIBITOR_SCOPED_ROLES = ["exhibitor_admin", "exhibitor_viewer"] as const;

export const CRITICAL_INVALID_ROLE_COUNT = 5;
export const CRITICAL_MISSING_COMPANY_COUNT = 5;
export const CRITICAL_ACTIVE_EVENTS_WITHOUT_ACCESS_COUNT = 5;
export const CRITICAL_ORPHANED_ACCESS_COUNT = 50;

type UserRow = { id: string | null; role: string | null; company_id: string | null; event_access_mode: string | null };
type EventUserRow = {
  event_id: string | null;
  user_id: string | null;
  exhibitor_company_id: string | null;
  status: string | null;
};
type EventRow = {
  id: string | null;
  company_id: string | null;
  status: string | null;
  is_active: boolean | null;
  start_date: string | null;
  end_date: string | null;
};
type CompanyRow = { id: string | null };

export async function getLeadRetrievalAccessReadinessHealth(input: {
  supabase: SupabaseAdmin;
  nowIso?: string;
}): Promise<LeadRetrievalHealthResponse> {
  const checkedAt = input.nowIso ?? new Date().toISOString();
  const todayDate = checkedAt.slice(0, 10);

  const [users, eventUsers, events, companies] = await Promise.all([
    loadAllHealthRows<UserRow>({
      supabase: input.supabase,
      table: "users",
      select: "id, role, company_id, event_access_mode",
      errorMessage: "Failed to load users access source.",
    }),
    loadAllHealthRows<EventUserRow>({
      supabase: input.supabase,
      table: "event_users",
      select: "event_id, user_id, exhibitor_company_id, status",
      errorMessage: "Failed to load event access source.",
    }),
    loadAllHealthRows<EventRow>({
      supabase: input.supabase,
      table: "events",
      select: "id, company_id, status, is_active, start_date, end_date",
      errorMessage: "Failed to load events access source.",
    }),
    loadAllHealthRows<CompanyRow>({
      supabase: input.supabase,
      table: "companies",
      select: "id",
      errorMessage: "Failed to load companies access source.",
    }),
  ]);

  const userIds = new Set<string>();
  let usersInvalidRole = 0;
  let usersDeprecatedRole = 0;
  let exhibitorUsersMissingCompany = 0;
  const exhibitorAssignedUserIdsNeedingAccess = new Set<string>();

  for (const row of users) {
    const id = normalizeId(row.id);
    if (id) userIds.add(id);
    const role = normalizeUserRole(row.role);

    if (!role || !(VALID_ROLES as readonly string[]).includes(role)) {
      usersInvalidRole += 1;
    }
    if (role === "viewer") usersDeprecatedRole += 1;

    const exhibitorScoped = (EXHIBITOR_SCOPED_ROLES as readonly string[]).includes(role);
    if (exhibitorScoped && !normalizeId(row.company_id)) {
      exhibitorUsersMissingCompany += 1;
    }
    if (exhibitorScoped && normalizeText(row.event_access_mode) === "assigned_events_only" && id) {
      exhibitorAssignedUserIdsNeedingAccess.add(id);
    }
  }

  const eventIds = new Set<string>();
  const activeOrFutureEventIds = new Set<string>();
  for (const row of events) {
    const id = normalizeId(row.id);
    if (!id) continue;
    eventIds.add(id);
    if (isActiveOrFutureEvent(row, todayDate)) activeOrFutureEventIds.add(id);
  }

  const companyIds = new Set<string>();
  for (const row of companies) {
    const id = normalizeId(row.id);
    if (id) companyIds.add(id);
  }

  let totalEventAccessRows = 0;
  let activeEventAccessRows = 0;
  let eventAccessOrphanUserCount = 0;
  let eventAccessOrphanEventCount = 0;
  let eventAccessOrphanCompanyCount = 0;
  const eventIdsWithAnyAccess = new Set<string>();
  const userIdsWithAnyAccess = new Set<string>();

  for (const row of eventUsers) {
    totalEventAccessRows += 1;
    if (normalizeText(row.status) === "active") activeEventAccessRows += 1;

    const userId = normalizeId(row.user_id);
    const eventId = normalizeId(row.event_id);
    const companyId = normalizeId(row.exhibitor_company_id);

    if (userId) userIdsWithAnyAccess.add(userId);
    if (eventId) eventIdsWithAnyAccess.add(eventId);

    if (!userId || !userIds.has(userId)) eventAccessOrphanUserCount += 1;
    if (!eventId || !eventIds.has(eventId)) eventAccessOrphanEventCount += 1;
    if (companyId && !companyIds.has(companyId)) eventAccessOrphanCompanyCount += 1;
  }

  let activeEventsWithoutExhibitorAccess = 0;
  for (const eventId of activeOrFutureEventIds) {
    if (!eventIdsWithAnyAccess.has(eventId)) activeEventsWithoutExhibitorAccess += 1;
  }

  let exhibitorAssignedUsersWithoutEventAccess = 0;
  for (const userId of exhibitorAssignedUserIdsNeedingAccess) {
    if (!userIdsWithAnyAccess.has(userId)) exhibitorAssignedUsersWithoutEventAccess += 1;
  }

  const orphanedEventAccessRows =
    eventAccessOrphanUserCount + eventAccessOrphanEventCount + eventAccessOrphanCompanyCount;

  const issues: ProductHealthIssue[] = [];
  pushCountIssue(issues, {
    code: "users_invalid_role",
    count: usersInvalidRole,
    criticalAt: CRITICAL_INVALID_ROLE_COUNT,
    warningMessage: "Some users have a role value outside the canonical role set.",
    criticalMessage: "Multiple users have invalid role values that would block expected access.",
  });
  pushCountIssue(issues, {
    code: "exhibitor_users_missing_company",
    count: exhibitorUsersMissingCompany,
    criticalAt: CRITICAL_MISSING_COMPANY_COUNT,
    warningMessage: "Some exhibitor users are missing company context and cannot be scoped.",
    criticalMessage: "Multiple exhibitor users are missing company context and cannot be scoped to a tenant.",
  });
  pushCountIssue(issues, {
    code: "active_events_without_exhibitor_access",
    count: activeEventsWithoutExhibitorAccess,
    criticalAt: CRITICAL_ACTIVE_EVENTS_WITHOUT_ACCESS_COUNT,
    warningMessage: "Some active/future events have no exhibitor access rows.",
    criticalMessage: "Multiple active/future events have no exhibitor access rows; showtime access is at risk.",
  });
  pushCountIssue(issues, {
    code: "exhibitor_assigned_users_without_event_access",
    count: exhibitorAssignedUsersWithoutEventAccess,
    criticalAt: Number.POSITIVE_INFINITY,
    warningMessage: "Some assigned-events-only exhibitor users have no event access rows.",
    criticalMessage: "Assigned-events-only exhibitor users have no event access rows.",
  });
  pushCountIssue(issues, {
    code: "orphaned_event_access_rows",
    count: orphanedEventAccessRows,
    criticalAt: CRITICAL_ORPHANED_ACCESS_COUNT,
    warningMessage: "Some event access rows point to missing users, events, or companies.",
    criticalMessage: "A large number of event access rows point to missing users, events, or companies.",
  });

  const metrics: LeadRetrievalHealthResponse["metrics"] = {
    totalUsers: users.length,
    usersInvalidRole,
    usersDeprecatedRole,
    exhibitorUsersMissingCompany,
    totalEventAccessRows,
    activeEventAccessRows,
    eventAccessOrphanUserCount,
    eventAccessOrphanEventCount,
    eventAccessOrphanCompanyCount,
    orphanedEventAccessRows,
    totalEvents: events.length,
    activeOrFutureEvents: activeOrFutureEventIds.size,
    activeEventsWithoutExhibitorAccess,
    exhibitorAssignedUsersWithoutEventAccess,
  };

  return buildHealthResponse({
    source: ACCESS_READINESS_SOURCE,
    checkedAt,
    summary: buildSummary({ usersInvalidRole, exhibitorUsersMissingCompany, activeEventsWithoutExhibitorAccess }),
    metrics,
    issues,
  });
}

function isActiveOrFutureEvent(event: EventRow, todayDate: string): boolean {
  if (event.is_active === true) return true;
  const endDate = String(event.end_date ?? "").slice(0, 10);
  if (endDate && endDate >= todayDate) return true;
  const startDate = String(event.start_date ?? "").slice(0, 10);
  if (startDate && startDate >= todayDate) return true;
  return false;
}

function normalizeUserRole(role: unknown) {
  const normalized = normalizeText(role);
  if (normalized === "event_organizer" || normalized === "organizer") {
    return "organizer_admin";
  }
  return normalized;
}

function buildSummary(input: {
  usersInvalidRole: number;
  exhibitorUsersMissingCompany: number;
  activeEventsWithoutExhibitorAccess: number;
}): string {
  const problems =
    input.usersInvalidRole + input.exhibitorUsersMissingCompany + input.activeEventsWithoutExhibitorAccess;
  if (problems > 0) {
    return `Access readiness degraded: ${input.usersInvalidRole} invalid roles, ${input.exhibitorUsersMissingCompany} exhibitor users missing company, ${input.activeEventsWithoutExhibitorAccess} active events without access.`;
  }
  return "Access readiness healthy: users have valid role/company context and active events have access rows.";
}
