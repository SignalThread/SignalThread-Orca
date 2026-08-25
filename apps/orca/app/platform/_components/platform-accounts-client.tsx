"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  Button,
  Card,
  DataTable,
  EmptyState as UiEmptyState,
  ErrorState as UiErrorState,
  StatCard,
  StatusBadge,
} from "@signalthread/ui";
import {
  ArrowRight,
  Building2,
  CalendarDays,
  CircleSlash,
  Loader2,
  Plus,
  ShieldCheck,
  Trash2,
  Unlock,
  UserPlus,
  Users,
} from "lucide-react";
import type {
  PlatformAccount,
  PlatformAccountEvent,
  PlatformAccountEventMember,
  PlatformAccountEventsResponse,
  PlatformAccountUser,
  PlatformAccountsResponse,
  PlatformAccountUsersResponse,
  PlatformContextResponse,
} from "./platform-types";
import { platformRoleLabel } from "@/lib/platform-admin-labels";

type PlatformAccountsClientProps =
  | {
      mode: "overview";
    }
  | {
      mode: "list";
    }
  | {
      mode: "detail";
      orgId: string;
    };

type LoadState = "loading" | "loaded" | "error" | "forbidden";

const numberFormatter = new Intl.NumberFormat("en-US");
const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});
const ACCOUNT_USER_ROLES = ["OWNER", "ADMIN", "MEMBER", "VIEWER"] as const;
const EVENT_MEMBER_ROLES = ["EVENT_ADMIN", "EVENT_EDITOR", "EVENT_VIEWER"] as const;

function toCount(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function formatCount(value: number | null | undefined): string {
  return numberFormatter.format(toCount(value));
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "Unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unavailable";
  return dateFormatter.format(date);
}

function primaryAdminLabel(account: PlatformAccount): string {
  return account.primaryAdmin?.name?.trim() || account.primaryAdmin?.email || "No primary admin";
}

function toErrorMessage(
  response: PlatformAccountsResponse | PlatformAccountUsersResponse | PlatformAccountEventsResponse | PlatformContextResponse,
  fallback: string,
): string {
  return response.hint || response.message || response.reason || fallback;
}

function eventRoleLabel(value: string): string {
  return value.replace("EVENT_", "").toLowerCase().replace(/^\w/, (letter) => letter.toUpperCase());
}

function sortRecentAccounts(accounts: PlatformAccount[]): PlatformAccount[] {
  return [...accounts]
    .filter((account) => Boolean(account.createdAt))
    .sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime())
    .slice(0, 5);
}

function MetricCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof Building2;
}) {
  return <StatCard label={label} value={value} icon={<Icon className="h-4 w-4" />} tone="primary" />;
}

function LoadingState() {
  return (
    <Card className="p-8 text-center text-slate-600">
      <Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-400" />
      <p className="mt-3 text-sm font-medium">Loading platform accounts...</p>
    </Card>
  );
}

function ErrorState({ message, forbidden = false }: { message: string; forbidden?: boolean }) {
  return (
    <UiErrorState
      title={forbidden ? "Platform Admin access is required" : "Could not load Platform Admin data"}
      message={message}
      className="rounded-2xl p-5"
    />
  );
}

function EmptyState({ onCreate }: { onCreate?: () => void }) {
  return (
    <UiEmptyState
      icon={<Building2 className="h-5 w-5" />}
      title="No accounts yet"
      description="Create the first account to start organizing clients and events."
      action={
        onCreate ? (
          <Button onClick={onCreate} leadingIcon={<Plus className="h-4 w-4" />}>
            Create Account
          </Button>
        ) : null
      }
    />
  );
}

function CreateAccountModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (account: PlatformAccount) => void;
}) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!open) return null;

  async function submitCreateAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/platform/accounts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          name,
          ...(slug.trim() ? { slug } : {}),
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as PlatformAccountsResponse & {
        account?: PlatformAccount;
      };

      if (!response.ok) {
        setErrorMessage(toErrorMessage(payload, "Account could not be created."));
        return;
      }

      if (payload.account) {
        setName("");
        setSlug("");
        onCreated(payload.account);
        return;
      }

      setErrorMessage("Account was created, but the response was incomplete.");
    } catch {
      setErrorMessage("Network error while creating the account.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-4">
      <section className="w-full max-w-lg rounded-lg border border-slate-200 bg-white shadow-xl">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-[18px] leading-[24px] font-semibold text-slate-950">Create Account</h2>
        </div>
        <form onSubmit={submitCreateAccount} className="space-y-4 p-5">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Account name</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm text-slate-900 outline-none focus:border-slate-500"
              autoFocus
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">Slug</span>
            <input
              value={slug}
              onChange={(event) => setSlug(event.target.value)}
              className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm text-slate-900 outline-none focus:border-slate-500"
              placeholder="Generated from account name if left blank"
            />
          </label>

          {errorMessage ? (
            <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {errorMessage}
            </p>
          ) : null}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 rounded-md bg-slate-950 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Create Account
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function AddAccountUserModal({
  orgId,
  open,
  onClose,
  onLinked,
}: {
  orgId: string;
  open: boolean;
  onClose: () => void;
  onLinked: (user: PlatformAccountUser) => void;
}) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<(typeof ACCOUNT_USER_ROLES)[number]>("MEMBER");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!open) return null;

  async function submitAccountUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/platform/accounts/${orgId}/users`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          mode: "addExisting",
          email,
          role,
          ...(name.trim() ? { name } : {}),
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as PlatformAccountUsersResponse;

      if (!response.ok) {
        setErrorMessage(toErrorMessage(payload, "User could not be linked to this account."));
        return;
      }

      if (payload.result?.user) {
        setEmail("");
        setName("");
        setRole("MEMBER");
        onLinked(payload.result.user);
        return;
      }

      setErrorMessage("User was linked, but the response was incomplete.");
    } catch {
      setErrorMessage("Network error while linking the user.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-4">
      <section className="w-full max-w-lg rounded-lg border border-slate-200 bg-white shadow-xl">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-[18px] leading-[24px] font-semibold text-slate-950">Add Account User</h2>
          <p className="mt-1 text-sm text-slate-500">
            Link an existing app user to this organization. Platform roles remain unchanged; this action only grants
            organization membership.
          </p>
        </div>
        <form onSubmit={submitAccountUser} className="space-y-4 p-5">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Email</span>
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm text-slate-900 outline-none focus:border-slate-500"
              autoFocus
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">Name</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm text-slate-900 outline-none focus:border-slate-500"
              placeholder="Optional"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">Account role</span>
            <select
              value={role}
              onChange={(event) => setRole(event.target.value as (typeof ACCOUNT_USER_ROLES)[number])}
              className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-slate-500"
            >
              {ACCOUNT_USER_ROLES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-slate-500">
              For platform admins, this does not replace their platform-wide role.
            </span>
          </label>

          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Organization membership does not grant event visibility. Assign EventMember access separately if needed.
          </p>

          {errorMessage ? (
            <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {errorMessage}
            </p>
          ) : null}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 rounded-md bg-slate-950 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              Link User
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function EventAccessModal({
  orgId,
  open,
  initialEventId,
  initialUserId,
  onClose,
  onChanged,
}: {
  orgId: string;
  open: boolean;
  initialEventId: string | null;
  initialUserId: string | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [events, setEvents] = useState<PlatformAccountEvent[]>([]);
  const [users, setUsers] = useState<PlatformAccountUser[]>([]);
  const [members, setMembers] = useState<PlatformAccountEventMember[]>([]);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [draftRoles, setDraftRoles] = useState<Record<string, (typeof EVENT_MEMBER_ROLES)[number]>>({});
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [membersLoading, setMembersLoading] = useState(false);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    setLoadState("loading");
    setErrorMessage(null);
    setMembers([]);
    setDraftRoles({});

    Promise.all([
      fetch(`/api/platform/accounts/${orgId}/events`, { credentials: "include" }),
      fetch(`/api/platform/accounts/${orgId}/users`, { credentials: "include" }),
    ])
      .then(async ([eventsResponse, usersResponse]) => {
        const eventsPayload = (await eventsResponse.json().catch(() => ({}))) as PlatformAccountEventsResponse;
        const usersPayload = (await usersResponse.json().catch(() => ({}))) as PlatformAccountUsersResponse;
        if (cancelled) return;

        if (!eventsResponse.ok) {
          setLoadState(eventsResponse.status === 401 || eventsResponse.status === 403 ? "forbidden" : "error");
          setErrorMessage(toErrorMessage(eventsPayload, "Account events could not be loaded."));
          return;
        }
        if (!usersResponse.ok) {
          setLoadState(usersResponse.status === 401 || usersResponse.status === 403 ? "forbidden" : "error");
          setErrorMessage(toErrorMessage(usersPayload, "Account users could not be loaded."));
          return;
        }

        const loadedEvents = Array.isArray(eventsPayload.events) ? eventsPayload.events : [];
        setEvents(loadedEvents);
        setUsers(Array.isArray(usersPayload.users) ? usersPayload.users : []);
        setSelectedEventId(initialEventId || loadedEvents[0]?.id || "");
        setLoadState("loaded");
      })
      .catch(() => {
        if (cancelled) return;
        setLoadState("error");
        setErrorMessage("Network error while loading event access data.");
      });

    return () => {
      cancelled = true;
    };
  }, [open, orgId, initialEventId]);

  useEffect(() => {
    if (!open || !selectedEventId) return;
    let cancelled = false;

    setMembersLoading(true);
    setErrorMessage(null);

    fetch(`/api/platform/accounts/${orgId}/events/${selectedEventId}/members`, { credentials: "include" })
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as PlatformAccountEventsResponse;
        if (cancelled) return;

        if (!response.ok) {
          setErrorMessage(toErrorMessage(payload, "Event access members could not be loaded."));
          return;
        }

        setMembers(Array.isArray(payload.members) ? payload.members : []);
      })
      .catch(() => {
        if (cancelled) return;
        setErrorMessage("Network error while loading event members.");
      })
      .finally(() => {
        if (!cancelled) setMembersLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, orgId, selectedEventId]);

  if (!open) return null;

  const membersByUserId = new Map(members.map((member) => [member.userId, member]));
  const selectedEvent = events.find((event) => event.id === selectedEventId) ?? null;

  async function refreshMembers() {
    if (!selectedEventId) return;
    const response = await fetch(`/api/platform/accounts/${orgId}/events/${selectedEventId}/members`, {
      credentials: "include",
    });
    const payload = (await response.json().catch(() => ({}))) as PlatformAccountEventsResponse;
    if (!response.ok) {
      setErrorMessage(toErrorMessage(payload, "Event access members could not be refreshed."));
      return;
    }
    setMembers(Array.isArray(payload.members) ? payload.members : []);
  }

  async function grantAccess(userId: string, eventRole: string) {
    if (!selectedEventId) return;
    setSavingUserId(userId);
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/platform/accounts/${orgId}/events/${selectedEventId}/members`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ userId, eventRole }),
      });
      const payload = (await response.json().catch(() => ({}))) as PlatformAccountEventsResponse;

      if (!response.ok) {
        setErrorMessage(toErrorMessage(payload, "Event access could not be granted."));
        return;
      }

      await refreshMembers();
      onChanged();
    } catch {
      setErrorMessage("Network error while granting event access.");
    } finally {
      setSavingUserId(null);
    }
  }

  async function revokeAccess(userId: string) {
    if (!selectedEventId) return;
    setSavingUserId(userId);
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/platform/accounts/${orgId}/events/${selectedEventId}/members/${userId}`, {
        method: "DELETE",
        credentials: "include",
      });
      const payload = (await response.json().catch(() => ({}))) as PlatformAccountEventsResponse;

      if (!response.ok) {
        setErrorMessage(toErrorMessage(payload, "Event access could not be revoked."));
        return;
      }

      await refreshMembers();
      onChanged();
    } catch {
      setErrorMessage("Network error while revoking event access.");
    } finally {
      setSavingUserId(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-4">
      <section className="max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-[18px] leading-[24px] font-semibold text-slate-950">Manage Event Access</h2>
            <p className="mt-1 text-sm text-slate-500">
              Event visibility is granted only by EventMember rows for the events in this account.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Close
          </button>
        </div>

        <div className="max-h-[calc(90vh-81px)] overflow-y-auto p-5">
          {loadState === "loading" ? (
            <div className="py-8 text-center text-sm text-slate-500">
              <Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-400" />
              <p className="mt-2">Loading event access...</p>
            </div>
          ) : null}

          {loadState === "forbidden" || loadState === "error" ? (
            <ErrorState
              forbidden={loadState === "forbidden"}
              message={errorMessage || "Event access data could not be loaded."}
            />
          ) : null}

          {loadState === "loaded" ? (
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">Event</span>
                  <select
                    value={selectedEventId}
                    onChange={(event) => setSelectedEventId(event.target.value)}
                    className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-slate-500"
                  >
                    {events.map((event) => (
                      <option key={event.id} value={event.id}>
                        {event.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                  {selectedEvent ? `${formatCount(selectedEvent.eventMemberCount)} current members` : "No event selected"}
                </div>
              </div>

              {errorMessage ? (
                <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {errorMessage}
                </p>
              ) : null}

              {events.length === 0 ? (
                <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-500">
                  No events exist for this account yet.
                </p>
              ) : null}

              {events.length > 0 ? (
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="w-full min-w-[820px] table-fixed border-collapse text-left">
                    <thead className="border-b border-slate-200 bg-slate-50 text-[12px] font-semibold tracking-wide text-slate-500 uppercase">
                      <tr>
                        <th className="w-[28%] px-4 py-3">User</th>
                        <th className="w-[20%] px-4 py-3">Current access</th>
                        <th className="w-[20%] px-4 py-3">Event role</th>
                        <th className="w-[16%] px-4 py-3">Assigned</th>
                        <th className="w-[16%] px-4 py-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {users.map((user) => {
                        const member = membersByUserId.get(user.id);
                        const roleValue = member?.eventRole ?? draftRoles[user.id] ?? "EVENT_VIEWER";
                        const highlighted = initialUserId === user.id;

                        return (
                          <tr key={user.id} className={highlighted ? "bg-amber-50/50 align-middle" : "align-middle"}>
                            <td className="px-4 py-3">
                              <p className="truncate text-sm font-semibold text-slate-950">{user.name || "Unnamed user"}</p>
                              <p className="truncate text-xs text-slate-500">{user.email}</p>
                            </td>
                            <td className="px-4 py-3">
                              {member ? (
                                <p className="text-sm font-medium text-emerald-700">Has event access</p>
                              ) : (
                                <p className="text-sm font-medium text-slate-500">No event access assigned yet.</p>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <select
                                value={roleValue}
                                disabled={savingUserId === user.id || membersLoading}
                                onChange={(event) => {
                                  const nextRole = event.target.value as (typeof EVENT_MEMBER_ROLES)[number];
                                  if (member) {
                                    grantAccess(user.id, nextRole);
                                    return;
                                  }
                                  setDraftRoles((current) => ({ ...current, [user.id]: nextRole }));
                                }}
                                className="h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-900 outline-none focus:border-slate-500 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {EVENT_MEMBER_ROLES.map((option) => (
                                  <option key={option} value={option}>
                                    {eventRoleLabel(option)}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="px-4 py-3 text-sm text-slate-700">{formatDate(member?.createdAt)}</td>
                            <td className="px-4 py-3">
                              {member ? (
                                <button
                                  type="button"
                                  disabled={savingUserId === user.id || membersLoading}
                                  onClick={() => revokeAccess(user.id)}
                                  className="inline-flex items-center gap-1 rounded-md border border-rose-200 px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                  Revoke
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  disabled={savingUserId === user.id || membersLoading}
                                  onClick={() => grantAccess(user.id, roleValue)}
                                  className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  <Unlock className="h-3.5 w-3.5" />
                                  Grant
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function AccountUsersPanel({
  orgId,
  refreshKey,
  onManageEventAccess,
}: {
  orgId: string;
  refreshKey: number;
  onManageEventAccess: (userId: string) => void;
}) {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [users, setUsers] = useState<PlatformAccountUser[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/platform/accounts/${orgId}/users`, { credentials: "include" })
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as PlatformAccountUsersResponse;
        if (cancelled) return;

        if (!response.ok) {
          setLoadState(response.status === 401 || response.status === 403 ? "forbidden" : "error");
          setErrorMessage(toErrorMessage(payload, "Account users could not be loaded."));
          return;
        }

        setUsers(Array.isArray(payload.users) ? payload.users : []);
        setLoadState("loaded");
      })
      .catch(() => {
        if (cancelled) return;
        setLoadState("error");
        setErrorMessage("Network error while loading account users.");
      });

    return () => {
      cancelled = true;
    };
  }, [orgId, refreshKey]);

  function upsertUser(user: PlatformAccountUser) {
    setUsers((current) => {
      const withoutDuplicate = current.filter((item) => item.id !== user.id);
      return [...withoutDuplicate, user].sort((a, b) => a.email.localeCompare(b.email));
    });
  }

  async function updateRole(userId: string, role: string) {
    setSavingUserId(userId);
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/platform/accounts/${orgId}/users/${userId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ role }),
      });
      const payload = (await response.json().catch(() => ({}))) as PlatformAccountUsersResponse;

      if (!response.ok) {
        setErrorMessage(toErrorMessage(payload, "Role could not be updated."));
        return;
      }

      if (payload.result?.user) {
        upsertUser(payload.result.user);
      }
    } catch {
      setErrorMessage("Network error while updating the role.");
    } finally {
      setSavingUserId(null);
    }
  }

  async function removeUser(user: PlatformAccountUser) {
    const confirmed = window.confirm(`Remove ${user.email} from this account? Event access is not changed here.`);
    if (!confirmed) return;

    setSavingUserId(user.id);
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/platform/accounts/${orgId}/users/${user.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const payload = (await response.json().catch(() => ({}))) as PlatformAccountUsersResponse;

      if (!response.ok) {
        setErrorMessage(toErrorMessage(payload, "User could not be removed from this account."));
        return;
      }

      setUsers((current) => current.filter((item) => item.id !== user.id));
    } catch {
      setErrorMessage("Network error while removing the user.");
    } finally {
      setSavingUserId(null);
    }
  }

  function handleLinked(user: PlatformAccountUser) {
    setModalOpen(false);
    upsertUser(user);
  }

  return (
    <Card padded={false}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-950">Members</h2>
          <p className="mt-1 text-sm text-slate-500">People with access to this account.</p>
        </div>
        <Button
          type="button"
          onClick={() => setModalOpen(true)}
          leadingIcon={<UserPlus className="h-4 w-4" />}
        >
          Add User
        </Button>
      </div>

      {errorMessage ? (
        <div className="border-b border-rose-200 bg-rose-50 px-5 py-3 text-sm text-rose-700">{errorMessage}</div>
      ) : null}

      {loadState === "loading" ? (
        <div className="p-6 text-center text-sm text-slate-500">
          <Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-400" />
          <p className="mt-2">Loading account users...</p>
        </div>
      ) : null}

      {loadState === "forbidden" || loadState === "error" ? (
        <div className="p-5">
          <ErrorState
            forbidden={loadState === "forbidden"}
            message={errorMessage || "Account users could not be loaded."}
          />
        </div>
      ) : null}

      {loadState === "loaded" && users.length === 0 ? (
        <div className="p-6 text-sm text-slate-500">No account users linked yet.</div>
      ) : null}

      {loadState === "loaded" && users.length > 0 ? (
        <DataTable className="rounded-none border-0 shadow-none" tableClassName="min-w-[900px]">
            <thead className="border-b border-slate-200 bg-slate-50 text-[12px] font-semibold tracking-wide text-slate-500 uppercase">
              <tr>
                <th className="w-[24%] px-4 py-3">User</th>
                <th className="w-[16%] px-4 py-3">Platform role</th>
                <th className="w-[16%] px-4 py-3">Membership</th>
                <th className="w-[22%] px-4 py-3">Event access</th>
                <th className="w-[12%] px-4 py-3">Created</th>
                <th className="w-[10%] px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((user) => (
                <tr key={user.id} className="align-middle">
                  <td className="px-4 py-3">
                    <p className="truncate text-sm font-semibold text-slate-950">{user.name || "Unnamed user"}</p>
                    <p className="truncate text-xs text-slate-500">{user.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    <div>
                      <StatusBadge tone="neutral">{platformRoleLabel(user.role as Parameters<typeof platformRoleLabel>[0])}</StatusBadge>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge tone="neutral">{user.membershipStatus}</StatusBadge>
                    <p className="text-xs text-slate-500">{formatDate(user.membershipCreatedAt)}</p>
                  </td>
                  <td className="px-4 py-3">
                    {user.hasEventAccess ? (
                      <StatusBadge tone="success">{formatCount(user.eventAccessCount)} {user.eventAccessCount === 1 ? "event" : "events"}</StatusBadge>
                    ) : (
                      <p className="text-sm text-slate-500">No event access</p>
                    )}
                    <button
                      type="button"
                      onClick={() => onManageEventAccess(user.id)}
                      className="mt-2 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Manage event access
                    </button>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700">{formatDate(user.userCreatedAt)}</td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      disabled={savingUserId === user.id}
                      onClick={() => removeUser(user)}
                      className="inline-flex items-center gap-1 rounded-md border border-rose-200 px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
        </DataTable>
      ) : null}

      <AddAccountUserModal orgId={orgId} open={modalOpen} onClose={() => setModalOpen(false)} onLinked={handleLinked} />
    </Card>
  );
}

function AccountEventsPanel({
  orgId,
  refreshKey,
  onManageAccess,
}: {
  orgId: string;
  refreshKey: number;
  onManageAccess: (eventId: string) => void;
}) {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [events, setEvents] = useState<PlatformAccountEvent[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/platform/accounts/${orgId}/events`, { credentials: "include" })
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as PlatformAccountEventsResponse;
        if (cancelled) return;

        if (!response.ok) {
          setLoadState(response.status === 401 || response.status === 403 ? "forbidden" : "error");
          setErrorMessage(toErrorMessage(payload, "Account events could not be loaded."));
          return;
        }

        setEvents(Array.isArray(payload.events) ? payload.events : []);
        setLoadState("loaded");
      })
      .catch(() => {
        if (cancelled) return;
        setLoadState("error");
        setErrorMessage("Network error while loading account events.");
      });

    return () => {
      cancelled = true;
    };
  }, [orgId, refreshKey]);

  return (
    <Card padded={false}>
      <div className="border-b border-slate-200 px-5 py-4">
        <h2 className="text-sm font-semibold text-slate-950">Events</h2>
        <p className="mt-1 text-sm text-slate-500">
          Manage EventMember access for events that belong to this account only.
        </p>
      </div>

      {loadState === "loading" ? (
        <div className="p-6 text-center text-sm text-slate-500">
          <Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-400" />
          <p className="mt-2">Loading account events...</p>
        </div>
      ) : null}

      {loadState === "forbidden" || loadState === "error" ? (
        <div className="p-5">
          <ErrorState
            forbidden={loadState === "forbidden"}
            message={errorMessage || "Account events could not be loaded."}
          />
        </div>
      ) : null}

      {loadState === "loaded" && events.length === 0 ? (
        <div className="p-6 text-sm text-slate-500">No events exist for this account yet.</div>
      ) : null}

      {loadState === "loaded" && events.length > 0 ? (
        <DataTable className="rounded-none border-0 shadow-none" tableClassName="min-w-[900px]">
            <thead className="border-b border-slate-200 bg-slate-50 text-[12px] font-semibold tracking-wide text-slate-500 uppercase">
              <tr>
                <th className="w-[28%] px-4 py-3">Event</th>
                {events.some((event) => event.clientName) ? <th className="w-[18%] px-4 py-3">Client</th> : null}
                <th className="w-[14%] px-4 py-3">Dates</th>
                <th className="w-[12%] px-4 py-3">Status</th>
                <th className="w-[12%] px-4 py-3">Members</th>
                <th className="w-[16%] px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {events.map((event) => (
                <tr key={event.id} className="align-middle">
                  <td className="px-4 py-3">
                    <p className="truncate text-sm font-semibold text-slate-950">{event.name}</p>
                  </td>
                  {events.some((item) => item.clientName) ? <td className="px-4 py-3 text-sm text-slate-700">{event.clientName || "—"}</td> : null}
                  <td className="px-4 py-3 text-sm text-slate-700">
                    <p>{formatDate(event.startDate)}</p>
                    {event.endDate ? <p className="text-xs text-slate-500">to {formatDate(event.endDate)}</p> : null}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700">
                    <StatusBadge tone="info">{event.status}</StatusBadge>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700">{formatCount(event.eventMemberCount)}</td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => onManageAccess(event.id)}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <Unlock className="h-3.5 w-3.5" />
                      Manage access
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
        </DataTable>
      ) : null}
    </Card>
  );
}

function OverviewContent({ accounts }: { accounts: PlatformAccount[] }) {
  const totals = useMemo(
    () => ({
      accounts: accounts.length,
      events: accounts.reduce((sum, account) => sum + toCount(account.eventCount), 0),
      users: accounts.reduce((sum, account) => sum + toCount(account.userCount), 0),
      members: accounts.reduce((sum, account) => sum + toCount(account.memberCount), 0),
      missingAdmins: accounts.filter((account) => !account.primaryAdmin).length,
      recent: sortRecentAccounts(accounts),
    }),
    [accounts],
  );

  return (
    <div className="space-y-6">
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Total accounts" value={formatCount(totals.accounts)} icon={Building2} />
        <MetricCard label="Total events" value={formatCount(totals.events)} icon={CalendarDays} />
        <MetricCard label="Users" value={formatCount(totals.users)} icon={Users} />
        <MetricCard label="Members" value={formatCount(totals.members)} icon={ShieldCheck} />
        <MetricCard label="Missing admins" value={formatCount(totals.missingAdmins)} icon={CircleSlash} />
      </section>

      <Card padded={false}>
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-950">Recent accounts</h2>
          <Link href="/platform/accounts" className="inline-flex items-center gap-1 text-sm font-semibold text-slate-700 hover:text-slate-950">
            Accounts
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        {totals.recent.length > 0 ? (
          <div className="divide-y divide-slate-100">
            {totals.recent.map((account) => (
              <Link
                key={account.id}
                href={`/platform/accounts/${account.id}`}
                className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-slate-50"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">{account.name}</p>
                  <p className="truncate text-xs text-slate-500">{account.slug || "No slug"}</p>
                </div>
                <p className="shrink-0 text-xs text-slate-500">{formatDate(account.createdAt)}</p>
              </Link>
            ))}
          </div>
        ) : (
          <p className="px-4 py-6 text-sm text-slate-500">Recent account data is unavailable.</p>
        )}
      </Card>
    </div>
  );
}

function AccountsListContent({
  accounts,
  onCreateClick,
  onJumpIn,
  jumpingOrgId,
  actionError,
}: {
  accounts: PlatformAccount[];
  onCreateClick: () => void;
  onJumpIn: (orgId: string) => void;
  jumpingOrgId: string | null;
  actionError: string | null;
}) {
  if (accounts.length === 0) return <EmptyState onCreate={onCreateClick} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500">{formatCount(accounts.length)} accounts</p>
        <Button type="button" onClick={onCreateClick} leadingIcon={<Plus className="h-4 w-4" />}>
          Create Account
        </Button>
      </div>
      {actionError ? (
        <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {actionError}
        </p>
      ) : null}

      <DataTable>
        <thead className="border-b border-slate-200 bg-slate-50 text-[12px] font-semibold tracking-wide text-slate-500 uppercase">
          <tr>
            <th className="w-[28%] px-4 py-3">Account</th>
            <th className="w-[22%] px-4 py-3">Primary admin</th>
            <th className="w-[12%] px-4 py-3">Users</th>
            <th className="w-[12%] px-4 py-3">Events</th>
            <th className="w-[14%] px-4 py-3">Created</th>
            <th className="w-[12%] px-4 py-3">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {accounts.map((account) => (
            <tr key={account.id} className="align-middle">
              <td className="px-4 py-3">
                <p className="truncate text-sm font-semibold text-slate-950">{account.name}</p>
              </td>
              <td className="px-4 py-3">
                <p className="truncate text-sm text-slate-700">{primaryAdminLabel(account)}</p>
              </td>
              <td className="px-4 py-3 text-sm text-slate-700">{formatCount(account.userCount ?? account.memberCount)}</td>
              <td className="px-4 py-3 text-sm text-slate-700">{formatCount(account.eventCount)}</td>
              <td className="px-4 py-3 text-sm text-slate-700">{formatDate(account.createdAt)}</td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <Link
                    href={`/platform/accounts/${account.id}`}
                    className="rounded-xl border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    View
                  </Link>
                  <button
                    type="button"
                    disabled
                    className="rounded-xl border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-400"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    disabled={jumpingOrgId === account.id}
                    onClick={() => onJumpIn(account.id)}
                    className="rounded-xl border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {jumpingOrgId === account.id ? "Opening..." : "Jump In"}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </DataTable>
    </div>
  );
}

function DetailContent({
  account,
  onJumpIn,
  jumpingOrgId,
  actionError,
}: {
  account: PlatformAccount;
  onJumpIn: (orgId: string) => void;
  jumpingOrgId: string | null;
  actionError: string | null;
}) {
  const [activeTab, setActiveTab] = useState<"members" | "events" | "details">("members");
  const [accessRefreshKey, setAccessRefreshKey] = useState(0);
  const [accessModalOpen, setAccessModalOpen] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  function openEventAccess(eventId: string | null, userId: string | null) {
    setSelectedEventId(eventId);
    setSelectedUserId(userId);
    setAccessModalOpen(true);
  }

  function handleAccessChanged() {
    setAccessRefreshKey((current) => current + 1);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <Card padded={false} className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Account</p>
            <h1 className="mt-1 text-[28px] leading-[34px] font-semibold text-slate-950">{account.name}</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              disabled={jumpingOrgId === account.id}
              onClick={() => onJumpIn(account.id)}
            >
              {jumpingOrgId === account.id ? "Opening..." : "Jump In"}
            </Button>
          </div>
        </div>

        <dl className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div>
            <dt className="text-xs font-semibold text-slate-500 uppercase">Created</dt>
            <dd className="mt-1 text-sm font-medium text-slate-900">{formatDate(account.createdAt)}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-slate-500 uppercase">Primary admin</dt>
            <dd className="mt-1 text-sm font-medium text-slate-900">{primaryAdminLabel(account)}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-slate-500 uppercase">Users</dt>
            <dd className="mt-1 text-sm font-medium text-slate-900">{formatCount(account.userCount ?? account.memberCount)}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-slate-500 uppercase">Events</dt>
            <dd className="mt-1 text-sm font-medium text-slate-900">{formatCount(account.eventCount)}</dd>
          </div>
        </dl>
      </Card>

      {actionError ? (
        <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {actionError}
        </p>
      ) : null}

      <Card padded={false} className="p-2">
        <div className="flex flex-wrap gap-2">
          {([['members', 'Members'], ['events', 'Events'], ['details', 'Account details']] as const).map(([tab, label]) => <button key={tab} type="button" onClick={() => setActiveTab(tab)} className={activeTab === tab ? "rounded-lg bg-[#28439A] px-3 py-2 text-sm font-semibold text-white" : "rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"}>{label}</button>)}
        </div>
      </Card>

      {activeTab === "members" ?
        <AccountUsersPanel
          orgId={account.id}
          refreshKey={accessRefreshKey}
          onManageEventAccess={(userId) => openEventAccess(null, userId)}
        /> : null}

      {activeTab === "events" ?
        <AccountEventsPanel
          orgId={account.id}
          refreshKey={accessRefreshKey}
          onManageAccess={(eventId) => openEventAccess(eventId, null)}
        /> : null}
      {activeTab === "details" ? <Card className="p-5"><h2 className="font-semibold text-slate-950">Account details</h2><dl className="mt-4 grid gap-4 sm:grid-cols-2"><div><dt className="text-xs font-semibold uppercase text-slate-500">Account ID</dt><dd className="mt-1 break-all text-sm text-slate-700">{account.id}</dd></div><div><dt className="text-xs font-semibold uppercase text-slate-500">Account slug</dt><dd className="mt-1 text-sm text-slate-700">{account.slug}</dd></div><div><dt className="text-xs font-semibold uppercase text-slate-500">Last updated</dt><dd className="mt-1 text-sm text-slate-700">{formatDate(account.updatedAt)}</dd></div></dl></Card> : null}

      <EventAccessModal
        orgId={account.id}
        open={accessModalOpen}
        initialEventId={selectedEventId}
        initialUserId={selectedUserId}
        onClose={() => setAccessModalOpen(false)}
        onChanged={handleAccessChanged}
      />
    </div>
  );
}

export function PlatformAccountsClient(props: PlatformAccountsClientProps) {
  const router = useRouter();
  const detailOrgId = props.mode === "detail" ? props.orgId : null;
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [accounts, setAccounts] = useState<PlatformAccount[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [jumpingOrgId, setJumpingOrgId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch(detailOrgId ? `/api/platform/accounts/${detailOrgId}` : "/api/platform/accounts", { credentials: "include" })
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as PlatformAccountsResponse;
        if (cancelled) return;

        if (!response.ok) {
          setLoadState(response.status === 401 || response.status === 403 ? "forbidden" : "error");
          setErrorMessage(toErrorMessage(payload, "Platform accounts could not be loaded."));
          return;
        }

        setAccounts(Array.isArray(payload.accounts) ? payload.accounts : payload.account ? [payload.account] : []);
        setLoadState("loaded");
      })
      .catch(() => {
        if (cancelled) return;
        setLoadState("error");
        setErrorMessage("Network error while loading platform accounts.");
      });

    return () => {
      cancelled = true;
    };
  }, [detailOrgId]);

  function handleCreated(account: PlatformAccount) {
    setModalOpen(false);
    setAccounts((current) => {
      const withoutDuplicate = current.filter((item) => item.id !== account.id);
      return [account, ...withoutDuplicate];
    });
    router.push(`/platform/accounts/${account.id}`);
  }

  async function jumpIntoAccount(orgId: string) {
    setJumpingOrgId(orgId);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/platform/context", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ orgId }),
      });
      const payload = (await response.json().catch(() => ({}))) as PlatformContextResponse;

      if (!response.ok) {
        setErrorMessage(toErrorMessage(payload, "Account context could not be opened."));
        return;
      }

      if (!payload.context?.orgId) {
        setErrorMessage("Account context was opened, but the response was incomplete.");
        return;
      }

      router.push("/events");
    } catch {
      setErrorMessage("Network error while opening account context.");
    } finally {
      setJumpingOrgId(null);
    }
  }

  if (loadState === "loading") return <LoadingState />;
  if (loadState === "forbidden") {
    return <ErrorState forbidden message={errorMessage || "You do not have access to Platform Admin."} />;
  }
  if (loadState === "error") {
    return <ErrorState message={errorMessage || "Platform accounts could not be loaded."} />;
  }

  if (props.mode === "overview") {
    return accounts.length > 0 ? <OverviewContent accounts={accounts} /> : <EmptyState />;
  }

  if (props.mode === "list") {
    return (
      <>
        <AccountsListContent
          accounts={accounts}
          onCreateClick={() => setModalOpen(true)}
          onJumpIn={jumpIntoAccount}
          jumpingOrgId={jumpingOrgId}
          actionError={errorMessage}
        />
        <CreateAccountModal open={modalOpen} onClose={() => setModalOpen(false)} onCreated={handleCreated} />
      </>
    );
  }

  const account = accounts.find((item) => item.id === props.orgId);
  if (!account) {
    return (
      <Card>
        <p className="text-sm font-semibold text-slate-900">Account not found</p>
        <p className="mt-1 text-sm text-slate-500">This account is not available from the platform account API.</p>
        <Link
          href="/platform/accounts"
          className="mt-4 inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
        >
          Back to Accounts
        </Link>
      </Card>
    );
  }

  return (
    <DetailContent
      account={account}
      onJumpIn={jumpIntoAccount}
      jumpingOrgId={jumpingOrgId}
      actionError={errorMessage}
    />
  );
}
