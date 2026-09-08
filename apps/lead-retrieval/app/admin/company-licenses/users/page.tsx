import Link from "next/link";
import { AdminPageHeader } from "@/components/admin/admin-ui";
import { CompanyScopedInviteUserAction } from "@/components/admin/company-scoped-invite-user-action";
import { CompanyScopedUsersRowActions } from "@/components/admin/company-scoped-users-row-actions";
import { companyMemberRoleProductLabel } from "@/lib/exhibitor/company-member-role-label";
import {
  applyCompanyScopedUsersFilters,
  companyFilterOptions,
  type CompanyScopedUsersFilterState
} from "@/lib/client/admin-company-licenses-filters";
import {
  getAdminCompanyScopedOverviewData,
  getAdminCompanyScopedUsersDirectoryData,
  summarizeCompanyScopedUsersDirectory,
  type CompanyScopedUsersDirectoryRow
} from "@/lib/data/admin-company-licenses-overview";
import { getAdminUsersPageData } from "@/lib/data/platform-admin";
import { addUserInviteAction } from "@/app/admin/users/actions";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function readParam(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function normalizeUsersFilters(params: Record<string, string | string[] | undefined>): CompanyScopedUsersFilterState {
  const role = readParam(params, "role");
  const status = readParam(params, "status");
  const seat = readParam(params, "seat");
  return {
    search: readParam(params, "q").trim(),
    companyId: readParam(params, "company") || "all",
    role: role === "exhibitor_admin" || role === "viewer" ? role : "all",
    status: status === "active" || status === "invited" || status === "expired" ? status : "all",
    seat: seat === "consumes" || seat === "none" ? seat : "all"
  };
}

function usersFiltersActive(filters: CompanyScopedUsersFilterState) {
  return Boolean(filters.search) ||
    filters.companyId !== "all" ||
    filters.role !== "all" ||
    filters.status !== "all" ||
    filters.seat !== "all";
}

function formatCount(value: number) {
  return value.toLocaleString("en-US");
}

function formatDateTime(value: string | null) {
  if (!value) return "Not tracked";
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return "Not tracked";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(ms));
}

function statusLabel(status: CompanyScopedUsersDirectoryRow["status"]) {
  if (status === "active") return "Active";
  if (status === "invited") return "Invited";
  if (status === "expired") return "Expired";
  return "Disabled";
}

function statusClasses(status: CompanyScopedUsersDirectoryRow["status"]) {
  if (status === "active") return "bg-emerald-100 text-emerald-800";
  if (status === "invited") return "bg-amber-100 text-amber-800";
  if (status === "expired") return "bg-slate-100 text-slate-700";
  return "bg-rose-100 text-rose-700";
}

function seatClasses(seatConsuming: boolean) {
  return seatConsuming
    ? "bg-emerald-100 text-emerald-800"
    : "bg-slate-100 text-slate-700";
}

function roleClasses(role: CompanyScopedUsersDirectoryRow["role"]) {
  if (role === "exhibitor_admin") return "bg-indigo-100 text-indigo-800";
  return "bg-slate-100 text-slate-700";
}

function SummaryCard({
  label,
  value
}: {
  label: string;
  value: string;
}) {
  return (
    <article className="rounded-2xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(15,23,42,0.06)] md:p-5">
      <p className="text-3xl font-bold text-slate-950 md:text-4xl">{value}</p>
      <p className="mt-1 text-sm font-semibold text-slate-600 md:text-base">{label}</p>
    </article>
  );
}

function UserDirectoryRow({ row }: { row: CompanyScopedUsersDirectoryRow }) {
  const displayName = row.fullName ?? (row.isPendingInvite ? "Pending invite" : "Not tracked");
  const eventsTooltip = row.eventSummary.subline
    ? `${row.eventSummary.headline}: ${row.eventSummary.subline}`
    : row.eventSummary.headline;

  return (
    <tr className="border-b border-border/70 text-sm text-slate-700 last:border-none hover:bg-slate-50/80">
      <td className="px-4 py-3 align-middle">
        <div className="min-w-0">
          <p className="truncate font-semibold text-slate-900" title={displayName}>
            {displayName}
          </p>
        </div>
      </td>
      <td className="px-4 py-3 align-middle text-sm text-slate-600">
        <span className="block truncate" title={row.email ?? undefined}>
          {row.email ?? "Not tracked"}
        </span>
      </td>
      <td className="px-4 py-3 align-middle">
        <div className="min-w-0">
          <p className="truncate font-medium text-slate-900" title={row.companyName}>
            {row.companyName}
          </p>
        </div>
      </td>
      <td className="px-4 py-3 align-middle">
        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${roleClasses(row.role)}`}>
          {companyMemberRoleProductLabel(row.role)}
        </span>
      </td>
      <td className="px-4 py-3 align-middle">
        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusClasses(row.status)}`}>
          {statusLabel(row.status)}
        </span>
      </td>
      <td className="px-4 py-3 align-middle">
        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${seatClasses(row.seatConsuming)}`}>
          {row.seatConsuming ? "Consumes seat" : "No seat"}
        </span>
      </td>
      <td className="px-4 py-3 align-middle">
        <p className="truncate font-medium text-slate-900" title={eventsTooltip}>
          {row.eventSummary.headline}
        </p>
      </td>
      <td className="px-4 py-3 align-middle text-sm text-slate-600">
        <span className="whitespace-nowrap">{formatDateTime(row.lastActivityOrInvitedAt)}</span>
      </td>
      <td className="px-4 py-3 align-middle">
        <CompanyScopedUsersRowActions row={row} />
      </td>
    </tr>
  );
}

export default async function CompanyScopedUsersPage({ searchParams }: { searchParams?: SearchParams }) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const filters = normalizeUsersFilters(resolvedSearchParams);
  const [users, overviewData, adminUsersData] = await Promise.all([
    getAdminCompanyScopedUsersDirectoryData(),
    getAdminCompanyScopedOverviewData(),
    getAdminUsersPageData()
  ]);
  const summary = summarizeCompanyScopedUsersDirectory(users);
  const filteredUsers = applyCompanyScopedUsersFilters(users, filters);
  const hasActiveFilters = usersFiltersActive(filters);
  const companies = overviewData.companies.map((row) => ({
    id: row.companyId,
    name: row.companyName
  }));
  const companyOptions = companyFilterOptions(overviewData.companies);

  return (
    <section className="space-y-7">
      <AdminPageHeader
        title="Users"
        subtitle="Manage company-scoped access, roles, invites, and seat usage."
        tag="Company-Scoped License Dashboard"
        action={
          <CompanyScopedInviteUserAction
            events={adminUsersData.events}
            exhibitors={adminUsersData.exhibitors}
            companies={companies}
            activeCompanyLicensedCompanyIds={adminUsersData.activeCompanyLicensedCompanyIds}
            addUserAction={addUserInviteAction}
          />
        }
      />

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Total users" value={formatCount(summary.totalUsers)} />
        <SummaryCard label="Active users" value={formatCount(summary.activeUsers)} />
        <SummaryCard label="Pending invites" value={formatCount(summary.pendingInvites)} />
        <SummaryCard
          label="Seat-consuming users"
          value={formatCount(summary.seatConsumingUsers)}
        />
      </section>

      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
        <form action="/admin/company-licenses/users" className="border-b border-border bg-slate-50/70 px-4 py-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            <label className="space-y-1.5 xl:col-span-2">
              <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Search</span>
              <input
                name="q"
                defaultValue={filters.search}
                placeholder="Name or email"
                className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm text-slate-800"
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Company</span>
              <select
                name="company"
                defaultValue={filters.companyId}
                className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm text-slate-800"
              >
                <option value="all">All companies</option>
                {companyOptions.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Role</span>
              <select
                name="role"
                defaultValue={filters.role}
                className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm text-slate-800"
              >
                <option value="all">All roles</option>
                <option value="exhibitor_admin">Exhibitor admin</option>
                <option value="viewer">App user</option>
              </select>
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Status</span>
              <select
                name="status"
                defaultValue={filters.status}
                className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm text-slate-800"
              >
                <option value="all">All statuses</option>
                <option value="active">Active</option>
                <option value="invited">Invited</option>
                <option value="expired">Expired</option>
              </select>
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Seat</span>
              <select
                name="seat"
                defaultValue={filters.seat}
                className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm text-slate-800"
              >
                <option value="all">All seat states</option>
                <option value="consumes">Consumes seat</option>
                <option value="none">No seat</option>
              </select>
            </label>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
            <span>
              Showing {formatCount(filteredUsers.length)} of {formatCount(users.length)} users
            </span>
            <span className="flex gap-2">
              <Link
                href="/admin/company-licenses/users"
                className="inline-flex h-9 items-center rounded-lg border border-border bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Clear filters
              </Link>
              <button
                type="submit"
                className="inline-flex h-9 items-center rounded-lg bg-slate-900 px-3 text-sm font-semibold text-white hover:bg-slate-800"
              >
                Apply filters
              </button>
            </span>
          </div>
        </form>
        <div className="w-full overflow-x-auto">
          <table className="w-full min-w-[1500px] table-fixed text-left">
            <thead className="border-b border-border bg-slate-50 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
              <tr>
                <th className="w-[14%] px-4 py-3.5">User</th>
                <th className="w-[16%] px-4 py-3.5">Email</th>
                <th className="w-[14%] px-4 py-3.5">Company</th>
                <th className="w-[10%] px-4 py-3.5">Role</th>
                <th className="w-[8%] px-4 py-3.5">Status</th>
                <th className="w-[10%] px-4 py-3.5">Seat Consuming</th>
                <th className="w-[12%] px-4 py-3.5">Events Assigned</th>
                <th className="w-[8%] px-4 py-3.5">Last Active / Invited</th>
                <th className="w-[8%] px-4 py-3.5">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((row) => (
                <UserDirectoryRow key={row.id} row={row} />
              ))}
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-sm text-slate-500">
                    {hasActiveFilters ? "No results match these filters." : "No company-scoped users found."}
                    {hasActiveFilters ? (
                      <Link href="/admin/company-licenses/users" className="ml-2 font-semibold text-slate-900 underline">
                        Clear filters.
                      </Link>
                    ) : null}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
