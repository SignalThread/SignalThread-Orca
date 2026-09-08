"use client";

import { type ReactNode, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Pencil, Send, Trash2 } from "lucide-react";
import type { ExhibitorLicenseOption, User } from "@/lib/data/users";
import type { EmergencyLoginCodeResult } from "@/lib/server/emergency-login-code-core";
import {
  EXHIBITOR_INVITE_ROLE_OPTIONS,
  exhibitorTeamRoleProductLabel,
  type ExhibitorInviteRole
} from "@/lib/exhibitor/exhibitor-invite-role";
import { PageHeader, PageShell } from "@/components/layout/page-header";
import { exhibitorUserDisplayName } from "@/lib/data/exhibitor-users-company-scope";
import { generateEmergencyLoginCodeAction, resendExhibitorUserInviteAction } from "./actions";

/** License `seats_used` / `seats_total` here are display hints from the server (reconciled, not authoritative for access). */

const actionIconButtonClass =
  "inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-45";

type ExhibitorUsersClientProps = {
  users: User[];
  licenses: ExhibitorLicenseOption[];
  /** Event id used to scope the Users table and seat picker — must match invite payload. */
  scopedEventId: string | null;
};

type AccessType = "app" | "no_app";

type InviteFormState = {
  email: string;
  fullName: string;
  role: ExhibitorInviteRole;
  accessType: AccessType;
  licenseId: string;
};

type LicenseOption = ExhibitorLicenseOption & {
  label: string;
};

type EmergencyLoginSuccess = Extract<EmergencyLoginCodeResult, { ok: true }>;

function roleBadgeClass(role: string | null | undefined) {
  const normalized = String(role ?? "").trim().toLowerCase();
  if (normalized === "event_organizer" || normalized === "organizer_admin") {
    return "bg-violet-100 text-violet-700";
  }
  if (normalized === "exhibitor_admin") {
    return "bg-indigo-50 text-indigo-950 ring-1 ring-inset ring-indigo-200/70";
  }
  return "bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-300/55";
}

function isOrganizerRole(role: string | null | undefined) {
  const normalized = String(role ?? "").trim().toLowerCase();
  return normalized === "event_organizer" || normalized === "organizer_admin";
}

function seatLabel(user: User) {
  return user.app_access ? "Assigned" : "No app access";
}

function seatDetail(user: User) {
  if (!user.app_access) return null;
  const n = user.app_access_event_count;
  if (n <= 0) return "App access";
  return `App · ${n} event${n === 1 ? "" : "s"}`;
}

/** Hover/focus tooltip copy for the Role pill when an event is selected. */
function eventScopeAccessHint(user: User, scopedEventId: string | null): string | null {
  if (!scopedEventId) return null;
  if (user.event_scope_access_label === "web_admin") return "Web admin access on this event";
  if (user.event_scope_access_label === "app_only") return "App-only access on this event";
  return null;
}

function statusLabel(status: string | null | undefined) {
  const normalized = String(status ?? "").trim().toLowerCase();
  if (normalized === "active") return "Active";
  if (normalized === "invited") return "Invited";
  if (normalized === "pending") return "Pending";
  return "Unknown";
}

function statusBadgeClass(status: string | null | undefined) {
  const normalized = String(status ?? "").trim().toLowerCase();
  if (normalized === "active") return "bg-emerald-100 text-emerald-700";
  if (normalized === "invited") return "bg-amber-100 text-amber-700";
  if (normalized === "pending") return "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200/80";
  return "bg-slate-100 text-slate-700";
}

function canResendInvite(user: User) {
  const status = String(user.user_status ?? "").trim().toLowerCase();
  return (status === "invited" || status === "pending") && !isOrganizerRole(user.role);
}

function canGenerateEmergencyLogin(user: User) {
  const status = String(user.user_status ?? "").trim().toLowerCase();
  const supportedStatus = status === "active" || status === "invited" || status === "pending";
  return Boolean(String(user.email ?? "").trim()) && supportedStatus && !isOrganizerRole(user.role);
}

function buildLicenseOptionLabels(licenses: ExhibitorLicenseOption[]): LicenseOption[] {
  if (licenses.length === 1) {
    const only = licenses[0];
    return [
      {
        ...only,
        label: `Assigned license \u2022 ${only.seats_used} / ${only.seats_total} seats used`
      }
    ];
  }

  return licenses.map((license, index) => ({
    ...license,
    label: `License ${index + 1} \u2022 ${license.seats_used} / ${license.seats_total} seats used`
  }));
}

export function ExhibitorUsersClient({ users, licenses, scopedEventId }: ExhibitorUsersClientProps) {
  const router = useRouter();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [emergencyUser, setEmergencyUser] = useState<User | null>(null);
  const [emergencyReason, setEmergencyReason] = useState("");
  const [emergencyResult, setEmergencyResult] = useState<EmergencyLoginSuccess | null>(null);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const defaultLicenseId =
    licenses.find((license) => {
      const status = String(license.status ?? "").toLowerCase();
      return status === "active" && Number(license.seats_used) < Number(license.seats_total);
    })?.id ?? "";
  const [inviteForm, setInviteForm] = useState<InviteFormState>({
    email: "",
    fullName: "",
    role: "viewer",
    accessType: defaultLicenseId ? "app" : "no_app",
    licenseId: defaultLicenseId
  });
  const [editRole, setEditRole] = useState<ExhibitorInviteRole>("viewer");
  const [editLicenseId, setEditLicenseId] = useState(defaultLicenseId);
  const [editFullName, setEditFullName] = useState("");

  const sortedUsers = useMemo(
    () =>
      [...users].sort((a, b) =>
        exhibitorUserDisplayName(a).localeCompare(exhibitorUserDisplayName(b))
      ),
    [users]
  );
  const seatAssignableLicenses = useMemo(
    () =>
      licenses.filter((license) => {
      const status = String(license.status ?? "").toLowerCase();
      return status === "active" && Number(license.seats_used) < Number(license.seats_total);
      }),
    [licenses]
  );
  const licenseOptions = useMemo(() => buildLicenseOptionLabels(licenses), [licenses]);
  const assignableLicenseOptions = useMemo(() => buildLicenseOptionLabels(seatAssignableLicenses), [seatAssignableLicenses]);
  const hasAssignableLicenses = seatAssignableLicenses.length > 0;

  async function handleInviteSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    setBusyUserId("invite");

    if (inviteForm.accessType === "app" && !inviteForm.licenseId) {
      setErrorMessage("Seat is required for app access invites.");
      setBusyUserId(null);
      return;
    }

    try {
      const response = await fetch("/api/exhibitor/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: inviteForm.email,
          fullName: inviteForm.fullName,
          role: inviteForm.role,
          accessType: inviteForm.accessType,
          licenseId: inviteForm.licenseId,
          ...(scopedEventId ? { eventId: scopedEventId } : {})
        })
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to invite user.");
      }

      setInviteOpen(false);
      setInviteForm({
        email: "",
        fullName: "",
        role: "viewer",
        accessType: defaultLicenseId ? "app" : "no_app",
        licenseId: defaultLicenseId
      });
      router.refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to invite user.");
    } finally {
      setBusyUserId(null);
    }
  }

  async function handleEditSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingUser) return;

    setErrorMessage(null);
    setSuccessMessage(null);
    setBusyUserId(editingUser.id);

    try {
      const isAdmin = editRole === "exhibitor_admin";
      const appAccess = !isAdmin || Boolean(editLicenseId);
      const response = await fetch(`/api/exhibitor/users/${editingUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: editFullName,
          role: editRole,
          licenseId: appAccess ? editLicenseId : "",
          appAccess: !isAdmin ? true : appAccess
        })
      });

      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to update user.");
      }

      setEditingUser(null);
      router.refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to update user.");
    } finally {
      setBusyUserId(null);
    }
  }

  async function handleRemoveUser(user: User) {
    const confirmed = window.confirm(`Remove ${user.full_name ?? user.email ?? "this user"}?`);
    if (!confirmed) return;

    setErrorMessage(null);
    setSuccessMessage(null);
    setBusyUserId(user.id);

    try {
      const response = await fetch(`/api/exhibitor/users/${user.id}`, {
        method: "DELETE"
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to remove user.");
      }
      router.refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to remove user.");
    } finally {
      setBusyUserId(null);
    }
  }

  async function handleResendInvite(user: User) {
    setErrorMessage(null);
    setSuccessMessage(null);
    setBusyUserId(user.id);

    try {
      const formData = new FormData();
      formData.set("targetUserId", user.id);
      const result = await resendExhibitorUserInviteAction(formData);
      if (!result.ok) {
        throw new Error(result.error);
      }
      setSuccessMessage(result.message ?? `Invite resent to ${user.email ?? "user"}.`);
      router.refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to resend invite.");
    } finally {
      setBusyUserId(null);
    }
  }

  async function handleEmergencyLoginSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!emergencyUser) return;

    setErrorMessage(null);
    setSuccessMessage(null);
    setEmergencyResult(null);
    setBusyUserId(emergencyUser.id);

    try {
      const formData = new FormData();
      formData.set("targetUserId", emergencyUser.id);
      formData.set("reason", emergencyReason);
      const result = await generateEmergencyLoginCodeAction(formData);
      if (!result.ok) {
        throw new Error(result.error);
      }
      setEmergencyResult(result);
      setSuccessMessage(result.message);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to generate emergency login access.");
    } finally {
      setBusyUserId(null);
    }
  }

  function closeEmergencyModal() {
    setEmergencyUser(null);
    setEmergencyReason("");
    setEmergencyResult(null);
  }

  return (
    <PageShell>
      <PageHeader
        title="Users"
        subtitle="Manage users in your exhibitor scope."
        actions={
          <button
            type="button"
            onClick={() => {
              setInviteForm((current) => ({
                ...current,
                accessType: defaultLicenseId ? current.accessType : "no_app",
                licenseId: current.licenseId || seatAssignableLicenses[0]?.id || ""
              }));
              setInviteOpen(true);
            }}
            className="inline-flex h-10 items-center justify-center rounded-lg bg-gradient-to-r from-indigo-500 to-violet-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:from-indigo-600 hover:to-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            + Invite User
          </button>
        }
      />

      {!hasAssignableLicenses ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
          No assignable seats are available for this exhibitor. You can still invite users without app access.
        </p>
      ) : null}

      {errorMessage ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          {errorMessage}
        </p>
      ) : null}

      {successMessage ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          {successMessage}
        </p>
      ) : null}

      {sortedUsers.length === 0 ? (
        <div className="rounded-xl border bg-card p-6 text-sm text-slate-600">No users found.</div>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <table className="w-full table-fixed text-left text-sm">
            <thead className="border-b bg-slate-50 text-slate-700">
              <tr>
                <th className="w-[24%] px-4 py-3 font-semibold">Full Name</th>
                <th className="w-[25%] px-4 py-3 font-semibold">Email</th>
                <th className="w-[15%] px-4 py-3 font-semibold">Role</th>
                <th className="w-[14%] px-4 py-3 font-semibold">Seat</th>
                <th className="w-[12%] px-4 py-3 font-semibold">User Status</th>
                <th className="w-[10%] px-4 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedUsers.map((user) => {
                const appSeatLine = seatDetail(user);
                const scopeHint = eventScopeAccessHint(user, scopedEventId);
                const roleLabel = isOrganizerRole(user.role)
                  ? "Organizer Admin"
                  : exhibitorTeamRoleProductLabel(user.role);
                const showResendInvite = canResendInvite(user);
                const showEmergencyLogin = canGenerateEmergencyLogin(user);
                return (
                <tr key={user.id} className="border-t">
                  <td className="px-4 py-3 font-medium text-slate-900">
                    <span className="block truncate">{exhibitorUserDisplayName(user)}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    <span className="block truncate">{user.email ?? "-"}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="group relative inline-flex max-w-full align-top">
                      <span
                        tabIndex={scopeHint ? 0 : undefined}
                        aria-label={scopeHint ? `${roleLabel}. ${scopeHint}` : roleLabel}
                        className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                          roleBadgeClass(user.role)
                        } ${scopeHint ? "cursor-help focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 focus-visible:ring-offset-2" : ""}`}
                      >
                        {roleLabel}
                      </span>
                      {scopeHint ? (
                        <span
                          aria-hidden="true"
                          className="pointer-events-none absolute left-1/2 top-full z-10 mt-2 w-max max-w-56 -translate-x-1/2 rounded-md bg-slate-900 px-2.5 py-1.5 text-[11px] font-medium leading-tight text-white opacity-0 shadow-lg transition group-hover:opacity-100 group-focus-within:opacity-100"
                        >
                          {scopeHint}
                        </span>
                      ) : null}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    <span className="block">{seatLabel(user)}</span>
                    {appSeatLine ? (
                      <span className="mt-0.5 block text-xs text-slate-500">{appSeatLine}</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${statusBadgeClass(user.user_status)}`}>
                      {statusLabel(user.user_status)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {showResendInvite ? (
                        <button
                          type="button"
                          onClick={() => handleResendInvite(user)}
                          className={`${actionIconButtonClass} hover:text-amber-700`}
                          disabled={busyUserId === user.id}
                          aria-label={`Resend invite to ${user.email ?? user.full_name ?? "user"}`}
                          title="Resend invite"
                        >
                          <Send className="h-4 w-4" strokeWidth={1.9} aria-hidden />
                        </button>
                      ) : null}
                      {showEmergencyLogin ? (
                        <button
                          type="button"
                          onClick={() => {
                            setEmergencyUser(user);
                            setEmergencyReason("");
                            setEmergencyResult(null);
                          }}
                          className={`${actionIconButtonClass} hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700`}
                          disabled={busyUserId === user.id}
                          aria-label={`Generate emergency login access for ${user.email ?? user.full_name ?? "user"}`}
                          title="Emergency login access"
                        >
                          <KeyRound className="h-4 w-4" strokeWidth={1.9} aria-hidden />
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => {
                          const currentRole = String(user.role ?? "").trim().toLowerCase();
                          setEditRole(currentRole === "exhibitor_admin" ? "exhibitor_admin" : "viewer");
                          setEditFullName(user.full_name ?? "");
                          setEditLicenseId(user.license_id ?? licenses[0]?.id ?? "");
                          setEditingUser(user);
                        }}
                        className={`${actionIconButtonClass} hover:text-indigo-700`}
                        disabled={busyUserId === user.id || isOrganizerRole(user.role)}
                        aria-label={`Edit ${user.full_name ?? user.email ?? "user"}`}
                        title="Edit"
                      >
                        <Pencil className="h-4 w-4" strokeWidth={1.9} aria-hidden />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveUser(user)}
                        className={`${actionIconButtonClass} hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700`}
                        disabled={busyUserId === user.id || isOrganizerRole(user.role)}
                        aria-label={`Remove ${user.full_name ?? user.email ?? "user"}`}
                        title="Remove"
                      >
                        <Trash2 className="h-4 w-4" strokeWidth={1.9} aria-hidden />
                      </button>
                    </div>
                  </td>
                </tr>
              );})}
            </tbody>
          </table>
        </div>
      )}

      {inviteOpen ? (
        <ModalShell
          title="Invite User"
          onClose={() => {
            if (busyUserId === "invite") return;
            setInviteOpen(false);
          }}
        >
          <form className="space-y-4" onSubmit={handleInviteSubmit}>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Email</label>
              <input
                type="email"
                required
                value={inviteForm.email}
                onChange={(event) => setInviteForm((current) => ({ ...current, email: event.target.value }))}
                className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Full Name (Optional)</label>
              <input
                type="text"
                value={inviteForm.fullName}
                onChange={(event) => setInviteForm((current) => ({ ...current, fullName: event.target.value }))}
                className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="invite-role" className="text-sm font-medium text-slate-700">Role</label>
              <select
                id="invite-role"
                value={inviteForm.role}
                onChange={(event) => {
                  const next = event.target.value as ExhibitorInviteRole;
                  setInviteForm((current) => ({
                    ...current,
                    role: next,
                    accessType: next === "viewer" ? "app" : current.accessType,
                    licenseId:
                      next === "viewer"
                        ? current.licenseId || seatAssignableLicenses[0]?.id || ""
                        : current.licenseId
                  }));
                }}
                className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm"
              >
                {EXHIBITOR_INVITE_ROLE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-500">
                {inviteForm.role === "exhibitor_admin"
                  ? "Web admin: manage users, settings, and events. Mobile app is optional and uses an app seat when enabled below."
                  : "App user: read-only / app role. Includes mobile app access and uses an app seat."}
              </p>
            </div>
            {inviteForm.role === "exhibitor_admin" ? (
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">Mobile app access</label>
                <select
                  value={inviteForm.accessType}
                  onChange={(event) =>
                    setInviteForm((current) => ({
                      ...current,
                      accessType: event.target.value as AccessType,
                      licenseId:
                        event.target.value === "app"
                          ? current.licenseId || seatAssignableLicenses[0]?.id || ""
                          : ""
                    }))
                  }
                  className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm"
                >
                  <option value="no_app">Web admin only (no mobile)</option>
                  <option value="app">Also allow mobile app access (uses an app seat)</option>
                </select>
              </div>
            ) : (
              <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                App access is on for this role and uses one app seat from the license below.
              </p>
            )}
            {inviteForm.accessType === "app" ? (
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">Seat</label>
                <select
                  required
                  value={inviteForm.licenseId}
                  onChange={(event) => setInviteForm((current) => ({ ...current, licenseId: event.target.value }))}
                  className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm"
                  disabled={!hasAssignableLicenses}
                >
                  {seatAssignableLicenses.map((license) => (
                    <option key={license.id} value={license.id}>
                      {assignableLicenseOptions.find((item) => item.id === license.id)?.label ??
                        `Assigned license \u2022 ${license.seats_used} / ${license.seats_total} seats used`}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setInviteOpen(false)}
                className="h-10 rounded-lg bg-slate-100 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-200"
                disabled={busyUserId === "invite"}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busyUserId === "invite"}
                className="h-10 rounded-lg bg-accent px-3 text-sm font-semibold text-white hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busyUserId === "invite" ? "Sending..." : "Send Invite"}
              </button>
            </div>
          </form>
        </ModalShell>
      ) : null}

      {editingUser ? (
        <ModalShell
          title={`Edit ${editingUser.full_name ?? editingUser.email ?? "User"}`}
          onClose={() => {
            if (busyUserId === editingUser.id) return;
            setEditingUser(null);
          }}
        >
          <form className="space-y-4" onSubmit={handleEditSubmit}>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Full Name</label>
              <input
                type="text"
                value={editFullName}
                onChange={(event) => setEditFullName(event.target.value)}
                placeholder="Enter full name"
                className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="edit-role" className="text-sm font-medium text-slate-700">Role</label>
              <select
                id="edit-role"
                value={editRole}
                onChange={(event) => setEditRole(event.target.value as ExhibitorInviteRole)}
                className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm"
              >
                {EXHIBITOR_INVITE_ROLE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Seat</label>
              <select
                required
                value={editLicenseId}
                onChange={(event) => setEditLicenseId(event.target.value)}
                className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm"
              >
                {Array.from(
                  new Map(
                    [...seatAssignableLicenses, ...licenses.filter((license) => license.id === editLicenseId)].map(
                      (license) => [license.id, license]
                    )
                  ).values()
                ).map((license) => (
                  <option key={license.id} value={license.id}>
                    {licenseOptions.find((item) => item.id === license.id)?.label ??
                      `Assigned license \u2022 ${license.seats_used} / ${license.seats_total} seats used`}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="h-10 rounded-lg bg-slate-100 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-200"
                disabled={busyUserId === editingUser.id}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busyUserId === editingUser.id}
                className="h-10 rounded-lg bg-accent px-3 text-sm font-semibold text-white hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busyUserId === editingUser.id ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </form>
        </ModalShell>
      ) : null}

      {emergencyUser ? (
        <ModalShell
          title="Emergency Login Code"
          onClose={() => {
            if (busyUserId === emergencyUser.id) return;
            closeEmergencyModal();
          }}
        >
          {emergencyResult ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-900">
                <p className="font-semibold">Shown once only</p>
                <p className="mt-1 text-xs leading-5">
                  This code is not emailed automatically and will disappear when you close this dialog.
                </p>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">
                  Emergency Login Code for {emergencyResult.targetEmail}
                </label>
                <input
                  readOnly
                  value={emergencyResult.loginCode.code}
                  aria-label="Emergency Login Code"
                  className="w-full rounded-lg border border-border bg-slate-50 px-3 py-3 text-center font-mono text-2xl font-semibold tracking-[0.35em] text-slate-900"
                />
              </div>
              <p className="text-xs leading-5 text-slate-500">
                The user enters this code with their email on a supported Lead Retrieval login screen. It expires and can be redeemed only once.
              </p>
              <div className="flex items-center justify-end pt-2">
                <button
                  type="button"
                  onClick={closeEmergencyModal}
                  className="h-10 rounded-lg bg-slate-900 px-3 text-sm font-semibold text-white hover:bg-slate-800"
                >
                  Close and clear
                </button>
              </div>
            </div>
          ) : (
            <form className="space-y-4" onSubmit={handleEmergencyLoginSubmit}>
              <div className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-900">
                <p className="font-semibold">Emergency/support action</p>
                <p className="mt-1 text-xs leading-5">
                  Generate fresh one-time login access only after verifying the user. Nothing will be emailed automatically.
                </p>
              </div>
              <div className="space-y-1.5">
                <p className="text-sm font-medium text-slate-700">Target user</p>
                <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  {emergencyUser.full_name || emergencyUser.email || "Selected user"}
                  {emergencyUser.email ? (
                    <span className="block text-xs text-slate-500">{emergencyUser.email}</span>
                  ) : null}
                </p>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="emergency-reason" className="text-sm font-medium text-slate-700">
                  Reason
                </label>
                <textarea
                  id="emergency-reason"
                  required
                  value={emergencyReason}
                  onChange={(event) => setEmergencyReason(event.target.value)}
                  placeholder="Example: Verified identity by phone; invite email did not arrive."
                  className="min-h-24 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeEmergencyModal}
                  className="h-10 rounded-lg bg-slate-100 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-200"
                  disabled={busyUserId === emergencyUser.id}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busyUserId === emergencyUser.id || !emergencyReason.trim()}
                  className="h-10 rounded-lg bg-orange-600 px-3 text-sm font-semibold text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {busyUserId === emergencyUser.id ? "Generating..." : "Generate Once"}
                </button>
              </div>
            </form>
          )}
        </ModalShell>
      ) : null}
    </PageShell>
  );
}

function ModalShell({
  title,
  onClose,
  children
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 py-6">
      <div className="w-full max-w-md rounded-xl border border-border bg-white p-5 shadow-lg">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
