/**
 * P1 Invite / License / Seat Access health.
 *
 * Answers: "Can exhibitors get access before/during the event?"
 *
 * Observes canonical access/capacity truth (licenses, invite_codes, events). Read-only and
 * aggregate-only — it does not re-implement seat enforcement, and never emits license keys,
 * emails, codes, or IDs. Active-license semantics mirror
 * `lib/licenses/exhibitor-company-license-admin-eligibility.ts`: status active + started + not expired.
 */
import type { createAdminClient } from "@/lib/supabase/admin";
import {
  buildHealthResponse,
  loadAllHealthRows,
  minutesBeforeIso,
  normalizeId,
  normalizeText,
  pushCountIssue,
  type LeadRetrievalHealthResponse,
  type ProductHealthIssue,
} from "@/lib/internal-health/shared";

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

export const INVITE_LICENSE_SEAT_SOURCE = "invite-license-seat-access";

export const NEAR_CAPACITY_REMAINING_SEATS = 1;
export const PENDING_INVITE_STALE_DAYS = 7;
export const PENDING_INVITE_RECENT_DAYS = 1;
export const CRITICAL_EXPIRED_ACTIVE_LICENSE_COUNT = 3;
export const CRITICAL_SEAT_EXHAUSTED_ACTIVE_COUNT = 3;
export const CRITICAL_ACTIVE_EVENTS_WITHOUT_LICENSE_COUNT = 5;

type LicenseRow = {
  status: string | null;
  scope: string | null;
  company_id: string | null;
  exhibitor_company_id?: string | null;
  event_id: string | null;
  expires_at: string | null;
  starts_at: string | null;
  seats_total: number | null;
  seats_used: number | null;
};
type EventRow = { id: string | null; company_id: string | null; is_active: boolean | null; start_date: string | null; end_date: string | null };
type InviteRow = { created_at: string | null; expires_at: string | null; used_at: string | null };

export async function getLeadRetrievalInviteLicenseSeatAccessHealth(input: {
  supabase: SupabaseAdmin;
  nowIso?: string;
}): Promise<LeadRetrievalHealthResponse> {
  const checkedAt = input.nowIso ?? new Date().toISOString();
  const nowMs = Date.parse(checkedAt);
  const todayDate = checkedAt.slice(0, 10);
  const pendingStaleCutoff = minutesBeforeIso(checkedAt, PENDING_INVITE_STALE_DAYS * 24 * 60);
  const pendingRecentCutoff = minutesBeforeIso(checkedAt, PENDING_INVITE_RECENT_DAYS * 24 * 60);

  const [licenses, events, invites] = await Promise.all([
    loadAllHealthRows<LicenseRow>({
      supabase: input.supabase,
      table: "licenses",
      select: "status, scope, company_id, exhibitor_company_id, event_id, expires_at, starts_at, seats_total, seats_used",
      errorMessage: "Failed to load licenses access source.",
    }),
    loadAllHealthRows<EventRow>({
      supabase: input.supabase,
      table: "events",
      select: "id, company_id, is_active, start_date, end_date",
      errorMessage: "Failed to load events access source.",
    }),
    loadAllHealthRows<InviteRow>({
      supabase: input.supabase,
      table: "invite_codes",
      select: "created_at, expires_at, used_at",
      errorMessage: "Failed to load invite access source.",
    }),
  ]);

  // Active/future events and their owning companies.
  const activeOrFutureEventIds = new Set<string>();
  const companiesWithActiveEvents = new Set<string>();
  for (const event of events) {
    const id = normalizeId(event.id);
    if (!id) continue;
    if (!isActiveOrFutureEvent(event, todayDate)) continue;
    activeOrFutureEventIds.add(id);
    const companyId = normalizeId(event.company_id);
    if (companyId) companiesWithActiveEvents.add(companyId);
  }

  // License coverage + capacity.
  const coveredEventIds = new Set<string>();
  const coveredCompanyIds = new Set<string>();
  let activeLicenses = 0;
  let expiredLicenses = 0;
  let expiredLicensesForActiveEvents = 0;
  let expiredLicensesForActiveEventsSuperseded = 0;
  let seatExhaustedActiveLicenses = 0;
  let nearCapacityActiveLicenses = 0;
  let seatsTotalActive = 0;
  let seatsUsedActive = 0;

  for (const license of licenses) {
    const active = isActiveLicense(license, nowMs);
    const companyId = getLicenseCoveredCompanyId(license);
    const eventId = normalizeId(license.event_id);

    if (active) {
      activeLicenses += 1;
      if (eventId) coveredEventIds.add(eventId);
      if (companyId && normalizeText(license.scope) !== "event") coveredCompanyIds.add(companyId);

      const total = toCount(license.seats_total);
      const used = toCount(license.seats_used);
      seatsTotalActive += total;
      seatsUsedActive += used;
      if (total > 0 && used >= total) {
        seatExhaustedActiveLicenses += 1;
      } else if (total > 0 && total - used <= NEAR_CAPACITY_REMAINING_SEATS) {
        nearCapacityActiveLicenses += 1;
      }
    } else {
      expiredLicenses += 1;
      const tiedToActiveEvent = findCoveredActiveEvent({
        eventId,
        companyId,
        activeOrFutureEventIds,
        companiesWithActiveEvents,
        events,
      });
      if (!tiedToActiveEvent) continue;

      if (isCoveredByActiveLicense(tiedToActiveEvent, licenses, nowMs)) {
        expiredLicensesForActiveEventsSuperseded += 1;
      } else {
        expiredLicensesForActiveEvents += 1;
      }
    }
  }

  let activeEventsWithoutLicense = 0;
  for (const eventId of activeOrFutureEventIds) {
    if (coveredEventIds.has(eventId)) continue;
    const event = events.find((e) => normalizeId(e.id) === eventId);
    const companyId = event ? normalizeId(event.company_id) : null;
    if (companyId && coveredCompanyIds.has(companyId)) continue;
    activeEventsWithoutLicense += 1;
  }

  // Invite status is derived: pending = unused & not expired; expired-unused = unused & expired.
  let pendingInvites = 0;
  let pendingInvitesOver24h = 0;
  let pendingInvitesOver7d = 0;
  let expiredUnusedInvites = 0;
  for (const invite of invites) {
    if (normalizeId(invite.used_at)) continue; // redeemed
    const expired = isExpiredTimestamp(invite.expires_at, nowMs);
    if (expired) {
      expiredUnusedInvites += 1;
      continue;
    }
    pendingInvites += 1;
    if (isAtOrBeforeCutoff(invite.created_at, pendingRecentCutoff)) pendingInvitesOver24h += 1;
    if (isAtOrBeforeCutoff(invite.created_at, pendingStaleCutoff)) pendingInvitesOver7d += 1;
  }

  const issues: ProductHealthIssue[] = [];
  pushCountIssue(issues, {
    code: "expired_licenses_for_active_events",
    count: expiredLicensesForActiveEvents,
    criticalAt: CRITICAL_EXPIRED_ACTIVE_LICENSE_COUNT,
    warningMessage: "Some expired licenses are tied to active/future events.",
    criticalMessage: "Multiple expired licenses are tied to active/future events; onboarding is at risk.",
  });
  pushCountIssue(issues, {
    code: "seats_exhausted_active_licenses",
    count: seatExhaustedActiveLicenses,
    criticalAt: CRITICAL_SEAT_EXHAUSTED_ACTIVE_COUNT,
    warningMessage: "Some active licenses are at seat capacity.",
    criticalMessage: "Multiple active licenses are at seat capacity and may block new exhibitor access.",
  });
  pushCountIssue(issues, {
    code: "active_events_without_license",
    count: activeEventsWithoutLicense,
    criticalAt: CRITICAL_ACTIVE_EVENTS_WITHOUT_LICENSE_COUNT,
    warningMessage: "Some active/future events have no covering license.",
    criticalMessage: "Multiple active/future events have no covering license; exhibitors cannot onboard.",
  });
  pushCountIssue(issues, {
    code: "licenses_near_seat_capacity",
    count: nearCapacityActiveLicenses,
    criticalAt: Number.POSITIVE_INFINITY,
    warningMessage: "Some active licenses are near seat capacity.",
    criticalMessage: "Active licenses are near seat capacity.",
  });
  pushCountIssue(issues, {
    code: "pending_invites_aging",
    count: pendingInvitesOver7d,
    criticalAt: Number.POSITIVE_INFINITY,
    warningMessage: "Some pending invites have been unredeemed for over a week.",
    criticalMessage: "Pending invites have been unredeemed for over a week.",
  });

  const metrics: LeadRetrievalHealthResponse["metrics"] = {
    totalLicenses: licenses.length,
    activeLicenses,
    expiredLicenses,
    expiredLicensesForActiveEvents,
    expiredLicensesForActiveEventsSuperseded,
    seatsTotalActive,
    seatsUsedActive,
    seatExhaustedActiveLicenses,
    nearCapacityActiveLicenses,
    activeOrFutureEvents: activeOrFutureEventIds.size,
    activeEventsWithoutLicense,
    pendingInvites,
    pendingInvitesOver24h,
    pendingInvitesOver7d,
    expiredUnusedInvites,
  };

  return buildHealthResponse({
    source: INVITE_LICENSE_SEAT_SOURCE,
    checkedAt,
    summary: buildSummary({ expiredLicensesForActiveEvents, seatExhaustedActiveLicenses, activeEventsWithoutLicense }),
    metrics,
    issues,
    window: { staleAfterMinutes: PENDING_INVITE_STALE_DAYS * 24 * 60 },
  });
}

function isActiveLicense(license: LicenseRow, nowMs: number): boolean {
  if (normalizeText(license.status) !== "active") return false;
  if (isNotYetStarted(license.starts_at, nowMs)) return false;
  if (isExpiredTimestamp(license.expires_at, nowMs)) return false;
  return true;
}

function getLicenseCoveredCompanyId(license: LicenseRow) {
  if (normalizeText(license.scope) === "company") {
    return normalizeId(license.exhibitor_company_id) ?? normalizeId(license.company_id);
  }
  return normalizeId(license.company_id) ?? normalizeId(license.exhibitor_company_id);
}

function findCoveredActiveEvent({
  eventId,
  companyId,
  activeOrFutureEventIds,
  companiesWithActiveEvents,
  events,
}: {
  eventId: string | null;
  companyId: string | null;
  activeOrFutureEventIds: Set<string>;
  companiesWithActiveEvents: Set<string>;
  events: EventRow[];
}) {
  if (eventId && activeOrFutureEventIds.has(eventId)) {
    return events.find((event) => normalizeId(event.id) === eventId) ?? null;
  }

  if (!companyId || !companiesWithActiveEvents.has(companyId)) {
    return null;
  }

  return events.find((event) => normalizeId(event.company_id) === companyId) ?? null;
}

function isCoveredByActiveLicense(event: EventRow, licenses: LicenseRow[], nowMs: number) {
  const eventId = normalizeId(event.id);
  const eventCompanyId = normalizeId(event.company_id);

  return licenses.some((license) => {
    if (!isActiveLicense(license, nowMs)) return false;

    const licenseEventId = normalizeId(license.event_id);
    if (eventId && licenseEventId === eventId) return true;

    const licenseCompanyId = getLicenseCoveredCompanyId(license);
    return normalizeText(license.scope) !== "event" &&
      Boolean(eventCompanyId) &&
      licenseCompanyId === eventCompanyId;
  });
}

function isNotYetStarted(startsAt: string | null, nowMs: number): boolean {
  if (!startsAt) return false;
  const t = Date.parse(startsAt);
  if (!Number.isFinite(t)) return false;
  return t > nowMs;
}

function isExpiredTimestamp(expiresAt: string | null, nowMs: number): boolean {
  if (!expiresAt) return false;
  const t = Date.parse(expiresAt);
  if (!Number.isFinite(t)) return false;
  return t <= nowMs;
}

function isActiveOrFutureEvent(event: EventRow, todayDate: string): boolean {
  if (event.is_active === true) return true;
  const endDate = String(event.end_date ?? "").slice(0, 10);
  if (endDate && endDate >= todayDate) return true;
  const startDate = String(event.start_date ?? "").slice(0, 10);
  if (startDate && startDate >= todayDate) return true;
  return false;
}

function isAtOrBeforeCutoff(value: string | null | undefined, cutoffIso: string): boolean {
  const ms = Date.parse(String(value ?? ""));
  if (!Number.isFinite(ms)) return false;
  return new Date(ms).toISOString() <= cutoffIso;
}

function toCount(value: number | null): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function buildSummary(input: {
  expiredLicensesForActiveEvents: number;
  seatExhaustedActiveLicenses: number;
  activeEventsWithoutLicense: number;
}): string {
  const problems =
    input.expiredLicensesForActiveEvents + input.seatExhaustedActiveLicenses + input.activeEventsWithoutLicense;
  if (problems > 0) {
    return `Onboarding access degraded: ${input.expiredLicensesForActiveEvents} expired licenses for active events, ${input.seatExhaustedActiveLicenses} seat-exhausted, ${input.activeEventsWithoutLicense} active events without a license.`;
  }
  return "Onboarding access healthy: active events have covering licenses and seat capacity.";
}
