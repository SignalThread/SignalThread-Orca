import { createClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database";

export type AdminEventStatus = "active" | "upcoming" | "completed";
export type AdminLicenseStatus = "active" | "trial" | "expired";
export type AdminUserStatus = "active" | "invited" | "inactive" | "invite_pending";
/** Server/query contract value for the synthetic platform-admin all-events scope. */
export const ADMIN_USERS_ALL_EVENTS_ID = "__all_events__";
export type AdminUserRole = "platform_admin" | "organizer_admin" | "exhibitor_admin" | "viewer";
export type LicensePlan = "starter" | "professional" | "enterprise";

export type PlatformEvent = {
  id: string;
  name: string;
  location: string;
  startDate: string;
  endDate: string;
  status: AdminEventStatus;
  exhibitors: number;
  users: number;
  licenses: number;
  leads: number;
  revenue: number;
  totalSeats: number;
  seatsUsed: number;
  /**
   * Owning company id (events.company_id). Used by the Add User modal to filter the
   * "Assigned Events" multi-select to events that belong to the user's company — never read
   * at runtime for access (resolver owns that).
   */
  companyId?: string | null;
};

export type ExhibitorOverview = {
  id: string;
  eventId: string;
  name: string;
  seatsPurchased: number;
  seatsUsed: number;
  licenseStatus: AdminLicenseStatus;
  revenue: number;
  leadCount: number;
  userCount: number;
  licenseCount: number;
  licensePlan: LicensePlan;
  expiration: string;
};

export type PlatformUserOverview = {
  id: string;
  fullName: string;
  email: string;
  role: AdminUserRole;
  eventId: string;
  exhibitorId: string | null;
  status: AdminUserStatus;
  /** membership = event_users + profile; invite_pending = auth invite not yet provisioned to event_users */
  rowSource: "membership" | "invite_pending" | "platform_role";
  /** Real event context for actions when the row is rendered platform-wide. */
  sourceEventId?: string | null;
};

export type LicenseOverview = {
  id: string;
  eventId: string;
  exhibitorId: string;
  exhibitorName: string;
  licensePlan: LicensePlan;
  seats: number;
  seatsUsed: number;
  status: AdminLicenseStatus;
  expiration: string;
  revenue: number;
};

const platformEvents: PlatformEvent[] = [
  {
    id: "tech-summit-2026",
    name: "Tech Summit 2026",
    location: "San Francisco, CA",
    startDate: "2026-03-14",
    endDate: "2026-03-17",
    status: "active",
    exhibitors: 24,
    users: 142,
    licenses: 678,
    leads: 12456,
    revenue: 338400,
    totalSeats: 195,
    seatsUsed: 184
  },
  {
    id: "saas-conference-q1",
    name: "SaaS Conference Q1",
    location: "Austin, TX",
    startDate: "2026-04-09",
    endDate: "2026-04-11",
    status: "upcoming",
    exhibitors: 18,
    users: 97,
    licenses: 524,
    leads: 0,
    revenue: 261800,
    totalSeats: 140,
    seatsUsed: 96
  },
  {
    id: "devcon-2026",
    name: "DevCon 2026",
    location: "Seattle, WA",
    startDate: "2026-05-19",
    endDate: "2026-05-22",
    status: "upcoming",
    exhibitors: 32,
    users: 178,
    licenses: 867,
    leads: 0,
    revenue: 433100,
    totalSeats: 236,
    seatsUsed: 142
  },
  {
    id: "ai-expo-spring",
    name: "AI Expo Spring",
    location: "Boston, MA",
    startDate: "2026-02-09",
    endDate: "2026-02-11",
    status: "completed",
    exhibitors: 28,
    users: 156,
    licenses: 698,
    leads: 8934,
    revenue: 348600,
    totalSeats: 210,
    seatsUsed: 177
  }
];

const exhibitors: ExhibitorOverview[] = [
  {
    id: "cloudtech-solutions",
    eventId: "tech-summit-2026",
    name: "CloudTech Solutions",
    seatsPurchased: 45,
    seatsUsed: 43,
    licenseStatus: "active",
    revenue: 22500,
    leadCount: 1234,
    userCount: 6,
    licenseCount: 45,
    licensePlan: "professional",
    expiration: "2026-12-30"
  },
  {
    id: "dataflow-inc",
    eventId: "tech-summit-2026",
    name: "DataFlow Inc",
    seatsPurchased: 32,
    seatsUsed: 28,
    licenseStatus: "active",
    revenue: 16000,
    leadCount: 987,
    userCount: 4,
    licenseCount: 32,
    licensePlan: "professional",
    expiration: "2026-12-30"
  },
  {
    id: "enterprise-systems",
    eventId: "tech-summit-2026",
    name: "Enterprise Systems",
    seatsPurchased: 38,
    seatsUsed: 38,
    licenseStatus: "active",
    revenue: 19000,
    leadCount: 856,
    userCount: 5,
    licenseCount: 38,
    licensePlan: "enterprise",
    expiration: "2026-12-30"
  },
  {
    id: "innovate-labs",
    eventId: "tech-summit-2026",
    name: "InnovateLabs",
    seatsPurchased: 28,
    seatsUsed: 24,
    licenseStatus: "active",
    revenue: 14000,
    leadCount: 743,
    userCount: 3,
    licenseCount: 28,
    licensePlan: "starter",
    expiration: "2026-12-30"
  },
  {
    id: "techventures-corp",
    eventId: "tech-summit-2026",
    name: "TechVentures Corp",
    seatsPurchased: 52,
    seatsUsed: 51,
    licenseStatus: "active",
    revenue: 26000,
    leadCount: 1198,
    userCount: 7,
    licenseCount: 52,
    licensePlan: "professional",
    expiration: "2026-12-30"
  },
  {
    id: "devcore-labs",
    eventId: "devcon-2026",
    name: "DevCore Labs",
    seatsPurchased: 40,
    seatsUsed: 26,
    licenseStatus: "trial",
    revenue: 12400,
    leadCount: 0,
    userCount: 9,
    licenseCount: 40,
    licensePlan: "professional",
    expiration: "2026-11-20"
  },
  {
    id: "swiftstack",
    eventId: "devcon-2026",
    name: "SwiftStack",
    seatsPurchased: 25,
    seatsUsed: 13,
    licenseStatus: "expired",
    revenue: 9400,
    leadCount: 0,
    userCount: 4,
    licenseCount: 25,
    licensePlan: "starter",
    expiration: "2026-07-01"
  }
];

const users: PlatformUserOverview[] = [
  {
    id: "user-emily-rodriguez",
    fullName: "Emily Rodriguez",
    email: "emily@cloudtech.com",
    role: "exhibitor_admin",
    eventId: "tech-summit-2026",
    exhibitorId: "cloudtech-solutions",
    status: "active",
    rowSource: "membership"
  },
  {
    id: "user-michael-chen",
    fullName: "Michael Chen",
    email: "michael@cloudtech.com",
    role: "exhibitor_admin",
    eventId: "tech-summit-2026",
    exhibitorId: "cloudtech-solutions",
    status: "active",
    rowSource: "membership"
  },
  {
    id: "user-sarah-johnson",
    fullName: "Sarah Johnson",
    email: "sarah@techsummit.com",
    role: "organizer_admin",
    eventId: "tech-summit-2026",
    exhibitorId: null,
    status: "active",
    rowSource: "membership"
  },
  {
    id: "user-james-park",
    fullName: "James Park",
    email: "james@dataflow.io",
    role: "exhibitor_admin",
    eventId: "tech-summit-2026",
    exhibitorId: "dataflow-inc",
    status: "invited",
    rowSource: "membership"
  },
  {
    id: "user-lisa-wang",
    fullName: "Lisa Wang",
    email: "lisa@enterprise.com",
    role: "exhibitor_admin",
    eventId: "tech-summit-2026",
    exhibitorId: "enterprise-systems",
    status: "active",
    rowSource: "membership"
  },
  {
    id: "user-marco-bell",
    fullName: "Marco Bell",
    email: "marco@devcore.io",
    role: "exhibitor_admin",
    eventId: "devcon-2026",
    exhibitorId: "devcore-labs",
    status: "inactive",
    rowSource: "membership"
  }
];

let licenses: LicenseOverview[] = exhibitors.map((item, index) => ({
  id: `license-${index + 1}`,
  eventId: item.eventId,
  exhibitorId: item.id,
  exhibitorName: item.name,
  licensePlan: item.licensePlan,
  seats: item.seatsPurchased,
  seatsUsed: item.seatsUsed,
  status: item.licenseStatus,
  expiration: item.expiration,
  revenue: item.revenue
}));

export type DashboardMetric = {
  label: string;
  value: string;
  shortValue?: string;
  hint?: string;
  tone?: "neutral" | "positive";
  icon: "events" | "exhibitors" | "licenses" | "active" | "revenue";
};

export function getPlatformEvents() {
  return [...platformEvents];
}

export function getDefaultEventId() {
  return platformEvents[0]?.id ?? "";
}

export function getEventById(eventId: string) {
  return platformEvents.find((event) => event.id === eventId) ?? null;
}

export function getPlatformDashboardData() {
  const totalEvents = platformEvents.length;
  const totalExhibitors = platformEvents.reduce((sum, event) => sum + event.exhibitors, 0);
  const totalLicenses = platformEvents.reduce((sum, event) => sum + event.licenses, 0);
  const activeLicenses = Math.round(totalLicenses * 0.94);
  const totalRevenue = platformEvents.reduce((sum, event) => sum + event.revenue, 0);

  const metrics: DashboardMetric[] = [
    { label: "Total Events", value: String(totalEvents), hint: "Across all seasons", icon: "events" },
    { label: "Total Exhibitors", value: String(totalExhibitors), hint: "Across all events", icon: "exhibitors" },
    { label: "Total Licenses Issued", value: totalLicenses.toLocaleString("en-US"), hint: "+145 this month", tone: "positive", icon: "licenses" },
    { label: "Active Licenses", value: activeLicenses.toLocaleString("en-US"), hint: "94% active rate", tone: "positive", icon: "active" },
    {
      label: "Total Revenue",
      value: formatCurrency(totalRevenue),
      shortValue: formatCompactCurrency(totalRevenue),
      hint: "+$147K this month",
      tone: "positive",
      icon: "revenue"
    }
  ];

  const revenueByEvent = platformEvents.map((event) => ({
    eventId: event.id,
    eventName: event.name,
    revenue: event.revenue
  }));

  const licenseDistributionByEvent = platformEvents.map((event) => {
    const eventLicenses = licenses.filter((license) => license.eventId === event.id);
    const active = eventLicenses.filter((license) => license.status === "active").length;
    const trial = eventLicenses.filter((license) => license.status === "trial").length;
    const expired = eventLicenses.filter((license) => license.status === "expired").length;
    return {
      eventId: event.id,
      eventName: event.name,
      active,
      trial,
      expired
    };
  });

  const seatUtilization = platformEvents.map((event) => ({
    eventId: event.id,
    eventName: event.name,
    seatsPurchased: event.totalSeats,
    seatsUsed: event.seatsUsed,
    utilizationRate: event.totalSeats ? Math.round((event.seatsUsed / event.totalSeats) * 100) : 0
  }));

  return {
    metrics,
    revenueByEvent,
    licenseDistributionByEvent,
    seatUtilization
  };
}

export function getEventDetailData(eventId: string) {
  const event = getEventById(eventId);
  if (!event) {
    return null;
  }

  const eventExhibitors = exhibitors.filter((item) => item.eventId === eventId);
  const eventUsers = users.filter((item) => item.eventId === eventId);
  const eventLicenses = licenses.filter((item) => item.eventId === eventId);

  const revenue = eventLicenses.reduce((sum, row) => sum + row.revenue, 0);

  return {
    event,
    exhibitors: eventExhibitors,
    users: eventUsers,
    licenses: eventLicenses,
    metrics: {
      exhibitors: eventExhibitors.length,
      users: eventUsers.length,
      licenses: eventLicenses.length,
      leads: event.leads,
      revenue
    }
  };
}

export function getExhibitorsData(eventId?: string) {
  const scoped = eventId ? exhibitors.filter((item) => item.eventId === eventId) : exhibitors;

  const totalSeats = scoped.reduce((sum, row) => sum + row.seatsPurchased, 0);
  const seatsUsed = scoped.reduce((sum, row) => sum + row.seatsUsed, 0);
  const totalRevenue = scoped.reduce((sum, row) => sum + row.revenue, 0);

  return {
    exhibitors: scoped,
    kpis: {
      totalExhibitors: scoped.length,
      totalSeats,
      totalRevenue,
      avgSeatUtilization: totalSeats ? Math.round((seatsUsed / totalSeats) * 100) : 0
    }
  };
}

export function getExhibitorById(exhibitorId: string) {
  return exhibitors.find((item) => item.id === exhibitorId) ?? null;
}

export function getExhibitorDetailData(exhibitorId: string, eventId?: string) {
  const exhibitor = getExhibitorById(exhibitorId);
  if (!exhibitor) {
    return null;
  }

  if (eventId && exhibitor.eventId !== eventId) {
    return null;
  }

  const event = getEventById(exhibitor.eventId);
  if (!event) {
    return null;
  }

  const exhibitorUsers = users.filter((item) => item.exhibitorId === exhibitor.id);
  const exhibitorLicenses = licenses.filter((item) => item.exhibitorId === exhibitor.id);

  const totalSeats = exhibitorLicenses.reduce((sum, item) => sum + item.seats, 0);
  const seatsUsed = exhibitorLicenses.reduce((sum, item) => sum + item.seatsUsed, 0);
  const revenue = exhibitorLicenses.reduce((sum, item) => sum + item.revenue, 0);
  const utilizationRate = totalSeats ? Math.round((seatsUsed / totalSeats) * 100) : 0;

  return {
    exhibitor,
    event,
    users: exhibitorUsers,
    licenses: exhibitorLicenses,
    metrics: {
      totalSeats,
      seatsUsed,
      utilizationRate,
      revenue,
      licenseStatus: exhibitorLicenses[0]?.status ?? "active"
    }
  };
}

export function getUsersData(filters?: { eventId?: string; exhibitorId?: string }) {
  let scoped = users;
  if (filters?.eventId) {
    scoped = scoped.filter((user) => user.eventId === filters.eventId);
  }
  if (filters?.exhibitorId) {
    scoped = scoped.filter((user) => user.exhibitorId === filters.exhibitorId);
  }

  const organizerCount = scoped.filter((user) => user.role === "organizer_admin").length;
  const exhibitorAdminCount = scoped.filter((user) => user.role === "exhibitor_admin").length;

  return {
    users: scoped,
    kpis: {
      totalUsers: scoped.length,
      eventOrganizers: organizerCount,
      exhibitorAdmins: exhibitorAdminCount
    }
  };
}

export function getLicensesData(eventId?: string) {
  const scoped = eventId ? licenses.filter((row) => row.eventId === eventId) : licenses;

  const totalSeats = scoped.reduce((sum, row) => sum + row.seats, 0);
  const seatsUsed = scoped.reduce((sum, row) => sum + row.seatsUsed, 0);
  const totalRevenue = scoped.reduce((sum, row) => sum + row.revenue, 0);

  return {
    licenses: scoped,
    kpis: {
      totalSeats,
      seatsUsed,
      totalRevenue,
      utilizationRate: totalSeats ? Math.round((seatsUsed / totalSeats) * 100) : 0
    }
  };
}

export function getLicenseById(licenseId: string) {
  return licenses.find((license) => license.id === licenseId) ?? null;
}

export function updateMockLicense(
  licenseId: string,
  patch: Partial<Pick<LicenseOverview, "licensePlan" | "status" | "expiration" | "revenue" | "seats">>
) {
  let updated: LicenseOverview | null = null;

  licenses = licenses.map((license) => {
    if (license.id !== licenseId) {
      return license;
    }

    updated = { ...license, ...patch };
    return updated;
  });

  return updated;
}

export function addMockLicenseSeats(licenseId: string, seatsToAdd: number) {
  const existing = getLicenseById(licenseId);
  if (!existing) return null;

  const nextSeats = Math.max(existing.seats, existing.seats + seatsToAdd);
  return updateMockLicense(licenseId, { seats: nextSeats });
}

export function getExhibitorName(exhibitorId: string | null) {
  if (!exhibitorId) {
    return "—";
  }

  return exhibitors.find((item) => item.id === exhibitorId)?.name ?? "Unknown Exhibitor";
}

export function getEventName(eventId: string) {
  return getEventById(eventId)?.name ?? "Unknown Event";
}

export function getEventDateRange(event: Pick<PlatformEvent, "startDate" | "endDate">) {
  const start = new Date(`${event.startDate}T12:00:00Z`);
  const end = new Date(`${event.endDate}T12:00:00Z`);
  return `${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} - ${end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(value);
}

export function formatCompactCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1
  }).format(value);
}

export function formatEventStatus(status: AdminEventStatus) {
  if (status === "active") return "Active";
  if (status === "upcoming") return "Upcoming";
  return "Completed";
}

export function formatLicenseStatus(status: AdminLicenseStatus) {
  if (status === "active") return "Active";
  if (status === "trial") return "Trial";
  return "Expired";
}

export function formatRole(role: AdminUserRole) {
  if (role === "platform_admin") return "Platform Admin";
  if (role === "organizer_admin") return "Organizer Admin";
  if (role === "exhibitor_admin") return "Exhibitor admin";
  return "App user";
}

export function formatUserStatus(status: AdminUserStatus) {
  if (status === "active") return "Active";
  if (status === "invited") return "Invited";
  if (status === "invite_pending") return "Invite pending";
  return "Inactive";
}

export function formatLicensePlan(plan: LicensePlan) {
  if (plan === "professional") return "Professional";
  if (plan === "enterprise") return "Enterprise";
  return "Starter";
}

export function getSeatUsagePercent(seatsUsed: number, seatsTotal: number) {
  if (!seatsTotal) return 0;
  return Math.max(0, Math.min(100, Math.round((seatsUsed / seatsTotal) * 100)));
}

type SupabaseServiceClient = ReturnType<typeof createClient<Database>>;
export const PLATFORM_WIDE_EVENT_ID = "__platform_wide__";

type AddUserRole = "organizer_admin" | "exhibitor_admin" | "viewer";

export type AddUserInviteActionState = {
  ok: boolean;
  error: string | null;
};

export type DeleteUserActionState = {
  ok: boolean;
  error: string | null;
};

export type ResendInviteActionState = {
  ok: boolean;
  error: string | null;
};

function createSupabaseServiceClient(): SupabaseServiceClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY or SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL");
  }

  return createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

/** Single source for admin Users table role mapping (DB string → display union). */
export function normalizeAdminUserTableRole(role: string | null | undefined): AdminUserRole | null {
  if (!role) return null;
  const value = role.toLowerCase();
  if (value === "platform_admin") return "platform_admin";
  if (value === "event_organizer" || value === "organizer" || value === "organizer_admin") return "organizer_admin";
  if (value === "exhibitor_admin" || value === "exhibitor") return "exhibitor_admin";
  if (value === "viewer") return "viewer";
  return null;
}

function normalizeUserStatus(status: string | null | undefined): AdminUserStatus {
  const value = String(status ?? "").toLowerCase();
  if (value === "invited") return "invited";
  if (value === "invite_pending") return "invite_pending";
  if (value === "inactive") return "inactive";
  return "active";
}

/** Written to auth user_metadata by inviteUserByEmail; used to scope pending rows and actions. */
export const INVITE_USER_METADATA = {
  EVENT_ID: "invite_event_id",
  COMPANY_ID: "invite_company_id",
  EXHIBITOR_COMPANY_ID: "invite_exhibitor_company_id",
  ROLE: "invite_role",
  EVENT_ACCESS_MODE: "invite_event_access_mode",
  ASSIGNED_EVENT_IDS: "invite_assigned_event_ids"
} as const;

type AuthUserLike = {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
};

type PendingPublicUserLike = {
  full_name: string | null;
  email: string | null;
  role: string;
};

export function readInviteMetadata(meta: Record<string, unknown>): {
  eventId: string;
  companyId: string;
  exhibitorCompanyId: string | null;
  roleRaw: string;
} {
  const rawEvent = meta[INVITE_USER_METADATA.EVENT_ID];
  const eventId = typeof rawEvent === "string" ? rawEvent : "";
  const rawCompany = meta[INVITE_USER_METADATA.COMPANY_ID];
  const companyId = typeof rawCompany === "string" ? rawCompany : "";
  const rawExhibitor = meta[INVITE_USER_METADATA.EXHIBITOR_COMPANY_ID];
  const exhibitorCompanyId =
    typeof rawExhibitor === "string" && rawExhibitor.trim() !== "" ? rawExhibitor : null;
  const rawRole = meta[INVITE_USER_METADATA.ROLE];
  const roleRaw = typeof rawRole === "string" ? rawRole : "";
  return { eventId, companyId, exhibitorCompanyId, roleRaw };
}

export function pendingInviteTableEventIdFromMetadata(meta: Record<string, unknown>): string | null {
  const { eventId, companyId } = readInviteMetadata(meta);
  if (eventId) return eventId;
  if (companyId) return PLATFORM_WIDE_EVENT_ID;
  return null;
}

function normalizeUsableEmail(value: unknown): string {
  const email = String(value ?? "").trim();
  return email.includes("@") ? email : "";
}

export function buildPendingInvitePlatformUserRow(
  au: AuthUserLike,
  pub: PendingPublicUserLike | null
): PlatformUserOverview | null {
  const meta = (au.user_metadata ?? {}) as Record<string, unknown>;
  const { eventId, exhibitorCompanyId, roleRaw } = readInviteMetadata(meta);
  const tableEventId = pendingInviteTableEventIdFromMetadata(meta);
  if (!tableEventId) return null;

  const fullNameFromMeta =
    typeof meta.full_name === "string"
      ? meta.full_name
      : typeof meta.name === "string"
        ? meta.name
        : null;
  const role = normalizeAdminUserTableRole(roleRaw || pub?.role) ?? "viewer";
  const email = normalizeUsableEmail(au.email) || normalizeUsableEmail(pub?.email);
  const fullName = (fullNameFromMeta ?? pub?.full_name ?? email ?? "Invited user").trim() || "Invited user";

  return {
    id: au.id,
    fullName,
    email,
    role,
    eventId: role === "platform_admin" ? PLATFORM_WIDE_EVENT_ID : tableEventId,
    exhibitorId: role === "platform_admin" ? null : exhibitorCompanyId,
    status: "invite_pending",
    rowSource: "invite_pending",
    sourceEventId: eventId || null
  };
}

async function listAllAuthUsers(supabase: SupabaseServiceClient): Promise<AuthUserLike[]> {
  const out: AuthUserLike[] = [];
  let page = 1;
  const perPage = 1000;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) {
      throw new Error(error.message ?? "Failed listing auth users.");
    }
    const batch = data?.users ?? [];
    if (batch.length === 0) break;
    out.push(...(batch as AuthUserLike[]));
    if (batch.length < perPage) break;
    page += 1;
  }
  return out;
}

/**
 * Merge provisioned membership rows with pending auth invites (same shape, single table + filters).
 * Dedup: (user_id, event_id) present in membership wins; pending is only added when no event_users row exists.
 */
export function mergeMembershipAndPendingInvites(
  membershipRows: PlatformUserOverview[],
  pendingRows: PlatformUserOverview[]
): PlatformUserOverview[] {
  const keys = new Set(membershipRows.map((r) => `${r.id}|${r.eventId}`));
  const dedupedPending = pendingRows.filter((r) => !keys.has(`${r.id}|${r.eventId}`));
  const merged = [...membershipRows, ...dedupedPending];
  merged.sort(comparePlatformUserOverview);
  return merged;
}

function comparePlatformUserOverview(a: PlatformUserOverview, b: PlatformUserOverview) {
  const ev = a.eventId.localeCompare(b.eventId);
  if (ev !== 0) return ev;
  const n = a.fullName.localeCompare(b.fullName);
  if (n !== 0) return n;
  return a.email.localeCompare(b.email);
}

function normalizeEventStatus(status: string | null | undefined): AdminEventStatus {
  const value = String(status ?? "").toLowerCase();
  if (value === "completed") return "completed";
  if (value === "active") return "active";
  return "upcoming";
}

function normalizeLicenseStatus(status: string | null | undefined): AdminLicenseStatus {
  const value = String(status ?? "").toLowerCase();
  if (value === "expired") return "expired";
  if (value === "trial") return "trial";
  return "active";
}

function parsePermissionsJson(input: string): Json {
  try {
    const parsed = JSON.parse(input);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((item) => typeof item === "string") as Json;
  } catch {
    return [];
  }
}

// App-access grants use evaluateAppAccessGrant in lib/server/event-user-access.ts; aggregates below
// may read licenses.seats_used for display — keep it accurate via reconcileLicenseSeatsUsed.
// The following stale helpers were removed:
//   - getActiveCompanyLicense (queried by company_id only, used stale seats_used)
//   - incrementLicenseSeat (no-op)
//   - decrementLicenseSeat (no-op)

async function fetchPublicUsersByIds(
  supabase: SupabaseServiceClient,
  userIds: string[]
): Promise<
  Array<{
    id: string;
    full_name: string | null;
    email: string | null;
    role: string;
    company_id: string | null;
    license_id: string | null;
  }>
> {
  const unique = Array.from(new Set(userIds.filter(Boolean)));
  const out: Array<{
    id: string;
    full_name: string | null;
    email: string | null;
    role: string;
    company_id: string | null;
    license_id: string | null;
  }> = [];
  const chunkSize = 200;
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    const { data, error } = await (supabase as any)
      .from("users")
      .select("id, full_name, email, role, company_id, license_id")
      .in("id", chunk);
    if (error) {
      throw new Error(error.message ?? "Failed loading users by id.");
    }
    out.push(...((data ?? []) as typeof out));
  }
  return out;
}

export async function getAdminUsersPageData(): Promise<{
  events: PlatformEvent[];
  exhibitors: ExhibitorOverview[];
  users: PlatformUserOverview[];
  /** Company ids with an active company-scoped license (`exhibitor_company_id` or `company_id` row target). */
  activeCompanyLicensedCompanyIds: string[];
}> {
  const supabase = createSupabaseServiceClient();

  const [eventsResponse, exhibitorsResponse, licensesResponse, eventUsersResponse] = await Promise.all([
    (supabase as any)
      .from("events")
      .select("id, name, city, state, location, start_date, end_date, status, company_id"),
    (supabase as any)
      .from("exhibitors")
      .select("id, event_id, company_id, status, created_at"),
    (supabase as any)
      .from("licenses")
      .select(
        "id, event_id, company_id, exhibitor_company_id, seats_total, seats_used, status, expires_at, created_at, price_cents, scope"
      ),
    (supabase as any)
      .from("event_users")
      .select("id, event_id, user_id, exhibitor_company_id, status, permissions, created_at")
      .limit(50000)
  ]);

  if (eventsResponse.error) {
    throw new Error(eventsResponse.error.message ?? "Failed loading events.");
  }
  if (exhibitorsResponse.error) {
    throw new Error(exhibitorsResponse.error.message ?? "Failed loading exhibitors.");
  }
  if (licensesResponse.error) {
    throw new Error(licensesResponse.error.message ?? "Failed loading licenses.");
  }
  if (eventUsersResponse.error) {
    throw new Error(eventUsersResponse.error.message ?? "Failed loading event user scopes.");
  }

  const eventRows = (eventsResponse.data ?? []) as Array<{
    id: string;
    name: string;
    city: string | null;
    state: string | null;
    location: string | null;
    start_date: string | null;
    end_date: string | null;
    status: string | null;
    company_id: string | null;
  }>;
  const exhibitorRows = (exhibitorsResponse.data ?? []) as Array<{
    id: string;
    event_id: string;
    company_id: string;
    status: string | null;
    created_at: string;
  }>;
  const licenseRows = (licensesResponse.data ?? []) as Array<{
    id: string;
    event_id: string | null;
    company_id: string;
    exhibitor_company_id: string | null;
    seats_total: number;
    seats_used: number;
    status: string | null;
    expires_at: string;
    created_at: string;
    price_cents: number | null;
    scope: string | null;
  }>;

  const activeCompanyLicensedCompanyIds = new Set<string>();
  for (const lic of licenseRows) {
    const scope = String(lic.scope ?? "").toLowerCase();
    if (scope !== "company") continue;
    if (String(lic.status ?? "").toLowerCase() !== "active") continue;
    const target = lic.exhibitor_company_id ?? lic.company_id;
    if (target) activeCompanyLicensedCompanyIds.add(target);
  }

  const eventUserRows = (eventUsersResponse.data ?? []) as Array<{
    id: string;
    event_id: string;
    user_id: string;
    exhibitor_company_id: string | null;
    status: string;
    permissions: Json;
    created_at: string;
  }>;

  const userIdsFromMembership = eventUserRows.map((row) => row.user_id);
  let userRows = await fetchPublicUsersByIds(supabase, userIdsFromMembership);
  const userByIdFromPublic = new Map(userRows.map((row) => [row.id, row]));
  const missingAfterPublic = Array.from(new Set(userIdsFromMembership)).filter((id) => !userByIdFromPublic.has(id));

  if (missingAfterPublic.length > 0) {
    const authRows = await Promise.all(
      missingAfterPublic.map(async (id) => {
        const { data, error } = await supabase.auth.admin.getUserById(id);
        if (error || !data?.user) {
          return null;
        }
        const u = data.user;
        const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
        const fullName =
          typeof meta.full_name === "string"
            ? meta.full_name
            : typeof meta.name === "string"
              ? meta.name
              : null;
        return {
          id,
          full_name: fullName,
          email: u.email ?? null,
          role: "",
          company_id: null,
          license_id: null
        } satisfies (typeof userRows)[number];
      })
    );
    for (const row of authRows) {
      if (row) {
        userRows.push(row);
      }
    }
  }

  const { data: canonicalPlatformAdminRows, error: canonicalPlatformAdminError } = await (supabase as any)
    .from("users")
    .select("id, full_name, email, role, company_id, license_id")
    .eq("role", "platform_admin");

  if (canonicalPlatformAdminError) {
    throw new Error(canonicalPlatformAdminError.message ?? "Failed loading platform admins.");
  }

  if ((canonicalPlatformAdminRows ?? []).length > 0) {
    const existingUserIds = new Set(userRows.map((row) => row.id));
    for (const row of (canonicalPlatformAdminRows ?? []) as typeof userRows) {
      if (existingUserIds.has(row.id)) continue;
      userRows.push(row);
    }
  }

  const companyIds = Array.from(
    new Set(
      [
        ...exhibitorRows.map((row) => row.company_id),
        ...licenseRows.map((row) => row.company_id),
        ...licenseRows.map((row) => row.exhibitor_company_id).filter(Boolean),
        ...eventUserRows.map((row) => row.exhibitor_company_id).filter(Boolean),
        ...userRows.map((row) => row.company_id).filter(Boolean)
      ].filter(Boolean)
    )
  ) as string[];

  const { data: companyRows, error: companiesError } = companyIds.length
    ? await (supabase as any)
        .from("companies")
        .select("id, name")
        .in("id", companyIds)
    : { data: [], error: null };

  if (companiesError) {
    throw new Error(companiesError.message ?? "Failed loading companies.");
  }

  const companyNameById = new Map(
    ((companyRows ?? []) as Array<{ id: string; name: string }>).map((row) => [row.id, row.name])
  );

  const usersByEvent = new Map<string, number>();
  for (const row of eventUserRows) {
    usersByEvent.set(row.event_id, (usersByEvent.get(row.event_id) ?? 0) + 1);
  }

  const exhibitorsByEvent = new Map<string, number>();
  for (const row of exhibitorRows) {
    exhibitorsByEvent.set(row.event_id, (exhibitorsByEvent.get(row.event_id) ?? 0) + 1);
  }

  const licensesByEvent = new Map<string, number>();
  const seatsByEvent = new Map<string, { total: number; used: number; revenue: number }>();
  for (const row of licenseRows) {
    if (!row.event_id) continue;
    licensesByEvent.set(row.event_id, (licensesByEvent.get(row.event_id) ?? 0) + 1);
    const existing = seatsByEvent.get(row.event_id) ?? { total: 0, used: 0, revenue: 0 };
    existing.total += Number(row.seats_total ?? 0);
    existing.used += Number(row.seats_used ?? 0);
    existing.revenue += Math.max(0, Number(row.price_cents ?? 0)) / 100;
    seatsByEvent.set(row.event_id, existing);
  }

  const usersByEventCompany = new Map<string, number>();
  for (const row of eventUserRows) {
    if (!row.exhibitor_company_id) continue;
    const key = `${row.event_id}:${row.exhibitor_company_id}`;
    usersByEventCompany.set(key, (usersByEventCompany.get(key) ?? 0) + 1);
  }

  const exhibitors: ExhibitorOverview[] = exhibitorRows.map((row) => {
    const companyId = row.company_id;
    const key = `${row.event_id}:${companyId}`;
    const scopedLicenses = licenseRows.filter(
      (license) =>
        license.event_id === row.event_id &&
        (license.exhibitor_company_id === companyId || license.company_id === companyId)
    );
    const latestLicense = scopedLicenses[0] ?? null;
    const seatsPurchased = scopedLicenses.reduce((sum, license) => sum + Number(license.seats_total ?? 0), 0);
    const seatsUsed = scopedLicenses.reduce((sum, license) => sum + Number(license.seats_used ?? 0), 0);
    const revenue = scopedLicenses.reduce(
      (sum, license) => sum + Math.max(0, Number(license.price_cents ?? 0)) / 100,
      0
    );

    return {
      id: companyId,
      eventId: row.event_id,
      name: companyNameById.get(companyId) ?? "Unknown Exhibitor",
      seatsPurchased,
      seatsUsed,
      licenseStatus: normalizeLicenseStatus(latestLicense?.status ?? row.status),
      revenue,
      leadCount: 0,
      userCount: usersByEventCompany.get(key) ?? 0,
      licenseCount: scopedLicenses.length,
      licensePlan: "starter",
      expiration: latestLicense?.expires_at?.slice(0, 10) ?? row.created_at.slice(0, 10)
    };
  });

  const userById = new Map(userRows.map((row) => [row.id, row]));

  const membershipKeySet = new Set(eventUserRows.map((row) => `${row.user_id}|${row.event_id}`));

  const platformMembershipByUserId = new Map<
    string,
    {
      eventId: string;
      status: AdminUserStatus;
      createdAt: string;
    }
  >();

  const membershipRows: PlatformUserOverview[] = eventUserRows.flatMap((row) => {
    const user = userById.get(row.user_id);
    if (!user) {
      return [{
        id: row.user_id,
        fullName: "No public.users or auth user",
        email: "",
        role: "viewer",
        eventId: row.event_id,
        exhibitorId: row.exhibitor_company_id,
        status: normalizeUserStatus(row.status),
        rowSource: "membership"
      } satisfies PlatformUserOverview];
    }
    const normalizedRole: AdminUserRole = normalizeAdminUserTableRole(user.role) ?? "viewer";

    if (normalizedRole === "platform_admin") {
      const existing = platformMembershipByUserId.get(row.user_id);
      if (!existing || existing.createdAt < row.created_at) {
        platformMembershipByUserId.set(row.user_id, {
          eventId: row.event_id,
          status: normalizeUserStatus(row.status),
          createdAt: row.created_at
        });
      }
      return [];
    }

    return [{
      id: row.user_id,
      fullName: user.full_name ?? "Unnamed User",
      email: user.email ?? "",
      role: normalizedRole,
      eventId: row.event_id,
      exhibitorId: row.exhibitor_company_id,
      status: normalizeUserStatus(row.status),
      rowSource: "membership"
    } satisfies PlatformUserOverview];
  });

  const authUsers = await listAllAuthUsers(supabase);
  const pendingCandidates = authUsers.filter((au) => {
    const meta = (au.user_metadata ?? {}) as Record<string, unknown>;
    const tableEventId = pendingInviteTableEventIdFromMetadata(meta);
    if (!tableEventId) return false;
    if (tableEventId === PLATFORM_WIDE_EVENT_ID) return true;
    return !membershipKeySet.has(`${au.id}|${tableEventId}`);
  });

  const pendingUserIds = pendingCandidates.map((u) => u.id);
  const pendingPublicRows = pendingUserIds.length
    ? await fetchPublicUsersByIds(supabase, pendingUserIds)
    : [];
  const pendingPublicById = new Map(pendingPublicRows.map((row) => [row.id, row]));

  const platformPendingRows = new Map<string, PlatformUserOverview>();

  const pendingRows: PlatformUserOverview[] = pendingCandidates.flatMap((au) => {
    const pub = pendingPublicById.get(au.id);
    const pendingRow = buildPendingInvitePlatformUserRow(au, pub ?? null);
    if (!pendingRow) return [];

    if (pendingRow.role === "platform_admin") {
      platformPendingRows.set(au.id, pendingRow);
      return [];
    }

    return [pendingRow];
  });

  const eventScopedUsers = mergeMembershipAndPendingInvites(membershipRows, pendingRows);
  const platformWideRows: PlatformUserOverview[] = [];
  const canonicalPlatformAdmins = (canonicalPlatformAdminRows ?? []) as Array<{
    id: string;
    full_name: string | null;
    email: string | null;
    role: string;
    company_id: string | null;
    license_id: string | null;
  }>;

  for (const platformAdmin of canonicalPlatformAdmins) {
    const pendingRow = platformPendingRows.get(platformAdmin.id);
    if (pendingRow) {
      platformWideRows.push(pendingRow);
      continue;
    }

    const membership = platformMembershipByUserId.get(platformAdmin.id);
    platformWideRows.push({
      id: platformAdmin.id,
      fullName: platformAdmin.full_name ?? "Unnamed User",
      email: platformAdmin.email ?? "",
      role: "platform_admin",
      eventId: PLATFORM_WIDE_EVENT_ID,
      exhibitorId: null,
      status: membership?.status ?? "active",
      rowSource: membership ? "membership" : "platform_role",
      sourceEventId: membership?.eventId ?? null
    });
  }

  for (const pendingRow of platformPendingRows.values()) {
    if (canonicalPlatformAdmins.some((row) => row.id === pendingRow.id)) continue;
    platformWideRows.push(pendingRow);
  }

  const users = [...eventScopedUsers, ...platformWideRows].sort(comparePlatformUserOverview);

  for (const row of pendingRows) {
    usersByEvent.set(row.eventId, (usersByEvent.get(row.eventId) ?? 0) + 1);
  }

  const events: PlatformEvent[] = eventRows.map((row) => {
    const metrics = seatsByEvent.get(row.id) ?? { total: 0, used: 0, revenue: 0 };
    const locationParts = [row.city, row.state].filter(Boolean).join(", ");

    return {
      id: row.id,
      name: row.name,
      location: (row.location ?? locationParts) || "Unknown location",
      startDate: row.start_date ?? "",
      endDate: row.end_date ?? "",
      status: normalizeEventStatus(row.status),
      exhibitors: exhibitorsByEvent.get(row.id) ?? 0,
      users: usersByEvent.get(row.id) ?? 0,
      licenses: licensesByEvent.get(row.id) ?? 0,
      leads: 0,
      revenue: metrics.revenue,
      totalSeats: metrics.total,
      seatsUsed: metrics.used,
      companyId: row.company_id ?? null
    };
  });

  return {
    events,
    exhibitors,
    users,
    activeCompanyLicensedCompanyIds: Array.from(activeCompanyLicensedCompanyIds)
  };
}
