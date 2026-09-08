import { eventMembershipGrantsAppOrAdminSurface } from "@/lib/exhibitor/event-app-permission-enabled";
import { normalizeEventAccessMode, type EventAccessMode } from "@/lib/access/event-access-mode";
import {
  buildCompanyTeamEventAccessSummary,
  type CompanyTeamEventAccessSummary
} from "@/lib/exhibitor/company-team-access-present";
import { deriveCompanyTeamMemberStatus } from "@/lib/exhibitor/company-team-member-status";
import type { CompanyTeamMemberStatus } from "@/lib/exhibitor/company-team-types";

export type CompanyScopedLicenseStatus = "active" | "trial" | "expired";
export type CompanyScopedUsageHealth = "healthy" | "watch" | "inactive" | "over_limit" | "expiring";

export type CompanyScopedOverviewKpis = {
  licensedCompanies: number;
  activeLicenses: number;
  seatsUsed: number;
  seatsAllocated: number;
  activeUsers: number;
  pendingInvites: number;
  activeEvents: number;
  eventsThisMonth: number;
  leadsCaptured: number;
};

export type CompanyScopedOverviewRow = {
  companyId: string;
  companyName: string;
  licenseId: string;
  licenseStatus: CompanyScopedLicenseStatus;
  licenseTier: string;
  expiresAt: string | null;
  maxEvents: number | null;
  seatsUsed: number;
  seatsAllocated: number;
  activeUsers: number;
  pendingInvites: number;
  activeEvents: number;
  eventsThisMonth: number;
  leadsCaptured: number;
  lastActivityAt: string | null;
  usageHealth: CompanyScopedUsageHealth;
};

export type CompanyScopedOverviewData = {
  kpis: CompanyScopedOverviewKpis;
  companies: CompanyScopedOverviewRow[];
};

export type CompanyScopedCompaniesDirectorySummary = {
  totalLicensedCompanies: number;
  activeCompanies: number;
  companiesWithPendingInvites: number;
  companiesNearOrOverLimits: number;
};

export type CompanyScopedLicensesSummary = {
  totalCompanyLicenses: number;
  activeLicenses: number;
  expiringLicenses: number;
  nearOrOverLimitLicenses: number;
};

export type CompanyScopedUserRole = "exhibitor_admin" | "viewer";

export type CompanyScopedUsersDirectoryRow = {
  id: string;
  isPendingInvite: boolean;
  fullName: string | null;
  email: string | null;
  companyId: string;
  companyName: string;
  role: CompanyScopedUserRole;
  status: CompanyTeamMemberStatus;
  seatConsuming: boolean;
  eventAccessMode: EventAccessMode;
  eventSummary: CompanyTeamEventAccessSummary;
  assignedEventDetails: { id: string; name: string }[];
  lastActivityOrInvitedAt: string | null;
};

export type CompanyScopedUsersDirectorySummary = {
  totalUsers: number;
  activeUsers: number;
  pendingInvites: number;
  seatConsumingUsers: number;
};

export type CompanyScopedEventsDirectoryRow = {
  eventId: string;
  eventName: string;
  companyId: string;
  companyName: string;
  status: string | null;
  startDate: string | null;
  endDate: string | null;
  usersAssigned: number;
  leadsCaptured: number;
  licenseTier: string;
  usageHealth: CompanyScopedUsageHealth;
  lastActivityAt: string | null;
};

export type CompanyScopedEventsDirectorySummary = {
  totalEvents: number;
  activeEvents: number;
  eventsThisMonth: number;
  companiesRunningEvents: number;
};

type CompanyScopedLicenseRow = {
  id: string;
  company_id: string;
  exhibitor_company_id: string | null;
  license_plan_id: string | null;
  seats_total: number | null;
  seats_used: number | null;
  status: string | null;
  expires_at: string | null;
  created_at: string;
  max_events: number | null;
};

type CompanyNameRow = {
  id: string;
  name: string;
};

type LicensePlanRow = {
  id: string;
  code: string;
  name: string;
};

type EventUsageRow = {
  id: string;
  name?: string | null;
  company_id: string;
  status: string | null;
  is_active: boolean | null;
  start_date: string | null;
  end_date?: string | null;
  created_at: string | null;
  updated_at: string;
};

type EventMembershipRow = {
  user_id: string;
  event_id?: string | null;
  exhibitor_company_id: string | null;
  status: string | null;
  permissions: unknown;
  created_at: string;
};

type LeadUsageRow = {
  company_id: string;
  event_id?: string | null;
  created_at: string;
  updated_at: string;
};

type CompanyScopedUserRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
  company_id: string | null;
  event_access_mode: string | null;
  created_at: string | null;
};

type CompanyEventNameRow = {
  id: string;
  company_id: string;
  name: string | null;
};

type CompanyScopedMembershipRow = {
  user_id: string;
  event_id: string;
  exhibitor_company_id: string | null;
  status: string | null;
  permissions: unknown;
  created_at: string | null;
};

type CompanyScopedPendingInviteRow = {
  event_id: string;
  exhibitor_company_id: string | null;
  email: string | null;
  permissions: unknown;
  event_access_mode: string | null;
  expires_at: string | null;
  created_at: string | null;
};

type CompanyScopedAuthUserRow = {
  id: string;
  email?: string | null;
  banned_until?: string | null;
  last_sign_in_at?: string | null;
  created_at?: string | null;
};

type BuildOverviewInput = {
  licenses: CompanyScopedLicenseRow[];
  companies: CompanyNameRow[];
  licensePlans: LicensePlanRow[];
  events: EventUsageRow[];
  memberships: EventMembershipRow[];
  leads: LeadUsageRow[];
  users?: CompanyScopedUserRow[];
  authUsers?: CompanyScopedAuthUserRow[];
  nowMs?: number;
};

type BuildCompanyScopedUsersDirectoryInput = {
  overviewCompanies: CompanyScopedOverviewRow[];
  users: CompanyScopedUserRow[];
  events: CompanyEventNameRow[];
  memberships: CompanyScopedMembershipRow[];
  pendingInvites: CompanyScopedPendingInviteRow[];
  authUsers: CompanyScopedAuthUserRow[];
  nowMs?: number;
};

type BuildCompanyScopedEventsDirectoryInput = {
  overviewCompanies: CompanyScopedOverviewRow[];
  events: EventUsageRow[];
  memberships: CompanyScopedMembershipRow[];
  leads: LeadUsageRow[];
  nowMs?: number;
};

export type CompanyScopedUsageHealthInput = {
  licenseStatus: CompanyScopedLicenseStatus;
  expiresAt: string | null;
  seatsUsed: number;
  seatsAllocated: number;
  activeUsers: number;
  pendingInvites: number;
  activeEvents: number;
  leadsCaptured: number;
  maxEvents: number | null;
  nowMs?: number;
};

function normalizeLicenseStatus(value: string | null | undefined): CompanyScopedLicenseStatus {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "trial") return "trial";
  if (normalized === "active") return "active";
  return "expired";
}

function maxIsoTimestamp(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return Date.parse(a) >= Date.parse(b) ? a : b;
}

function targetCompanyIdForLicense(row: CompanyScopedLicenseRow) {
  return String(row.exhibitor_company_id ?? row.company_id ?? "").trim();
}

function toMonthBucketFromIsoDate(value: string | null | undefined): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  return raw.slice(0, 7);
}

function toMonthBucketFromMs(ms: number): string {
  const d = new Date(ms);
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${d.getUTCFullYear()}-${month}`;
}

function isActiveEvent(row: EventUsageRow) {
  if (row.is_active === true) return true;
  return String(row.status ?? "").trim().toLowerCase() === "active";
}

function daysUntil(dateText: string, nowMs: number) {
  const targetMs = Date.parse(dateText);
  if (Number.isNaN(targetMs)) return null;
  return Math.floor((targetMs - nowMs) / 86_400_000);
}

function normalizeCompanyRole(value: string | null | undefined): CompanyScopedUserRole {
  return String(value ?? "").trim().toLowerCase() === "exhibitor_admin"
    ? "exhibitor_admin"
    : "viewer";
}

function normalizeEmail(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

function readPermissionFlag(value: unknown, key: "admin" | "app") {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const raw = (value as Record<string, unknown>)[key];
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "string") return raw.trim().toLowerCase() === "true";
  if (typeof raw === "number") return raw === 1;
  return false;
}

function sortAssignedEventDetails(rows: Iterable<{ id: string; name: string }>) {
  return [...rows].sort((a, b) => a.name.localeCompare(b.name));
}

function statusSortOrder(status: CompanyTeamMemberStatus) {
  if (status === "active") return 0;
  if (status === "invited") return 1;
  if (status === "expired") return 2;
  return 3;
}

export function isCompanyScopedSeatConsumingUser(input: {
  status: CompanyTeamMemberStatus;
  isPendingInvite: boolean;
  hasActiveAppMembership: boolean;
}) {
  return !input.isPendingInvite && input.status === "active" && input.hasActiveAppMembership;
}

export function buildCompanyScopedSeatConsumingUserIds(
  memberships: ReadonlyArray<{
    user_id: string | null;
    exhibitor_company_id: string | null;
    status: string | null;
    permissions: unknown;
  }>,
  options: { companyIds?: ReadonlySet<string> } = {}
): Map<string, Set<string>> {
  const byCompany = new Map<string, Set<string>>();
  for (const row of memberships) {
    const companyId = String(row.exhibitor_company_id ?? "").trim();
    const userId = String(row.user_id ?? "").trim();
    if (!companyId || !userId) continue;
    if (options.companyIds && !options.companyIds.has(companyId)) continue;
    if (String(row.status ?? "").trim().toLowerCase() !== "active") continue;
    if (!readPermissionFlag(row.permissions, "app")) continue;

    const ids = byCompany.get(companyId) ?? new Set<string>();
    ids.add(userId);
    byCompany.set(companyId, ids);
  }
  return byCompany;
}

export function computeCompanyScopedUsageHealth(
  input: CompanyScopedUsageHealthInput
): CompanyScopedUsageHealth {
  const nowMs = input.nowMs ?? Date.now();
  const seatsUsed = Math.max(0, Number(input.seatsUsed ?? 0));
  const seatsAllocated = Math.max(0, Number(input.seatsAllocated ?? 0));
  const activeUsers = Math.max(0, Number(input.activeUsers ?? 0));
  const pendingInvites = Math.max(0, Number(input.pendingInvites ?? 0));
  const activeEvents = Math.max(0, Number(input.activeEvents ?? 0));
  const leadsCaptured = Math.max(0, Number(input.leadsCaptured ?? 0));

  if (seatsAllocated >= 0 && seatsUsed > seatsAllocated) {
    return "over_limit";
  }
  if (input.maxEvents != null && activeEvents > Math.max(0, Number(input.maxEvents))) {
    return "over_limit";
  }

  const expiryDays = input.expiresAt ? daysUntil(input.expiresAt, nowMs) : null;
  if (
    (input.licenseStatus === "active" || input.licenseStatus === "trial") &&
    expiryDays != null &&
    expiryDays >= 0 &&
    expiryDays <= 30
  ) {
    return "expiring";
  }

  if (
    input.licenseStatus === "expired" ||
    (activeUsers === 0 && pendingInvites === 0 && activeEvents === 0 && leadsCaptured === 0)
  ) {
    return "inactive";
  }

  const seatsNearLimit = seatsAllocated > 0 && seatsUsed / seatsAllocated >= 0.85;
  const invitePressure = seatsAllocated > 0 && seatsUsed + pendingInvites >= seatsAllocated;
  const eventsNearLimit =
    input.maxEvents != null &&
    input.maxEvents > 0 &&
    activeEvents / input.maxEvents >= 0.85;

  if (seatsNearLimit || invitePressure || eventsNearLimit) {
    return "watch";
  }

  return "healthy";
}

export function buildCompanyScopedOverviewData(
  input: BuildOverviewInput
): CompanyScopedOverviewData {
  const nowMs = input.nowMs ?? Date.now();
  const currentMonth = toMonthBucketFromMs(nowMs);

  const latestLicenseByCompany = new Map<string, CompanyScopedLicenseRow>();
  for (const row of input.licenses) {
    const companyId = targetCompanyIdForLicense(row);
    if (!companyId) continue;
    const existing = latestLicenseByCompany.get(companyId);
    if (!existing || Date.parse(row.created_at) > Date.parse(existing.created_at)) {
      latestLicenseByCompany.set(companyId, row);
    }
  }

  const companyNameById = new Map(input.companies.map((row) => [row.id, row.name]));
  const planLabelById = new Map(
    input.licensePlans.map((row) => [row.id, row.name || row.code || "Not assigned"])
  );
  const licensedCompanyIds = new Set([...latestLicenseByCompany.keys()]);
  const seatConsumingUserIdsByCompany = buildCompanyScopedSeatConsumingUserIds(
    input.memberships,
    { companyIds: licensedCompanyIds }
  );

  const eventStatsByCompany = new Map<
    string,
    { activeEvents: number; eventsThisMonth: number; lastActivityAt: string | null }
  >();
  for (const row of input.events) {
    const companyId = String(row.company_id ?? "").trim();
    if (!latestLicenseByCompany.has(companyId)) continue;
    const existing = eventStatsByCompany.get(companyId) ?? {
      activeEvents: 0,
      eventsThisMonth: 0,
      lastActivityAt: null
    };
    if (isActiveEvent(row)) {
      existing.activeEvents += 1;
    }
    if (toMonthBucketFromIsoDate(row.start_date) === currentMonth) {
      existing.eventsThisMonth += 1;
    }
    existing.lastActivityAt = maxIsoTimestamp(existing.lastActivityAt, row.updated_at ?? row.created_at ?? null);
    existing.lastActivityAt = maxIsoTimestamp(existing.lastActivityAt, row.created_at ?? null);
    eventStatsByCompany.set(companyId, existing);
  }

  const membershipStatsByCompany = new Map<
    string,
    {
      activeUserIds: Set<string>;
      pendingInviteIds: Set<string>;
      lastActivityAt: string | null;
    }
  >();
  for (const row of input.memberships) {
    const companyId = String(row.exhibitor_company_id ?? "").trim();
    if (!latestLicenseByCompany.has(companyId)) continue;
    if (!eventMembershipGrantsAppOrAdminSurface(row.permissions)) continue;
    const existing = membershipStatsByCompany.get(companyId) ?? {
      activeUserIds: new Set<string>(),
      pendingInviteIds: new Set<string>(),
      lastActivityAt: null
    };
    const status = String(row.status ?? "").trim().toLowerCase();
    if (status === "active") {
      existing.activeUserIds.add(row.user_id);
    } else if (status === "invited") {
      existing.pendingInviteIds.add(row.user_id);
    }
    existing.lastActivityAt = maxIsoTimestamp(existing.lastActivityAt, row.created_at);
    membershipStatsByCompany.set(companyId, existing);
  }

  const authByUserId = new Map(
    (input.authUsers ?? [])
      .map((row) => [String(row.id ?? "").trim(), row] as const)
      .filter(([id]) => Boolean(id))
  );

  const userStatusStatsByCompany = new Map<
    string,
    {
      activeUserIds: Set<string>;
      pendingInviteIds: Set<string>;
      lastActivityAt: string | null;
    }
  >();
  for (const row of input.users ?? []) {
    const companyId = String(row.company_id ?? "").trim();
    const userId = String(row.id ?? "").trim();
    if (!companyId || !userId || !latestLicenseByCompany.has(companyId)) continue;
    const normalizedRole = String(row.role ?? "").trim().toLowerCase();
    if (normalizedRole === "platform_admin" || normalizedRole === "event_organizer") continue;
    const auth = authByUserId.get(userId);
    const status = deriveCompanyTeamMemberStatus(
      {
        bannedUntil: auth?.banned_until ?? null,
        lastSignInAt: auth?.last_sign_in_at ?? null,
        createdAtAuth: auth?.created_at ?? row.created_at ?? null
      },
      { nowMs }
    );
    const existing = userStatusStatsByCompany.get(companyId) ?? {
      activeUserIds: new Set<string>(),
      pendingInviteIds: new Set<string>(),
      lastActivityAt: null
    };
    if (status === "active") {
      existing.activeUserIds.add(userId);
    } else if (status === "invited") {
      existing.pendingInviteIds.add(userId);
    }
    existing.lastActivityAt = maxIsoTimestamp(existing.lastActivityAt, auth?.last_sign_in_at ?? null);
    existing.lastActivityAt = maxIsoTimestamp(existing.lastActivityAt, auth?.created_at ?? row.created_at ?? null);
    userStatusStatsByCompany.set(companyId, existing);
  }

  const leadStatsByCompany = new Map<
    string,
    { leadsCaptured: number; lastActivityAt: string | null }
  >();
  for (const row of input.leads) {
    const companyId = String(row.company_id ?? "").trim();
    if (!latestLicenseByCompany.has(companyId)) continue;
    const existing = leadStatsByCompany.get(companyId) ?? {
      leadsCaptured: 0,
      lastActivityAt: null
    };
    existing.leadsCaptured += 1;
    existing.lastActivityAt = maxIsoTimestamp(existing.lastActivityAt, row.updated_at ?? row.created_at);
    leadStatsByCompany.set(companyId, existing);
  }

  const rows: CompanyScopedOverviewRow[] = [...latestLicenseByCompany.entries()]
    .map(([companyId, license]) => {
      const membership = membershipStatsByCompany.get(companyId);
      const userStatus = userStatusStatsByCompany.get(companyId);
      const events = eventStatsByCompany.get(companyId);
      const leads = leadStatsByCompany.get(companyId);
      const licenseStatus = normalizeLicenseStatus(license.status);
      const seatsAllocated = Math.max(0, Number(license.seats_total ?? 0));
      const seatsUsed = seatConsumingUserIdsByCompany.get(companyId)?.size ?? 0;
      const activeUserIds = new Set<string>(userStatus?.activeUserIds ?? []);
      for (const id of membership?.activeUserIds ?? []) {
        activeUserIds.add(id);
      }
      const pendingInviteIds = new Set<string>(userStatus?.pendingInviteIds ?? []);
      for (const id of membership?.pendingInviteIds ?? []) {
        pendingInviteIds.add(id);
      }
      const activeUsers = activeUserIds.size;
      const pendingInvites = pendingInviteIds.size;
      const activeEvents = events?.activeEvents ?? 0;
      const eventsThisMonth = events?.eventsThisMonth ?? 0;
      const leadsCaptured = leads?.leadsCaptured ?? 0;
      const lastActivityAt = [
        license.created_at,
        userStatus?.lastActivityAt ?? null,
        membership?.lastActivityAt ?? null,
        events?.lastActivityAt ?? null,
        leads?.lastActivityAt ?? null
      ].reduce<string | null>((latest, candidate) => maxIsoTimestamp(latest, candidate), null);

      return {
        companyId,
        companyName: companyNameById.get(companyId) ?? "Unknown Company",
        licenseId: license.id,
        licenseStatus,
        licenseTier: license.license_plan_id
          ? planLabelById.get(license.license_plan_id) ?? "Not assigned"
          : "Not assigned",
        expiresAt: license.expires_at,
        maxEvents: license.max_events != null ? Math.max(0, Number(license.max_events)) : null,
        seatsUsed,
        seatsAllocated,
        activeUsers,
        pendingInvites,
        activeEvents,
        eventsThisMonth,
        leadsCaptured,
        lastActivityAt,
        usageHealth: computeCompanyScopedUsageHealth({
          licenseStatus,
          expiresAt: license.expires_at,
          seatsUsed,
          seatsAllocated,
          activeUsers,
          pendingInvites,
          activeEvents,
          leadsCaptured,
          maxEvents: license.max_events,
          nowMs
        })
      };
    })
    .sort((a, b) => {
      const healthOrder: Record<CompanyScopedUsageHealth, number> = {
        over_limit: 0,
        expiring: 1,
        watch: 2,
        inactive: 3,
        healthy: 4
      };
      const byHealth = healthOrder[a.usageHealth] - healthOrder[b.usageHealth];
      if (byHealth !== 0) return byHealth;
      return a.companyName.localeCompare(b.companyName);
    });

  const kpis = rows.reduce<CompanyScopedOverviewKpis>(
    (acc, row) => {
      acc.licensedCompanies += 1;
      if (row.licenseStatus === "active") {
        acc.activeLicenses += 1;
      }
      acc.seatsUsed += row.seatsUsed;
      acc.seatsAllocated += row.seatsAllocated;
      acc.activeUsers += row.activeUsers;
      acc.pendingInvites += row.pendingInvites;
      acc.activeEvents += row.activeEvents;
      acc.eventsThisMonth += row.eventsThisMonth;
      acc.leadsCaptured += row.leadsCaptured;
      return acc;
    },
    {
      licensedCompanies: 0,
      activeLicenses: 0,
      seatsUsed: 0,
      seatsAllocated: 0,
      activeUsers: 0,
      pendingInvites: 0,
      activeEvents: 0,
      eventsThisMonth: 0,
      leadsCaptured: 0
    }
  );

  return { kpis, companies: rows };
}

export function summarizeCompanyScopedCompaniesDirectory(
  rows: CompanyScopedOverviewRow[]
): CompanyScopedCompaniesDirectorySummary {
  return rows.reduce<CompanyScopedCompaniesDirectorySummary>(
    (acc, row) => {
      acc.totalLicensedCompanies += 1;
      if (row.licenseStatus === "active") {
        acc.activeCompanies += 1;
      }
      if (row.pendingInvites > 0) {
        acc.companiesWithPendingInvites += 1;
      }
      if (row.usageHealth === "watch" || row.usageHealth === "over_limit") {
        acc.companiesNearOrOverLimits += 1;
      }
      return acc;
    },
    {
      totalLicensedCompanies: 0,
      activeCompanies: 0,
      companiesWithPendingInvites: 0,
      companiesNearOrOverLimits: 0
    }
  );
}

export function summarizeCompanyScopedLicenses(
  rows: CompanyScopedOverviewRow[]
): CompanyScopedLicensesSummary {
  return rows.reduce<CompanyScopedLicensesSummary>(
    (acc, row) => {
      acc.totalCompanyLicenses += 1;
      if (row.licenseStatus === "active") {
        acc.activeLicenses += 1;
      }
      if (row.usageHealth === "expiring") {
        acc.expiringLicenses += 1;
      }
      if (row.usageHealth === "watch" || row.usageHealth === "over_limit") {
        acc.nearOrOverLimitLicenses += 1;
      }
      return acc;
    },
    {
      totalCompanyLicenses: 0,
      activeLicenses: 0,
      expiringLicenses: 0,
      nearOrOverLimitLicenses: 0
    }
  );
}

export function buildCompanyScopedUsersDirectoryData(
  input: BuildCompanyScopedUsersDirectoryInput
): CompanyScopedUsersDirectoryRow[] {
  const nowMs = input.nowMs ?? Date.now();
  const licensedCompanies = input.overviewCompanies.map((row) => ({
    companyId: row.companyId,
    companyName: row.companyName
  }));
  const licensedCompanyIds = new Set(licensedCompanies.map((row) => row.companyId).filter(Boolean));
  const companyNameById = new Map(licensedCompanies.map((row) => [row.companyId, row.companyName] as const));

  const companyEventsByCompany = new Map<string, { id: string; name: string }[]>();
  const eventNameById = new Map<string, string>();
  const companyEventIdSets = new Map<string, Set<string>>();
  for (const row of input.events) {
    const companyId = String(row.company_id ?? "").trim();
    const eventId = String(row.id ?? "").trim();
    if (!companyId || !eventId || !licensedCompanyIds.has(companyId)) continue;
    const eventName = String(row.name ?? "Event");
    const list = companyEventsByCompany.get(companyId) ?? [];
    list.push({ id: eventId, name: eventName });
    companyEventsByCompany.set(companyId, list);
    eventNameById.set(eventId, eventName);
    const eventIds = companyEventIdSets.get(companyId) ?? new Set<string>();
    eventIds.add(eventId);
    companyEventIdSets.set(companyId, eventIds);
  }
  for (const [companyId, list] of companyEventsByCompany.entries()) {
    companyEventsByCompany.set(
      companyId,
      list.sort((a, b) => a.name.localeCompare(b.name))
    );
  }
  const seatConsumingUserIdsByCompany = buildCompanyScopedSeatConsumingUserIds(
    input.memberships,
    { companyIds: licensedCompanyIds }
  );

  const membershipByUserCompany = new Map<
    string,
    {
      assignedEvents: Map<string, { id: string; name: string }>;
      latestInviteAt: string | null;
      hasActiveAppMembership: boolean;
    }
  >();
  for (const row of input.memberships) {
    const companyId = String(row.exhibitor_company_id ?? "").trim();
    const userId = String(row.user_id ?? "").trim();
    const eventId = String(row.event_id ?? "").trim();
    if (!companyId || !userId || !eventId || !licensedCompanyIds.has(companyId)) continue;
    if (!eventMembershipGrantsAppOrAdminSurface(row.permissions)) continue;
    if (!companyEventIdSets.get(companyId)?.has(eventId)) continue;
    const status = String(row.status ?? "").trim().toLowerCase();
    if (status !== "active" && status !== "invited") continue;
    const key = `${companyId}|${userId}`;
    const current = membershipByUserCompany.get(key) ?? {
      assignedEvents: new Map<string, { id: string; name: string }>(),
      latestInviteAt: null,
      hasActiveAppMembership: false
    };
    current.assignedEvents.set(eventId, { id: eventId, name: eventNameById.get(eventId) ?? "Event" });
    if (status === "invited") {
      current.latestInviteAt = maxIsoTimestamp(current.latestInviteAt, row.created_at ?? null);
    }
    if (status === "active" && readPermissionFlag(row.permissions, "app")) {
      current.hasActiveAppMembership = true;
    }
    membershipByUserCompany.set(key, current);
  }

  const authById = new Map(
    input.authUsers
      .map((row) => [String(row.id ?? "").trim(), row] as const)
      .filter(([id]) => Boolean(id))
  );

  const rows: CompanyScopedUsersDirectoryRow[] = [];
  const provisionedCompanyEmailKeys = new Set<string>();

  for (const row of input.users) {
    const companyId = String(row.company_id ?? "").trim();
    const userId = String(row.id ?? "").trim();
    if (!companyId || !userId || !licensedCompanyIds.has(companyId)) continue;
    const membership = membershipByUserCompany.get(`${companyId}|${userId}`);
    const consumesSeat = seatConsumingUserIdsByCompany.get(companyId)?.has(userId) ?? false;
    const auth = authById.get(userId);
    const email = normalizeEmail(row.email);
    if (email) {
      provisionedCompanyEmailKeys.add(`${companyId}|${email}`);
    }

    const assignedEventDetails = sortAssignedEventDetails(membership?.assignedEvents.values() ?? []);
    const eventAccessMode = normalizeEventAccessMode(row.event_access_mode);
    const eventSummary = buildCompanyTeamEventAccessSummary({
      eventAccessMode,
      companyOwnedEventCount: companyEventsByCompany.get(companyId)?.length ?? 0,
      assignedEvents: assignedEventDetails
    });
    const status = deriveCompanyTeamMemberStatus(
      {
        bannedUntil: auth?.banned_until ?? null,
        lastSignInAt: auth?.last_sign_in_at ?? null,
        createdAtAuth: auth?.created_at ?? row.created_at ?? membership?.latestInviteAt ?? null
      },
      { nowMs }
    );

    rows.push({
      id: userId,
      isPendingInvite: false,
      fullName: row.full_name,
      email: row.email,
      companyId,
      companyName: companyNameById.get(companyId) ?? "Unknown Company",
      role: normalizeCompanyRole(row.role),
      status,
      seatConsuming: isCompanyScopedSeatConsumingUser({
        status,
        isPendingInvite: false,
        hasActiveAppMembership: consumesSeat
      }),
      eventAccessMode,
      eventSummary,
      assignedEventDetails,
      lastActivityOrInvitedAt:
        auth?.last_sign_in_at ??
        membership?.latestInviteAt ??
        auth?.created_at ??
        row.created_at ??
        null
    });
  }

  const pendingInvitesByCompanyEmail = new Map<
    string,
    {
      companyId: string;
      email: string;
      assignedEvents: Map<string, { id: string; name: string }>;
      latestInviteAt: string | null;
      anyUnexpired: boolean;
      anyAdmin: boolean;
      anyAllCompanyEvents: boolean;
    }
  >();

  for (const row of input.pendingInvites) {
    const companyId = String(row.exhibitor_company_id ?? "").trim();
    const email = normalizeEmail(row.email);
    const eventId = String(row.event_id ?? "").trim();
    if (!companyId || !email || !eventId || !licensedCompanyIds.has(companyId)) continue;
    if (provisionedCompanyEmailKeys.has(`${companyId}|${email}`)) continue;
    if (!companyEventIdSets.get(companyId)?.has(eventId)) continue;
    if (!eventMembershipGrantsAppOrAdminSurface(row.permissions)) continue;
    const key = `${companyId}|${email}`;
    const current = pendingInvitesByCompanyEmail.get(key) ?? {
      companyId,
      email,
      assignedEvents: new Map<string, { id: string; name: string }>(),
      latestInviteAt: null,
      anyUnexpired: false,
      anyAdmin: false,
      anyAllCompanyEvents: false
    };
    current.assignedEvents.set(eventId, { id: eventId, name: eventNameById.get(eventId) ?? "Event" });
    current.latestInviteAt = maxIsoTimestamp(current.latestInviteAt, row.created_at ?? null);
    const expiresMs = row.expires_at ? Date.parse(row.expires_at) : Number.NaN;
    if (!Number.isNaN(expiresMs) && expiresMs > nowMs) {
      current.anyUnexpired = true;
    }
    if (readPermissionFlag(row.permissions, "admin")) {
      current.anyAdmin = true;
    }
    if (normalizeEventAccessMode(row.event_access_mode) === "all_company_events") {
      current.anyAllCompanyEvents = true;
    }
    pendingInvitesByCompanyEmail.set(key, current);
  }

  for (const pending of pendingInvitesByCompanyEmail.values()) {
    const assignedEventDetails = sortAssignedEventDetails(pending.assignedEvents.values());
    const companyOwnedEventCount = companyEventsByCompany.get(pending.companyId)?.length ?? 0;
    const eventAccessMode =
      pending.anyAllCompanyEvents ||
      (companyOwnedEventCount > 0 && assignedEventDetails.length === companyOwnedEventCount)
        ? "all_company_events"
        : "assigned_events_only";

    rows.push({
      id: `pending:${pending.companyId}:${pending.email}`,
      isPendingInvite: true,
      fullName: null,
      email: pending.email,
      companyId: pending.companyId,
      companyName: companyNameById.get(pending.companyId) ?? "Unknown Company",
      role: pending.anyAdmin ? "exhibitor_admin" : "viewer",
      status: pending.anyUnexpired ? "invited" : "expired",
      seatConsuming: false,
      eventAccessMode,
      eventSummary: buildCompanyTeamEventAccessSummary({
        eventAccessMode,
        companyOwnedEventCount,
        assignedEvents: assignedEventDetails
      }),
      assignedEventDetails,
      lastActivityOrInvitedAt: pending.latestInviteAt
    });
  }

  rows.sort((a, b) => {
    const companyCompare = a.companyName.localeCompare(b.companyName);
    if (companyCompare !== 0) return companyCompare;
    const statusCompare = statusSortOrder(a.status) - statusSortOrder(b.status);
    if (statusCompare !== 0) return statusCompare;
    const nameA = (a.fullName ?? a.email ?? "").toLowerCase();
    const nameB = (b.fullName ?? b.email ?? "").toLowerCase();
    return nameA.localeCompare(nameB);
  });

  return rows;
}

export function summarizeCompanyScopedUsersDirectory(
  rows: CompanyScopedUsersDirectoryRow[]
): CompanyScopedUsersDirectorySummary {
  return rows.reduce<CompanyScopedUsersDirectorySummary>(
    (acc, row) => {
      acc.totalUsers += 1;
      if (row.status === "active") {
        acc.activeUsers += 1;
      }
      if (row.status === "invited") {
        acc.pendingInvites += 1;
      }
      if (row.seatConsuming) {
        acc.seatConsumingUsers += 1;
      }
      return acc;
    },
    {
      totalUsers: 0,
      activeUsers: 0,
      pendingInvites: 0,
      seatConsumingUsers: 0
    }
  );
}

export function buildCompanyScopedEventsDirectoryData(
  input: BuildCompanyScopedEventsDirectoryInput
): CompanyScopedEventsDirectoryRow[] {
  const overviewByCompanyId = new Map(
    input.overviewCompanies.map((row) => [row.companyId, row] as const)
  );

  const membershipStatsByEvent = new Map<
    string,
    {
      userIds: Set<string>;
      lastActivityAt: string | null;
    }
  >();
  for (const row of input.memberships) {
    const companyId = String(row.exhibitor_company_id ?? "").trim();
    const eventId = String(row.event_id ?? "").trim();
    if (!companyId || !eventId || !overviewByCompanyId.has(companyId)) continue;
    if (!eventMembershipGrantsAppOrAdminSurface(row.permissions)) continue;
    const status = String(row.status ?? "").trim().toLowerCase();
    if (status !== "active" && status !== "invited") continue;
    const key = `${companyId}|${eventId}`;
    const current = membershipStatsByEvent.get(key) ?? {
      userIds: new Set<string>(),
      lastActivityAt: null
    };
    if (row.user_id) {
      current.userIds.add(String(row.user_id));
    }
    current.lastActivityAt = maxIsoTimestamp(current.lastActivityAt, row.created_at ?? null);
    membershipStatsByEvent.set(key, current);
  }

  const leadStatsByEvent = new Map<
    string,
    {
      leadsCaptured: number;
      lastActivityAt: string | null;
    }
  >();
  for (const row of input.leads) {
    const companyId = String(row.company_id ?? "").trim();
    const eventId = String(row.event_id ?? "").trim();
    if (!companyId || !eventId || !overviewByCompanyId.has(companyId)) continue;
    const key = `${companyId}|${eventId}`;
    const current = leadStatsByEvent.get(key) ?? {
      leadsCaptured: 0,
      lastActivityAt: null
    };
    current.leadsCaptured += 1;
    current.lastActivityAt = maxIsoTimestamp(
      current.lastActivityAt,
      row.updated_at ?? row.created_at ?? null
    );
    current.lastActivityAt = maxIsoTimestamp(current.lastActivityAt, row.created_at ?? null);
    leadStatsByEvent.set(key, current);
  }

  const rows = input.events
    .map((row) => {
      const companyId = String(row.company_id ?? "").trim();
      if (!companyId) return null;
      const companyOverview = overviewByCompanyId.get(companyId);
      if (!companyOverview) return null;
      const eventId = String(row.id ?? "").trim();
      if (!eventId) return null;
      const key = `${companyId}|${eventId}`;
      const membership = membershipStatsByEvent.get(key);
      const leads = leadStatsByEvent.get(key);
      const lastActivityAt = [
        row.updated_at ?? null,
        row.created_at ?? null,
        membership?.lastActivityAt ?? null,
        leads?.lastActivityAt ?? null
      ].reduce<string | null>((latest, candidate) => maxIsoTimestamp(latest, candidate), null);

      return {
        eventId,
        eventName: String(row.name ?? "Untitled Event"),
        companyId,
        companyName: companyOverview.companyName,
        status: row.status ?? null,
        startDate: row.start_date ?? null,
        endDate: row.end_date ?? null,
        usersAssigned: membership?.userIds.size ?? 0,
        leadsCaptured: leads?.leadsCaptured ?? 0,
        licenseTier: companyOverview.licenseTier,
        usageHealth: companyOverview.usageHealth,
        lastActivityAt
      } satisfies CompanyScopedEventsDirectoryRow;
    })
    .filter((row): row is CompanyScopedEventsDirectoryRow => Boolean(row))
    .sort((a, b) => {
      const activeCompare =
        Number(String(b.status ?? "").trim().toLowerCase() === "active") -
        Number(String(a.status ?? "").trim().toLowerCase() === "active");
      if (activeCompare !== 0) return activeCompare;
      const startA = Date.parse(a.startDate ?? "");
      const startB = Date.parse(b.startDate ?? "");
      if (!Number.isNaN(startA) && !Number.isNaN(startB) && startA !== startB) {
        return startB - startA;
      }
      return a.eventName.localeCompare(b.eventName);
    });

  return rows;
}

export function summarizeCompanyScopedEventsDirectory(
  rows: CompanyScopedEventsDirectoryRow[],
  opts?: { nowMs?: number }
): CompanyScopedEventsDirectorySummary {
  const currentMonth = toMonthBucketFromMs(opts?.nowMs ?? Date.now());
  const companyIds = new Set<string>();
  const summary: CompanyScopedEventsDirectorySummary = {
    totalEvents: 0,
    activeEvents: 0,
    eventsThisMonth: 0,
    companiesRunningEvents: 0
  };

  for (const row of rows) {
    summary.totalEvents += 1;
    if (String(row.status ?? "").trim().toLowerCase() === "active") {
      summary.activeEvents += 1;
    }
    if (toMonthBucketFromIsoDate(row.startDate) === currentMonth) {
      summary.eventsThisMonth += 1;
    }
    if (row.companyId) {
      companyIds.add(row.companyId);
    }
  }

  summary.companiesRunningEvents = companyIds.size;
  return summary;
}

async function fetchChunkedRows<T>(
  queryFactory: (chunk: string[]) => Promise<{ data: T[] | null; error: { message?: string } | null }>,
  ids: string[],
  errorMessage: string
) {
  const out: T[] = [];
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  const chunkSize = 200;
  for (let i = 0; i < uniqueIds.length; i += chunkSize) {
    const chunk = uniqueIds.slice(i, i + chunkSize);
    const { data, error } = await queryFactory(chunk);
    if (error) {
      throw new Error(error.message ?? errorMessage);
    }
    out.push(...(data ?? []));
  }
  return out;
}

async function listAllAuthUsers(): Promise<CompanyScopedAuthUserRow[]> {
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const supabase = createAdminClient();
  const out: CompanyScopedAuthUserRow[] = [];
  let page = 1;
  const perPage = 1000;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) {
      throw new Error(error.message ?? "Failed listing auth users.");
    }
    const batch = (data?.users ?? []) as CompanyScopedAuthUserRow[];
    if (batch.length === 0) break;
    out.push(...batch);
    if (batch.length < perPage) break;
    page += 1;
  }
  return out;
}

export async function getAdminCompanyScopedOverviewData(): Promise<CompanyScopedOverviewData> {
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const supabase = createAdminClient();

  const [licensesResponse, plansResponse] = await Promise.all([
    (supabase as any)
      .from("licenses")
      .select("id, company_id, exhibitor_company_id, license_plan_id, seats_total, seats_used, status, expires_at, created_at, max_events")
      .eq("scope", "company")
      .order("created_at", { ascending: false }),
    (supabase as any)
      .from("license_plans")
      .select("id, code, name")
  ]);

  if (licensesResponse.error) {
    throw new Error(licensesResponse.error.message ?? "Failed loading company-scoped licenses.");
  }
  if (plansResponse.error) {
    throw new Error(plansResponse.error.message ?? "Failed loading license plans.");
  }

  const licenses = (licensesResponse.data ?? []) as CompanyScopedLicenseRow[];
  const companyIds = Array.from(
    new Set(licenses.map((row) => targetCompanyIdForLicense(row)).filter(Boolean))
  );

  const [companies, events, memberships, leads, users, authUsers] = await Promise.all([
    fetchChunkedRows<CompanyNameRow>(
      async (chunk) =>
        (supabase as any)
          .from("companies")
          .select("id, name")
          .in("id", chunk),
      companyIds,
      "Failed loading companies."
    ),
    fetchChunkedRows<EventUsageRow>(
      async (chunk) =>
        (supabase as any)
          .from("events")
          .select("id, name, company_id, status, is_active, start_date, end_date, created_at, updated_at")
          .in("company_id", chunk),
      companyIds,
      "Failed loading company events."
    ),
    fetchChunkedRows<EventMembershipRow>(
      async (chunk) =>
        (supabase as any)
          .from("event_users")
          .select("user_id, event_id, exhibitor_company_id, status, permissions, created_at")
          .in("exhibitor_company_id", chunk),
      companyIds,
      "Failed loading company event-user memberships."
    ),
    fetchChunkedRows<LeadUsageRow>(
      async (chunk) =>
        (supabase as any)
          .from("leads")
          .select("company_id, event_id, created_at, updated_at")
          .in("company_id", chunk),
      companyIds,
      "Failed loading company lead usage."
    ),
    fetchChunkedRows<CompanyScopedUserRow>(
      async (chunk) =>
        (supabase as any)
          .from("users")
          .select("id, full_name, email, role, company_id, event_access_mode, created_at")
          .in("company_id", chunk),
      companyIds,
      "Failed loading company-scoped users."
    ),
    listAllAuthUsers()
  ]);

  return buildCompanyScopedOverviewData({
    licenses,
    companies,
    licensePlans: (plansResponse.data ?? []) as LicensePlanRow[],
    events,
    memberships,
    leads,
    users,
    authUsers
  });
}

export async function getAdminCompanyScopedUsersDirectoryData(): Promise<CompanyScopedUsersDirectoryRow[]> {
  const overview = await getAdminCompanyScopedOverviewData();
  const companyIds = overview.companies.map((row) => row.companyId).filter(Boolean);
  if (companyIds.length === 0) {
    return [];
  }

  const { createAdminClient } = await import("@/lib/supabase/admin");
  const supabase = createAdminClient();

  const [users, events, memberships, pendingInvites, authUsers] = await Promise.all([
    fetchChunkedRows<CompanyScopedUserRow>(
      async (chunk) =>
        (supabase as any)
          .from("users")
          .select("id, full_name, email, role, company_id, event_access_mode, created_at")
          .in("company_id", chunk),
      companyIds,
      "Failed loading company-scoped users."
    ),
    fetchChunkedRows<CompanyEventNameRow>(
      async (chunk) =>
        (supabase as any)
          .from("events")
          .select("id, company_id, name")
          .in("company_id", chunk),
      companyIds,
      "Failed loading company event names."
    ),
    fetchChunkedRows<CompanyScopedMembershipRow>(
      async (chunk) =>
        (supabase as any)
          .from("event_users")
          .select("user_id, event_id, exhibitor_company_id, status, permissions, created_at")
          .in("exhibitor_company_id", chunk),
      companyIds,
      "Failed loading company event assignments."
    ),
    fetchChunkedRows<CompanyScopedPendingInviteRow>(
      async (chunk) =>
        (supabase as any)
          .from("invite_codes")
          .select("event_id, exhibitor_company_id, email, permissions, event_access_mode, expires_at, created_at")
          .in("exhibitor_company_id", chunk)
          .is("used_at", null),
      companyIds,
      "Failed loading company pending invites."
    ),
    listAllAuthUsers()
  ]);

  return buildCompanyScopedUsersDirectoryData({
    overviewCompanies: overview.companies,
    users,
    events,
    memberships,
    pendingInvites,
    authUsers
  });
}

export async function getAdminCompanyScopedEventsDirectoryData(): Promise<CompanyScopedEventsDirectoryRow[]> {
  const overview = await getAdminCompanyScopedOverviewData();
  const companyIds = overview.companies.map((row) => row.companyId).filter(Boolean);
  if (companyIds.length === 0) {
    return [];
  }

  const { createAdminClient } = await import("@/lib/supabase/admin");
  const supabase = createAdminClient();

  const [events, memberships, leads] = await Promise.all([
    fetchChunkedRows<EventUsageRow>(
      async (chunk) =>
        (supabase as any)
          .from("events")
          .select("id, name, company_id, status, is_active, start_date, end_date, created_at, updated_at")
          .in("company_id", chunk),
      companyIds,
      "Failed loading company-scoped events."
    ),
    fetchChunkedRows<CompanyScopedMembershipRow>(
      async (chunk) =>
        (supabase as any)
          .from("event_users")
          .select("user_id, event_id, exhibitor_company_id, status, permissions, created_at")
          .in("exhibitor_company_id", chunk),
      companyIds,
      "Failed loading company-scoped event assignments."
    ),
    fetchChunkedRows<LeadUsageRow>(
      async (chunk) =>
        (supabase as any)
          .from("leads")
          .select("company_id, event_id, created_at, updated_at")
          .in("company_id", chunk),
      companyIds,
      "Failed loading company-scoped lead usage."
    )
  ]);

  return buildCompanyScopedEventsDirectoryData({
    overviewCompanies: overview.companies,
    events,
    memberships,
    leads
  });
}
