"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AddUserModal } from "@/components/admin/add-user-modal";
import type { AddUserRoleOption } from "@/components/admin/add-user-modal";
import { AdminPageHeader, UserStatusBadge } from "@/components/admin/admin-ui";
import type {
  AdminUserRole,
  AdminUserStatus,
  ExhibitorOverview,
  PlatformEvent,
  PlatformUserOverview
} from "@/lib/data/platform-admin";
import type {
  AddUserInviteActionState,
  DeleteUserActionState,
  ResendInviteActionState
} from "@/lib/data/platform-admin";
import { ADMIN_USERS_ALL_EVENTS_ID, PLATFORM_WIDE_EVENT_ID } from "@/lib/data/platform-admin";
import { applyUsersTableFilters } from "@/lib/client/admin-users-filters";
import {
  OrganizerFilterBar,
  OrganizerFilterField,
  OrganizerFilterSelect,
  OrganizerSearchField
} from "@/components/organizer/organizer-filter-bar";

type UsersIndexClientProps = {
  events: PlatformEvent[];
  exhibitors: ExhibitorOverview[];
  users: PlatformUserOverview[];
  activeCompanyLicensedCompanyIds: string[];
  addUserAction: (formData: FormData) => Promise<AddUserInviteActionState>;
  deleteUserAction: (formData: FormData) => Promise<DeleteUserActionState>;
  resendInviteAction?: (formData: FormData) => Promise<ResendInviteActionState>;
  title?: string;
  subtitle?: string;
  defaultEventId?: string;
  eventStorageKey?: string;
  allowedRoles?: AddUserRoleOption[];
  showEventFilter?: boolean;
  eventContextLabel?: string;
  /** Organizer Admin: one shared filter row (filters left, search right). */
  organizerFilterLayout?: boolean;
  /** Platform Admin only: expose the server/query all-events scope. */
  includeAllEvents?: boolean;
};

export function UsersIndexClient({
  events,
  exhibitors,
  users,
  activeCompanyLicensedCompanyIds,
  addUserAction,
  deleteUserAction,
  resendInviteAction,
  title = "Users",
  subtitle = "Manage users and permissions by event",
  defaultEventId,
  eventStorageKey,
  allowedRoles = [
    "platform_admin",
    "organizer_admin",
    "exhibitor_admin",
    "exhibitor_viewer"
  ],
  showEventFilter = true,
  eventContextLabel,
  organizerFilterLayout = false,
  includeAllEvents = false
}: UsersIndexClientProps) {
  const router = useRouter();
  const [isPendingDelete, startDeleteTransition] = useTransition();
  const [isPendingResend, startResendTransition] = useTransition();
  const actionsBusy = isPendingDelete || isPendingResend;
  const [openModal, setOpenModal] = useState(false);
  const [eventId, setEventId] = useState(defaultEventId ?? events[0]?.id ?? "");
  const [exhibitorId, setExhibitorId] = useState("all");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | AdminUserRole>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | AdminUserStatus>("all");
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);

  const closeModal = useCallback(() => setOpenModal(false), []);

  const handleAddUserInvite = useCallback(
    async (formData: FormData) => {
      setFeedback(null);
      const result = await addUserAction(formData);
      if (!result.ok) {
        setFeedback({ kind: "error", message: result.error ?? "Failed adding user." });
        return result;
      }
      closeModal();
      router.refresh();
      return result;
    },
    [addUserAction, closeModal, router]
  );

  useEffect(() => {
    if (!events.length) return;
    if (!eventStorageKey) return;

    try {
      const stored = window.localStorage.getItem(eventStorageKey) ?? "";
      if (stored && events.some((event) => event.id === stored)) {
        setEventId(stored);
        return;
      }
    } catch {
      // Ignore localStorage read errors.
    }

    if (
      defaultEventId &&
      (events.some((event) => event.id === defaultEventId) ||
        (includeAllEvents && defaultEventId === ADMIN_USERS_ALL_EVENTS_ID))
    ) {
      setEventId(defaultEventId);
    }
  }, [defaultEventId, eventStorageKey, events, includeAllEvents]);

  useEffect(() => {
    if (!eventStorageKey || !eventId) return;
    try {
      window.localStorage.setItem(eventStorageKey, eventId);
    } catch {
      // Ignore localStorage write errors.
    }
  }, [eventId, eventStorageKey]);

  const filteredUsers = useMemo(
    () =>
      applyUsersTableFilters(users, {
        eventId,
        exhibitorId,
        roleFilter,
        statusFilter,
        search
      }),
    [users, eventId, exhibitorId, roleFilter, statusFilter, search]
  );

  const scopedExhibitors = useMemo(
    () => {
      const rows = eventId === ADMIN_USERS_ALL_EVENTS_ID
        ? exhibitors
        : exhibitors.filter((item) => item.eventId === eventId);
      return Array.from(new Map(rows.map((item) => [item.id, item])).values());
    },
    [eventId, exhibitors]
  );
  const eventNameById = useMemo(
    () => new Map(events.map((event) => [event.id, event.name])),
    [events]
  );
  const exhibitorNameById = useMemo(
    () => new Map(exhibitors.map((exhibitor) => [exhibitor.id, exhibitor.name])),
    [exhibitors]
  );

  const totalUsers = filteredUsers.length;
  const platformAdmins = filteredUsers.filter((user) => user.role === "platform_admin").length;
  const organizerAdmins = filteredUsers.filter((user) => user.role === "organizer_admin").length;
  const exhibitorAdmins = filteredUsers.filter((user) => user.role === "exhibitor_admin").length;
  const viewers = filteredUsers.filter((user) => user.role === "viewer").length;

  return (
    <section className="space-y-7">
      <AdminPageHeader
        title={title}
        subtitle={subtitle}
        action={
          <button
            type="button"
            onClick={() => setOpenModal(true)}
            className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 px-5 py-3 text-base font-semibold text-white shadow-sm hover:from-indigo-600 hover:to-violet-700"
          >
            + Add User
          </button>
        }
      />

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <Metric label="Total Users" value={totalUsers} />
        <Metric label="Platform Admins" value={platformAdmins} tone="accent" />
        <Metric label="Organizer Admins" value={organizerAdmins} tone="accent" />
        <Metric label="Exhibitor Admins" value={exhibitorAdmins} tone="accent" />
        <Metric label="App users" value={viewers} />
      </section>

      {organizerFilterLayout ? (
        <OrganizerFilterBar
          filters={
            <>
              {showEventFilter ? (
                <OrganizerFilterField label="Event">
                  <OrganizerFilterSelect
                    value={eventId}
                    onChange={(event) => {
                      setEventId(event.target.value);
                      setExhibitorId("all");
                    }}
                  >
                    {includeAllEvents ? (
                      <option value={ADMIN_USERS_ALL_EVENTS_ID}>All events</option>
                    ) : null}
                    {events.map((event) => (
                      <option key={event.id} value={event.id}>
                        {event.name}
                      </option>
                    ))}
                  </OrganizerFilterSelect>
                </OrganizerFilterField>
              ) : eventContextLabel ? (
                <span className="mb-1.5 self-center rounded-lg bg-accentSoft px-3 py-1.5 text-sm font-semibold text-accent">
                  {eventContextLabel}
                </span>
              ) : null}
              <OrganizerFilterField label="Exhibitor">
                <OrganizerFilterSelect
                  value={exhibitorId}
                  onChange={(event) => setExhibitorId(event.target.value)}
                  aria-label="Filter by exhibitor"
                >
                  <option value="all">All exhibitors</option>
                  {scopedExhibitors.map((exhibitor) => (
                    <option key={exhibitor.id} value={exhibitor.id}>
                      {exhibitor.name}
                    </option>
                  ))}
                </OrganizerFilterSelect>
              </OrganizerFilterField>
              <OrganizerFilterField label="Role">
                <OrganizerFilterSelect
                  value={roleFilter}
                  onChange={(event) => setRoleFilter(event.target.value as "all" | AdminUserRole)}
                  aria-label="Filter by role"
                >
                  <option value="all">All roles</option>
                  <option value="platform_admin">Platform admin</option>
                  <option value="organizer_admin">Organizer admin</option>
                  <option value="exhibitor_admin">Exhibitor admin</option>
                  <option value="viewer">App user</option>
                </OrganizerFilterSelect>
              </OrganizerFilterField>
              <OrganizerFilterField label="Status">
                <OrganizerFilterSelect
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value as "all" | AdminUserStatus)}
                  aria-label="Filter by status"
                >
                  <option value="all">All statuses</option>
                  <option value="active">Active</option>
                  <option value="invited">Invited</option>
                  <option value="invite_pending">Invite pending</option>
                  <option value="inactive">Inactive</option>
                </OrganizerFilterSelect>
              </OrganizerFilterField>
            </>
          }
          search={
            <OrganizerFilterField label="Search" className="w-full">
              <OrganizerSearchField
                value={search}
                onChange={setSearch}
                placeholder="Search by name or email…"
                aria-label="Search users"
              />
            </OrganizerFilterField>
          }
        />
      ) : (
        <section className="rounded-2xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(15,23,42,0.06)] md:p-5">
          <div className="flex flex-wrap items-end justify-start gap-3 md:gap-4">
            {showEventFilter ? (
              <label className="flex min-w-[200px] flex-col gap-1.5">
                <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Filter by event</span>
                <select
                  value={eventId}
                  onChange={(event) => {
                    setEventId(event.target.value);
                    setExhibitorId("all");
                  }}
                  aria-label="Filter by event"
                  className="h-11 min-w-[200px] rounded-xl border border-border bg-white px-4 text-base font-semibold"
                >
                  {includeAllEvents ? (
                    <option value={ADMIN_USERS_ALL_EVENTS_ID}>All events</option>
                  ) : null}
                  {events.map((event) => (
                    <option key={event.id} value={event.id}>
                      {event.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : eventContextLabel ? (
              <span className="rounded-lg bg-accentSoft px-3 py-1 text-sm font-semibold text-accent md:text-base">
                {eventContextLabel}
              </span>
            ) : null}
            <label className="flex min-w-[200px] flex-col gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Exhibitor</span>
              <select
                value={exhibitorId}
                onChange={(event) => setExhibitorId(event.target.value)}
                aria-label="Filter by exhibitor"
                className="h-11 min-w-[200px] rounded-xl border border-border bg-white px-4 text-base font-semibold"
              >
                <option value="all">All exhibitors</option>
                {scopedExhibitors.map((exhibitor) => (
                  <option key={exhibitor.id} value={exhibitor.id}>
                    {exhibitor.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-[180px] flex-col gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Role</span>
              <select
                value={roleFilter}
                onChange={(event) => setRoleFilter(event.target.value as "all" | AdminUserRole)}
                aria-label="Filter by role"
                className="h-11 min-w-[180px] rounded-xl border border-border bg-white px-4 text-base font-semibold"
              >
                <option value="all">All roles</option>
                <option value="platform_admin">Platform admin</option>
                <option value="organizer_admin">Organizer admin</option>
                <option value="exhibitor_admin">Exhibitor admin</option>
                <option value="viewer">App user</option>
              </select>
            </label>
            <label className="flex min-w-[160px] flex-col gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Status</span>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as "all" | AdminUserStatus)}
                aria-label="Filter by status"
                className="h-11 min-w-[160px] rounded-xl border border-border bg-white px-4 text-base font-semibold"
              >
                <option value="all">All statuses</option>
                <option value="active">Active</option>
                <option value="invited">Invited</option>
                <option value="invite_pending">Invite pending</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(15,23,42,0.06)] md:p-5">
        {feedback ? (
          <p
            className={`mb-4 rounded-xl border px-4 py-3 text-sm font-medium ${
              feedback.kind === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                : "border-rose-200 bg-rose-50 text-rose-700"
            }`}
            role="status"
          >
            {feedback.message}
          </p>
        ) : null}
        {organizerFilterLayout ? null : (
          <div className="relative">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search users by name or email..."
              className="h-12 w-full rounded-xl border border-border bg-white pl-12 pr-4 text-base placeholder:text-slate-400"
            />
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
              <SearchIcon />
            </span>
          </div>
        )}

        <div className={organizerFilterLayout ? "" : "mt-5"}>
          <table className="w-full table-fixed text-left">
            <thead className="border-b border-border bg-slate-50 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
              <tr>
                <th className="w-[42%] px-4 py-3">Name</th>
                <th className="w-[16%] px-4 py-3">Role</th>
                <th className="hidden w-[18%] px-4 py-3 lg:table-cell">Event</th>
                <th className="hidden w-[14%] px-4 py-3 xl:table-cell">Exhibitor</th>
                <th className="w-[12%] px-4 py-3">Status</th>
                <th className="w-[18%] px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => (
                <tr
                  key={`${user.id}-${user.eventId}`}
                  className="border-b border-border/70 text-sm text-slate-700 transition hover:bg-slate-50/80 last:border-none"
                >
                  <td className="px-4 py-4">
                    <div className="min-w-0 max-w-[420px]">
                      <p className="truncate font-semibold text-slate-900">{user.fullName}</p>
                      <p className="truncate text-slate-500">{user.email}</p>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <RoleBadge role={user.role} />
                  </td>
                  <td className="hidden px-4 py-4 font-medium lg:table-cell">
                    <span className="block truncate">
                      {user.role === "platform_admin"
                        ? "Platform-wide"
                        : user.eventId === PLATFORM_WIDE_EVENT_ID
                          ? "All company events"
                        : eventNameById.get(user.eventId) ?? "Unknown Event"}
                    </span>
                  </td>
                  <td className="hidden px-4 py-4 font-medium xl:table-cell">
                    <span className="block truncate">
                      {user.exhibitorId ? exhibitorNameById.get(user.exhibitorId) ?? "Unknown Exhibitor" : "—"}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <UserStatusBadge status={user.status} />
                  </td>
                  <td className="px-4 py-4 text-right">
                    <div className="inline-flex items-center justify-end gap-1">
                      {resendInviteAction && (user.status === "invited" || user.status === "invite_pending") ? (
                        <form
                          className="inline"
                          onSubmit={(event) => {
                            event.preventDefault();
                            if (actionsBusy) return;
                            const formData = new FormData(event.currentTarget);
                            startResendTransition(async () => {
                              setFeedback(null);
                              const result = await resendInviteAction(formData);
                              if (!result.ok) {
                                setFeedback({
                                  kind: "error",
                                  message: result.error ?? "Failed resending invite."
                                });
                                return;
                              }
                              setFeedback({ kind: "success", message: "Invite email sent." });
                              router.refresh();
                            });
                          }}
                        >
                          <input type="hidden" name="userId" value={user.id} />
                          <input type="hidden" name="eventId" value={user.sourceEventId ?? user.eventId} />
                          <input type="hidden" name="rowSource" value={user.rowSource} />
                          <button
                            type="submit"
                            disabled={actionsBusy}
                            aria-label="Resend invite email"
                            title="Resend invite"
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-white text-accent shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <MailIcon className="h-4 w-4" />
                          </button>
                        </form>
                      ) : null}
                      <form
                        className="inline"
                        onSubmit={(event) => {
                          event.preventDefault();
                          if (actionsBusy) return;
                          const confirmed = window.confirm("Delete this user?");
                          if (!confirmed) return;

                          const formData = new FormData(event.currentTarget);
                          startDeleteTransition(async () => {
                            setFeedback(null);
                            const result = await deleteUserAction(formData);
                            if (!result.ok) {
                              setFeedback({
                                kind: "error",
                                message: result.error ?? "Failed deleting user."
                              });
                              return;
                            }
                            router.refresh();
                          });
                        }}
                      >
                        <input type="hidden" name="userId" value={user.id} />
                        <input type="hidden" name="eventId" value={user.sourceEventId ?? user.eventId} />
                        <input type="hidden" name="rowSource" value={user.rowSource} />
                        <button
                          type="submit"
                          disabled={actionsBusy}
                          aria-label="Delete user"
                          title="Delete user"
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-rose-200 bg-white text-rose-600 shadow-sm transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <AddUserModal
        open={openModal}
        onClose={closeModal}
        events={events}
        exhibitors={exhibitors}
        activeCompanyLicensedCompanyIds={activeCompanyLicensedCompanyIds}
        defaultEventId={eventId === ADMIN_USERS_ALL_EVENTS_ID ? events[0]?.id : eventId}
        roleOptions={allowedRoles}
        addUserAction={handleAddUserInvite}
      />
    </section>
  );
}

function RoleBadge({ role }: { role: PlatformUserOverview["role"] }) {
  if (role === "platform_admin") {
    return (
      <span className="inline-flex rounded-full bg-violet-100 px-3 py-1 text-sm font-semibold text-violet-800">
        Platform Admin
      </span>
    );
  }
  if (role === "organizer_admin") {
    return <span className="inline-flex rounded-full bg-accentSoft px-3 py-1 text-sm font-semibold text-accent">Organizer Admin</span>;
  }
  if (role === "exhibitor_admin") {
    return <span className="inline-flex rounded-full bg-blue-100 px-3 py-1 text-sm font-semibold text-blue-700">Exhibitor Admin</span>;
  }
  return <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">App user</span>;
}

function Metric({
  label,
  value,
  tone = "default"
}: {
  label: string;
  value: number;
  tone?: "default" | "accent";
}) {
  return (
    <article className="rounded-2xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(15,23,42,0.06)] md:p-5">
      <p className={`text-3xl font-bold md:text-4xl ${tone === "accent" ? "text-accent" : "text-slate-950"}`}>{value}</p>
      <p className="mt-1 text-sm font-semibold text-slate-600 md:text-base">{label}</p>
    </article>
  );
}

function SearchIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
      <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function MailIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 6h16v12H4V6zm0 0 8 6 8-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M9 3h6m-7 4v11a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V7M10 11v6m4-6v6M5 7h14"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
