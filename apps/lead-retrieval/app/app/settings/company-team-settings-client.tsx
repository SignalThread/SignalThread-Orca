"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { EventAccessMode } from "@/lib/access/event-access-mode";
import type { CompanyMemberDbRole } from "@/lib/exhibitor/company-admin-invite-metadata";
import { companyMemberRoleProductLabel } from "@/lib/exhibitor/company-member-role-label";
import { EXHIBITOR_INVITE_ROLE_OPTIONS } from "@/lib/exhibitor/exhibitor-invite-role";
import type {
  CompanyTeamActionState,
  CompanyTeamAppInviteCode,
  CompanyTeamMemberRow
} from "@/lib/exhibitor/company-team-types";
import {
  companyTeamRowMenuFlags,
  companyTeamTableStatusLabel,
  shortCompanyTeamEventAccessLabel
} from "@/lib/exhibitor/company-team-table-display";
import { MoreHorizontal } from "lucide-react";
import {
  inviteCompanyMemberAction,
  cancelCompanyAppUserInviteAction,
  deleteCompanyTeamUserAction,
  resendCompanyAppUserInviteAction,
  resendCompanyMemberInviteAction,
  revokeCompanyMemberInviteAction,
  setCompanyMemberDisabledAction,
  updateCompanyMemberAccessAction
} from "./team-actions";

const inputCls =
  "mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200";
const labelCls = "block text-sm font-medium text-slate-700";

/** Shared pill shell — tinted fills + inset rings for a refined SaaS look. */
const pillShell = "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold leading-none";

function roleLabel(role: CompanyMemberDbRole): string {
  return companyMemberRoleProductLabel(role);
}

function rolePillClass(role: CompanyMemberDbRole): string {
  if (role === "exhibitor_admin") {
    return "bg-indigo-50 text-indigo-950 ring-1 ring-inset ring-indigo-200/70";
  }
  return "bg-slate-100 text-slate-800 ring-1 ring-inset ring-slate-300/55";
}

function statusPillClass(display: ReturnType<typeof companyTeamTableStatusLabel>): string {
  switch (display) {
    case "Active":
      return "bg-emerald-50 text-emerald-950 ring-1 ring-inset ring-emerald-200/65";
    case "Invited":
      return "bg-amber-50 text-amber-950 ring-1 ring-inset ring-amber-200/60";
    case "Expired":
      return "bg-orange-50 text-orange-900 ring-1 ring-inset ring-orange-200/65";
    case "Disabled":
      return "bg-rose-50 text-rose-900 ring-1 ring-inset ring-rose-200/55";
    default:
      return "bg-slate-100 text-slate-800 ring-1 ring-inset ring-slate-300/55";
  }
}

function eventAccessModeSummaryPill(mode: EventAccessMode): { label: string; className: string } {
  if (mode === "all_company_events") {
    return {
      label: "All events",
      className: "bg-violet-50 text-violet-950 ring-1 ring-inset ring-violet-200/55"
    };
  }
  return {
    label: "Specific events",
    className: "bg-sky-50 text-sky-950 ring-1 ring-inset ring-sky-200/55"
  };
}

type CompanyEventOption = { id: string; name: string };

function EventAccessFields(props: {
  licenseEligible: boolean;
  companyEvents: CompanyEventOption[];
  eventAccessMode: EventAccessMode;
  onEventAccessMode: (m: EventAccessMode) => void;
  selectedEventIds: string[];
  onToggleEvent: (id: string) => void;
  search: string;
  onSearch: (s: string) => void;
  idPrefix: string;
}) {
  const {
    licenseEligible,
    companyEvents,
    eventAccessMode,
    onEventAccessMode,
    selectedEventIds,
    onToggleEvent,
    search,
    onSearch,
    idPrefix
  } = props;

  const hasEvents = companyEvents.length > 0;
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return companyEvents;
    return companyEvents.filter((e) => e.name.toLowerCase().includes(q) || e.id.toLowerCase().includes(q));
  }, [companyEvents, search]);

  const modePill = eventAccessModeSummaryPill(eventAccessMode);

  return (
    <div className="space-y-3">
      <fieldset>
        <legend className="mb-2 flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-slate-700">Event access</span>
          <span className={`${pillShell} ${modePill.className}`}>{modePill.label}</span>
        </legend>
        <div className="space-y-2">
          <label
            className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 ${
              !licenseEligible
                ? "cursor-not-allowed border-slate-100 bg-slate-50/80 opacity-70"
                : "border-slate-200/80 bg-white hover:border-slate-300"
            }`}
          >
            <input
              type="radio"
              name={`${idPrefix}-eventAccessMode`}
              className="border-slate-300"
              checked={eventAccessMode === "all_company_events"}
              disabled={!licenseEligible}
              onChange={() => onEventAccessMode("all_company_events")}
            />
            <div className="min-w-0 flex-1">
              <span className="text-sm font-medium text-slate-900">All events</span>
              {!licenseEligible ? (
                <p className="text-xs text-slate-500">Requires an active company license.</p>
              ) : null}
            </div>
          </label>
          <label
            className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 ${
              !hasEvents
                ? "cursor-not-allowed border-dashed border-slate-200 bg-slate-50/50 opacity-75"
                : "border-slate-200/80 bg-white hover:border-slate-300"
            }`}
          >
            <input
              type="radio"
              name={`${idPrefix}-eventAccessMode`}
              className="border-slate-300"
              checked={eventAccessMode === "assigned_events_only"}
              disabled={!hasEvents}
              onChange={() => onEventAccessMode("assigned_events_only")}
            />
            <div className="min-w-0 flex-1">
              <span className="text-sm font-medium text-slate-900">Specific events</span>
              {!hasEvents ? (
                <p className="text-xs text-slate-500">Create an event to limit access.</p>
              ) : null}
            </div>
          </label>
        </div>
      </fieldset>

      {eventAccessMode === "assigned_events_only" && hasEvents ? (
        <div>
          <label htmlFor={`${idPrefix}-eventSearch`} className={labelCls}>
            Events
          </label>
          <input
            id={`${idPrefix}-eventSearch`}
            type="search"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search…"
            className={inputCls}
          />
          <div className="mt-2 max-h-40 overflow-auto rounded-lg border border-slate-200/80 bg-slate-50/40 p-1.5">
            {filtered.length === 0 ? (
              <p className="px-2 py-2 text-xs text-slate-500">No matches.</p>
            ) : (
              <ul className="space-y-0.5">
                {filtered.map((e) => {
                  const checked = selectedEventIds.includes(e.id);
                  return (
                    <li key={e.id}>
                      <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-white">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => onToggleEvent(e.id)}
                          className="rounded border-slate-300"
                        />
                        <span className="text-sm text-slate-800">{e.name}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function CompanyTeamSettingsClient(props: {
  licenseEligible: boolean;
  members: CompanyTeamMemberRow[];
  companyEvents: CompanyEventOption[];
  canManageTeam: boolean;
}) {
  const { licenseEligible, members, companyEvents, canManageTeam } = props;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<{
    kind: "ok" | "err";
    text: string;
    appInviteCodes?: CompanyTeamAppInviteCode[];
  } | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [openMenuFor, setOpenMenuFor] = useState<string | null>(null);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState<CompanyMemberDbRole>("exhibitor_admin");
  const [inviteMode, setInviteMode] = useState<EventAccessMode>(() =>
    licenseEligible ? "all_company_events" : companyEvents.length > 0 ? "assigned_events_only" : "all_company_events"
  );
  const [inviteEvents, setInviteEvents] = useState<string[]>([]);
  const [inviteSearch, setInviteSearch] = useState("");
  const inviteSubmissionRef = useRef(false);
  const [isInviteSubmitting, setIsInviteSubmitting] = useState(false);

  const [detailMember, setDetailMember] = useState<CompanyTeamMemberRow | null>(null);
  const [editMember, setEditMember] = useState<CompanyTeamMemberRow | null>(null);
  const [editRole, setEditRole] = useState<CompanyMemberDbRole>("viewer");
  const [editMode, setEditMode] = useState<EventAccessMode>("all_company_events");
  const [editEvents, setEditEvents] = useState<string[]>([]);
  const [editSearch, setEditSearch] = useState("");

  useEffect(() => {
    if (!licenseEligible && inviteMode === "all_company_events" && companyEvents.length > 0) {
      setInviteMode("assigned_events_only");
    }
  }, [licenseEligible, inviteMode, companyEvents.length]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!openMenuFor) return;
      const el = menuRef.current;
      if (el && !el.contains(e.target as Node)) {
        setOpenMenuFor(null);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [openMenuFor]);

  useEffect(() => {
    if (!editMember) return;
    setEditRole(editMember.companyRole);
    setEditMode(editMember.eventAccessMode);
    setEditEvents(editMember.assignedEventDetails.map((e) => e.id));
    setEditSearch("");
  }, [editMember]);

  function runAction(
    action: (p: CompanyTeamActionState | null, fd: FormData) => Promise<CompanyTeamActionState>,
    build: (fd: FormData) => void,
    onSuccess?: () => void
  ) {
    startTransition(async () => {
      try {
        const fd = new FormData();
        build(fd);
        const r = await action(null, fd);
        if (r.ok) {
          setBanner({
            kind: "ok",
            text: r.message ?? "Done.",
            appInviteCodes: r.appInviteCodes
          });
          setOpenMenuFor(null);
          setEditMember(null);
          onSuccess?.();
          router.refresh();
        } else {
          setBanner({ kind: "err", text: r.error });
        }
      } catch (error) {
        setBanner({
          kind: "err",
          text: error instanceof Error ? error.message : "The action failed. Please try again."
        });
      }
    });
  }

  function submitInvite(e: React.FormEvent) {
    e.preventDefault();
    if (inviteMode === "assigned_events_only" && inviteEvents.length === 0) {
      setBanner({ kind: "err", text: "Select at least one event." });
      return;
    }
    if (inviteSubmissionRef.current) return;
    inviteSubmissionRef.current = true;
    setIsInviteSubmitting(true);
    const emailSnapshot = inviteEmail.trim();
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set("email", emailSnapshot);
        fd.set("fullName", inviteName.trim());
        fd.set("companyRole", inviteRole);
        fd.set("eventAccessMode", inviteMode);
        fd.set("assignedEventIdsJson", JSON.stringify(inviteMode === "all_company_events" ? [] : inviteEvents));
        const r = await inviteCompanyMemberAction(null, fd);
        if (r.ok) {
          setBanner({
            kind: "ok",
            text: r.message ?? "Done.",
            appInviteCodes: r.appInviteCodes
          });
          setInviteEmail("");
          setInviteName("");
          setInviteEvents([]);
          router.refresh();
        } else {
          setBanner({ kind: "err", text: r.error });
        }
      } catch (error) {
        setBanner({
          kind: "err",
          text: error instanceof Error ? error.message : "Invite generation failed. Please try again."
        });
      } finally {
        inviteSubmissionRef.current = false;
        setIsInviteSubmitting(false);
      }
    });
  }

  function submitEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editMember) return;
    if (editMode === "assigned_events_only" && editEvents.length === 0) {
      setBanner({ kind: "err", text: "Select at least one event." });
      return;
    }
    runAction(updateCompanyMemberAccessAction, (fd) => {
      fd.set("targetUserId", editMember.id);
      fd.set("companyRole", editRole);
      fd.set("eventAccessMode", editMode);
      fd.set("assignedEventIdsJson", JSON.stringify(editMode === "all_company_events" ? [] : editEvents));
    });
  }

  function toggleInviteEvent(id: string) {
    setInviteEvents((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function toggleEditEvent(id: string) {
    setEditEvents((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  return (
    <div className="w-full space-y-5">
      {banner ? (
        <div
          role={banner.kind === "err" ? "alert" : "status"}
          className={`rounded-lg border px-3 py-2.5 text-sm ${
            banner.kind === "err"
              ? "border-rose-200/80 bg-rose-50/80 text-rose-800"
              : "border-emerald-200/80 bg-emerald-50/80 text-emerald-800"
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <span>{banner.text}</span>
            <button
              type="button"
              className="shrink-0 font-medium text-slate-600 underline"
              onClick={() => setBanner(null)}
            >
              Dismiss
            </button>
          </div>
          {banner.kind === "ok" && banner.appInviteCodes && banner.appInviteCodes.length > 0 ? (
            <div className="mt-3 rounded-md border border-emerald-200/80 bg-white/70 p-3">
              <p className="text-xs font-semibold text-emerald-900">Mobile app invite codes</p>
              <p className="mt-0.5 text-xs text-emerald-900/80">
                Share with the invitee. They enter one code per event in the mobile app. Codes expire in 7 days.
              </p>
              <ul className="mt-2 divide-y divide-emerald-100">
                {banner.appInviteCodes.map((c) => (
                  <li
                    key={`${c.eventId}:${c.code}`}
                    className="flex items-center justify-between gap-3 py-1.5 text-sm"
                  >
                    <span className="truncate text-slate-800">{c.eventName}</span>
                    <span className="font-mono text-sm font-semibold tracking-widest text-slate-950">
                      {c.code}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-sm font-semibold tracking-tight text-slate-900">Company team</h2>
        </div>

        {members.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">No team members yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200/80 bg-white">
            <table className="min-w-[640px] w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200/90 bg-slate-50/95">
                  <th className="px-4 py-3.5 text-xs font-semibold tracking-wide text-slate-700">Person</th>
                  <th className="px-4 py-3.5 text-xs font-semibold tracking-wide text-slate-700">Status</th>
                  <th className="px-4 py-3.5 text-xs font-semibold tracking-wide text-slate-700">Role</th>
                  <th className="px-4 py-3.5 text-xs font-semibold tracking-wide text-slate-700">Event access</th>
                  {canManageTeam ? (
                    <th className="px-4 py-3.5 text-right text-xs font-semibold tracking-wide text-slate-700">
                      <span className="sr-only">Actions</span>
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {members.map((row) => {
                  const statusDisplay = companyTeamTableStatusLabel(row.status);
                  const menu = companyTeamRowMenuFlags({
                    status: row.status,
                    isPendingInvite: row.isPendingInvite
                  });
                  const eventShort = shortCompanyTeamEventAccessLabel({
                    eventAccessMode: row.eventAccessMode,
                    assignedEventCount: row.assignedEventDetails.length
                  });
                  const isPending = Boolean(row.isPendingInvite);
                  return (
                    <tr
                      key={row.id}
                      className="border-b border-slate-100/90 last:border-b-0 transition-colors hover:bg-slate-50/60"
                    >
                      <td className="px-4 py-[1.125rem] align-middle">
                        <p className="font-semibold leading-tight text-slate-950">
                          {row.fullName?.trim() || row.email || "Unnamed"}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">{row.email ?? "—"}</p>
                      </td>
                      <td className="px-4 py-[1.125rem] align-middle">
                        <span className={`${pillShell} ${statusPillClass(statusDisplay)}`}>{statusDisplay}</span>
                      </td>
                      <td className="px-4 py-[1.125rem] align-middle">
                        <span className={`${pillShell} ${rolePillClass(row.companyRole)}`}>
                          {roleLabel(row.companyRole)}
                        </span>
                      </td>
                      <td className="px-4 py-[1.125rem] align-middle">
                        <button
                          type="button"
                          className="text-left text-sm font-medium text-slate-800 transition-colors rounded-md px-2 py-1 -mx-2 hover:bg-indigo-50/70 hover:text-indigo-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300/50 focus-visible:ring-offset-1"
                          onClick={() => setDetailMember(row)}
                        >
                          {eventShort}
                        </button>
                      </td>
                      {canManageTeam ? (
                        <td className="px-4 py-[1.125rem] align-middle text-right">
                          <div
                            className="relative inline-flex justify-end"
                            ref={openMenuFor === row.id ? menuRef : null}
                          >
                            <button
                              type="button"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100/90 hover:text-slate-600 disabled:opacity-50"
                              onClick={() => setOpenMenuFor((v) => (v === row.id ? null : row.id))}
                              aria-expanded={openMenuFor === row.id}
                              aria-label={`Actions for ${row.email ?? row.fullName ?? "user"}`}
                            >
                              <MoreHorizontal className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                            </button>
                            {openMenuFor === row.id ? (
                              <div className="absolute right-0 top-full z-20 mt-1 w-48 rounded-xl border border-slate-200/90 bg-white py-1 shadow-md shadow-slate-200/40">
                                {menu.showEdit ? (
                                  <button
                                    type="button"
                                    className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                                    onClick={() => {
                                      setOpenMenuFor(null);
                                      setEditMember(row);
                                    }}
                                  >
                                    Edit access
                                  </button>
                                ) : null}
                                {menu.showResendInvite ? (
                                  <button
                                    type="button"
                                    className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                                    onClick={() => {
                                      if (row.isPendingInvite) {
                                        if (!row.email) return;
                                        runAction(resendCompanyAppUserInviteAction, (fd) =>
                                          fd.set("email", row.email ?? "")
                                        );
                                      } else {
                                        runAction(resendCompanyMemberInviteAction, (fd) =>
                                          fd.set("targetUserId", row.id)
                                        );
                                      }
                                    }}
                                  >
                                    Resend invite
                                  </button>
                                ) : null}
                                {menu.showCancelInvite ? (
                                  <button
                                    type="button"
                                    className="block w-full px-3 py-2 text-left text-sm text-rose-700 hover:bg-rose-50/90 disabled:opacity-50"
                                    onClick={() => {
                                      if (!row.email) return;
                                      if (
                                        !window.confirm(
                                          "Cancel this invite? Unused invite codes will be deleted. Codes already redeemed are preserved."
                                        )
                                      ) {
                                        return;
                                      }
                                      runAction(cancelCompanyAppUserInviteAction, (fd) =>
                                        fd.set("email", row.email ?? "")
                                      );
                                    }}
                                  >
                                    Cancel invite
                                  </button>
                                ) : null}
                                {menu.showRevokeInvite ? (
                                  <button
                                    type="button"
                                    disabled={isPending}
                                    className="block w-full px-3 py-2 text-left text-sm text-rose-700 hover:bg-rose-50/90 disabled:opacity-50"
                                    onClick={() => {
                                      if (!window.confirm("Revoke this invite? The pending account will be removed.")) {
                                        return;
                                      }
                                      runAction(revokeCompanyMemberInviteAction, (fd) =>
                                        fd.set("targetUserId", row.id)
                                      );
                                    }}
                                  >
                                    Revoke invite
                                  </button>
                                ) : null}
                                {menu.showDisable ? (
                                  <button
                                    type="button"
                                    disabled={isPending}
                                    className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                                    onClick={() =>
                                      runAction(setCompanyMemberDisabledAction, (fd) => {
                                        fd.set("targetUserId", row.id);
                                        fd.set("disable", menu.disableIsReEnable ? "false" : "true");
                                      })
                                    }
                                  >
                                    {menu.disableIsReEnable ? "Re-enable user" : "Disable user"}
                                  </button>
                                ) : null}
                                {menu.showDelete ? (
                                  <button
                                    type="button"
                                    disabled={isPending}
                                    className="block w-full px-3 py-2 text-left text-sm text-rose-700 hover:bg-rose-50/90 disabled:opacity-50"
                                    onClick={() => {
                                      if (
                                        !window.confirm(
                                          "This permanently deletes this user and removes their access to all events in this company."
                                        )
                                      ) {
                                        return;
                                      }
                                      runAction(deleteCompanyTeamUserAction, (fd) => fd.set("targetUserId", row.id));
                                    }}
                                  >
                                    Delete user
                                  </button>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {canManageTeam ? (
          <>
            <div className="my-5 border-t border-slate-100" />
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Invite a teammate</h3>
              <form onSubmit={submitInvite} className="mt-4 space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="invite-email" className={labelCls}>
                      Email <span className="text-rose-600">*</span>
                    </label>
                    <input
                      id="invite-email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      type="email"
                      required
                      autoComplete="off"
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label htmlFor="invite-name" className={labelCls}>
                      Full name <span className="font-normal text-slate-400">(optional)</span>
                    </label>
                    <input
                      id="invite-name"
                      value={inviteName}
                      onChange={(e) => setInviteName(e.target.value)}
                      type="text"
                      autoComplete="off"
                      className={inputCls}
                    />
                  </div>
                </div>
                <div>
                  <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                    <label htmlFor="invite-role" className="text-sm font-medium text-slate-700">
                      Role
                    </label>
                    <span className={`${pillShell} ${rolePillClass(inviteRole)}`}>{roleLabel(inviteRole)}</span>
                  </div>
                  <select
                    id="invite-role"
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as CompanyMemberDbRole)}
                    className={inputCls}
                  >
                    {EXHIBITOR_INVITE_ROLE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <EventAccessFields
                  idPrefix="invite"
                  licenseEligible={licenseEligible}
                  companyEvents={companyEvents}
                  eventAccessMode={inviteMode}
                  onEventAccessMode={setInviteMode}
                  selectedEventIds={inviteEvents}
                  onToggleEvent={toggleInviteEvent}
                  search={inviteSearch}
                  onSearch={setInviteSearch}
                />
                <div className="flex justify-end pt-1">
                  <button
                    type="submit"
                    disabled={isPending || isInviteSubmitting}
                    className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isPending || isInviteSubmitting ? "Sending…" : "Send invite"}
                  </button>
                </div>
              </form>
            </div>
          </>
        ) : (
          <>
            <div className="my-5 border-t border-slate-100" />
            <p className="text-sm text-slate-500">Only admins can invite or change access.</p>
          </>
        )}
      </div>

      {detailMember ? (
        <AccessDetailModal member={detailMember} onClose={() => setDetailMember(null)} />
      ) : null}

      {editMember ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center"
          onClick={() => setEditMember(null)}
          onKeyDown={(e) => e.key === "Escape" && setEditMember(null)}
          role="presentation"
        >
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-access-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="edit-access-title" className="text-base font-semibold text-slate-900">
              Edit access
            </h3>
            <p className="mt-1 text-sm font-medium text-slate-800">
              {editMember.fullName?.trim() || editMember.email}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className={`${pillShell} ${rolePillClass(editRole)}`}>{roleLabel(editRole)}</span>
              <span className={`${pillShell} ${statusPillClass(companyTeamTableStatusLabel(editMember.status))}`}>
                {companyTeamTableStatusLabel(editMember.status)}
              </span>
            </div>
            <form onSubmit={submitEdit} className="mt-5 space-y-4">
              <div>
                <span className={labelCls}>Email</span>
                <div className="mt-1 min-h-10 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  {editMember.email ?? "No email on file"}
                </div>
                <p className="mt-1.5 text-xs text-slate-500">
                  {editMember.status === "invited" || editMember.status === "expired"
                    ? "To correct an email, remove this invite and send a new one."
                    : "Email is managed by the user's login identity and cannot be edited here."}
                </p>
              </div>
              <div>
                <label htmlFor="edit-role" className={labelCls}>
                  Role
                </label>
                <select
                  id="edit-role"
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value as CompanyMemberDbRole)}
                  className={inputCls}
                >
                  {EXHIBITOR_INVITE_ROLE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <EventAccessFields
                idPrefix="edit"
                licenseEligible={licenseEligible}
                companyEvents={companyEvents}
                eventAccessMode={editMode}
                onEventAccessMode={setEditMode}
                selectedEventIds={editEvents}
                onToggleEvent={toggleEditEvent}
                search={editSearch}
                onSearch={setEditSearch}
              />
              <div className="flex flex-wrap justify-end gap-2 pt-1">
                <button
                  type="button"
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800"
                  onClick={() => setEditMember(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {isPending ? "Saving…" : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AccessDetailModal(props: { member: CompanyTeamMemberRow; onClose: () => void }) {
  const { member, onClose } = props;
  const summary = shortCompanyTeamEventAccessLabel({
    eventAccessMode: member.eventAccessMode,
    assignedEventCount: member.assignedEventDetails.length
  });
  const statusDisplay = companyTeamTableStatusLabel(member.status);
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="access-detail-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="access-detail-title" className="text-base font-semibold text-slate-950">
          Event access
        </h3>
        <p className="mt-1 text-sm font-semibold text-slate-950">
          {member.fullName?.trim() || member.email}
          <span className="mt-1 block text-xs font-normal text-slate-500">{member.email}</span>
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className={`${pillShell} ${rolePillClass(member.companyRole)}`}>
            {roleLabel(member.companyRole)}
          </span>
          <span className={`${pillShell} ${statusPillClass(statusDisplay)}`}>{statusDisplay}</span>
        </div>
        <p className="mt-4 text-sm font-semibold text-slate-900">{summary}</p>
        <div className="mt-3 text-sm text-slate-600">
          {member.eventAccessMode === "all_company_events" ? (
            <p>All current and future company-owned events.</p>
          ) : member.assignedEventDetails.length === 0 ? (
            <p className="text-sm text-amber-900/85">No events assigned.</p>
          ) : (
            <ul className="max-h-52 space-y-1.5 overflow-y-auto border-t border-slate-100 pt-3">
              {member.assignedEventDetails.map((e) => (
                <li key={e.id} className="leading-snug text-slate-800">
                  {e.name}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="mt-5 flex justify-end">
          <button
            type="button"
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
