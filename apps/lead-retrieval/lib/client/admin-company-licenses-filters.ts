import type {
  CompanyScopedEventsDirectoryRow,
  CompanyScopedLicenseStatus,
  CompanyScopedOverviewRow,
  CompanyScopedUsageHealth,
  CompanyScopedUsersDirectoryRow,
  CompanyScopedUserRole
} from "@/lib/data/admin-company-licenses-overview";

export type CompanyScopedUsersFilterState = {
  search: string;
  companyId: string;
  role: "all" | CompanyScopedUserRole;
  status: "all" | "active" | "invited" | "expired";
  seat: "all" | "consumes" | "none";
};

export type CompanyScopedLicensesFilterState = {
  search: string;
  status: "all" | CompanyScopedLicenseStatus;
  tier: string;
  limit: "all" | "near_or_over";
  expiring: "all" | "soon";
  activeEvents: "all" | "yes" | "no";
};

export type CompanyScopedEventsFilterState = {
  search: string;
  companyId: string;
  status: "all" | "active" | "upcoming" | "past";
  date: "all" | "this_month" | "upcoming" | "past";
  leads: "all" | "yes" | "no";
};

function normalized(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function includesSearch(...values: Array<string | null | undefined>) {
  const haystack = values.map((value) => normalized(value)).join(" ");
  return (query: string) => !query || haystack.includes(query);
}

function monthBucketFromMs(ms: number) {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function ymdFromMs(ms: number) {
  return new Date(ms).toISOString().slice(0, 10);
}

function ymd(value: string | null | undefined) {
  return String(value ?? "").slice(0, 10);
}

function eventStatusBucket(row: CompanyScopedEventsDirectoryRow): "active" | "upcoming" | "past" | "other" {
  const status = normalized(row.status);
  if (status === "active") return "active";
  if (status === "upcoming") return "upcoming";
  if (status === "completed" || status === "past") return "past";
  return "other";
}

export function applyCompanyScopedUsersFilters(
  rows: CompanyScopedUsersDirectoryRow[],
  state: CompanyScopedUsersFilterState
) {
  const query = normalized(state.search);
  return rows.filter((row) => {
    if (state.companyId !== "all" && row.companyId !== state.companyId) return false;
    if (state.role !== "all" && row.role !== state.role) return false;
    if (state.status !== "all" && row.status !== state.status) return false;
    if (state.seat === "consumes" && !row.seatConsuming) return false;
    if (state.seat === "none" && row.seatConsuming) return false;
    return includesSearch(row.fullName, row.email)(query);
  });
}

export function applyCompanyScopedLicensesFilters(
  rows: CompanyScopedOverviewRow[],
  state: CompanyScopedLicensesFilterState
) {
  const query = normalized(state.search);
  const tier = normalized(state.tier);
  return rows.filter((row) => {
    if (!includesSearch(row.companyName)(query)) return false;
    if (state.status !== "all" && row.licenseStatus !== state.status) return false;
    if (tier !== "all" && normalized(row.licenseTier) !== tier) return false;
    if (state.limit === "near_or_over" && row.usageHealth !== "watch" && row.usageHealth !== "over_limit") return false;
    if (state.expiring === "soon" && row.usageHealth !== "expiring") return false;
    if (state.activeEvents === "yes" && row.activeEvents <= 0) return false;
    if (state.activeEvents === "no" && row.activeEvents > 0) return false;
    return true;
  });
}

export function applyCompanyScopedEventsFilters(
  rows: CompanyScopedEventsDirectoryRow[],
  state: CompanyScopedEventsFilterState,
  opts: { nowMs?: number } = {}
) {
  const query = normalized(state.search);
  const currentMonth = monthBucketFromMs(opts.nowMs ?? Date.now());
  const today = ymdFromMs(opts.nowMs ?? Date.now());

  return rows.filter((row) => {
    if (!includesSearch(row.eventName, row.companyName)(query)) return false;
    if (state.companyId !== "all" && row.companyId !== state.companyId) return false;
    if (state.status !== "all" && eventStatusBucket(row) !== state.status) return false;
    if (state.date === "this_month" && ymd(row.startDate).slice(0, 7) !== currentMonth) return false;
    if (state.date === "upcoming" && ymd(row.startDate) < today) return false;
    if (state.date === "past") {
      const end = ymd(row.endDate) || ymd(row.startDate);
      if (!end || end >= today) return false;
    }
    if (state.leads === "yes" && row.leadsCaptured <= 0) return false;
    if (state.leads === "no" && row.leadsCaptured > 0) return false;
    return true;
  });
}

export function licenseTierFilterOptions(rows: CompanyScopedOverviewRow[]) {
  return Array.from(new Set(rows.map((row) => row.licenseTier).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b)
  );
}

export function companyFilterOptions(
  rows: Array<{ companyId: string; companyName: string }>
) {
  return Array.from(new Map(rows.map((row) => [row.companyId, row.companyName])).entries())
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export const COMPANY_SCOPED_LICENSE_HEALTH_REQUIRING_ATTENTION = new Set<CompanyScopedUsageHealth>([
  "watch",
  "over_limit"
]);
