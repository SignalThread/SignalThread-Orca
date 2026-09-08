import { ADMIN_USERS_ALL_EVENTS_ID } from "@/lib/data/platform-admin";
import type { AdminUserRole, AdminUserStatus, PlatformUserOverview } from "@/lib/data/platform-admin";

/** Single composition point for /admin/users table + KPI counts (same input → same output). */
export type UsersTableFilterState = {
  eventId: string;
  exhibitorId: string;
  roleFilter: "all" | AdminUserRole;
  statusFilter: "all" | AdminUserStatus;
  search: string;
};

export function applyUsersTableFilters(
  users: PlatformUserOverview[],
  state: UsersTableFilterState
): PlatformUserOverview[] {
  const normalizedSearch = state.search.trim().toLowerCase();
  return users.filter((user) => {
    const isPlatformAdmin = user.role === "platform_admin";
    const allEvents = state.eventId === ADMIN_USERS_ALL_EVENTS_ID;
    // Platform admins are intentionally platform-wide. Company-wide pending
    // invites are not: when a concrete event is selected, they must not make
    // the event table appear unchanged.
    if (state.eventId && !allEvents && !isPlatformAdmin && user.eventId !== state.eventId) return false;
    if (state.exhibitorId !== "all" && !isPlatformAdmin && user.exhibitorId !== state.exhibitorId) return false;
    if (state.roleFilter !== "all" && user.role !== state.roleFilter) return false;
    if (state.statusFilter !== "all" && user.status !== state.statusFilter) return false;
    if (!normalizedSearch) return true;
    return (
      user.fullName.toLowerCase().includes(normalizedSearch) ||
      user.email.toLowerCase().includes(normalizedSearch)
    );
  });
}
